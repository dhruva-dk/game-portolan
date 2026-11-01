import { bool, bytes, decode, encode, f64, hash64, int, list, rec, words, type Format, type Value } from './codec.ts';
import {
  PI, addScaled, cross, dacos, dcos, dot, dsin, hash32, normalize, rngDir, rngFloat, rngFrom, rngInt, rngRange, set, v3,
  type Rng, type V3,
} from './math.ts';
import { R, TERRITORY, advance } from './sphere.ts';
import {
  GULL, BATTERIES, COINS, CONSUMABLE_SLOTS, DAY, DOUBLED_PLANKING, FITTING, FITTING_SLOT, FORM, FORMS, GUSTS, OPENING, SLOT, SLOTS, SPELL, START_FITTINGS, STORM, TIERS, WEATHER,
} from './tables.ts';
import { greatCurrent, type CurrentRoute } from './world/geography.ts';
import { REGIONS } from './world/regions.ts';

export const TICK = 1 / 30;
export const SHIPS = 10;

export const STREAM = { world: 0, weather: 1, wind: 2, loot: 3, storm: 4, captains: 5 } as const;
const STREAMS = STREAM.captains + SHIPS - 1;

export const SAIL = { reefed: 0, plain: 1, full: 2 } as const;

export const AFLOAT = { coin: 0, flotsam: 1, bottle: 2 } as const;

export const PHASE = { riding: 0, peeling: 1, sailing: 2, sunk: 3 } as const;

export const FLIGHT = { mast: 0, wheel: 1, out: 2, away: 3, back: 4, circle: 5, dive: 6 } as const;

export const CAUSE = { gun: 0, ram: 1, fire: 2, rocks: 3, hotWater: 4, storm: 5 } as const;

const FIND_SITES = REGIONS.reduce((n, r) => n + r.finds.length, 0);

const XYZ = rec(['x', f64], ['y', f64], ['z', f64]);

const FIT = rec(['kind', int], ['tier', int]);

const STOCK = rec(['kind', int], ['count', int]);

const COMPANION = rec(
  ['talons', int],
  ['wings', int],
  ['eye', int],
  ['beak', int],
  ['dive', int],
  ['flight', int],
  ['at', XYZ],
  ['dir', XYZ],
  ['span', f64],
  ['time', f64],
  ['tier', int],
  ['prey', int],
  ['cool', f64],
  ['spied', int],
  ['site', int],
);

const CAPTAIN = rec(
  ['temperament', int],
  ['skill', f64],
  ['gentle', bool],
  ['grudge', int],
  ['knows', int],
  ['breakOff', int],
  ['loop', f64],
  ['raids', f64],
  ['run', f64],
  ['margin', f64],
  ['fittings', list(int)],
  ['mode', int],
  ['target', int],
  ['goal', XYZ],
  ['want', XYZ],
  ['intent', XYZ],
  ['anchor', XYZ],
  ['plan', list(int)],
  ['tell', f64],
  ['since', f64],
  ['think', int],
  ['loops', int],
  ['trim', int],
  ['avoid', f64],
  ['felt', f64],
  ['watches', bool],
  ['learnt', int],
  ['seen', int],
  ['eyed', int],
);

const SHIP = rec(
  ['form', int],
  ['pigment', int],
  ['pattern', int],
  ['gull', COMPANION],
  ['phase', int],
  ['ride', f64],
  ['peel', f64],
  ['pos', XYZ],
  ['head', XYZ],
  ['was', XYZ],
  ['wasHead', XYZ],
  ['speed', f64],
  ['rate', f64],
  ['shove', XYZ],
  ['fling', XYZ],
  ['sail', int],
  ['course', list(int)],
  ['leg', int],
  ['home', list(int)],
  ['homeLeg', int],
  ['homing', bool],
  ['torn', f64],
  ['fittings', list(FIT, SLOTS)],
  ['bump', f64],
  ['bumped', int],
  ['bumpOn', f64],
  ['laid', list(int)],
  ['purse', f64],
  ['bank', f64],
  ['held', f64],
  ['prize', int],
  ['holding', f64],
  ['hull', f64],
  ['flask', f64],
  ['flare', f64],
  ['fogged', list(bool)],
  ['fire', f64],
  ['fireBy', int],
  ['ward', f64],
  ['patch', f64],
  ['boost', f64],
  ['cut', f64],
  ['consumables', list(STOCK, CONSUMABLE_SLOTS)],
  ['offer', list(FIT)],
  ['reload', list(f64, BATTERIES)],
  ['gunnery', f64],
  ['harm', list(f64, SHIPS)],
  ['captain', CAPTAIN],
);

const GUST = rec(['at', XYZ], ['age', f64], ['life', f64], ['r', f64]);

const WEATHER_SPELL = rec(['kind', int], ['at', XYZ], ['v', XYZ], ['r', f64], ['age', f64], ['life', f64]);

const COIN = rec(['kind', int], ['at', XYZ], ['value', f64], ['age', f64]);

const HAPPENING = rec(['kind', int], ['ship', int], ['by', int], ['at', XYZ], ['amount', f64], ['cells', list(int)]);

const ENTRY = rec(['tick', int], ['kind', int], ['ship', int], ['by', int], ['amount', f64]);

const CHEST = rec(['at', XYZ], ['tier', int], ['fitting', FIT], ['from', int]);

const KEG = rec(['ship', int], ['at', XYZ], ['age', f64], ['tier', int]);

const SINKING = rec(['ship', int], ['by', int], ['cause', int], ['tick', int]);

const SHOT = rec(
  ['ship', int], ['kind', int], ['from', XYZ], ['to', XYZ], ['age', f64], ['time', f64], ['top', f64],
  ['power', f64], ['effect', int], ['lasting', f64], ['blast', f64],
);

const CALM = rec(['at', XYZ], ['r', f64]);

const MATCH = rec(
  ['seed', int],
  ['tick', int],
  ['rng', list(words(4), STREAMS)],
  ['ships', list(SHIP, SHIPS)],
  ['gusts', list(GUST, GUSTS.count)],
  ['weather', list(WEATHER_SPELL, WEATHER.count)],
  ['hour', f64],
  ['owner', bytes(TERRITORY.cells)],
  ['trail', bytes(TERRITORY.cells)],
  ['coins', list(COIN, COINS.count)],
  ['finds', list(f64, FIND_SITES)],
  ['leader', int],
  ['charm', bool],
  ['rank', int],
  ['events', list(HAPPENING)],
  ['timeline', list(ENTRY)],
  ['storm', rec(['origin', XYZ], ['calms', list(CALM)])],
  ['chests', list(CHEST)],
  ['kegs', list(KEG)],
  ['shots', list(SHOT)],
  ['sunk', list(SINKING)],
  ['winner', int],
);

export type Ship = Value<typeof SHIP>;
export type Gull = Value<typeof COMPANION>;
export type Gust = Value<typeof GUST>;
export type Spell = Value<typeof WEATHER_SPELL>;
export type MatchState = Value<typeof MATCH>;
export type Coin = Value<typeof COIN>;
export type Happening = Value<typeof HAPPENING>;
export type Entry = Value<typeof ENTRY>;
export type Chest = Value<typeof CHEST>;
export type Sinking = Value<typeof SINKING>;
export type Shot = Value<typeof SHOT>;
export type Keg = Value<typeof KEG>;

export const afloat = (ship: Ship): boolean => ship.phase !== PHASE.sunk;

export const MATCH_FORMAT: Format<typeof MATCH> = { magic: 'PTLM', version: 13, schema: MATCH };

export const EVENT = {
  home: 0,
  loop: 1,
  broken: 2,
  spill: 3,
  bank: 4,
  scoop: 5,
  swallow: 6,
  lead: 7,
  find: 8,
  afloat: 9,
  erupt: 10,
  breakOff: 11,
  thrown: 12,
  sunk: 13,
  bounty: 14,
  chest: 15,
  win: 16,
  freed: 17,
  broadside: 18,
  hit: 19,
  splash: 20,
  ram: 21,
  struck: 22,
  ablaze: 23,
  engage: 24,
  opened: 25,
  chosen: 26,
  swapped: 27,
  used: 28,
  keg: 29,
  kegBurst: 30,
  mortar: 31,
  shell: 32,
  called: 33,
  departed: 34,
  returning: 35,
  landed: 36,
  chestLost: 37,
  dive: 38,
  snatch: 39,
  spotted: 40,
} as const;

export function emit(state: MatchState, kind: number, ship: number, by: number, at: V3, amount: number, cells: number[] = []): void {
  state.events.push({ kind, ship, by, at: { x: at.x, y: at.y, z: at.z }, amount, cells });
}

export function chronicle(state: MatchState, kind: number, ship: number, by: number, amount: number): void {
  state.timeline.push({ tick: state.tick, kind, ship, by, amount });
}

export interface Outfit {
  form?: number;
  pigment?: number;
  pattern?: number;
  fittings?: readonly { kind: number; tier: number }[];
  gull?: { talons?: number; wings?: number; eye?: number; beak?: number; dive?: number };
  gunnery?: number;
  captain?: { temperament: number; tier: number };
}

export interface Expect {
  value: number;
  confidence: number;
}

export interface Mind {
  gentle: boolean;
  grudge: number;
  breakOff: Expect;
  loop: Expect;
  raids: Expect;
  run: Expect;
  storm: Expect;
  fittings: readonly number[];
}

export const KNOW = { breakOff: 1, loop: 2, raids: 4, run: 8, storm: 16 } as const;

const KNOWN = 500;

export interface MatchSetup {
  seed: number;
  fleet?: readonly Outfit[];
  hour?: number;
  firstVoyage?: boolean;
  rank?: number;
  minds?: readonly (Mind | null)[];
  known?: readonly number[];
}

export function createMatch(setup: MatchSetup): MatchState {
  const { seed, fleet = new Array<Outfit>(SHIPS).fill({}), hour = startHour(seed), firstVoyage = false, rank = 1, minds } = setup;
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) throw new RangeError(`createMatch: seed ${seed} is not a uint32`);
  if (fleet.length !== SHIPS) throw new RangeError(`createMatch: a fleet of ${fleet.length} ships, not ${SHIPS}`);
  if (minds !== undefined && minds.length !== SHIPS) throw new RangeError(`createMatch: ${minds.length} minds, not ${SHIPS}`);
  fleet.forEach(check);
  if (!(hour >= 0 && hour < 24)) throw new RangeError(`createMatch: hour ${hour} is not in 0…24`);
  if (!Number.isInteger(rank) || rank < 1) throw new RangeError(`createMatch: rank tier ${rank} is not a whole number from 1`);
  const rng: Uint32Array[] = [];
  for (let s = 0; s < STREAMS; s++) rng.push(rngFrom(hash32(seed, s)));
  const route = greatCurrent(seed), ships: Ship[] = [], gusts: Gust[] = [];
  for (let i = 0; i < SHIPS; i++) ships.push(launch(route, i, fleet[i], minds?.[i] ?? null));
  for (let g = 0; g < GUSTS.count; g++) gusts.push({ at: v3(0, 0, 1), age: 0, life: 0, r: 0 });
  const weather = Array.from({ length: WEATHER.count }, () => ({ kind: SPELL.fair, at: v3(0, 0, 1), v: v3(), r: 0, age: 0, life: 0 }));
  const coins = Array.from({ length: COINS.count }, () => ({ kind: AFLOAT.coin, at: v3(0, 0, 1), value: 0, age: 0 }));
  return {
    seed, tick: 0, rng, ships, gusts, weather, hour, owner: new Uint8Array(TERRITORY.cells), trail: new Uint8Array(TERRITORY.cells),
    coins, finds: new Array<number>(FIND_SITES).fill(0), leader: -1, charm: firstVoyage, rank, events: [], timeline: [],
    storm: stormPlan(rng[STREAM.storm]), chests: [], kegs: [], shots: [], sunk: [], winner: -1,
  };
}

function check(o: Outfit, i: number): void {
  const whole = (x: number | undefined, below = Infinity): boolean => x === undefined || (Number.isInteger(x) && x >= 0 && x < below);
  const fits = o.fittings === undefined || (o.fittings.length === SLOTS && o.fittings.every((f, s) => (f.kind === FITTING.none || FITTING_SLOT[f.kind] === s) && whole(f.tier, TIERS)));
  const g = o.gull ?? {}, trained = (['talons', 'wings', 'eye', 'beak', 'dive'] as const).every((t) => whole(g[t], GULL.levels[t] + 1));
  const share = o.gunnery === undefined || (o.gunnery >= 0 && o.gunnery <= 1);
  const crew = o.captain === undefined || (whole(o.captain.temperament) && Number.isInteger(o.captain.tier) && o.captain.tier >= 1);
  if (!whole(o.form, FORMS.length) || !whole(o.pigment) || !whole(o.pattern) || !trained || !fits || !share || !crew) {
    throw new RangeError(`createMatch: ship ${i}'s outfit cannot be fitted out`);
  }
}

function startHour(seed: number): number {
  const rng = rngFrom(hash32(seed, STREAMS));
  const [from, to] = DAY.starts[rngInt(rng, DAY.starts.length)];
  return rngRange(rng, from, to);
}

export function fullHull(form: number, fittings: readonly { kind: number; tier: number }[]): number {
  const h = fittings[SLOT.hull];
  return FORMS[form].hull * (1 + (h.kind === FITTING.doubledPlanking ? DOUBLED_PLANKING[h.tier] : 0));
}

export function stormPlan(rng: Rng): MatchState['storm'] {
  const origin = rngDir(rng, v3()), r = STORM.phases.map((p) => p.calm / R), n = r.length, end = v3();
  do rngDir(rng, end); while (dot(end, origin) > dcos(r[n - 2]));
  const far = v3(-origin.x, -origin.y, -origin.z), c = dot(end, far), d = dacos(Math.max(-1, Math.min(1, c)));
  const w = d > 1e-9 ? normalize(addScaled(v3(), far, end, -c)) : v3();
  const x = new Array<number>(n).fill(0);
  for (let k = n - 3; k >= 0; k--) {
    const give = r[k] - r[k + 1], lo = Math.max(0, d - PI + r[k], x[k + 1] - give), hi = Math.min(d, x[k + 1] + give);
    x[k] = lo + (hi - lo) * rngFloat(rng);
  }
  const calms = x.map((a, k) => {
    const ca = dcos(a), sa = dsin(a);
    return { at: normalize(v3(end.x * ca + w.x * sa, end.y * ca + w.y * sa, end.z * ca + w.z * sa)), r: r[k] };
  });
  return { origin, calms };
}

export const LANE: readonly number[] = [0, -3.5, 3.5, -7, 7, 0, -3.5, 3.5, -7, 7];
const START = [12, 4];
const AT = v3(), SIDE = v3();

export function onCurrent(route: CurrentRoute, s: number, lane: number, pos: V3, head: V3): void {
  const p = route.points, n = p.length / 3, f = Math.min(Math.max(s / 2, 0), n - 1), k = Math.min(Math.floor(f), n - 2);
  const t = f - k, a = 3 * k, b = a + 3;
  normalize(set(AT, p[a] + (p[b] - p[a]) * t, p[a + 1] + (p[b + 1] - p[a + 1]) * t, p[a + 2] + (p[b + 2] - p[a + 2]) * t));
  set(head, p[b] - p[a], p[b + 1] - p[a + 1], p[b + 2] - p[a + 2]);
  normalize(addScaled(head, head, AT, -dot(head, AT)));
  advance(AT, cross(SIDE, head, AT), lane, pos, SIDE);
  normalize(addScaled(head, head, pos, -dot(head, pos)));
}

function launch(route: CurrentRoute, i: number, o: Outfit, mind: Mind | null): Ship {
  const { form = FORM.pinnace, pigment = i, pattern = 0, gull = {}, gunnery = 1 } = o, ride = START[(i / 5) | 0], pos = v3(), head = v3();
  const fittings = o.fittings ? o.fittings.map(({ kind, tier }) => ({ kind, tier })) : START_FITTINGS.map((kind) => ({ kind, tier: 0 }));
  onCurrent(route, ride, LANE[i], pos, head);
  return {
    form, pigment, pattern, gull: companion(gull, pos), phase: PHASE.riding, ride, peel: 0, pos, head, was: { ...pos }, wasHead: { ...head },
    speed: OPENING.way, rate: 0, shove: v3(), fling: v3(), sail: SAIL.full, course: [], leg: 0, home: [], homeLeg: 0,
    homing: false, torn: 0, fittings, bump: 0, bumped: -1, bumpOn: 0, laid: [], purse: 0, bank: 0, held: 0, prize: -1, holding: 0,
    hull: fullHull(form, fittings), flask: 0, flare: 0, fogged: [], fire: 0, fireBy: -1, ward: 0,
    patch: 0, boost: 0, cut: 0, consumables: Array.from({ length: CONSUMABLE_SLOTS }, () => ({ kind: 0, count: 0 })), offer: [],
    reload: new Array<number>(BATTERIES).fill(0), gunnery, harm: new Array<number>(SHIPS).fill(0),
    captain: captainOf(o.captain, mind),
  };
}

function captainOf(who: Outfit['captain'], mind: Mind | null): Ship['captain'] {
  const bit = (e: Expect, b: number): number => (e.confidence >= KNOWN ? b : 0);
  const knows = mind ? bit(mind.breakOff, KNOW.breakOff) | bit(mind.loop, KNOW.loop) | bit(mind.raids, KNOW.raids) | bit(mind.run, KNOW.run) | bit(mind.storm, KNOW.storm) : 0;
  return {
    temperament: who ? who.temperament : -1, skill: who ? Math.min(1, (who.tier - 1) / 7) : 0, gentle: mind?.gentle ?? false,
    grudge: mind?.grudge ?? 0, knows, breakOff: mind?.breakOff.value ?? -1, loop: mind?.loop.value ?? -1, raids: mind?.raids.value ?? -1,
    run: mind?.run.value ?? -1, margin: mind?.storm.value ?? 0, fittings: mind ? [...mind.fittings] : [], mode: 0, target: -1, goal: v3(), want: v3(), intent: v3(), anchor: v3(),
    plan: [], tell: 0, since: 0, think: 1, loops: 0, trim: SAIL.full, avoid: 0, felt: 0,
    watches: mind !== null && !mind.gentle, learnt: 0, seen: 0, eyed: 0,
  };
}

export const encodeMatch = (state: MatchState): Uint8Array => encode(MATCH_FORMAT, state);

function companion({ talons = 0, wings = 0, eye = 0, beak = 0, dive = 0 }: NonNullable<Outfit['gull']>, pos: V3): Gull {
  return { talons, wings, eye, beak, dive, flight: FLIGHT.mast, at: { ...pos }, dir: v3(), span: 0, time: 0, tier: -1, prey: -1, cool: 0, spied: 0, site: -1 };
}

export const decodeMatch = (bytes: Uint8Array): MatchState => decode(MATCH_FORMAT, bytes);

export const matchHash = (state: MatchState): string => hash64(encodeMatch(state));
