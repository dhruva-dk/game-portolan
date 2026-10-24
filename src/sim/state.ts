// The whole state of a match: one plain-data object graph that the renderer, interface and audio only read and
// only the step (match.ts) writes. Its shape is declared once, as codec schemas; its TypeScript types, its
// snapshot encoding and its hash all follow from them. To add state, add a field to a schema here and bump
// MATCH_FORMAT.version, so snapshots of the old shape are discarded rather than misread.
import { bool, bytes, decode, encode, f64, hash64, int, list, rec, words, type Format, type Value } from './codec.ts';
import {
  PI, addScaled, cross, dacos, dcos, dot, dsin, hash32, normalize, rngDir, rngFloat, rngFrom, rngInt, rngRange, set, v3,
  type Rng, type V3,
} from './math.ts';
import { R, TERRITORY, advance } from './sphere.ts';
import {
  BATTERIES, COINS, DAY, DOUBLED_PLANKING, FITTING, FORM, FORMS, GUSTS, OPENING, SLOT, SLOTS, SPELL, START_FITTINGS, STORM, TIERS, WEATHER,
} from './tables.ts';
import { greatCurrent, type CurrentRoute } from './world/geography.ts';
import { REGIONS } from './world/regions.ts';

/** Seconds per tick: the simulation's fixed timestep. */
export const TICK = 1 / 30;
/** Ships in a match. Ship 0 is the player; ships 1–9 are captains. */
export const SHIPS = 10;

/**
 * The random streams, one generator each, so a system that draws more or fewer numbers never shifts another
 * system's draws. Captain ship i (1–9) draws from stream `captains + i − 1`.
 */
export const STREAM = { world: 0, weather: 1, wind: 2, loot: 3, storm: 4, captains: 5 } as const;
const STREAMS = STREAM.captains + SHIPS - 1;

/** The sail settings that ShipInput.sail steps between. */
export const SAIL = { reefed: 0, plain: 1, full: 2 } as const;

/** What floats for any hull to scoop (MatchState.coins): coins spilled or rained, flotsam wrecks shed, drifting bottles. */
export const AFLOAT = { coin: 0, flotsam: 1, bottle: 2 } as const;

/** Where a ship is in its match: riding the Great Current, peeling off it until its home inks, at sea, or sunk. */
export const PHASE = { riding: 0, peeling: 1, sailing: 2, sunk: 3 } as const;

/** How a ship sank (Sinking.cause, EVENT.sunk's amount): to combat (WP8 part B) or the storm (part C, and the deadline). */
export const CAUSE = { gun: 0, ram: 1, fire: 2, rocks: 3, hotWater: 4, storm: 5 } as const;

/** The find sites: the wrecks and island caches of every region (Geography.finds order). */
const FIND_SITES = REGIONS.reduce((n, r) => n + r.finds.length, 0);

/** A point or direction in space: positions are unit vectors from the planet's centre, headings unit tangents. */
const XYZ = rec(['x', f64], ['y', f64], ['z', f64]);

/** A fitting in a slot: a FITTING and its tier. */
const FIT = rec(['kind', int], ['tier', int]);

const SHIP = rec(
  ['form', int], // a FORM
  ['pigment', int], // the hull's pigment and the sails' pattern, as the career fitted it out (MatchSetup.fleet)
  ['pattern', int],
  ['gull', int], // the companion gull's level (WP9)
  ['phase', int], // a PHASE
  ['ride', f64], // u down the Great Current: where it rides, or where it left the current
  ['peel', f64], // seconds since it broke off: its home inks where it has slowed, clear of the current
  ['pos', XYZ], // where the ship is
  ['head', XYZ], // where its bow points
  ['was', XYZ], // the position a tick ago, and the heading: the renderer interpolates from them
  ['wasHead', XYZ],
  ['speed', f64], // u/s through the water along the heading
  ['rate', f64], // turn rate, rad/s, positive to starboard
  ['shove', XYZ], // a tangent velocity in u/s from blows (collisions), dying away
  ['fling', XYZ], // the Maelstrom's carry, u/s tangent: its water's way, kept a while after leaving it
  ['sail', int], // a SAIL setting
  ['course', list(int)], // the drawn course: territory cells to sail through in order; empty when steering by hand
  ['leg', int], // the course point being sailed for
  ['home', list(int)], // while head home is held: the route to the ship's own waters, as territory cells
  ['homeLeg', int],
  ['homing', bool], // head home was held last tick
  ['torn', f64], // seconds left of sails torn by chain shot
  ['fittings', list(FIT, SLOTS)], // by SLOT
  ['bump', f64], // this tick's impact: the closing speed in u/s, 0 when nothing was struck
  ['bumped', int], // what was struck: −1 nothing, a ship index, or SHIPS for land
  ['bumpOn', f64], // where on the hull: −1 the stern … 1 the bow
  ['laid', list(int)], // the open trail: the territory cells it crosses, in the order laid; empty when none is open
  ['purse', f64], // doubloons won on the open trail: lost if it breaks, banked when its loop closes
  ['bank', f64], // doubloons banked, safe for the match
  ['held', f64], // the sea it holds, AREA_Q quanta: whole numbers, so exact in any order (territory.ts keeps it)
  ['prize', int], // the find site it is holding beside to take: −1 none
  ['holding', f64], // the seconds it has held there
  ['hull', f64], // hull points left: it sinks at none (combat.ts damage); fullHull when it sets out
  ['flask', f64], // seconds left of its fog flask, and of its flare (WP9 lights and burns them; visibility.ts reads them)
  ['flare', f64],
  ['fogged', list(bool)], // beside `laid`: whether each cell was laid in fog, never to show on rival charts (visibility.ts)
  ['fire', f64], // seconds left of the fire burning its hull (combat.ts ignite), and the ship that set it (−1 none)
  ['fireBy', int],
  ['ward', f64], // seconds left of its ward (WP9 lights and burns it): combat.ts damage takes nothing from the hull meanwhile
  ['reload', list(f64, BATTERIES)], // by BATTERY, seconds until it has reloaded (combat.ts)
  ['gunnery', f64], // how well its gunners lead a moving target, 0 … 1 (Outfit.gunnery)
  ['harm', list(f64, SHIPS)], // the hull it has lost to each ship: the captains remember who hurt them
);

/** A gust: a patch of stronger wind running downwind, rising and dying over its life. Never spawned while life = 0. */
const GUST = rec(['at', XYZ], ['age', f64], ['life', f64], ['r', f64]);

/**
 * A weather spell, of a SPELL kind (a fog bank, a squall, a calm, or a fair rest): its centre, its drift (u/s tangent)
 * and outer radius (u), rising and fading over its life. Never yet sent while life = 0.
 */
const WEATHER_SPELL = rec(['kind', int], ['at', XYZ], ['v', XYZ], ['r', f64], ['age', f64], ['life', f64]);

/** Something afloat, of an AFLOAT kind, worth `value` doubloons (0: a free place), gone at the end of its kind's life. */
const COIN = rec(['kind', int], ['at', XYZ], ['value', f64], ['age', f64]);

/** An EVENT: its kind, the ship it is about, the other ship in it (−1 none), where, how much, and the cells it touched. */
const HAPPENING = rec(['kind', int], ['ship', int], ['by', int], ['at', XYZ], ['amount', f64], ['cells', list(int)]);

/** A timeline entry: an EVENT the results remember, at its tick. */
const ENTRY = rec(['tick', int], ['kind', int], ['ship', int], ['by', int], ['amount', f64]);

/** A chest afloat at its wreck: the fitting a sinking dropped, from the ship that sank (WP9: what else it holds, how it is taken). */
const CHEST = rec(['at', XYZ], ['fitting', FIT], ['from', int]);

/** A sinking: the ship, the ship that sank it (−1 none), its CAUSE and its tick. */
const SINKING = rec(['ship', int], ['by', int], ['cause', int], ['tick', int]);

/**
 * A shot in flight (combat.ts launch): fired by `ship` from its `kind` of FITTING, flying along the great circle from
 * `from` to where it falls, `to`, in `time` s, `age` s of it flown, `top` u high at mid-flight (drawn only). It strikes
 * for `power` hull with an EFFECT lasting `lasting` s; a shell with `blast` > 0 flies over everything and bursts where it falls.
 */
const SHOT = rec(
  ['ship', int], ['kind', int], ['from', XYZ], ['to', XYZ], ['age', f64], ['time', f64], ['top', f64],
  ['power', f64], ['effect', int], ['lasting', f64], ['blast', f64],
);

/** A calm of the storm's plan: the storm-free cap round `at`, of angular radius r. */
const CALM = rec(['at', XYZ], ['r', f64]);

const MATCH = rec(
  ['seed', int], // the match seed, a uint32
  ['tick', int], // ticks stepped; match time is tick·TICK
  ['rng', list(words(4), STREAMS)], // each STREAM's generator
  ['ships', list(SHIP, SHIPS)],
  ['gusts', list(GUST, GUSTS.count)],
  ['weather', list(WEATHER_SPELL, WEATHER.count)],
  ['hour', f64], // the hour the match started at; hourOf (weather.ts) gives the hour now
  ['owner', bytes(TERRITORY.cells)], // who holds each territory cell: 0 nobody, else ship index + 1
  ['trail', bytes(TERRITORY.cells)], // whose open trail crosses each cell, coded the same way
  ['coins', list(COIN, COINS.count)], // what floats: coins, flotsam, bottles
  ['finds', list(f64, FIND_SITES)], // each find site's wait: seconds until it is back to take, 0 while it is there
  ['leader', int], // the ship flying the gold-leaf pennant, holding the most sea; −1 while nobody holds any
  ['charm', bool], // the first voyage: the player's trail cannot break until its first loop closes
  ['events', list(HAPPENING)], // this tick's events, cleared at the start of each step
  ['timeline', list(ENTRY)], // the events the results remember
  ['storm', rec(['origin', XYZ], ['calms', list(CALM)])], // where the storm rises, revealed from the first tick, and its plan (stormPlan)
  ['chests', list(CHEST)], // chests afloat
  ['shots', list(SHOT)], // shots in flight, in the order fired
  ['sunk', list(SINKING)], // the sinkings, in the order they happened: the finishing order from the last place up
  ['winner', int], // the last ship afloat once the match is over; −1 while it runs
);

export type Ship = Value<typeof SHIP>;
export type Gust = Value<typeof GUST>;
export type Spell = Value<typeof WEATHER_SPELL>;
export type MatchState = Value<typeof MATCH>;
export type Coin = Value<typeof COIN>;
export type Happening = Value<typeof HAPPENING>;
export type Entry = Value<typeof ENTRY>;
export type Chest = Value<typeof CHEST>;
export type Sinking = Value<typeof SINKING>;
export type Shot = Value<typeof SHOT>;

/** The ship has not sunk: it sails, scoops, holds, collides and is seen. */
export const afloat = (ship: Ship): boolean => ship.phase !== PHASE.sunk;

export const MATCH_FORMAT: Format<typeof MATCH> = { magic: 'PTLM', version: 8, schema: MATCH };

/** What happened, for the renderer, the interface and the audio (this tick's `events`) and the results (`timeline`). */
export const EVENT = {
  home: 0, // a ship inked its home disc: amount its u², cells the disc
  loop: 1, // a loop closed: amount the u² claimed, cells the trail that closed it
  broken: 2, // a trail broke: ship its owner, by the rival that crossed it, at the break, amount the purse lost, cells the trail
  spill: 3, // doubloons spilled as coins round `at`: ship whose they were, amount
  bank: 4, // a purse banked: amount
  scoop: 5, // a ship scooped something afloat at `at`: by its AFLOAT kind, amount
  swallow: 6, // the storm swallowed sea: amount its u², cells
  lead: 7, // the pennant passed to ship (−1 nobody) from by: amount the u² the new holder holds
  find: 8, // a ship took a wreck or cache: by the find site (Geography.finds), at the site, amount
  afloat: 9, // flotsam or a bottle came afloat: by its AFLOAT kind, at where, amount its worth
  erupt: 10, // the Caldera erupted: ship its holder (−1 nobody), at the Caldera, amount the doubloons it rains
  breakOff: 11, // a ship broke off the Great Current: by the region it peels into, amount u down the current
  thrown: 12, // a ship rode the Great Current to its end and was thrown off there: by the region, amount u down it
  sunk: 13, // a ship sank: by the ship that sank it (−1 none), amount its CAUSE
  bounty: 14, // a sinker's bounty: ship the sinker, by the ship it sank, amount the doubloons
  chest: 15, // a sinking dropped a chest at `at`: ship whose, by the FITTING in it, amount its tier
  win: 16, // the match is over: ship the last afloat, amount the u² it holds
  freed: 17, // a sunk ship's sea fell to nobody: amount its u², cells
  broadside: 18, // a battery fired (muzzle smoke, "a broadside fired"): by the rival it bore on, at the ship, amount its BATTERY
  hit: 19, // a shot struck ship ("a hit taken": splinters, a shiver through its sails): by the shooter, at where, amount the hull it struck for
  splash: 20, // a shot fell at `at` without striking a hull: ship the shooter, amount 1 on land, 0 in the sea
  ram: 21, // ship was rammed by `by`: at the pair, amount the hull it struck for
  struck: 22, // ship struck reef or rock at speed: amount the hull it lost
  ablaze: 23, // ship's hull caught fire: by who set it (−1 embers), amount the seconds it will burn
  engage: 24, // timeline only: a rival first drew ship's hull: by the rival, amount the CAUSE
} as const;

/** Record an event of this tick (the step clears them first); `cells` is kept, not copied. */
export function emit(state: MatchState, kind: number, ship: number, by: number, at: V3, amount: number, cells: number[] = []): void {
  state.events.push({ kind, ship, by, at: { x: at.x, y: at.y, z: at.z }, amount, cells });
}

/** Enter an event in the match's timeline, which the results read. */
export function chronicle(state: MatchState, kind: number, ship: number, by: number, amount: number): void {
  state.timeline.push({ tick: state.tick, kind, ship, by, amount });
}

/** How the career fits out one ship for a match; what it leaves out, the ship starts with. */
export interface Outfit {
  /** A FORM; the pinnace. */
  form?: number;
  /** The hull's pigment and the sails' pattern, as the shipwright numbers its swatches; the ship's index, plain sails. */
  pigment?: number;
  pattern?: number;
  /** For each SLOT a FITTING and its tier (0 … TIERS − 1); START_FITTINGS at the first tier. */
  fittings?: readonly { kind: number; tier: number }[];
  /** The companion gull's level (WP9); 1, the gull every captain starts with. */
  gull?: number;
  /** How well its gunners lead a moving target, 0 (where it is) … 1 (where it will be), by the captain's rank (WP11); 1. */
  gunnery?: number;
}

/** Everything a match starts from besides the player's inputs. The career's match setup fills it in. */
export interface MatchSetup {
  /** A uint32. */
  seed: number;
  /** The ten ships as the career fits them out, player first; every ship takes an Outfit's defaults when left out. */
  fleet?: readonly Outfit[];
  /** The hour it starts at, 0 ≤ hour < 24; anywhere in one of the day's openings (DAY.starts), by the seed, when left out. */
  hour?: number;
  /** The career's first match (PROMPT.md, The first voyage): the player's first loop always succeeds. */
  firstVoyage?: boolean;
}

export function createMatch(setup: MatchSetup): MatchState {
  const { seed, fleet = new Array<Outfit>(SHIPS).fill({}), hour = startHour(seed), firstVoyage = false } = setup;
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) throw new RangeError(`createMatch: seed ${seed} is not a uint32`);
  if (fleet.length !== SHIPS) throw new RangeError(`createMatch: a fleet of ${fleet.length} ships, not ${SHIPS}`);
  fleet.forEach(check);
  if (!(hour >= 0 && hour < 24)) throw new RangeError(`createMatch: hour ${hour} is not in 0…24`);
  const rng: Uint32Array[] = [];
  for (let s = 0; s < STREAMS; s++) rng.push(rngFrom(hash32(seed, s)));
  const route = greatCurrent(seed), ships: Ship[] = [], gusts: Gust[] = [];
  for (let i = 0; i < SHIPS; i++) ships.push(launch(route, i, fleet[i]));
  for (let g = 0; g < GUSTS.count; g++) gusts.push({ at: v3(0, 0, 1), age: 0, life: 0, r: 0 });
  const weather = Array.from({ length: WEATHER.count }, () => ({ kind: SPELL.fair, at: v3(0, 0, 1), v: v3(), r: 0, age: 0, life: 0 }));
  const coins = Array.from({ length: COINS.count }, () => ({ kind: AFLOAT.coin, at: v3(0, 0, 1), value: 0, age: 0 }));
  return {
    seed, tick: 0, rng, ships, gusts, weather, hour, owner: new Uint8Array(TERRITORY.cells), trail: new Uint8Array(TERRITORY.cells),
    coins, finds: new Array<number>(FIND_SITES).fill(0), leader: -1, charm: firstVoyage, events: [], timeline: [],
    storm: stormPlan(rng[STREAM.storm]), chests: [], shots: [], sunk: [], winner: -1,
  };
}

/** Throws unless createMatch can fit out ship i as outfit o says. */
function check(o: Outfit, i: number): void {
  const whole = (x: number | undefined, below = Infinity): boolean => x === undefined || (Number.isInteger(x) && x >= 0 && x < below);
  const fits = o.fittings === undefined || (o.fittings.length === SLOTS && o.fittings.every((f) => whole(f.kind) && whole(f.tier, TIERS)));
  const share = o.gunnery === undefined || (o.gunnery >= 0 && o.gunnery <= 1);
  if (!whole(o.form, FORMS.length) || !whole(o.pigment) || !whole(o.pattern) || !whole(o.gull) || !fits || !share) {
    throw new RangeError(`createMatch: ship ${i}'s outfit cannot be fitted out`);
  }
}

/** The hour a match starts at when its setup leaves it out: anywhere in one of the day's openings, by the seed. */
function startHour(seed: number): number {
  const rng = rngFrom(hash32(seed, STREAMS)); // a generator of its own, numbered past every stream
  const [from, to] = DAY.starts[rngInt(rng, DAY.starts.length)];
  return rngRange(rng, from, to);
}

/** A ship's full hull: its form's hull points, and more with doubled planking. */
export function fullHull(form: number, fittings: readonly { kind: number; tier: number }[]): number {
  const h = fittings[SLOT.hull];
  return FORMS[form].hull * (1 + (h.kind === FITTING.doubledPlanking ? DOUBLED_PLANKING[h.tier] : 0));
}

/**
 * The storm's plan, drawn on its stream (storm.ts sweeps it): its origin, anywhere; the final calm, anywhere clear of
 * the origin, a uniform draw over the sphere, so it falls in every region as often as the region's share of the
 * planet; then, from the last but one back to the first, each calm's centre on the great circle from the final calm
 * toward the origin's antipode, as far along as a uniform draw within what keeps it inside the calm before it (calm 0:
 * all but the origin) and round the calm after it. The last phase closes the final calm to nothing where it lies.
 */
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

/**
 * The fleet's places on the Great Current: two ranks of five abreast, the player in the front centre. Ship i rides
 * LANE[i] u to starboard of the current's centreline; the front rank starts 12 u down it, the rear rank 4 u.
 */
export const LANE: readonly number[] = [0, -3.5, 3.5, -7, 7, 0, -3.5, 3.5, -7, 7];
const START = [12, 4];
const AT = v3(), SIDE = v3();

/** The pose `lane` u to starboard of the Great Current's centreline, `s` u down it (held at its ends): where, and heading down it. */
export function onCurrent(route: CurrentRoute, s: number, lane: number, pos: V3, head: V3): void {
  const p = route.points, n = p.length / 3, f = Math.min(Math.max(s / 2, 0), n - 1), k = Math.min(Math.floor(f), n - 2);
  const t = f - k, a = 3 * k, b = a + 3;
  normalize(set(AT, p[a] + (p[b] - p[a]) * t, p[a + 1] + (p[b + 1] - p[a + 1]) * t, p[a + 2] + (p[b + 2] - p[a + 2]) * t));
  set(head, p[b] - p[a], p[b + 1] - p[a + 1], p[b + 2] - p[a + 2]);
  normalize(addScaled(head, head, AT, -dot(head, AT)));
  advance(AT, cross(SIDE, head, AT), lane, pos, SIDE);
  normalize(addScaled(head, head, pos, -dot(head, pos)));
}

/** Ship i as outfit o fits it out, under full sail in its place on the Great Current, riding it. */
function launch(route: CurrentRoute, i: number, o: Outfit): Ship {
  const { form = FORM.pinnace, pigment = i, pattern = 0, gull = 1, gunnery = 1 } = o, ride = START[(i / 5) | 0], pos = v3(), head = v3();
  const fittings = o.fittings ? o.fittings.map(({ kind, tier }) => ({ kind, tier })) : START_FITTINGS.map((kind) => ({ kind, tier: 0 }));
  onCurrent(route, ride, LANE[i], pos, head);
  return {
    form, pigment, pattern, gull, phase: PHASE.riding, ride, peel: 0, pos, head, was: { ...pos }, wasHead: { ...head },
    speed: OPENING.way, rate: 0, shove: v3(), fling: v3(), sail: SAIL.full, course: [], leg: 0, home: [], homeLeg: 0,
    homing: false, torn: 0, fittings, bump: 0, bumped: -1, bumpOn: 0, laid: [], purse: 0, bank: 0, held: 0, prize: -1, holding: 0,
    hull: fullHull(form, fittings), flask: 0, flare: 0, fogged: [], fire: 0, fireBy: -1, ward: 0,
    reload: new Array<number>(BATTERIES).fill(0), gunnery, harm: new Array<number>(SHIPS).fill(0),
  };
}

/** The snapshot of a match: everything needed to continue it exactly. */
export const encodeMatch = (state: MatchState): Uint8Array => encode(MATCH_FORMAT, state);

/** A match from its snapshot; throws on anything but an intact snapshot of the current format. */
export const decodeMatch = (bytes: Uint8Array): MatchState => decode(MATCH_FORMAT, bytes);

/** The match state's 64-bit hash, 16 hex digits: equal hashes mean identical states. */
export const matchHash = (state: MatchState): string => hash64(encodeMatch(state));
