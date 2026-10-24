// The sea a match is sailed on and what moves over it: the one planetary wind, shifting slowly through the match,
// with gusts running downwind across it; the fixed current lanes and the seed's Great Current; the tide's sea level.
// Seams for WP6 part B: the weather scales the wind's strength in windAt (and spawns its squall gusts in stir), the
// floes join the land in aground, the Maelstrom's vortex joins the lanes in currentAt.
import {
  PI, addScaled, cross, dcos, dot, dsin, hash32, length, normalize, rngFrom, rngRange, set, v3, type Rng, type V3,
} from './math.ts';
import { R, TERRITORY, advance, cellDir, cellOf, neighbor } from './sphere.ts';
import { STREAM, TICK, type Gust, type MatchState } from './state.ts';
import { GREAT_CURRENT, GUSTS, LANE_TAPER, PILOT, REFERENCE, WIND } from './tables.ts';
import { greatCurrent, navigable, type CurrentRoute, type Geography } from './world/geography.ts';
import { NAV, type Nav } from './world/nav.ts';
import { TIDE } from './world/regions.ts';

/** The fixed world: the geography and its navigation graph, the same every match. */
export interface World {
  readonly geo: Geography;
  readonly nav: Nav;
}

/** One swirl of the planetary wind: flow round `axis`, which itself turns slowly round `spin`. */
interface Swirl { readonly axis: V3; readonly spin: V3; readonly drift: number; readonly amp: number; readonly freq: number; readonly phase: number }

/** A fixed lane as a great-circle arc from a to b about the pole n, flowing a → b. */
interface LaneArc { readonly a: V3; readonly b: V3; readonly n: V3; readonly half: number; readonly speed: number }

/**
 * The waters of one match: the world, the seed's Great Current and its wind. It follows from the world and the
 * seed alone, so it is built once per match (seaFor) and never saved.
 */
export interface Sea extends World {
  readonly current: CurrentRoute;
  readonly swirls: readonly Swirl[];
  readonly lanes: readonly LaneArc[];
  /** The swirls' mean strength over the planet, which windAt divides out so fair wind has strength 1. */
  readonly mean: number;
  /** The territory cell of each landmark (geo.landmarks order): the landmark lies in the waters that hold it. */
  readonly marks: Int32Array;
  /**
   * The navigation graph with this match's currents in its step costs, which become times at the reference speed:
   * a step down a current costs less, one against it more, so the route home rides the currents it can and never
   * stems one it cannot.
   */
  readonly voyage: Nav;
}

export function seaFor(world: World, seed: number): Sea {
  const rng = rngFrom(hash32(seed, 0x77696e64)), swirls: Swirl[] = [];
  for (let k = 0; k < WIND.terms; k++) {
    swirls.push({
      axis: randomDir(rng, v3()), spin: randomDir(rng, v3()), drift: rngRange(rng, WIND.drift[0], WIND.drift[1]),
      amp: rngRange(rng, 0.6, 1), freq: rngRange(rng, WIND.freq[0], WIND.freq[1]), phase: rngRange(rng, 0, 2 * PI),
    });
  }
  const lanes = world.geo.lanes.map(({ a, b, width, speed }) => ({ a, b, n: normalize(cross(v3(), a, b)), half: width / 2, speed }));
  const marks = Int32Array.from(world.geo.landmarks, (l) => cellOf(TERRITORY, l.pos));
  const sea: Sea = { ...world, current: greatCurrent(seed), swirls, lanes, mean: 1, marks, voyage: world.nav };
  // The mean over 642 evenly spread points (a Fibonacci sphere) at the start of the match.
  const N = 642, p = v3(), w = v3();
  let sum = 0;
  for (let k = 0; k < N; k++) {
    const z = 1 - (2 * k + 1) / N, r = Math.sqrt(1 - z * z), lon = k * 2.399963229728653;
    sum += swirl(sea, 0, set(p, r * dcos(lon), r * dsin(lon), z), w);
  }
  return { ...sea, mean: sum / N, voyage: { ...world.nav, cost: voyageCosts(sea) } };
}

/** The nav graph's step costs reckoned as times against this sea's currents, taken at each cell's centre. */
function voyageCosts(sea: Sea): Float32Array {
  const cells = NAV.cells, centre = new Float64Array(3 * cells), flow = new Float64Array(3 * cells), c = v3(), f = v3();
  for (let k = 0; k < cells; k++) {
    cellDir(NAV, k, c);
    currentAt(sea, c, f);
    centre[3 * k] = c.x;
    centre[3 * k + 1] = c.y;
    centre[3 * k + 2] = c.z;
    flow[3 * k] = f.x;
    flow[3 * k + 1] = f.y;
    flow[3 * k + 2] = f.z;
  }
  const cost = Float32Array.from(sea.nav.cost), floor = PILOT.headway * REFERENCE;
  for (let k = 0; k < cells; k++) {
    for (let s = 0; s < 4; s++) {
      const m = neighbor(NAV, k, s), a = 3 * k, b = 3 * m;
      const fx = flow[a] + flow[b], fy = flow[a + 1] + flow[b + 1], fz = flow[a + 2] + flow[b + 2];
      if (fx === 0 && fy === 0 && fz === 0) continue;
      const dx = centre[b] - centre[a], dy = centre[b + 1] - centre[a + 1], dz = centre[b + 2] - centre[a + 2];
      const along = (0.5 * (fx * dx + fy * dy + fz * dz)) / Math.sqrt(dx * dx + dy * dy + dz * dz);
      cost[4 * k + s] *= REFERENCE / Math.max(floor, REFERENCE + along);
    }
  }
  return cost;
}

/** A direction uniformly over the sphere. */
function randomDir(rng: Rng, out: V3): V3 {
  const z = rngRange(rng, -1, 1), r = Math.sqrt(1 - z * z), lon = rngRange(rng, 0, 2 * PI);
  return set(out, r * dcos(lon), r * dsin(lon), z);
}

export const timeOf = (state: MatchState): number => state.tick * TICK;

// ---------------------------------------------------------------------------------------------------------------
// Wind

/** The swirls' axes at the time they were last turned to, shared by every call in a tick. */
const AXES = Array.from({ length: WIND.terms }, () => v3());
let axesSea: Sea | null = null, axesTime = Number.NaN;

function turnAxes(sea: Sea, t: number): void {
  if (sea === axesSea && t === axesTime) return;
  axesSea = sea;
  axesTime = t;
  for (let k = 0; k < WIND.terms; k++) {
    const { axis: d, spin: s, drift } = sea.swirls[k], a = drift * t, c = dcos(a), sn = dsin(a), sd = dot(s, d) * (1 - c);
    // Rodrigues: d·cos a + (s × d)·sin a + s·(s·d)(1 − cos a)
    set(AXES[k], d.x * c + (s.y * d.z - s.z * d.y) * sn + s.x * sd, d.y * c + (s.z * d.x - s.x * d.z) * sn + s.y * sd,
      d.z * c + (s.x * d.y - s.y * d.x) * sn + s.z * sd);
  }
}

/**
 * The swirling field at p and time t, in units of its planetary mean: the flow of a stream function
 * Σ amp·sin(freq·(p·axis) + phase), so p × its gradient — tangent, without sources or sinks, in broad wheeling
 * systems. Returns its magnitude.
 */
function swirl(sea: Sea, t: number, p: V3, out: V3): number {
  turnAxes(sea, t);
  set(out, 0, 0, 0);
  for (let k = 0; k < WIND.terms; k++) {
    const s = sea.swirls[k], d = AXES[k], c = (s.amp * s.freq * dcos(s.freq * dot(p, d) + s.phase)) / sea.mean;
    out.x += c * (p.y * d.z - p.z * d.y);
    out.y += c * (p.z * d.x - p.x * d.z);
    out.z += c * (p.x * d.y - p.y * d.x);
  }
  return length(out);
}

/** The wind at a point: what windAt fills. */
export interface Wind {
  /** The true wind's velocity, u/s, tangent. */
  readonly v: V3;
  /** Fair = 1, more in a gust; the weather (part B) scales it. */
  strength: number;
  /** How settled its direction is: 0 in the dead eye of a swirl, 1 in a steady breeze. */
  steady: number;
  /** 0…1: how deep in a gust the point lies. */
  gust: number;
}

export const newWind = (): Wind => ({ v: v3(), strength: 0, steady: 0, gust: 0 });

/** The true wind at p now: what drives the sails and the swell, and what flags, smoke and foliage stream in. */
export function windAt(sea: Sea, state: MatchState, p: V3, out: Wind): Wind {
  const m = swirl(sea, timeOf(state), p, out.v);
  out.gust = gustAt(state, p);
  out.strength = 1 + GUSTS.strength * out.gust;
  out.steady = Math.min(1, m / WIND.lull);
  const s = m > 0 ? (WIND.speed * out.strength) / m : 0;
  set(out.v, out.v.x * s, out.v.y * s, out.v.z * s);
  return out;
}

/** How deep in a gust p lies: its envelope over its life times its fall-off from the heart, the deepest gust's. */
export function gustAt(state: MatchState, p: V3): number {
  let g = 0;
  for (const gust of state.gusts) {
    if (gust.life === 0) continue;
    const q = 1 - (R * R * (2 - 2 * dot(p, gust.at))) / (gust.r * gust.r);
    if (q > 0) g = Math.max(g, dsin((PI * gust.age) / gust.life) * q * q);
  }
  return g;
}

const DRIFT = v3();

/** The environment's tick: gusts age and run downwind, and are born again elsewhere when they die. */
export function stir(sea: Sea, state: MatchState): void {
  const rng = state.rng[STREAM.wind], t = timeOf(state);
  for (const gust of state.gusts) {
    if (gust.age >= gust.life) {
      spawn(rng, gust);
      continue;
    }
    gust.age += TICK;
    if (swirl(sea, t, gust.at, DRIFT) > 0) advance(gust.at, normalize(DRIFT), WIND.speed * GUSTS.drift * TICK, gust.at, DRIFT);
  }
}

/** A gust anywhere on the planet; one never yet spawned starts part-way through its life, so they never pulse together. */
function spawn(rng: Rng, gust: Gust): void {
  const first = gust.life === 0;
  randomDir(rng, gust.at);
  gust.r = rngRange(rng, GUSTS.radius[0], GUSTS.radius[1]);
  gust.life = rngRange(rng, GUSTS.life[0], GUSTS.life[1]);
  gust.age = first ? rngRange(rng, 0, gust.life) : 0;
}

// ---------------------------------------------------------------------------------------------------------------
// Currents

const ALONG = v3(), OFF = v3();

/** Strongest on the centreline, nothing at the edge: x is the offset over the half-width. */
const profile = (x: number): number => (1 - x * x) * (1 - x * x);
/** The chord between two unit vectors, in u. */
const apart = (a: V3, b: V3): number => R * Math.sqrt(Math.max(0, 2 - 2 * dot(a, b)));

/** The current's velocity at p, u/s, tangent: the fixed lanes and the Great Current carry any ship in them. */
export function currentAt(sea: Sea, p: V3, out: V3): V3 {
  set(out, 0, 0, 0);
  for (const l of sea.lanes) {
    const x = (R * dot(p, l.n)) / l.half;
    if (x <= -1 || x >= 1) continue;
    if (dot(cross(OFF, l.a, p), l.n) < 0 || dot(cross(OFF, p, l.b), l.n) < 0) continue; // beyond an end
    const ends = Math.min(apart(p, l.a), apart(p, l.b));
    addScaled(out, out, normalize(cross(ALONG, l.n, p)), l.speed * profile(x) * Math.min(1, ends / LANE_TAPER));
  }
  return greatCurrentAt(sea, p, out);
}

/** Adds the Great Current at p to `out`. Its centreline is a point every ~2 u: a coarse pass, then a fine one. */
function greatCurrentAt(sea: Sea, p: V3, out: V3): V3 {
  const pts = sea.current.points, n = pts.length / 3, half = GREAT_CURRENT.width / 2, COARSE = 8;
  let best = 0, near = Infinity;
  for (let k = 0; k < n; k += COARSE) {
    const d = 2 - 2 * (p.x * pts[3 * k] + p.y * pts[3 * k + 1] + p.z * pts[3 * k + 2]);
    if (d < near) { near = d; best = k; }
  }
  const reach = (half + COARSE) / R; // the nearest coarse point lies within COARSE u along of the nearest point
  if (near > reach * reach) return out;
  for (let k = Math.max(0, best - COARSE); k <= Math.min(n - 1, best + COARSE); k++) {
    const d = 2 - 2 * (p.x * pts[3 * k] + p.y * pts[3 * k + 1] + p.z * pts[3 * k + 2]);
    if (d < near) { near = d; best = k; }
  }
  const k0 = 3 * Math.max(0, best - 1), k1 = 3 * Math.min(n - 1, best + 1), kb = 3 * best;
  set(ALONG, pts[k1] - pts[k0], pts[k1 + 1] - pts[k0 + 1], pts[k1 + 2] - pts[k0 + 2]);
  normalize(addScaled(ALONG, ALONG, p, -dot(ALONG, p)));
  set(OFF, p.x - pts[kb], p.y - pts[kb + 1], p.z - pts[kb + 2]);
  const along = dot(OFF, ALONG), x = (R * Math.sqrt(Math.max(0, dot(OFF, OFF) - along * along))) / half;
  if (x >= 1) return out;
  const ends = (Math.min(best, n - 1 - best) * sea.current.length) / (n - 1);
  return addScaled(out, out, ALONG, GREAT_CURRENT.speed * profile(x) * Math.min(1, ends / GREAT_CURRENT.taper));
}

// ---------------------------------------------------------------------------------------------------------------
// The tide and what is solid

/** Sea level above mean, u, at match time t: the planetary tide. Part B gives passages their visible rhythm. */
export const seaLevel = (t: number): number => TIDE.amp * dsin((2 * PI * t) / TIDE.period);

/** The lowest the tide falls: a route planned for it stays open whatever the hour. */
export const LOW_WATER = -TIDE.amp;

/** Whether a hull at p is aground now. */
export const aground = (sea: Sea, state: MatchState, p: V3): boolean => !navigable(sea.geo, p, seaLevel(timeOf(state)));
