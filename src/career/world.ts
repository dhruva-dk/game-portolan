// The world at the start (Phase B section 3): 120 teams in three championships of forty, each named, coloured, with an
// emblem, a home colony, a manager, an chairman, balance and a budget, buildings and parts by tier, and a full staff; and
// 300 free agents across every role. Strength by tier: staff about 3.5, 2.5 and 1.75 stars, spread by seed.
// Every draw is on the 'world' stream's rolls, so a seed and the player's colours make the same world every time.

import { SWATCHES, type Colours, type PartType, type Rules } from '../race.ts';
import type { Building, Role, Status } from '../office.ts';
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
import type { Person, PersonOf } from './roles.ts';
import { age, stars } from './stars.ts';
import {
  beginning,
  type CareerState,
  type Team,
  type Hands,
  type Championship,
  type Part,
  type Works,
} from './state.ts';
import { TUNING } from './tuning.ts';

export const BUILDINGS: readonly Building[] = [
  'factory',
  'drawingLoft',
  'testTank',
  'foundry',
  'sailingSchool',
  'pitHouse',
  'crowsNest',
  'fishMarket',
  'landingPad',
];
export const PART_TYPES: readonly PartType[] = [
  'sails',
  'rigging',
  'rudder',
  'hull',
  'keel',
  'mounts',
];
const JOB_ORDER = ['mend', 'gust', 'stores', 'part'] as const;
const W = TUNING.world,
  C = TUNING.team;

/** The rules every tier starts under. */
export function startingRules(): Rules {
  const R = TUNING.rules;
  return {
    spec: [...R.spec],
    storm: { pace: R.pace },
    banned: [...R.banned],
    pointsPerSinking: R.pointsPerSinking,
    seaHeldPoint: R.seaHeldPoint,
    prizeSpread: R.prizeSpread,
    inspection: R.inspection,
  };
}

/** Every unordered pair of team swatches but `taken`, each as a Colours in a seeded order. */
function pairs(rand: Rand, taken: Colours): Colours[] {
  const out: Colours[] = [];
  for (let a = 0; a < SWATCHES; a++)
    for (let b = a + 1; b < SWATCHES; b++) {
      if (
        (a === taken.first && b === taken.second) ||
        (a === taken.second && b === taken.first)
      )
        continue;
      out.push(
        rand() < 0.5 ? { first: a, second: b } : { first: b, second: a }
      );
    }
  return shuffled(rand, out);
}

/** What the generator gathers as it goes: people by id and the names taken. */
interface Gathering {
  people: Person[];
  taken: Set<string>;
  day: number;
  colonies: number;
}

/** A new person added to the gathering. */
function recruit(
  g: Gathering,
  rand: Rand,
  role: Role,
  starsNow: number,
  colony: number
): Person {
  const [lo, hi] = TUNING.ages.start[role];
  const person = makePerson(
    {
      id: g.people.length,
      role,
      stars: Math.min(5, Math.max(0.25, starsNow)),
      years: between(rand, lo, hi),
      day: g.day,
      colony,
    },
    rand,
    g.taken
  );
  g.people.push(person);
  return person;
}

/** A person signed to a team at the start: their ask at its tier, a length by age, some with a break clause. */
function signed(
  g: Person,
  team: number,
  tier: number,
  status: Status,
  rand: Rand
): Person {
  if (g.role === 'chairman')
    return {
      ...g,
      contract: {
        team,
        status,
        wage: 0,
        fee: 0,
        ends: null,
        podium: 0,
        sinking: 0,
        breakClause: null,
        signed: 0,
      },
    };
  const K = TUNING.contracts;
  const wage = askWage(g, tier);
  const years = age(g, 0);
  const breakClause =
    rand() < K.breakShare
      ? wage * between(rand, K.breakRaces[0], K.breakRaces[1])
      : null;
  const driver = g.role === 'driver';
  return {
    ...g,
    contract: {
      team,
      status,
      wage,
      fee: askFee(wage),
      ends: between(rand, 0, askSeasons(years) - 1),
      podium: driver ? Math.round(wage * K.podium) : 0,
      sinking: driver ? Math.round(wage * K.sinking) : 0,
      breakClause,
      signed: 0,
    },
  };
}

/** A building's starting level about a tier's mean, 1..3. */
const levelAbout = (rand: Rand, mean: number): number =>
  Math.min(3, Math.max(1, Math.round(mean + (rand() - 0.5) * 1.6)));

/** A team's starting parts: one of each type on each ship, by tier. */
function startingParts(rand: Rand, tier: number, firstId: number): Part[] {
  const P = C.parts;
  return [0, 1].flatMap((ship) =>
    PART_TYPES.map((type, i): Part => {
      const perf = Math.round(P.perf[tier] + (rand() * 2 - 1) * P.spread);
      const reliability =
        Math.round((P.reliability[tier] + (rand() * 2 - 1) * 0.04) * 1000) /
        1000;
      return {
        id: firstId + ship * PART_TYPES.length + i,
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
        ship: ship as 0 | 1,
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

/** A team and its staff, made and signed. */
function makeTeam(
  g: Gathering,
  rand: Rand,
  id: number,
  tier: number,
  name: string,
  colours: Colours
): Team {
  const home = between(rand, 0, g.colonies - 1);
  const strength = W.stars[tier] + (rand() - 0.5) * W.starSpread;
  const about = () => strength + (rand() - 0.5) * 0.8;
  const from = () => (rand() < 0.5 ? home : between(rand, 0, g.colonies - 1));
  const sign = (role: Role, s: number, status: Status = 'staff') => {
    const person = signed(
      recruit(g, rand, role, s, from()),
      id,
      tier,
      status,
      rand
    );
    g.people[person.id] = person;
    return person.id;
  };
  const buildings = {} as Record<Building, Works>;
  for (const b of BUILDINGS)
    buildings[b] = { level: levelAbout(rand, C.buildings[tier]), next: null };
  const manager = sign('manager', about());
  g.people[manager] = {
    ...g.people[manager],
    reputation: Math.round(
      Math.min(
        100,
        Math.max(
          0,
          C.managerReputation[tier] + (rand() - 0.5) * C.managerSpread
        )
      )
    ),
  };
  const chairman = sign('chairman', about());
  const drivers = [
    sign('driver', about(), 'ship'),
    sign('driver', about(), 'ship'),
  ];
  const ships: [Hands, Hands] = [
    { driver: drivers[0], mechanic: sign('mechanic', about()) },
    { driver: drivers[1], mechanic: sign('mechanic', about()) },
  ];
  const reserve = sign('driver', about() - 0.5, 'reserve');
  const designer = sign('designer', about());
  const scouts = Array.from({ length: buildings.crowsNest.level }, () =>
    sign('scout', about())
  );
  const pit = JOB_ORDER.map((job) => {
    const fid = sign('pit', about());
    g.people[fid] = { ...g.people[fid], job };
    return fid;
  });
  const chairmanPerson = g.people[chairman] as PersonOf<'chairman'>;
  const budget = C.budget[tier];
  return {
    id,
    name,
    colours,
    emblem: between(rand, 0, W.emblems - 1),
    colony: home,
    tier,
    staff: { manager, chairman, ships, reserve, designer, scouts, pit },
    balance: C.balance[tier],
    budget,
    debtFloor: Math.round(debtFloor(chairmanPerson.stats.generosity, budget)),
    reputation: Math.round(
      Math.min(
        100,
        Math.max(0, C.reputation[tier] + (rand() - 0.5) * C.reputationSpread)
      )
    ),
    confidence: C.confidence,
    target: 1,
    buildings,
    parts: startingParts(rand, tier, id * 12),
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
    bonds: [0, 0],
    suppliers: { timber: null, canvas: null, cordage: null },
    sponsors: [null, null, null],
    offers: [],
    plan: null,
    player: false,
  };
}

/** Each team of a tier's target: its expected place (by the mean of its rank by staff stars and its rank by the
 *  fitted parts' performance), moved up by its chairman's Ambition. */
export function targets(
  teams: readonly Team[],
  people: readonly Person[]
): Team[] {
  const stars = (c: Team) =>
    staffStars(
      [
        c.staff.manager,
        ...c.staff.ships.flatMap((h) => [h.driver, h.mechanic]),
        c.staff.reserve,
        c.staff.designer,
        ...c.staff.scouts,
        ...c.staff.pit,
      ]
        .filter((x): x is number => x !== null)
        .map((i) => people[i])
    );
  const perf = (c: Team) =>
    c.parts.reduce((a, p) => a + (p.ship === null ? 0 : p.perf), 0);
  const rankBy = (f: (c: Team) => number) => {
    const order = [...teams].sort((a, b) => f(b) - f(a) || a.id - b.id);
    return new Map(order.map((c, i) => [c.id, i]));
  };
  const byStars = rankBy(stars),
    byParts = rankBy(perf);
  const expected = [...teams].sort(
    (a, b) =>
      byStars.get(a.id)! +
        byParts.get(a.id)! -
        byStars.get(b.id)! -
        byParts.get(b.id)! || byStars.get(a.id)! - byStars.get(b.id)!
  );
  return teams.map((c) => {
    const chairman = people[c.staff.chairman] as PersonOf<'chairman'>;
    return {
      ...c,
      target: targetPlace(chairman.stats.ambition, expected.indexOf(c) + 1),
    };
  });
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
    const deal = pairs(rand, theirs);
    const ids: number[] = [];
    for (let k = 0; k < W.teams; k++) {
      let word = place(rand);
      while (places.has(word.toLowerCase())) word = place(rand);
      places.add(word.toLowerCase());
      const id = teams.length;
      teams.push(
        makeTeam(g, rand, id, tier, teamName(word, nouns[id]), deal[k])
      );
      ids.push(id);
    }
    const rules = startingRules();
    championships.push({
      id: tier,
      teams: ids,
      rules,
      next: startingRules(),
      proposals: [],
      standings: ids.map((team) => ({
        team,
        points: 0,
        wins: 0,
        podiums: 0,
        sinkings: 0,
      })),
    });
  }
  const targeted = championships.flatMap((l) =>
    targets(
      l.teams.map((i) => teams[i]),
      g.people
    )
  );
  for (const c of targeted) teams[c.id] = c;
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
    ids: { part: teams.length * 12, mail: 0, talk: 0, proposal: 0, sponsor: 0 },
  };
  return sponsorsScheduled(
    reviewsScheduled(scheduleSeason(base, calendar), 0),
    0
  );
}

/** The free agents: 300 across every role, 30 of them managers. */
function addFreeAgents(g: Gathering, rand: Rand): void {
  const roles: Role[] = Array.from(
    { length: W.freeManagers },
    () => 'manager' as Role
  );
  const shares = Object.entries(W.freeRoles) as [Role, number][];
  const rest = W.free - W.freeManagers;
  for (const [role, share] of shares)
    for (let i = 0; i < Math.round(rest * share); i++) roles.push(role);
  while (roles.length < W.free) roles.push(pick(rand, shares)[0]);
  for (const role of roles.slice(0, W.free))
    recruit(
      g,
      rand,
      role,
      W.freeStars + (rand() - 0.5) * W.freeSpread,
      between(rand, 0, g.colonies - 1)
    );
}
