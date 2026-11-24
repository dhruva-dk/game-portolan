// The world at the start: three championships of twenty teams, each team named,
// in a livery, with an emblem, a home colony, a manager, a chairman, a balance
// and a budget, buildings and parts by tier, and a full staff (four drivers and
// a reserve, a race mechanic a ship, a lead designer, scouts and a pit crew);
// and the free agents across every role. Strength by tier (TUNING.world.stars),
// spread by seed. Every draw is on the 'world' stream's rolls, so a seed and
// the player's colours make the same world every time.

import { PARTS, TEAM, type Colours, type Rules } from '../race.ts';
import {
  SHIPS,
  type Building,
  type Role,
  type Ship,
  type Status,
} from '../office/command.ts';
import { askFee, askSeasons, askWage } from './asks.ts';
import {
  makeCalendar,
  sponsorsScheduled,
  reviewsScheduled,
  scheduleSeason,
} from './calendar.ts';
import { between, pick, shuffled, type Dice, type Rand } from './dice.ts';
import { debtFloor, targetPlace } from './leadership.ts';
import { NOUNS, colony, teamName, place } from './names.ts';
import { makePerson } from './recruit.ts';
import { inRole, type Person } from './roles.ts';
import { age, stars } from './stars.ts';
import {
  beginning,
  staffOf,
  type CareerState,
  type Championship,
  type Part,
  type Team,
  type Works,
} from './state.ts';
import { TUNING } from './tuning.ts';

export const BUILDINGS: readonly Building[] = [
  'factory',
  'designCentre',
  'towingTank',
  'compositesPlant',
  'simulator',
  'pitCentre',
  'scoutingCentre',
  'commercialCentre',
  'hospitality',
];
const W = TUNING.world,
  C = TUNING.team;

/** A tier's own number of a table by tier (the last tier's past its end). */
const at = (table: readonly number[], tier: number): number =>
  table[Math.min(tier, table.length - 1)] ?? 0;

/** A number kept to 0..100, whole. */
const in100 = (x: number): number => Math.round(Math.min(100, Math.max(0, x)));

/** The rules every tier starts under. */
export function startingRules(): Rules {
  const R = TUNING.rules;
  return {
    spec: [...R.spec],
    storm: R.pace,
    banned: [...R.banned],
    pointsPerSinking: R.pointsPerSinking,
    seaHeldPoint: R.seaHeldPoint,
    prizeSpread: R.prizeSpread,
    inspection: R.inspection,
  };
}

/** Every livery (a dye in a pattern) but `taken`, in a seeded order: a tier's teams are dealt from it. */
function liveries(rand: Rand, taken: Colours): Colours[] {
  const out: Colours[] = [];
  for (let dye = 0; dye < W.liveries.dyes; dye++)
    for (let pattern = 0; pattern < W.liveries.patterns; pattern++)
      if (dye !== taken.dye || pattern !== taken.pattern)
        out.push({ dye, pattern });
  return shuffled(rand, out);
}

/** What the generator gathers as it goes: people by id and the names taken. */
interface Gathering {
  people: Person[];
  taken: Set<string>;
  day: number;
  colonies: number;
}

/** A new person of a role, of about so many stars, from a colony. */
function recruit(
  g: Gathering,
  rand: Rand,
  as: { role: Role; stars: number; colony: number }
): Person {
  const [lo, hi] = TUNING.ages.start[as.role];
  return makePerson(
    {
      id: g.people.length,
      role: as.role,
      stars: Math.min(5, Math.max(0.25, as.stars)),
      years: between(rand, lo, hi),
      day: g.day,
      colony: as.colony,
    },
    rand,
    g.taken
  );
}

/** A person signed to a team at the start: their ask at its tier, a length by age, some with a break clause. */
function signed(
  g: Person,
  to: { team: number; tier: number; status: Status },
  rand: Rand
): Person {
  const none = {
    team: to.team,
    status: to.status,
    wage: 0,
    fee: 0,
    ends: null,
    podium: 0,
    sinking: 0,
    breakClause: null,
    signed: 0,
  };
  if (g.role === 'chairman') return { ...g, contract: none };
  const K = TUNING.contracts;
  const wage = askWage(g, to.tier);
  const years = age(g, 0);
  const breakClause =
    rand() < K.breakShare
      ? wage * between(rand, K.breakRaces[0], K.breakRaces[1])
      : null;
  const driver = g.role === 'driver';
  return {
    ...g,
    contract: {
      ...none,
      wage,
      fee: askFee(wage),
      ends: between(rand, 0, askSeasons(years) - 1),
      podium: driver ? Math.round(wage * K.podium) : 0,
      sinking: driver ? Math.round(wage * K.sinking) : 0,
      breakClause,
    },
  };
}

/** A team's buildings at the start, each drawn in BUILDINGS' order about its tier's mean: the core at level 1 at
 *  least, none above the tier's cap, none more than a level above the building it needs (TUNING.hq.requires). */
function startingBuildings(rand: Rand, tier: number): Record<Building, Works> {
  const H = TUNING.hq,
    cap = H.cap[Math.min(H.cap.length - 1, tier)];
  const core: readonly Building[] = H.core,
    levels = new Map<Building, number>();
  for (const b of BUILDINGS) {
    const parent = H.requires[b],
      most = parent ? Math.min(cap, (levels.get(parent) ?? 0) + 1) : cap,
      drawn = Math.round(at(C.buildings, tier) + (rand() - 0.5) * 2.4);
    levels.set(b, Math.min(most, Math.max(core.includes(b) ? 1 : 0, drawn)));
  }
  const w = (b: Building): Works => ({ level: levels.get(b) ?? 0, next: null });
  return {
    factory: w('factory'),
    designCentre: w('designCentre'),
    towingTank: w('towingTank'),
    compositesPlant: w('compositesPlant'),
    simulator: w('simulator'),
    pitCentre: w('pitCentre'),
    scoutingCentre: w('scoutingCentre'),
    commercialCentre: w('commercialCentre'),
    hospitality: w('hospitality'),
  };
}

/** The parts a team owns at the start: so many a ship, one of each type. */
const FITTED = TEAM * PARTS.length;

/** A team's starting parts: one of each type on each ship, by tier. */
function startingParts(rand: Rand, tier: number, firstId: number): Part[] {
  const P = C.parts;
  return SHIPS.flatMap((ship: Ship) =>
    PARTS.map((type, i): Part => {
      const perf = Math.round(at(P.perf, tier) + (rand() * 2 - 1) * P.spread);
      const reliability =
        Math.round(
          (at(P.reliability, tier) + (rand() * 2 - 1) * P.reliabilitySpread) *
            1000
        ) / 1000;
      return {
        id: firstId + ship * PARTS.length + i,
        type,
        perf,
        perfMax: perf + P.headroom,
        reliability,
        reliabilityMax: Math.min(
          1,
          Math.round((reliability + P.reliabilityHeadroom) * 1000) / 1000
        ),
        risk: 0,
        condition: 1,
        components: [],
        ship,
        forNext: false,
        spec: false,
        cost: 0,
      };
    })
  );
}

/** A team's mean staff stars (every person on it but the chairman and the player). */
export const staffStars = (teamPeople: readonly Person[]): number => {
  const counted = teamPeople.filter((g) => g.role !== 'chairman' && !g.player);
  return (
    counted.reduce((a, g) => a + stars(g), 0) / Math.max(1, counted.length)
  );
};

/** What a team is made as: its id, tier, name and livery. */
interface Making {
  id: number;
  tier: number;
  name: string;
  colours: Colours;
}

/** A team and its staff, made and signed. */
function makeTeam(g: Gathering, rand: Rand, m: Making): Team {
  const { id, tier } = m;
  const home = between(rand, 0, g.colonies - 1);
  const strength = at(W.stars, tier) + (rand() - 0.5) * W.starSpread;
  const about = () => strength + (rand() - 0.5) * 0.8;
  const from = () => (rand() < 0.5 ? home : between(rand, 0, g.colonies - 1));
  const sign = (role: Role, s: number, status: Status = 'staff'): Person => {
    const person = signed(
      recruit(g, rand, { role, stars: s, colony: from() }),
      { team: id, tier, status },
      rand
    );
    g.people.push(person);
    return person;
  };
  const buildings = startingBuildings(rand, tier);
  const manager = sign('manager', about());
  g.people[manager.id] = {
    ...manager,
    reputation: in100(
      at(C.managerReputation, tier) + (rand() - 0.5) * C.managerSpread
    ),
  };
  const chairman = inRole(sign('chairman', about()), 'chairman');
  const drivers = SHIPS.map(() => sign('driver', about(), 'ship').id);
  const ships = drivers.map((driver) => ({
    driver,
    mechanic: sign('mechanic', about()).id,
  }));
  const reserve = sign('driver', about() - 0.5, 'reserve').id;
  const designer = sign('designer', about()).id;
  const scouts = Array.from(
    { length: TUNING.hq.scouts[buildings.scoutingCentre.level] ?? 1 },
    () => sign('scout', about()).id
  );
  const pit = Array.from({ length: W.pit }, () => sign('pit', about()).id);
  const budget = at(C.budget, tier);
  return {
    id,
    name: m.name,
    colours: m.colours,
    emblem: between(rand, 0, W.emblems - 1),
    colony: home,
    tier,
    staff: {
      manager: manager.id,
      chairman: chairman.id,
      ships,
      reserve,
      designer,
      scouts,
      pit,
    },
    balance: at(C.balance, tier),
    budget,
    debtFloor: Math.round(debtFloor(chairman.stats.generosity, budget)),
    reputation: in100(
      at(C.reputation, tier) + (rand() - 0.5) * C.reputationSpread
    ),
    confidence: C.confidence,
    target: 1,
    buildings,
    parts: startingParts(rand, tier, id * FITTED),
    design: null,
    draft: null,
    designs: 0,
    improvement: [],
    improvementDay: 0,
    lastNew: {
      sails: null,
      rigging: null,
      rudder: null,
      hull: null,
      keel: null,
      mounts: null,
    },
    bonds: SHIPS.map(() => 0),
    suppliers: { composites: null, sailmaker: null, hydraulics: null },
    sponsors: [null, null, null],
    offers: [],
    plan: null,
    player: false,
  };
}

/**
 * Each team of a tier's target: its expected place (by the mean of its rank by
 * staff stars and its rank by the fitted parts' performance), moved up by its
 * chairman's Ambition.
 */
export function targets(
  teams: readonly Team[],
  people: readonly Person[]
): Team[] {
  const strength = (c: Team) =>
    staffStars(
      staffOf(c).flatMap((i) => {
        const g = people[i];
        return g ? [g] : [];
      })
    );
  const perf = (c: Team) =>
    c.parts.reduce((a, p) => a + (p.ship === null ? 0 : p.perf), 0);
  const rankBy = (f: (c: Team) => number) => {
    const order = [...teams].sort((a, b) => f(b) - f(a) || a.id - b.id);
    const rank = new Map(order.map((c, i) => [c.id, i]));
    return (c: Team) => rank.get(c.id) ?? 0;
  };
  const byStars = rankBy(strength),
    byParts = rankBy(perf);
  const expected = [...teams].sort(
    (a, b) =>
      byStars(a) + byParts(a) - byStars(b) - byParts(b) ||
      byStars(a) - byStars(b)
  );
  return teams.map((c) => ({
    ...c,
    target: targetPlace(
      inRole(people[c.staff.chairman], 'chairman').stats.ambition,
      expected.indexOf(c) + 1
    ),
  }));
}

/** The world of a seed, with the player's colours taken out of the deal: before founding (career/found.ts). */
export function makeWorld(
  seed: number,
  theirs: Colours,
  roll: Dice
): CareerState {
  const rand = roll.roll('world');
  const colonies: string[] = [];
  while (colonies.length < W.colonies) {
    const c = colony(rand);
    if (!colonies.includes(c)) colonies.push(c);
  }
  const g: Gathering = {
    people: [],
    taken: new Set(),
    day: 0,
    colonies: colonies.length,
  };
  const nouns = shuffled(rand, NOUNS);
  const places = new Set<string>(nouns.map((n) => n.toLowerCase()));
  const teams: Team[] = [];
  const championships: Championship[] = [];
  for (let tier = 0; tier < W.championships; tier++) {
    const deal = liveries(rand, theirs);
    const made: Team[] = [];
    for (let k = 0; k < W.teams; k++) {
      let word = place(rand);
      while (places.has(word.toLowerCase())) word = place(rand);
      places.add(word.toLowerCase());
      const id = teams.length + made.length;
      made.push(
        makeTeam(g, rand, {
          id,
          tier,
          name: teamName(word, nouns[id % nouns.length] ?? ''),
          colours: deal[k % deal.length] ?? theirs,
        })
      );
    }
    teams.push(...targets(made, g.people));
    championships.push({
      id: tier,
      teams: made.map((c) => c.id),
      rules: startingRules(),
      next: startingRules(),
      proposals: [],
      standings: made.map((c) => ({
        team: c.id,
        points: 0,
        wins: 0,
        podiums: 0,
        sinkings: 0,
      })),
      drivers: [],
    });
  }
  addFreeAgents(g, rand);
  const calendar = makeCalendar(0, 0, rand);
  const base: CareerState = {
    ...beginning(0),
    seed,
    colonies,
    people: g.people,
    teams,
    championships,
    calendar,
    ids: {
      part: teams.length * FITTED,
      mail: 0,
      talk: 0,
      proposal: 0,
      sponsor: 0,
    },
  };
  return sponsorsScheduled(
    reviewsScheduled(scheduleSeason(base, calendar), 0),
    0
  );
}

/** The roles free agents other than managers come in, by TUNING.world.freeRoles' shares. */
const FREE = ['driver', 'mechanic', 'designer', 'scout', 'pit'] as const;

/** The free agents: TUNING.world.free across every role, freeManagers of them managers. */
function addFreeAgents(g: Gathering, rand: Rand): void {
  const roles: Role[] = Array.from({ length: W.freeManagers }, () => 'manager');
  const rest = W.free - W.freeManagers;
  for (const role of FREE)
    for (let i = 0; i < Math.round(rest * W.freeRoles[role]); i++)
      roles.push(role);
  while (roles.length < W.free) roles.push(pick(rand, FREE));
  for (const role of roles.slice(0, W.free))
    g.people.push(
      recruit(g, rand, {
        role,
        stars: W.freeStars + (rand() - 0.5) * W.freeSpread,
        colony: between(rand, 0, g.colonies - 1),
      })
    );
}
