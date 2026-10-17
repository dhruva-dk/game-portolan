// Deterministic match simulation. No rendering, no wall clock, no Math.random, no Math.sin & co.
// Everything that can influence the match goes through the d* math below so Node and every browser
// produce bit-identical results.
import type { Island, World } from './world.ts';

export const R = 200; // planet radius at sea level, world units (1 unit ≈ 7 m)
export const TICK = 1 / 30; // fixed timestep, seconds
export const SHIPS = 21; // ship 0 is the player
export const GRID = 512; // territory cells per cube-face edge
export const HN = 512; // world grids (heights, coast): cells per cube-face edge, same mapping as GRID
export const SOLID = -0.8; // heights above this block ships (beaches, reef crests, sandbars, rock)

// ---------------------------------------------------------------------------------------------
// Deterministic math: only + - * / sqrt floor round, so results never depend on the JS engine.
export const PI = 3.141592653589793;
const HALF_PI = PI / 2;

export function dsin(x: number): number {
  const k = Math.round(x / HALF_PI);
  const r = x - k * HALF_PI;
  const q = ((k % 4) + 4) % 4;
  const r2 = r * r;
  const s = r * (1 - r2 / 6 * (1 - r2 / 20 * (1 - r2 / 42 * (1 - r2 / 72 * (1 - r2 / 110 * (1 - r2 / 156))))));
  const c = 1 - r2 / 2 * (1 - r2 / 12 * (1 - r2 / 30 * (1 - r2 / 56 * (1 - r2 / 90 * (1 - r2 / 132)))));
  return q === 0 ? s : q === 1 ? c : q === 2 ? -s : -c;
}

export function dcos(x: number): number {
  return dsin(x + HALF_PI);
}

function datan(x: number): number {
  if (x < 0) return -datan(-x);
  if (x > 1) return HALF_PI - datan(1 / x);
  // atan(x) = 2 atan(x / (1 + sqrt(1 + x²))), applied twice brings |x| below 0.2
  let y = x / (1 + Math.sqrt(1 + x * x));
  y = y / (1 + Math.sqrt(1 + y * y));
  const y2 = y * y;
  let sum = 0;
  for (let n = 10; n >= 0; n--) sum = 1 / (2 * n + 1) - y2 * sum;
  return 4 * y * sum;
}

export function datan2(y: number, x: number): number {
  if (x > 0) return datan(y / x);
  if (x < 0) return y >= 0 ? datan(y / x) + PI : datan(y / x) - PI;
  return y > 0 ? HALF_PI : y < 0 ? -HALF_PI : 0;
}

export function dasin(x: number): number {
  return datan2(x, Math.sqrt(Math.max(0, 1 - x * x)));
}

export function dtan(x: number): number {
  return dsin(x) / dcos(x);
}

// Seeded generator (sfc32 seeded through splitmix32).
export class Rng {
  private a: number;
  private b: number;
  private c: number;
  private d: number;
  constructor(seed: number) {
    let s = seed >>> 0;
    const next = () => {
      s = (s + 0x9e3779b9) >>> 0;
      let z = s;
      z = Math.imul(z ^ (z >>> 16), 0x85ebca6b);
      z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35);
      return (z ^ (z >>> 16)) >>> 0;
    };
    this.a = next();
    this.b = next();
    this.c = next();
    this.d = next();
    for (let i = 0; i < 12; i++) this.u32();
  }
  u32(): number {
    const t = (((this.a + this.b) >>> 0) + this.d) >>> 0;
    this.d = (this.d + 1) >>> 0;
    this.a = this.b ^ (this.b >>> 9);
    this.b = (this.c + (this.c << 3)) >>> 0;
    this.c = ((this.c << 21) | (this.c >>> 11)) >>> 0;
    this.c = (this.c + t) >>> 0;
    return t;
  }
  /** uniform in [0, 1) */
  next(): number {
    return this.u32() / 4294967296;
  }
  range(lo: number, hi: number): number {
    return lo + (hi - lo) * this.next();
  }
  int(n: number): number {
    return Math.floor(this.next() * n);
  }
}

// ---------------------------------------------------------------------------------------------
// Vectors. Plain mutable objects; `out` parameters avoid garbage in hot loops.
export interface V3 {
  x: number;
  y: number;
  z: number;
}
export const v3 = (x = 0, y = 0, z = 0): V3 => ({ x, y, z });
export const dot = (a: V3, b: V3) => a.x * b.x + a.y * b.y + a.z * b.z;
export function cross(a: V3, b: V3, out: V3): V3 {
  const x = a.y * b.z - a.z * b.y, y = a.z * b.x - a.x * b.z, z = a.x * b.y - a.y * b.x;
  out.x = x; out.y = y; out.z = z;
  return out;
}
export function normalize(a: V3): V3 {
  const l = Math.sqrt(a.x * a.x + a.y * a.y + a.z * a.z) || 1;
  a.x /= l; a.y /= l; a.z /= l;
  return a;
}
export function copy(a: V3, b: V3): V3 {
  a.x = b.x; a.y = b.y; a.z = b.z;
  return a;
}
/** Straight-line distance between two surface points (unit vectors), world units. */
export function chord(a: V3, b: V3): number {
  const x = a.x - b.x, y = a.y - b.y, z = a.z - b.z;
  return Math.sqrt(x * x + y * y + z * z) * R;
}
/** Unit direction at height y (sine of latitude) and longitude lon. */
export function sphereDir(y: number, lon: number): V3 {
  const r = Math.sqrt(1 - y * y);
  return v3(r * dcos(lon), y, r * dsin(lon));
}
export const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
export const mix = (a: number, b: number, t: number) => a + (b - a) * t;
/** Hermite step from 0 at a to 1 at b (a > b runs it backwards). */
export function smoothstep(a: number, b: number, x: number): number {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
}

// ---------------------------------------------------------------------------------------------
// Cube-sphere grid. Gnomonic face projection followed by an equal-angle warp a = atan(u)·4/π, so
// cells are nearly uniform in area. The renderer mirrors this mapping exactly in GLSL.
//   face 0 +X: u = -z/|x|, v =  y/|x|     face 1 -X: u =  z/|x|, v = y/|x|
//   face 2 +Y: u =  x/|y|, v = -z/|y|     face 3 -Y: u =  x/|y|, v = z/|y|
//   face 4 +Z: u =  x/|z|, v =  y/|z|     face 5 -Z: u = -x/|z|, v = y/|z|
// Ties go to the lower face number. cell = face·N² + j·N + i with i from u and j from v.
export interface FaceUV {
  face: number;
  u: number; // in [-1, 1]: equal-angle from faceUV, plain gnomonic from gnomonicUV
  v: number;
}

/** Cube face of a direction and its plain gnomonic coordinates, before the equal-angle warp. */
export function gnomonicUV(p: V3, out: FaceUV): FaceUV {
  const ax = Math.abs(p.x), ay = Math.abs(p.y), az = Math.abs(p.z);
  let face: number, u: number, v: number;
  if (ax >= ay && ax >= az) {
    face = p.x >= 0 ? 0 : 1;
    u = (p.x >= 0 ? -p.z : p.z) / ax;
    v = p.y / ax;
  } else if (ay >= az) {
    face = p.y >= 0 ? 2 : 3;
    u = p.x / ay;
    v = (p.y >= 0 ? -p.z : p.z) / ay;
  } else {
    face = p.z >= 0 ? 4 : 5;
    u = (p.z >= 0 ? p.x : -p.x) / az;
    v = p.y / az;
  }
  out.face = face;
  out.u = u;
  out.v = v;
  return out;
}

export function faceUV(p: V3, out: FaceUV): FaceUV {
  gnomonicUV(p, out);
  out.u = datan(out.u) * (4 / PI);
  out.v = datan(out.v) * (4 / PI);
  return out;
}

const scratchUV: FaceUV = { face: 0, u: 0, v: 0 };
export function cellOf(p: V3, n: number): number {
  const f = faceUV(p, scratchUV);
  const i = Math.min(n - 1, Math.max(0, Math.floor((f.u + 1) * 0.5 * n)));
  const j = Math.min(n - 1, Math.max(0, Math.floor((f.v + 1) * 0.5 * n)));
  return f.face * n * n + j * n + i;
}

/** Unit direction for plain gnomonic face coordinates: the point (gu, gv) on the face's side of the unit cube. */
export function gnomonicDir(face: number, gu: number, gv: number, out: V3): V3 {
  switch (face) {
    case 0: out.x = 1; out.y = gv; out.z = -gu; break;
    case 1: out.x = -1; out.y = gv; out.z = gu; break;
    case 2: out.x = gu; out.y = 1; out.z = -gv; break;
    case 3: out.x = gu; out.y = -1; out.z = gv; break;
    case 4: out.x = gu; out.y = gv; out.z = 1; break;
    default: out.x = -gu; out.y = gv; out.z = -1;
  }
  return normalize(out);
}

/** Unit direction for equal-angle face coordinates (u, v ∈ [-1, 1], may extrapolate slightly). */
export function faceDir(face: number, u: number, v: number, out: V3): V3 {
  return gnomonicDir(face, dtan(u * (PI / 4)), dtan(v * (PI / 4)), out);
}

/** Centre of cell (i, j) on face f of an n-grid; indices past the face edge extrapolate beyond it. */
function centreDir(f: number, i: number, j: number, n: number, out: V3): V3 {
  return faceDir(f, ((i + 0.5) / n) * 2 - 1, ((j + 0.5) / n) * 2 - 1, out);
}

export function cellDir(cell: number, n: number, out: V3): V3 {
  const face = Math.floor(cell / (n * n));
  const rem = cell - face * n * n;
  const j = Math.floor(rem / n), i = rem - j * n;
  return centreDir(face, i, j, n, out);
}

const wrapTmp = v3();
/** Cell (i, j) of face f on an n-grid, where indices past a face edge continue onto the neighbouring face. */
export function wrapCell(f: number, i: number, j: number, n: number): number {
  return cellOf(centreDir(f, i, j, n, wrapTmp), n);
}

// ---------------------------------------------------------------------------------------------
// Wind: one global field shared by gameplay (ship speed) and every visual system (mirrored in
// sky.ts WIND_GLSL). Trade-wind belts: easterlies at the equator, westerlies at mid latitudes,
// polar easterlies, with equatorward/poleward drift and a slowly wandering weather vortex.
// Returned vector is tangent to the sphere; its length is strength (≈1 = fresh breeze).
export function wind(p: V3, t: number, out: V3): V3 {
  const y = p.y, c2 = 1 - y * y;
  const zonal = -(8 * c2 * c2 - 8 * c2 + 1); // -cos(4·latitude)
  const merid = -0.5 * y * (1 - 4 * y * y);
  // east = (z, 0, -x), north = (-x·y, 1 - y², -z·y); both vanish smoothly at the poles
  let wx = zonal * p.z + merid * -p.x * y;
  let wy = merid * c2;
  let wz = zonal * -p.x + merid * -p.z * y;
  // wandering vortex around axis A(t): adds cross(A, p)
  const ang = t * 0.013;
  const ax = dcos(ang) * 0.8, ay = 0.6, az = dsin(ang) * 0.8;
  wx += 0.45 * (ay * p.z - az * p.y);
  wy += 0.45 * (az * p.x - ax * p.z);
  wz += 0.45 * (ax * p.y - ay * p.x);
  // slow gusts
  const g = 1 + 0.22 * dsin(t * 0.37 + p.x * 6.1 + p.z * 4.3) * dsin(t * 0.23 + p.y * 5.7 - p.x * 3.1);
  const s = 0.9 * g;
  // remove any residual normal component so the vector is exactly tangent
  const n = wx * p.x + wy * p.y + wz * p.z;
  out.x = (wx - n * p.x) * s;
  out.y = (wy - n * p.y) * s;
  out.z = (wz - n * p.z) * s;
  return out;
}

// ---------------------------------------------------------------------------------------------
// Territory grid topology and exact cell areas. GRID is a power of two so a cell index splits into
// face, row and column with shifts.
const N = GRID, NN = N * N, LOG = 31 - Math.clz32(N), CELLS = 6 * NN;

// Neighbour across each face edge, [face][side −u, +u, −v, +v][position along the edge]. Probing a hair
// past the edge lands in the adjacent face's border cell at the same position along the shared edge.
const EDGE = new Int32Array(24 * N);
{
  const p = v3(), e = 1 + 1e-6;
  for (let f = 0; f < 6; f++) {
    for (let k = 0; k < N; k++) {
      const t = ((k + 0.5) / N) * 2 - 1, b = f * 4 * N + k;
      EDGE[b] = cellOf(faceDir(f, -e, t, p), N);
      EDGE[b + N] = cellOf(faceDir(f, e, t, p), N);
      EDGE[b + 2 * N] = cellOf(faceDir(f, t, -e, p), N);
      EDGE[b + 3 * N] = cellOf(faceDir(f, t, e, p), N);
    }
  }
}

/** The k-th 4-neighbour of a territory cell (k: 0 −u, 1 +u, 2 −v, 3 +v), continuing across face edges. */
export function neighbor(c: number, k: number): number {
  const i = c & (N - 1), j = (c >> LOG) & (N - 1), e = (c >> (2 * LOG)) * 4 * N;
  if (k === 0) return i > 0 ? c - 1 : EDGE[e + j];
  if (k === 1) return i < N - 1 ? c + 1 : EDGE[e + N + j];
  if (k === 2) return j > 0 ? c - N : EDGE[e + 2 * N + i];
  return j < N - 1 ? c + N : EDGE[e + 3 * N + i];
}

function adjacent(a: number, b: number): boolean {
  for (let k = 0; k < 4; k++) if (neighbor(a, k) === b) return true;
  return false;
}

// Exact spherical area of every cell (all faces share one table). A gnomonic rectangle [x0,x1]×[y0,y1] on
// the unit cube face subtends F(x1,y1) − F(x0,y1) − F(x1,y0) + F(x0,y0) steradians, F = atan(xy/√(1+x²+y²)).
// Areas are kept as integers in AREA_Q quanta so owned-area sums stay exact under any order of updates.
const AREA_Q = 1 << 24; // quanta per square unit
const AREA = new Float64Array(NN);
let totalQ = 0;
{
  const g = new Float64Array(N + 1), F = new Float64Array((N + 1) * (N + 1));
  for (let k = 0; k <= N; k++) g[k] = dtan((k / N * 2 - 1) * (PI / 4));
  for (let j = 0; j <= N; j++) {
    for (let i = 0; i <= N; i++) F[j * (N + 1) + i] = datan(g[i] * g[j] / Math.sqrt(1 + g[i] * g[i] + g[j] * g[j]));
  }
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const a = j * (N + 1) + i, b = a + N + 1;
      AREA[j * N + i] = Math.round((F[b + 1] - F[b] - F[a + 1] + F[a]) * R * R * AREA_Q);
      totalQ += 6 * AREA[j * N + i];
    }
  }
}
/** Surface area of the planet as the sum of its cells (≈ 4πR²), square units. */
export const PLANET_AREA = totalQ / AREA_Q;
/** Exact spherical area of a territory cell, square units. */
export const cellArea = (c: number): number => AREA[c & (NN - 1)] / AREA_Q;

// Flood-fill scratch shared by every Sim, always left zeroed.
const LABEL = new Int32Array(CELLS);
const MARK = new Uint8Array(CELLS);

/** Append the cells crossed going from p0 (in c0) to p1 (in c1), excluding c0, as a 4-connected chain. */
function trace(p0: V3, c0: number, p1: V3, c1: number, out: number[], depth: number): void {
  if (adjacent(c0, c1)) {
    out.push(c1);
    return;
  }
  if (depth === 0) {
    // exactly through a cell corner: step via a cell that touches both
    for (let k = 0; k < 4; k++) {
      const n = neighbor(c0, k);
      if (adjacent(n, c1)) {
        out.push(n);
        break;
      }
    }
    out.push(c1);
    return;
  }
  const m = normalize(v3(p0.x + p1.x, p0.y + p1.y, p0.z + p1.z)), cm = cellOf(m, GRID);
  if (cm !== c0) trace(p0, c0, m, cm, out, depth - 1);
  if (cm !== c1) trace(m, cm, p1, c1, out, depth - 1);
}

// ---------------------------------------------------------------------------------------------
// Ships and match state. The renderer, HUD and audio only read these.
const CLASSES = ['caravel', 'carrack', 'galleon', 'pinnace', 'fluyt'] as const;
export type ShipClass = (typeof CLASSES)[number];
/** Hull length (waterline, world units) per class; collision radius derives from it. */
export const HULL_LENGTH: Record<ShipClass, number> = {
  caravel: 4.4, carrack: 5.2, galleon: 5.8, pinnace: 3.8, fluyt: 5.0,
};
/**
 * Per-class handling: cruising speed (u/s), full-rudder turning radius (u) and helm response (share of the
 * remaining yaw-rate change applied per tick). Longer hulls run a little faster but turn wider and answer the
 * helm more slowly, so no class dominates.
 */
export const HANDLING: Record<ShipClass, { speed: number; radius: number; response: number }> = {
  pinnace: { speed: 8.7, radius: 6.0, response: 0.2 },
  caravel: { speed: 8.9, radius: 6.5, response: 0.18 },
  fluyt: { speed: 9.1, radius: 7.0, response: 0.16 },
  carrack: { speed: 9.2, radius: 7.4, response: 0.15 },
  galleon: { speed: 9.3, radius: 7.8, response: 0.14 },
};
export const HOME_RADIUS = 10; // home territory disc radius, world units
export const RESPAWN_TICKS = 180; // a sunk ship re-enters this many ticks later (6 s)
export const TRAIL_STEP = 0.5; // spacing of Ship.trail polyline points, world units

const ACCEL = 0.035; // per-tick approach to the target speed (τ ≈ 1 s): weighty, never sluggish
const MIN_SPEED = 2.5; // always under way, even right after a collision
const DRIFT_DAMP = 0.92; // per-tick decay of sideways (collision) velocity: water drag on the hull
const SAIL = 0.12; // speed swing between close-hauled and a broad reach in a fresh breeze
const TURN_LOSS = 0.1; // speed lost at full rudder
const BEAM = 0.16; // hull capsule radius / hull length
const BOUNCE = 0.35; // ship-ship restitution
const LAND_BOUNCE = 0.15;
const LAND_FRICTION = 0.25; // scraping along a coast
const YAW_KICK = 0.45; // share of a contact's torque that becomes yaw rate
const GLANCE = 0.05; // extra yaw (rad/s per u/s of impact) turning the bow off a coast, so nothing pins head-on
const SELF_GRACE = 12; // newest own-trail cells, under the hull, that do not count as a self-crossing
const BUMP_MIN = 0.8; // closing speed (u/s) that makes a bump event
const GROUND_MIN = 0.6; // impact speed (u/s) that makes a ground event
// Waterline outline probed against the coast: [along the keel, to port] as fractions of the hull length.
const HULL_POINTS = [
  [0.5, 0], [0.4, 0.084], [0.4, -0.084], [0.25, 0.121], [0.25, -0.121], [0.05, 0.14], [0.05, -0.14],
  [-0.15, 0.135], [-0.15, -0.135], [-0.35, 0.11], [-0.35, -0.11], [-0.47, 0.07], [-0.47, -0.07],
];

export interface Ship {
  id: number;
  cls: ShipClass;
  alive: boolean;
  pos: V3; // unit vector, position on the sphere
  fwd: V3; // unit tangent heading
  prevPos: V3; // state at the previous tick, for render interpolation
  prevFwd: V3;
  speed: number; // forward speed through the water, world units / s
  turn: number; // signed yaw rate, rad/s, positive = turning to port (left)
  rudder: number; // last applied input in [-1, 1]
  drift: V3; // sideways velocity from collisions (tangent, u/s), decays quickly
  home: V3; // centre of the current home disc
  /** Open-trail polyline (unit vectors): the exit point, then a point every TRAIL_STEP. Empty while safe at home.
   * Replaced by a new array when the trail closes or is lost, so a held reference keeps the old ribbon. */
  trail: V3[];
  share: number; // owned fraction of the planet surface
  sinkTick: number; // tick of last sinking, -1 if never; it re-enters RESPAWN_TICKS later
}

/**
 * claim: `cells` are all cells that became the ship's, loop cells first; `prev` their previous owners
 * (0 neutral, k = ship k-1); `loop` the closed trail's cells (the first loop.length entries of `cells`).
 * respawn: `cells` are the new home disc.
 * A sinking emits `sink` (`by`: the ship that cut its trail or took its last territory, itself for a self-crossing,
 * -1 when no ship is to blame), then `drain` with the cells that returned to neutral sea.
 */
export type SimEvent =
  | { type: 'claim'; tick: number; ship: number; cells: Int32Array; prev: Uint8Array; loop: Int32Array }
  | { type: 'trail'; tick: number; ship: number } // a ship left its territory and opened a trail
  | { type: 'sink'; tick: number; ship: number; by: number; pos: V3; fwd: V3 }
  | { type: 'drain'; tick: number; ship: number; cells: Int32Array }
  | { type: 'respawn'; tick: number; ship: number; cells: Int32Array }
  | { type: 'bump'; tick: number; a: number; b: number; strength: number } // ship-ship contact, closing speed u/s
  | { type: 'ground'; tick: number; ship: number; strength: number }; // ship struck an island, impact speed u/s

interface SimOptions {
  seed: number;
  world: World | null; // null = open ocean, no islands (used by the territory geometry check)
  ships?: number; // defaults to SHIPS
  spawns?: V3[]; // fixed home centres for the first ships (tests)
}

// Hot-path scratch vectors.
const W = v3(), S = v3(), T = v3(), X = v3(), Q = v3(), M = v3(), J = v3(), L = v3(), PA = v3(), PB = v3();

function tangent(a: V3, p: V3): V3 {
  const k = dot(a, p);
  a.x -= k * p.x; a.y -= k * p.y; a.z -= k * p.z;
  return a;
}
/** Unit direction `k` world units from p along tangent `dir`. */
function offsetBy(p: V3, dir: V3, k: number, out: V3): V3 {
  out.x = p.x * R + dir.x * k; out.y = p.y * R + dir.y * k; out.z = p.z * R + dir.z * k;
  return normalize(out);
}
/** Unit direction `dist` world units from p along `bearing` in the tangent basis (e1, e2). */
function offset(p: V3, e1: V3, e2: V3, bearing: number, dist: number, out: V3): V3 {
  const c = dcos(bearing) * dist, s = dsin(bearing) * dist;
  out.x = p.x * R + e1.x * c + e2.x * s;
  out.y = p.y * R + e1.y * c + e2.y * s;
  out.z = p.z * R + e1.z * c + e2.z * s;
  return normalize(out);
}
function basis(p: V3, e1: V3, e2: V3): void {
  normalize(cross(p, Math.abs(p.y) < 0.9 ? v3(0, 1, 0) : v3(1, 0, 0), e1));
  cross(p, e1, e2);
}
const mass = (s: Ship) => (HULL_LENGTH[s.cls] * HULL_LENGTH[s.cls]) / 25;

export class Sim {
  readonly seed: number;
  readonly world: World | null;
  tick = 0;
  ships: Ship[] = [];
  /** owner per cell: 0 = neutral sea, k = ship k-1 */
  owner = new Uint8Array(CELLS);
  /** open-trail owner per cell: 0 = none, k = ship k-1 */
  trailOwner = new Uint8Array(CELLS);
  /** appended by step(); the frame loop drains it */
  events: SimEvent[] = [];
  private readonly rng: Rng;
  private readonly areaQ: Float64Array; // owned area per ship, AREA_Q quanta
  private readonly cellAt: Int32Array; // territory cell under each ship's centre
  private readonly trailCells: number[][]; // open-trail cells per ship, in the order they were laid
  private readonly walks: number[][]; // this tick: the previous cell, then every cell the centre entered
  private readonly groundTick: Int32Array; // last tick each ship pressed against land
  private readonly doomBy: Int32Array; // crossings found this tick: who sank each ship (-2 = nobody)

  constructor(opts: SimOptions) {
    this.seed = opts.seed;
    this.world = opts.world;
    this.rng = new Rng(opts.seed ^ 0x51ed);
    const count = opts.ships ?? SHIPS;
    this.areaQ = new Float64Array(count);
    this.cellAt = new Int32Array(count);
    this.trailCells = Array.from({ length: count }, () => []);
    this.walks = Array.from({ length: count }, () => []);
    this.groundTick = new Int32Array(count).fill(-100);
    this.doomBy = new Int32Array(count).fill(-2);
    for (let id = 0; id < count; id++) {
      const s: Ship = {
        id, cls: id === 0 ? 'galleon' : CLASSES[id % CLASSES.length], alive: true,
        pos: v3(), fwd: v3(), prevPos: v3(), prevFwd: v3(), speed: 0, turn: 0, rudder: 0, drift: v3(), home: v3(),
        trail: [], share: 0, sinkTick: -1,
      };
      this.ships.push(s);
      this.launch(s, opts.spawns?.[id] ?? this.initialSpot(id));
    }
    this.frameOpening();
    this.updateShares();
  }

  /** Advance one TICK. inputs[i] is ship i's rudder in [-1, 1] (positive = port). */
  step(inputs: ArrayLike<number>): void {
    const ships = this.ships, doom = this.doomBy;
    for (const s of ships) {
      copy(s.prevPos, s.pos);
      copy(s.prevFwd, s.fwd);
      if (s.alive) this.sail(s, inputs[s.id], this.tick * TICK);
    }
    this.collideShips();
    for (const s of ships) {
      const walk = this.walks[s.id];
      walk.length = 0;
      if (!s.alive) continue;
      if (this.world) this.collideLand(s);
      this.walk(s, walk);
    }
    // Crossings are judged against the trails as they stood at the start of the tick, so when two ships cut
    // each other's trails in the same tick both sink, whatever the processing order.
    for (const s of ships) {
      const walk = this.walks[s.id], mine = this.trailCells[s.id];
      // shoved astern by another hull, a ship retraces its own wake rather than crossing it
      const ahead = dot(s.prevPos, s.fwd) < 0;
      for (let k = 1; k < walk.length; k++) {
        const o = this.trailOwner[walk[k]] - 1;
        if (o < 0) continue;
        if (o !== s.id) {
          if (doom[o] === -2) doom[o] = s.id;
        } else if (ahead && doom[o] === -2 && mine.lastIndexOf(walk[k]) < mine.length - SELF_GRACE) doom[o] = o;
      }
    }
    for (const s of ships) {
      const by = doom[s.id];
      if (by === -2) continue;
      doom[s.id] = -2;
      this.sink(s, by);
    }
    for (const s of ships) if (s.alive) this.advance(s);
    for (const s of ships) if (!s.alive && this.tick >= s.sinkTick + RESPAWN_TICKS) this.respawn(s);
    this.updateShares();
    this.tick++;
  }

  /** Hash of territory ownership (FNV-1a, two lanes). */
  hash(): string {
    let h1 = 0x811c9dc5, h2 = 0x01000193 ^ 0x5bd1e995;
    const o = this.owner;
    for (let i = 0; i < o.length; i++) {
      h1 = Math.imul(h1 ^ o[i], 0x01000193);
      h2 = Math.imul(h2 ^ (o[i] + (i & 255)), 0x01000193);
    }
    return (h1 >>> 0).toString(16).padStart(8, '0') + (h2 >>> 0).toString(16).padStart(8, '0');
  }

  // -------------------------------------------------------------------------------------------
  // Movement and collisions

  /** Helm, sails and drag for one tick, then advance along the sphere. */
  private sail(s: Ship, input: number, t: number): void {
    const h = HANDLING[s.cls], p = s.pos, f = s.fwd, d = s.drift;
    const rudder = Math.max(-1, Math.min(1, Math.round((input || 0) * 127) / 127));
    s.rudder = rudder;
    // Turning inertia: the yaw rate eases toward what the rudder asks; a slowed hull answers with less rate.
    s.turn += ((rudder * Math.max(s.speed, h.speed * 0.6)) / h.radius - s.turn) * h.response;
    // Point of sail: fastest on a broad reach, slowest close-hauled, never stalled.
    wind(p, t, W);
    const ws = Math.sqrt(dot(W, W)), c = ws > 1e-9 ? dot(f, W) / ws : 0;
    const sail = 1 + SAIL * Math.min(ws, 1.2) * (0.778 + 0.889 * c * (1 - c));
    const hard = Math.min(1, Math.abs(s.turn * h.radius) / h.speed);
    s.speed += (h.speed * sail * (1 - TURN_LOSS * hard * hard) - s.speed) * ACCEL;
    if (s.speed < MIN_SPEED) s.speed = MIN_SPEED;
    const a = s.turn * TICK, ca = dcos(a), sa = dsin(a);
    cross(p, f, S);
    f.x = f.x * ca + S.x * sa; f.y = f.y * ca + S.y * sa; f.z = f.z * ca + S.z * sa;
    const k = TICK / R;
    p.x += (f.x * s.speed + d.x) * k; p.y += (f.y * s.speed + d.y) * k; p.z += (f.z * s.speed + d.z) * k;
    this.settle(s);
    d.x *= DRIFT_DAMP; d.y *= DRIFT_DAMP; d.z *= DRIFT_DAMP;
  }

  /** Renormalise the position and keep heading and drift tangent after a move. */
  private settle(s: Ship): void {
    normalize(s.pos);
    normalize(tangent(s.fwd, s.pos));
    tangent(s.drift, s.pos);
  }

  /** Apply impulse `j` (mass·u/s, tangent) at lever arm `r` (world units from the hull centre). */
  private impulse(s: Ship, j: V3, r: V3): void {
    const m = mass(s), f = s.fwd, d = s.drift, len = HULL_LENGTH[s.cls];
    const along = dot(j, f) / m;
    s.speed += along;
    d.x += j.x / m - f.x * along; d.y += j.y / m - f.y * along; d.z += j.z / m - f.z * along;
    if (s.speed < MIN_SPEED) {
      // way lost to the blow becomes backward drift: the hull recoils, then sails on
      const k = s.speed - MIN_SPEED;
      d.x += f.x * k; d.y += f.y * k; d.z += f.z * k;
      s.speed = MIN_SPEED;
    }
    s.turn += (YAW_KICK * dot(cross(r, j, X), s.pos)) / ((m * len * len) / 12);
  }

  /** Closest points PA, PB (world units) between the keel segments of a and b, half-lengths ha and hb. */
  private keels(a: Ship, b: Ship, ha: number, hb: number): void {
    const p1x = (a.pos.x * R) - a.fwd.x * ha, p1y = (a.pos.y * R) - a.fwd.y * ha, p1z = (a.pos.z * R) - a.fwd.z * ha;
    const p2x = (b.pos.x * R) - b.fwd.x * hb, p2y = (b.pos.y * R) - b.fwd.y * hb, p2z = (b.pos.z * R) - b.fwd.z * hb;
    const d1x = a.fwd.x * 2 * ha, d1y = a.fwd.y * 2 * ha, d1z = a.fwd.z * 2 * ha;
    const d2x = b.fwd.x * 2 * hb, d2y = b.fwd.y * 2 * hb, d2z = b.fwd.z * 2 * hb;
    const rx = p1x - p2x, ry = p1y - p2y, rz = p1z - p2z;
    const aa = 4 * ha * ha, ee = 4 * hb * hb, bb = d1x * d2x + d1y * d2y + d1z * d2z;
    const c = d1x * rx + d1y * ry + d1z * rz, f = d2x * rx + d2y * ry + d2z * rz, den = aa * ee - bb * bb;
    let s = den > 1e-9 ? clamp01((bb * f - c * ee) / den) : 0;
    let t = (bb * s + f) / ee;
    if (t < 0) {
      t = 0;
      s = clamp01(-c / aa);
    } else if (t > 1) {
      t = 1;
      s = clamp01((bb - c) / aa);
    }
    PA.x = p1x + d1x * s; PA.y = p1y + d1y * s; PA.z = p1z + d1z * s;
    PB.x = p2x + d2x * t; PB.y = p2y + d2y * t; PB.z = p2z + d2z * t;
  }

  /** Hulls are capsules along the keel; overlapping pairs separate and exchange momentum. */
  private collideShips(): void {
    const ships = this.ships;
    for (let i = 0; i < ships.length; i++) {
      const a = ships[i];
      if (!a.alive) continue;
      const la = HULL_LENGTH[a.cls];
      for (let k = i + 1; k < ships.length; k++) {
        const b = ships[k];
        if (!b.alive) continue;
        const lb = HULL_LENGTH[b.cls], ra = BEAM * la, rb = BEAM * lb;
        if (chord(a.pos, b.pos) > (la + lb) / 2) continue;
        this.keels(a, b, la * (0.5 - BEAM), lb * (0.5 - BEAM));
        // normal n (in T) from b toward a, tangent at the contact
        T.x = PA.x - PB.x; T.y = PA.y - PB.y; T.z = PA.z - PB.z;
        const dist = Math.sqrt(dot(T, T)), pen = ra + rb - dist;
        if (pen <= 0) continue;
        normalize(copy(M, PA));
        if (dist > 1e-6) normalize(tangent(T, M));
        else cross(a.pos, a.fwd, T);
        // contact point between the hulls; levers from each centre
        Q.x = PA.x - T.x * ra; Q.y = PA.y - T.y * ra; Q.z = PA.z - T.z * ra;
        const ma = mass(a), mb = mass(b);
        const vn = dot(a.fwd, T) * a.speed + dot(a.drift, T) - dot(b.fwd, T) * b.speed - dot(b.drift, T);
        this.nudge(a, T, (pen * mb) / (ma + mb));
        this.nudge(b, T, (-pen * ma) / (ma + mb));
        if (vn >= 0) continue;
        const jm = (-(1 + BOUNCE) * vn) / (1 / ma + 1 / mb);
        J.x = T.x * jm; J.y = T.y * jm; J.z = T.z * jm;
        this.impulse(a, J, this.lever(a, Q));
        J.x = -J.x; J.y = -J.y; J.z = -J.z;
        this.impulse(b, J, this.lever(b, Q));
        if (-vn > BUMP_MIN) this.events.push({ type: 'bump', tick: this.tick, a: a.id, b: b.id, strength: -vn });
      }
    }
  }

  /** Move a ship `dist` world units along tangent n. */
  private nudge(s: Ship, n: V3, dist: number): void {
    const k = dist / R;
    s.pos.x += n.x * k; s.pos.y += n.y * k; s.pos.z += n.z * k;
    this.settle(s);
  }

  /** Lever arm from s's centre to world point q (in L). */
  private lever(s: Ship, q: V3): V3 {
    L.x = q.x - s.pos.x * R; L.y = q.y - s.pos.y * R; L.z = q.z - s.pos.z * R;
    return L;
  }

  /** Probe the hull outline against the height field; push out of any land and slide along the coast. */
  private collideLand(s: Ship): void {
    const w = this.world!, len = HULL_LENGTH[s.cls];
    if (w.coast[cellOf(s.pos, HN)] > len * 0.5 + 2.5) return;
    for (let it = 0; it < 2; it++) {
      cross(s.pos, s.fwd, S);
      let worst = 0;
      for (const [along, port] of HULL_POINTS) {
        X.x = s.fwd.x * along + S.x * port; X.y = s.fwd.y * along + S.y * port; X.z = s.fwd.z * along + S.z * port;
        offsetBy(s.pos, X, len, Q);
        // a probe two units from the navigable boundary cannot be aground; skip the exact height there
        if (w.coast[cellOf(Q, HN)] > 2) continue;
        const pen = w.height(Q) - SOLID;
        if (pen > worst) {
          worst = pen;
          copy(M, Q);
        }
      }
      if (worst <= 0) return;
      // seaward normal: down the height gradient at the deepest probe
      const e = 0.35, h = (dir: V3, k: number) => w.height(offsetBy(M, dir, k, Q));
      const gf = h(s.fwd, e) - h(s.fwd, -e), gs = h(S, e) - h(S, -e);
      T.x = -(s.fwd.x * gf + S.x * gs); T.y = -(s.fwd.y * gf + S.y * gs); T.z = -(s.fwd.z * gf + S.z * gs);
      const slope = Math.sqrt(dot(T, T)) / (2 * e);
      if (slope > 1e-6) normalize(T);
      else {
        // flat ground (deep inside a probe): back straight out
        T.x = -s.fwd.x; T.y = -s.fwd.y; T.z = -s.fwd.z;
      }
      M.x *= R; M.y *= R; M.z *= R;
      this.lever(s, M);
      this.nudge(s, T, Math.min(0.4, worst / Math.max(slope, 0.5)) + 0.02);
      const vn = dot(s.fwd, T) * s.speed + dot(s.drift, T);
      if (vn >= 0) continue;
      // cancel the blow into the coast with a little rebound, and scrape along it
      const m = mass(s), jn = -(1 + LAND_BOUNCE) * vn * m;
      X.x = s.fwd.x * s.speed + s.drift.x - T.x * vn;
      X.y = s.fwd.y * s.speed + s.drift.y - T.y * vn;
      X.z = s.fwd.z * s.speed + s.drift.z - T.z * vn;
      const slide = Math.sqrt(dot(X, X)), fr = slide > 1e-6 ? (Math.min(LAND_FRICTION * jn, slide * m) / slide) : 0;
      J.x = T.x * jn - X.x * fr; J.y = T.y * jn - X.y * fr; J.z = T.z * jn - X.z * fr;
      this.impulse(s, J, L);
      s.turn += GLANCE * -vn * (dot(T, S) >= 0 ? 1 : -1);
      if (-vn > GROUND_MIN && this.tick - this.groundTick[s.id] > 10) {
        this.events.push({ type: 'ground', tick: this.tick, ship: s.id, strength: -vn });
      }
      this.groundTick[s.id] = this.tick;
    }
  }

  // -------------------------------------------------------------------------------------------
  // Trails, loops and territory

  /** Record the 4-connected chain of cells the ship's centre passed through this tick. */
  private walk(s: Ship, out: number[]): void {
    const c0 = this.cellAt[s.id], c1 = cellOf(s.pos, GRID);
    out.push(c0);
    if (c1 !== c0) trace(s.prevPos, c0, s.pos, c1, out, 12);
    this.cellAt[s.id] = c1;
  }

  /** Lay trail, open it on leaving home and close loops on coming back, along this tick's cells. */
  private advance(s: Ship): void {
    const me = s.id + 1, walk = this.walks[s.id], laid = this.trailCells[s.id];
    for (let k = 0; k < walk.length; k++) {
      const c = walk[k], open = s.trail.length > 0;
      if (k === 0 && open) continue; // laid when it was entered
      if (this.owner[c] === me) {
        if (open) this.claim(s);
      } else {
        if (!open) this.openTrail(s, k === 0);
        laid.push(c);
        this.trailOwner[c] = me;
      }
    }
    if (s.trail.length && chord(s.trail[s.trail.length - 1], s.pos) >= TRAIL_STEP) s.trail.push(copy(v3(), s.pos));
  }

  /** Start a trail at the border crossing (found by bisection), or right here when home was taken from under us. */
  private openTrail(s: Ship, lostHome: boolean): void {
    const me = s.id + 1, lo = copy(v3(), s.prevPos), hi = copy(v3(), s.pos);
    for (let i = 0; i < 8 && !lostHome; i++) {
      const m = normalize(v3(lo.x + hi.x, lo.y + hi.y, lo.z + hi.z));
      copy(this.owner[cellOf(m, GRID)] === me ? lo : hi, m);
    }
    s.trail.push(lostHome ? lo : hi);
    this.events.push({ type: 'trail', tick: this.tick, ship: s.id });
  }

  /**
   * Close a loop. Own territory ∪ own trail is the barrier; every connected region of the rest except the
   * largest becomes ours (on a sphere every loop splits the world, so this takes the smaller side and any other
   * enclosed pockets). Regions grow from the trail's neighbours in lockstep, a few cells each per round, merging
   * on contact; the flood stops as soon as one region is still growing and it already outweighs every finished
   * one, so the cost scales with the enclosed side rather than the planet.
   */
  private claim(s: Ship): void {
    const me = s.id + 1, owner = this.owner, trail = this.trailCells[s.id];
    for (const c of trail) MARK[c] = 1;
    const parent: number[] = [], queue: number[][] = [], head: number[] = [], area: number[] = [];
    const visited: number[] = [];
    const find = (r: number) => {
      while (parent[r] !== r) r = parent[r] = parent[parent[r]];
      return r;
    };
    for (const c of trail) {
      for (let k = 0; k < 4; k++) {
        const n = neighbor(c, k);
        if (owner[n] === me || MARK[n] || LABEL[n]) continue;
        LABEL[n] = parent.length + 1;
        parent.push(parent.length);
        queue.push([n]);
        head.push(0);
        area.push(AREA[n & (NN - 1)]);
        visited.push(n);
      }
    }
    const active = parent.slice();
    let finished = 0; // area of the largest finished region
    while (active.length > 1 || (active.length === 1 && area[active[0]] < finished)) {
      for (const r0 of active) {
        let r = r0, q = queue[r];
        // a short turn per region; its length only bounds how far the stop test can overshoot
        for (let turn = 0; turn < 16 && parent[r] === r && head[r] < q.length; turn++) {
          const c = q[head[r]++];
          for (let k = 0; k < 4; k++) {
            const n = neighbor(c, k);
            if (owner[n] === me || MARK[n]) continue;
            const l = LABEL[n];
            if (!l) {
              LABEL[n] = r + 1;
              area[r] += AREA[n & (NN - 1)];
              q.push(n);
              visited.push(n);
              continue;
            }
            if (l - 1 === r) continue;
            const o = find(l - 1);
            if (o === r) continue;
            // two fronts met: fold the one with less pending work into the other
            const keep = queue[o].length - head[o] > q.length - head[r] ? o : r, drop = keep === o ? r : o;
            const from = queue[drop], into = queue[keep];
            for (let m = head[drop]; m < from.length; m++) into.push(from[m]);
            parent[drop] = keep;
            area[keep] += area[drop];
            queue[drop] = [];
            r = keep;
            q = into;
          }
        }
      }
      let live = 0;
      for (const r of active) {
        if (parent[r] !== r) continue;
        if (head[r] < queue[r].length) active[live++] = r;
        else finished = Math.max(finished, area[r]);
      }
      active.length = live;
    }
    // the outer side: the one region still growing or, if every region finished, the largest
    let outer = active.length ? active[0] : -1;
    if (outer < 0) {
      for (let r = 0; r < parent.length; r++) if (parent[r] === r && (outer < 0 || area[r] > area[outer])) outer = r;
    }
    const gained: number[] = [];
    for (const c of trail) {
      if (!MARK[c]) continue;
      MARK[c] = 0;
      gained.push(c);
    }
    const loop = gained.length;
    for (const c of visited) {
      if (find(LABEL[c] - 1) !== outer) gained.push(c);
      LABEL[c] = 0;
    }
    const cells = Int32Array.from(gained), prev = new Uint8Array(cells.length);
    for (let k = 0; k < cells.length; k++) {
      prev[k] = owner[cells[k]];
      this.setOwner(cells[k], me);
    }
    this.dropTrail(s);
    this.events.push({ type: 'claim', tick: this.tick, ship: s.id, cells, prev, loop: cells.slice(0, loop) });
    this.sinkEmpty(s.id);
  }

  private setOwner(c: number, k: number): void {
    const o = this.owner[c], a = AREA[c & (NN - 1)];
    if (o) this.areaQ[o - 1] -= a;
    if (k) this.areaQ[k - 1] += a;
    this.owner[c] = k;
  }

  private updateShares(): void {
    for (const s of this.ships) s.share = this.areaQ[s.id] / totalQ;
  }

  private dropTrail(s: Ship): void {
    const me = s.id + 1, laid = this.trailCells[s.id];
    for (const c of laid) if (this.trailOwner[c] === me) this.trailOwner[c] = 0;
    laid.length = 0;
    s.trail = [];
  }

  // -------------------------------------------------------------------------------------------
  // Sinking and respawning

  private sink(s: Ship, by: number): void {
    const me = s.id + 1, cells: number[] = [];
    s.alive = false;
    s.sinkTick = this.tick;
    const pos = copy(v3(), s.pos), fwd = copy(v3(), s.fwd);
    this.events.push({ type: 'sink', tick: this.tick, ship: s.id, by, pos, fwd });
    this.dropTrail(s);
    for (let c = this.owner.indexOf(me); c >= 0; c = this.owner.indexOf(me, c + 1)) {
      cells.push(c);
      this.setOwner(c, 0);
    }
    this.events.push({ type: 'drain', tick: this.tick, ship: s.id, cells: Int32Array.from(cells) });
    s.speed = 0;
    s.turn = 0;
    s.rudder = 0;
    s.drift.x = s.drift.y = s.drift.z = 0;
  }

  /** Sink every ship left without territory; `by` is the ship whose claim took the last of it. */
  private sinkEmpty(by: number): void {
    for (const o of this.ships) if (o.alive && this.areaQ[o.id] === 0) this.sink(o, by);
  }

  private respawn(s: Ship): void {
    const p = this.spot(40, () => this.randomDir(), (q) => {
      let near = 90;
      for (const o of this.ships) if (o.alive) near = Math.min(near, chord(q, o.pos));
      return near + 60 * this.neutral(q);
    });
    this.events.push({ type: 'respawn', tick: this.tick, ship: s.id, cells: this.launch(s, p) });
    this.sinkEmpty(-1);
  }

  /** Put a ship afloat at p on a random heading with a fresh home disc; returns the disc's cells. */
  private launch(s: Ship, p: V3): Int32Array {
    normalize(copy(s.pos, p));
    copy(s.prevPos, s.pos);
    copy(s.home, s.pos);
    basis(s.pos, S, T);
    const b = this.rng.range(-PI, PI), cb = dcos(b), sb = dsin(b);
    s.fwd.x = S.x * cb + T.x * sb; s.fwd.y = S.y * cb + T.y * sb; s.fwd.z = S.z * cb + T.z * sb;
    copy(s.prevFwd, s.fwd);
    s.alive = true;
    s.speed = HANDLING[s.cls].speed * 0.7;
    s.turn = 0;
    s.rudder = 0;
    s.drift.x = s.drift.y = s.drift.z = 0;
    s.trail = [];
    const me = s.id + 1, cosA = dcos(HOME_RADIUS / R), list = [cellOf(s.pos, GRID)];
    this.cellAt[s.id] = list[0];
    LABEL[list[0]] = 1;
    for (let k = 0; k < list.length; k++) {
      for (let d = 0; d < 4; d++) {
        const n = neighbor(list[k], d);
        if (LABEL[n] || dot(cellDir(n, GRID, Q), s.pos) < cosA) continue;
        LABEL[n] = 1;
        list.push(n);
      }
    }
    for (const c of list) {
      LABEL[c] = 0;
      this.setOwner(c, me);
    }
    return Int32Array.from(list);
  }

  /** Opening line-up: the player near an archipelago, four rivals within reach, the rest spread out. */
  private initialSpot(id: number): V3 {
    const placed = this.ships.slice(0, id).map((s) => s.pos);
    const nearest = (p: V3) => placed.reduce((m, q) => Math.min(m, chord(p, q)), Infinity);
    if (id === 0) return this.spot(400, () => this.randomDir(), (p) => this.scenery(p));
    if (id > 4) return this.spot(30, () => this.randomDir(), nearest);
    const e1 = v3(), e2 = v3();
    basis(placed[0], e1, e2);
    const near = () => offset(placed[0], e1, e2, this.rng.range(-PI, PI), this.rng.range(38, 65), v3());
    return this.spot(60, near, (p) => (nearest(p) > 2 * HOME_RADIUS + 10 ? 0 : -Infinity));
  }

  /** Turn the player so the nearest island lies abeam to starboard for the opening view. */
  private frameOpening(): void {
    const s = this.ships[0], islands = this.world?.islands;
    if (!islands?.length) return;
    const gap = (i: Island) => chord(s.pos, i.center) - i.radius;
    const isl = islands.reduce((a, b) => (gap(a) < gap(b) ? a : b));
    normalize(cross(s.pos, normalize(tangent(copy(T, isl.center), s.pos)), s.fwd));
    copy(s.prevFwd, s.fwd);
  }

  /** How well a spot frames an archipelago: tall islands lying just beyond their shelves, several in view. */
  private scenery(p: V3): number {
    let score = 0;
    for (const isl of this.world?.islands ?? []) {
      const gap = chord(p, isl.center) - isl.radius - HOME_RADIUS;
      score += Math.max(0, 1 - Math.abs(gap - 8) / 25) * Math.min(1, isl.peak / 15);
    }
    return score;
  }

  /** Fraction of a home disc at p that is neutral sea (13 samples). */
  private neutral(p: V3): number {
    basis(p, S, T);
    let free = this.owner[cellOf(p, GRID)] === 0 ? 1 : 0;
    for (let k = 0; k < 12; k++) {
      const q = offset(p, S, T, k * (PI / 6), HOME_RADIUS * (k & 1 ? 1 : 0.5), Q);
      if (this.owner[cellOf(q, GRID)] === 0) free++;
    }
    return free / 13;
  }

  /** Best-scoring candidate from `gen` with open water for a home disc. */
  private spot(tries: number, gen: () => V3, score: (p: V3) => number): V3 {
    let best: V3 | null = null, top = -Infinity;
    for (let k = 0; k < tries || (!best && k < tries * 20); k++) {
      const p = gen();
      if (!this.clearWater(p)) continue;
      const v = score(p);
      if (v > top || !best) {
        top = v;
        best = p;
      }
    }
    return best ?? gen();
  }

  /** Open navigable water around a whole home disc, clear of every island's reef and shelf. */
  private clearWater(p: V3): boolean {
    const w = this.world;
    if (!w) return true;
    if (w.coast[cellOf(p, HN)] < HOME_RADIUS + 4) return false;
    return w.islands.every((i) => chord(p, i.center) > i.radius + HOME_RADIUS);
  }

  private randomDir(): V3 {
    return sphereDir(this.rng.range(-0.9, 0.9), this.rng.range(-PI, PI));
  }
}
