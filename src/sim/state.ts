// The whole state of a match: one plain-data object graph that the renderer, interface and audio only read and
// only the step (match.ts) writes. Its shape is declared once, as codec schemas; its TypeScript types, its
// snapshot encoding and its hash all follow from them. To add state, add a field to a schema here and bump
// MATCH_FORMAT.version, so snapshots of the old shape are discarded rather than misread.
import { bool, bytes, decode, encode, f64, hash64, int, list, rec, words, type Format, type Value } from './codec.ts';
import { addScaled, cross, dot, hash32, normalize, rngFrom, rngInt, rngRange, v3, type V3 } from './math.ts';
import { TERRITORY, advance, tangentToward } from './sphere.ts';
import { COINS, DAY, FORMS, GUSTS, SAILS, SLOTS, SPELL, START_FITTINGS, WEATHER } from './tables.ts';
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

/** The find sites: the wrecks and island caches of every region (Geography.finds order). */
const FIND_SITES = REGIONS.reduce((n, r) => n + r.finds.length, 0);

/** A point or direction in space: positions are unit vectors from the planet's centre, headings unit tangents. */
const XYZ = rec(['x', f64], ['y', f64], ['z', f64]);

const SHIP = rec(
  ['form', int], // a FORM
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
  ['fittings', list(rec(['kind', int], ['tier', int]), SLOTS)], // by SLOT: a FITTING and its tier
  ['bump', f64], // this tick's impact: the closing speed in u/s, 0 when nothing was struck
  ['bumped', int], // what was struck: −1 nothing, a ship index, or SHIPS for land
  ['bumpOn', f64], // where on the hull: −1 the stern … 1 the bow
  ['laid', list(int)], // the open trail: the territory cells it crosses, in the order laid; empty when none is open
  ['purse', f64], // doubloons won on the open trail: lost if it breaks, banked when its loop closes
  ['bank', f64], // doubloons banked, safe for the match
  ['held', f64], // the sea it holds, AREA_Q quanta: whole numbers, so exact in any order (territory.ts keeps it)
  ['prize', int], // the find site it is holding beside to take: −1 none
  ['holding', f64], // the seconds it has held there
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
);

export type Ship = Value<typeof SHIP>;
export type Gust = Value<typeof GUST>;
export type Spell = Value<typeof WEATHER_SPELL>;
export type MatchState = Value<typeof MATCH>;
export type Coin = Value<typeof COIN>;
export type Happening = Value<typeof HAPPENING>;

export const MATCH_FORMAT: Format<typeof MATCH> = { magic: 'PTLM', version: 5, schema: MATCH };

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
} as const;

/** Record an event of this tick (the step clears them first); `cells` is kept, not copied. */
export function emit(state: MatchState, kind: number, ship: number, by: number, at: V3, amount: number, cells: number[] = []): void {
  state.events.push({ kind, ship, by, at: { x: at.x, y: at.y, z: at.z }, amount, cells });
}

/** Enter an event in the match's timeline, which the results read. */
export function chronicle(state: MatchState, kind: number, ship: number, by: number, amount: number): void {
  state.timeline.push({ tick: state.tick, kind, ship, by, amount });
}

/** Everything a match starts from besides the player's inputs. The career's match setup fills it in. */
export interface MatchSetup {
  /** A uint32. */
  seed: number;
  /** Each ship's FORM, player first; every ship sails the starting pinnace when left out. */
  forms?: readonly number[];
  /** The hour it starts at, 0 ≤ hour < 24; anywhere in one of the day's openings (DAY.starts), by the seed, when left out. */
  hour?: number;
  /** The career's first match (PROMPT.md, The first voyage): the player's first loop always succeeds. */
  firstVoyage?: boolean;
}

export function createMatch(setup: MatchSetup): MatchState {
  const { seed, forms = new Array<number>(SHIPS).fill(0), hour = startHour(seed), firstVoyage = false } = setup;
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) throw new RangeError(`createMatch: seed ${seed} is not a uint32`);
  if (forms.length !== SHIPS || !forms.every((f) => Number.isInteger(f) && f >= 0 && f < FORMS.length)) {
    throw new RangeError(`createMatch: forms ${forms} are not ${SHIPS} FORM ids`);
  }
  if (!(hour >= 0 && hour < 24)) throw new RangeError(`createMatch: hour ${hour} is not in 0…24`);
  const rng: Uint32Array[] = [];
  for (let s = 0; s < STREAMS; s++) rng.push(rngFrom(hash32(seed, s)));
  const route = greatCurrent(seed), ships: Ship[] = [], gusts: Gust[] = [];
  for (let i = 0; i < SHIPS; i++) ships.push(launch(route, i, forms[i]));
  for (let g = 0; g < GUSTS.count; g++) gusts.push({ at: v3(0, 0, 1), age: 0, life: 0, r: 0 });
  const weather = Array.from({ length: WEATHER.count }, () => ({ kind: SPELL.fair, at: v3(0, 0, 1), v: v3(), r: 0, age: 0, life: 0 }));
  const coins = Array.from({ length: COINS.count }, () => ({ kind: AFLOAT.coin, at: v3(0, 0, 1), value: 0, age: 0 }));
  return {
    seed, tick: 0, rng, ships, gusts, weather, hour, owner: new Uint8Array(TERRITORY.cells), trail: new Uint8Array(TERRITORY.cells),
    coins, finds: new Array<number>(FIND_SITES).fill(0), leader: -1, charm: firstVoyage, events: [], timeline: [],
  };
}

/** The hour a match starts at when its setup leaves it out: anywhere in one of the day's openings, by the seed. */
function startHour(seed: number): number {
  const rng = rngFrom(hash32(seed, STREAMS)); // a generator of its own, numbered past every stream
  const [from, to] = DAY.starts[rngInt(rng, DAY.starts.length)];
  return rngRange(rng, from, to);
}

/** The fleet's places at the head of the Great Current: two ranks of five abreast, the player in the front centre. */
const FILE = [0, -1, 1, -2, 2], ABREAST = 3.5, RANK_AT = [6, 2]; // RANK_AT: route points (every ~2 u) of each rank

/** Ship i under full sail in its place at the head of the Great Current, ready to ride it. */
function launch(route: CurrentRoute, i: number, form: number): Ship {
  const p = route.points, k = 3 * RANK_AT[(i / 5) | 0], at = v3(p[k], p[k + 1], p[k + 2]);
  const head = tangentToward(at, v3(p[k + 9], p[k + 10], p[k + 11]), v3()), pos = v3(), side = cross(v3(), head, at);
  advance(at, side, FILE[i % 5] * ABREAST, pos, side);
  normalize(addScaled(head, head, pos, -dot(head, pos)));
  return {
    form, pos, head, was: { ...pos }, wasHead: { ...head }, speed: FORMS[form].speed * SAILS[SAIL.full].speed, rate: 0,
    shove: v3(), fling: v3(), sail: SAIL.full, course: [], leg: 0, home: [], homeLeg: 0, homing: false, torn: 0,
    fittings: START_FITTINGS.map((kind) => ({ kind, tier: 0 })), bump: 0, bumped: -1, bumpOn: 0,
    laid: [], purse: 0, bank: 0, held: 0, prize: -1, holding: 0,
  };
}

/** The snapshot of a match: everything needed to continue it exactly. */
export const encodeMatch = (state: MatchState): Uint8Array => encode(MATCH_FORMAT, state);

/** A match from its snapshot; throws on anything but an intact snapshot of the current format. */
export const decodeMatch = (bytes: Uint8Array): MatchState => decode(MATCH_FORMAT, bytes);

/** The match state's 64-bit hash, 16 hex digits: equal hashes mean identical states. */
export const matchHash = (state: MatchState): string => hash64(encodeMatch(state));
