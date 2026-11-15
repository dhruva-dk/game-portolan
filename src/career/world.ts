// The world at the start (Phase B section 3): 120 crews in three leagues of forty, each named, coloured, with an
// emblem, a home colony, a manager, an elder, coin and a budget, buildings and parts by league, and a full staff; and
// 300 free agents across every role. Strength by league: staff about 3.5, 2.5 and 1.75 stars, spread by seed.
// Every draw is on the 'world' stream's rolls, so a seed and the player's colours make the same world every time.

import { SWATCHES, type Colours, type PartType, type Rules } from '../race.ts';
import type { Building, Role, Status } from '../office.ts';
import { askFee, askSeasons, askWage } from './asks.ts';
import { makeCalendar, reviewsScheduled, scheduleSeason } from './calendar.ts';
import { between, pick, shuffled, type Dice, type Rand } from './dice.ts';
import { debtFloor, targetPlace } from './leadership.ts';
import { NOUNS, colony, crewName, place } from './names.ts';
import { makeGull } from './recruit.ts';
import type { Gull, GullOf } from './roles.ts';
import { age, stars } from './stars.ts';
import { beginning, type CareerState, type Crew, type Hands, type League, type Part, type Works } from './state.ts';
import { TUNING } from './tuning.ts';

export const BUILDINGS: readonly Building[] = ['factory', 'drawingLoft', 'testTank', 'foundry', 'sailingSchool', 'flightLoft', 'crowsNest', 'fishMarket', 'landingPad'];
export const PART_TYPES: readonly PartType[] = ['sails', 'rigging', 'rudder', 'hull', 'keel', 'mounts'];
const JOB_ORDER = ['mend', 'gust', 'stores', 'part'] as const;
const W = TUNING.world, C = TUNING.crew;

/** The rules every league starts under. */
export function startingRules(): Rules {
  const R = TUNING.rules;
  return { spec: [...R.spec], storm: { pace: R.pace }, banned: [...R.banned], pointsPerSinking: R.pointsPerSinking, seaHeldPoint: R.seaHeldPoint,
    prizeSpread: R.prizeSpread, inspection: R.inspection };
}

/** Every unordered pair of crew swatches but `taken`, each as a Colours in a seeded order. */
function pairs(rand: Rand, taken: Colours): Colours[] {
  const out: Colours[] = [];
  for (let a = 0; a < SWATCHES; a++) for (let b = a + 1; b < SWATCHES; b++) {
    if ((a === taken.first && b === taken.second) || (a === taken.second && b === taken.first)) continue;
    out.push(rand() < 0.5 ? { first: a, second: b } : { first: b, second: a });
  }
  return shuffled(rand, out);
}

/** What the generator gathers as it goes: gulls by id and the names taken. */
interface Gathering { gulls: Gull[]; taken: Set<string>; day: number; colonies: number }

/** A new gull added to the gathering. */
function recruit(g: Gathering, rand: Rand, role: Role, starsNow: number, colony: number): Gull {
  const [lo, hi] = TUNING.ages.start[role];
  const gull = makeGull({ id: g.gulls.length, role, stars: Math.min(5, Math.max(0.25, starsNow)), years: between(rand, lo, hi), day: g.day, colony }, rand, g.taken);
  g.gulls.push(gull);
  return gull;
}

/** A gull signed to a crew at the start: their ask at its league, a length by age, some with a break clause. */
function signed(g: Gull, crew: number, league: number, status: Status, rand: Rand): Gull {
  if (g.role === 'elder') return { ...g, contract: { crew, status, wage: 0, fee: 0, ends: null, podium: 0, sinking: 0, breakClause: null, signed: 0 } };
  const K = TUNING.contracts;
  const wage = askWage(g, league);
  const years = age(g, 0);
  const breakClause = rand() < K.breakShare ? wage * between(rand, K.breakRaces[0], K.breakRaces[1]) : null;
  const captain = g.role === 'captain';
  return { ...g, contract: { crew, status, wage, fee: askFee(wage), ends: between(rand, 0, askSeasons(years) - 1), podium: captain ? Math.round(wage * K.podium) : 0,
    sinking: captain ? Math.round(wage * K.sinking) : 0, breakClause, signed: 0 } };
}

/** A building's starting level about a league's mean, 1..3. */
const levelAbout = (rand: Rand, mean: number): number => Math.min(3, Math.max(1, Math.round(mean + (rand() - 0.5) * 1.6)));

/** A crew's starting parts: one of each type on each ship, by league. */
function startingParts(rand: Rand, league: number, firstId: number): Part[] {
  const P = C.parts;
  return [0, 1].flatMap((ship) => PART_TYPES.map((type, i): Part => {
    const perf = Math.round(P.perf[league] + (rand() * 2 - 1) * P.spread);
    const reliability = Math.round((P.reliability[league] + (rand() * 2 - 1) * 0.04) * 1000) / 1000;
    return { id: firstId + ship * PART_TYPES.length + i, type, perf, perfMax: perf + P.headroom, reliability,
      reliabilityMax: Math.min(1, Math.round((reliability + P.reliabilityHeadroom) * 1000) / 1000), risk: 0, condition: 1, components: [],
      ship: ship as 0 | 1, forNext: false, spec: false, cost: 0 };
  }));
}

/** A crew's mean staff stars (every gull on it but the elder and the player). */
export const staffStars = (crewGulls: readonly Gull[]): number => {
  const counted = crewGulls.filter((g) => g.role !== 'elder' && !g.player);
  return counted.reduce((a, g) => a + stars(g), 0) / Math.max(1, counted.length);
};

/** A crew and its staff, made and signed. */
function makeCrew(g: Gathering, rand: Rand, id: number, league: number, name: string, colours: Colours): Crew {
  const home = between(rand, 0, g.colonies - 1);
  const strength = W.stars[league] + (rand() - 0.5) * W.starSpread;
  const about = () => strength + (rand() - 0.5) * 0.8;
  const from = () => (rand() < 0.5 ? home : between(rand, 0, g.colonies - 1));
  const sign = (role: Role, s: number, status: Status = 'staff') => {
    const gull = signed(recruit(g, rand, role, s, from()), id, league, status, rand);
    g.gulls[gull.id] = gull;
    return gull.id;
  };
  const buildings = {} as Record<Building, Works>;
  for (const b of BUILDINGS) buildings[b] = { level: levelAbout(rand, C.buildings[league]), next: null };
  const manager = sign('manager', about());
  g.gulls[manager] = { ...g.gulls[manager], reputation: Math.round(Math.min(100, Math.max(0, C.managerReputation[league] + (rand() - 0.5) * C.managerSpread))) };
  const elder = sign('elder', about());
  const captains = [sign('captain', about(), 'ship'), sign('captain', about(), 'ship')];
  const ships: [Hands, Hands] = [{ captain: captains[0], bosun: sign('bosun', about()) }, { captain: captains[1], bosun: sign('bosun', about()) }];
  const reserve = sign('captain', about() - 0.5, 'reserve');
  const shipwright = sign('shipwright', about());
  const scouts = Array.from({ length: buildings.crowsNest.level }, () => sign('scout', about()));
  const flight = JOB_ORDER.map((job) => {
    const fid = sign('flight', about());
    g.gulls[fid] = { ...g.gulls[fid], job };
    return fid;
  });
  const elderGull = g.gulls[elder] as GullOf<'elder'>;
  const budget = C.budget[league];
  return {
    id, name, colours, emblem: between(rand, 0, W.emblems - 1), colony: home, league,
    staff: { manager, elder, ships, reserve, shipwright, scouts, flight },
    coin: C.coin[league], budget, debtFloor: Math.round(debtFloor(elderGull.stats.generosity, budget)),
    reputation: Math.round(Math.min(100, Math.max(0, C.reputation[league] + (rand() - 0.5) * C.reputationSpread))),
    confidence: C.confidence, target: 1, buildings, parts: startingParts(rand, league, id * 12), design: null, yard: [],
    lastNew: { sails: null, rigging: null, rudder: null, hull: null, keel: null, mounts: null }, bonds: [0, 0],
    suppliers: { timber: null, canvas: null, cordage: null }, patrons: [], plan: null, player: false,
  };
}

/** Each crew of a league's target: its rank by staff stars, moved up by its elder's Ambition. */
export function targets(crews: readonly Crew[], gulls: readonly Gull[]): Crew[] {
  const strength = (c: Crew) => staffStars([c.staff.manager, ...c.staff.ships.flatMap((h) => [h.captain, h.bosun]), c.staff.reserve, c.staff.shipwright, ...c.staff.scouts, ...c.staff.flight]
    .filter((x): x is number => x !== null).map((i) => gulls[i]));
  const ranked = [...crews].sort((a, b) => strength(b) - strength(a) || a.id - b.id);
  return crews.map((c) => {
    const elder = gulls[c.staff.elder] as GullOf<'elder'>;
    return { ...c, target: targetPlace(elder.stats.ambition, ranked.indexOf(c) + 1) };
  });
}

/** The world of a seed, with the player's colours taken out of the deal: before founding (career/found.ts). */
export function makeWorld(seed: number, theirs: Colours, roll: Dice): CareerState {
  const rand = roll.roll('world');
  const colonies: string[] = [];
  while (colonies.length < W.colonies) {
    const c = colony(rand);
    if (!colonies.includes(c)) colonies.push(c);
  }
  const g: Gathering = { gulls: [], taken: new Set(), day: 0, colonies: colonies.length };
  const nouns = shuffled(rand, NOUNS);
  const places = new Set<string>(nouns.map((n) => n.toLowerCase()));
  const crews: Crew[] = [];
  const leagues: League[] = [];
  for (let league = 0; league < W.leagues; league++) {
    const deal = pairs(rand, theirs);
    const ids: number[] = [];
    for (let k = 0; k < W.crews; k++) {
      let word = place(rand);
      while (places.has(word.toLowerCase())) word = place(rand);
      places.add(word.toLowerCase());
      const id = crews.length;
      crews.push(makeCrew(g, rand, id, league, crewName(word, nouns[id]), deal[k]));
      ids.push(id);
    }
    const rules = startingRules();
    leagues.push({ id: league, crews: ids, rules, next: startingRules(), proposals: [],
      standings: ids.map((crew) => ({ crew, points: 0, wins: 0, podiums: 0, sinkings: 0 })) });
  }
  const targeted = leagues.flatMap((l) => targets(l.crews.map((i) => crews[i]), g.gulls));
  for (const c of targeted) crews[c.id] = c;
  addFreeAgents(g, rand);
  const calendar = makeCalendar(0, 0, rand);
  const base: CareerState = { ...beginning(0), seed, colonies, gulls: g.gulls, crews, leagues, calendar, ids: { part: crews.length * 12, mail: 0, talk: 0, proposal: 0 } };
  return reviewsScheduled(scheduleSeason(base, calendar), 0);
}

/** The free agents: 300 across every role, 30 of them managers. */
function addFreeAgents(g: Gathering, rand: Rand): void {
  const roles: Role[] = Array.from({ length: W.freeManagers }, () => 'manager' as Role);
  const shares = Object.entries(W.freeRoles) as [Role, number][];
  const rest = W.free - W.freeManagers;
  for (const [role, share] of shares) for (let i = 0; i < Math.round(rest * share); i++) roles.push(role);
  while (roles.length < W.free) roles.push(pick(rand, shares)[0]);
  for (const role of roles.slice(0, W.free)) recruit(g, rand, role, W.freeStars + (rand() - 0.5) * W.freeSpread, between(rand, 0, g.colonies - 1));
}
