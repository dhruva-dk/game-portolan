// The sea's cells: the planet's equi-angular cube (sphere.ts faceUV) cut into N × N cells a face, for who holds what
// water (sim/territory.ts) and for drawing it (water/claims.ts). The first game's grid (agent-initial src/sim.ts
// cellOf, neighbor, trace and its exact cell areas), on this planet.
//
// A cell's index is face·N² + j·N + i, i along the face's u and j along its v. N is a power of two, so an index splits
// into face, row and column by shifts. Along each edge of the cube the two faces' cells line up one for one (both
// faces' coordinates along a shared edge are the same ratio), so stepping across an edge lands in the neighbouring
// face's edge row at the same place along it: the cells tile the planet without a seam.
//
// N = 256: a cell is 2.7–3.8 m across (3.4 m at a face's middle), a galleon 26 m long covers some eight of them, the
// whole planet is 393 216 cells (one byte each to say who holds it), and the largest loop a ship can close (half the
// planet) floods 200 000 of them.
//
// Pure arithmetic: no three, so it runs in node for the tests.

import { R, faceUV, normalize, type Vec3 } from './sphere.ts';

/** Cells along a face's edge. */
export const N = 256;
const NN = N * N, LOG = 8;
/** Cells on the planet. */
export const CELLS = 6 * NN;

/** Cells as a reader has them, a number a cell (who holds each; the cells a change took), with no way to write them. */
export type ReadCells = ArrayLike<number>;

/** The face, column and row of a cell. */
export const faceOf = (c: number) => c >> (2 * LOG);
export const columnOf = (c: number) => c & (N - 1);
export const rowOf = (c: number) => (c >> LOG) & (N - 1);

/** The cell a point lies in (any vector from the centre). */
export function cellOf(p: Vec3): number {
  const { face, u, v } = faceUV(p);
  const i = Math.min(N - 1, Math.max(0, Math.floor((u + 1) * 0.5 * N)));
  const j = Math.min(N - 1, Math.max(0, Math.floor((v + 1) * 0.5 * N)));
  return face * NN + j * N + i;
}

/** tan of each column's (or row's) centre angle: the gnomonic coordinate of its middle. */
const TAN = Float64Array.from({ length: N }, (_, k) => Math.tan(((k + 0.5) / N * 2 - 1) * (Math.PI / 4)));

/** The point on face f at gnomonic (gu, gv), unnormalised: sphere.ts faceDir's faces. */
function onFace(f: number, gu: number, gv: number): Vec3 {
  switch (f) {
    case 0: return [1, gv, -gu];
    case 1: return [-1, gv, gu];
    case 2: return [gu, 1, -gv];
    case 3: return [gu, -1, gv];
    case 4: return [gu, gv, 1];
    default: return [-gu, gv, -1];
  }
}

/** The centre of a cell: a unit vector. */
export const centreOf = (c: number): Vec3 => normalize(onFace(faceOf(c), TAN[columnOf(c)], TAN[rowOf(c)]));

/** The cosine of the angle between a cell's centre and unit vector u: cheap, for sweeping many cells. */
export function cosTo(c: number, u: Vec3): number {
  const [x, y, z] = onFace(faceOf(c), TAN[columnOf(c)], TAN[rowOf(c)]);
  return (x * u[0] + y * u[1] + z * u[2]) / Math.sqrt(x * x + y * y + z * z);
}

/** The point at (u, v) on face f in the equi-angular coordinates (−1…1, and a little past an edge). */
const atUV = (f: number, u: number, v: number): Vec3 => onFace(f, Math.tan(u * (Math.PI / 4)), Math.tan(v * (Math.PI / 4)));

// The cell across each face edge, [face][side −u, +u, −v, +v][place along the edge]: probing a hair past the edge
// lands in the next face's edge row at the same place.
const EDGE = new Int32Array(24 * N);
for (let f = 0; f < 6; f++) {
  for (let k = 0; k < N; k++) {
    const t = ((k + 0.5) / N) * 2 - 1, b = f * 4 * N + k, e = 1 + 1e-6;
    EDGE[b] = cellOf(atUV(f, -e, t));
    EDGE[b + N] = cellOf(atUV(f, e, t));
    EDGE[b + 2 * N] = cellOf(atUV(f, t, -e));
    EDGE[b + 3 * N] = cellOf(atUV(f, t, e));
  }
}

/** A cell's k-th neighbour (k: 0 −u, 1 +u, 2 −v, 3 +v), across a face's edge onto the next face. */
export function neighbor(c: number, k: number): number {
  const i = c & (N - 1), j = (c >> LOG) & (N - 1), e = (c >> (2 * LOG)) * 4 * N;
  if (k === 0) return i > 0 ? c - 1 : EDGE[e + j];
  if (k === 1) return i < N - 1 ? c + 1 : EDGE[e + N + j];
  if (k === 2) return j > 0 ? c - N : EDGE[e + 2 * N + i];
  return j < N - 1 ? c + N : EDGE[e + 3 * N + i];
}

/** Whether two cells share a side. */
export function adjacent(a: number, b: number): boolean {
  for (let k = 0; k < 4; k++) if (neighbor(a, k) === b) return true;
  return false;
}

/**
 * The cell at column i, row j of face f, where i or j may be one past the face's edge (−1 or N): then the next face's
 * cell there. Past both edges at once, at a corner of the cube, where only three cells meet, it is the lowest-numbered
 * of those three, as every face that meets there takes it (so all three read the corner alike).
 */
export function wrapped(f: number, i: number, j: number): number {
  const inI = i >= 0 && i < N, inJ = j >= 0 && j < N;
  if (inI && inJ) return f * NN + j * N + i;
  const ci = Math.min(N - 1, Math.max(0, i)), cj = Math.min(N - 1, Math.max(0, j)), own = f * NN + cj * N + ci;
  const across = (c: number, di: number, dj: number) => (di < 0 ? neighbor(c, 0) : di > 0 ? neighbor(c, 1) : dj < 0 ? neighbor(c, 2) : neighbor(c, 3));
  const di = i < 0 ? -1 : i >= N ? 1 : 0, dj = j < 0 ? -1 : j >= N ? 1 : 0;
  if (inJ) return across(own, di, 0);
  if (inI) return across(own, 0, dj);
  return Math.min(own, across(own, di, 0), across(own, 0, dj));
}

/** The cell at column i, row j of face f, however far past its edges: where that point of the face's plane, carried
 *  on past the edge, lands on the sphere (a few cells past, the next face's cell there). */
export function beyond(f: number, i: number, j: number): number {
  if (i >= 0 && i < N && j >= 0 && j < N) return f * NN + j * N + i;
  return cellOf(atUV(f, ((i + 0.5) / N) * 2 - 1, ((j + 0.5) / N) * 2 - 1));
}

// Every cell's exact area on the sphere, one table for all six faces. A gnomonic rectangle [x0, x1] × [y0, y1] on the
// cube's face subtends F(x1, y1) − F(x0, y1) − F(x1, y0) + F(x0, y0) steradians, F = atan(xy / √(1 + x² + y²)). Areas
// are whole numbers of AREA_Q quanta, so sums of them are exact in any order of adding and taking away.
const AREA_Q = 1 << 20;
const AREA = new Float64Array(NN);
let total = 0;
{
  const g = Float64Array.from({ length: N + 1 }, (_, k) => Math.tan((k / N * 2 - 1) * (Math.PI / 4)));
  const F = (i: number, j: number) => Math.atan((g[i] * g[j]) / Math.sqrt(1 + g[i] * g[i] + g[j] * g[j]));
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      AREA[j * N + i] = Math.round((F(i + 1, j + 1) - F(i, j + 1) - F(i + 1, j) + F(i, j)) * R * R * AREA_Q);
      total += 6 * AREA[j * N + i];
    }
  }
}
/** A cell's area in quanta (whole numbers: sums of them are exact). */
export const areaQuanta = (c: number) => AREA[c & (NN - 1)];
/** The planet's area in quanta: the sum of every cell's (≈ 4πR² m²). */
export const PLANET_QUANTA = total;
/** Square metres a quantum. */
export const QUANTUM = 1 / AREA_Q;

/**
 * The cells crossed going straight from p0 (in c0) to p1 (in c1), c0 left out, as a chain each sharing a side with the
 * last, appended to `out` (the first game's trace): halved until each half's ends share a side; through a corner exactly,
 * by a cell touching both.
 */
export function trace(p0: Vec3, c0: number, p1: Vec3, c1: number, out: number[], depth = 12): void {
  if (c0 === c1) return;
  if (adjacent(c0, c1)) {
    out.push(c1);
    return;
  }
  if (depth === 0) {
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
  const m = normalize([p0[0] + p1[0], p0[1] + p1[1], p0[2] + p1[2]]), cm = cellOf(m);
  if (cm !== c0) trace(p0, c0, m, cm, out, depth - 1);
  if (cm !== c1) trace(m, cm, p1, c1, out, depth - 1);
}
