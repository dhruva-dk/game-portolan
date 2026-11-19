// Routes round land: a chart of the open water, a pathfinder over it, and the helm that follows what it finds.
//
// The chart: a coarse grid of open water over the sphere, 128 cells along each edge of the cube's six faces (the same
// equi-angular cube as world/sphere.ts faceUV), about 6.8 m a cell. A cell is open when the water is deep enough for a
// ship, with a little to spare, at its centre and at eight soundings across it (so a bar thinner than a cell still
// shows); each open cell knows how many cells it lies from the shore, up to 4. Baked once from a Depth (chart), some
// tenths of a second on a desktop; the world is fixed, so it is the same all game. (It keeps no tide, columns, logs or
// heights for line of sight: this sea has none of the first three, and bot.ts sees past land itself.)
//
// Routes are found by A* over the open cells, a cell near the shore costing more to cross so a route keeps off it where
// it can, and are followed (course): straight for the mark while the water to it is clear, else along the route,
// looking as far ahead along it as the water is clear. A route steps to the eight cells round each, not only the four
// beside it, the diagonals only where they cut no corner of land. Over blocked pairs of open water on the
// release's planet whose way round is under 1.5 times the straight line, it is found within ROUTE.work cells every time
// at 150–250 m and 84% at 250–400 m (where four neighbours found 91% and 50% of what eight found 99% and 91% of, eight
// took half the time and ran 1.1–1.15 times the straight line to four's 1.3–1.4).
//
// Pure arithmetic: no three, so it runs in node for the tests; deterministic, to the bit.

import { add, distance, faceDir, faceUV, frameAt, normalize, scale, R, type Vec3 } from '../world/sphere.ts';
import { SHIP } from './handling.ts';
import type { Depth } from './shoal.ts';

/** Everything the chart and its routes are tuned by. Metres and seconds. */
export const ROUTE = {
  /** Cells along a cube face's edge (a power of two): about 6.8 m cells. */
  n: 128,
  /** Open water: this deep past her draught at the centre and at soundings `sounding` m east, west,
   *  north, south and on the diagonals of it. */
  open: 0.3, sounding: 2.3,
  /** Within `offshore` cells of the shore a cell costs `hug` times as much to cross; the A* is greedy by `greed`. */
  offshore: 2, hug: 2.5, greed: 1.2,
  /** Cells a route may look through before it gives up; how far round a ship on a bank it looks for open water, cells. */
  work: 4000, wade: 6,
  /** Routing: from further than `far` m, with the water to the mark not clear; a new route every `repath` s, or when
   *  the mark has moved `moved` m; a cell `reached` within this many m; up to `ahead` cells looked ahead along it,
   *  and the water looked along every `step` m. */
  far: 12, repath: 2, moved: 30, reached: 10, ahead: 6, step: 6,
} as const;

/** The chart: whether each cell is open water, how many cells it lies from the shore (0: not open; up to 4), and its
 *  pathfinder's working space (findPath's alone). */
export interface Chart { readonly open: Uint8Array; readonly clear: Uint8Array; readonly space: Space }

/** A pathfinder's working space, kept with its chart between queries (a query leaves nothing in it that the next
 *  reads: each is stamped). Cell centres, and for each cell its cost so far, the cell it was reached from and the
 *  stamps of the queries that saw and marked it; the open heap. */
interface Space {
  readonly g: Float64Array; readonly from: Int32Array; readonly seen: Int32Array; readonly marks: Int32Array; readonly centre: Float64Array;
  readonly heap: Int32Array; readonly key: Float64Array; stamp: number;
}

const N = ROUTE.n, LOG = 31 - Math.clz32(N), CELLS = 6 * N * N;

// ---------------------------------------------------------------- the grid

/** The cell direction p lies in. */
function cellOf(p: Vec3): number {
  const f = faceUV(p);
  const i = Math.min(N - 1, Math.max(0, Math.floor((f.u + 1) * 0.5 * N)));
  const j = Math.min(N - 1, Math.max(0, Math.floor((f.v + 1) * 0.5 * N)));
  return (f.face << (2 * LOG)) + (j << LOG) + i;
}

/** The unit direction of a cell's centre. */
export function cellCentre(c: number): Vec3 {
  const i = c & (N - 1), j = (c >> LOG) & (N - 1);
  return faceDir(c >> (2 * LOG), ((i + 0.5) / N) * 2 - 1, ((j + 0.5) / N) * 2 - 1);
}

/** Across each face's four edges, the cell on the far side of each cell along it. */
const EDGE = (() => {
  const edge = new Int32Array(24 * N), e = 1 + 1e-6;
  for (let f = 0; f < 6; f++) {
    for (let k = 0; k < N; k++) {
      const t = ((k + 0.5) / N) * 2 - 1, b = f * 4 * N + k;
      edge[b] = cellOf(faceDir(f, -e, t));
      edge[b + N] = cellOf(faceDir(f, e, t));
      edge[b + 2 * N] = cellOf(faceDir(f, t, -e));
      edge[b + 3 * N] = cellOf(faceDir(f, t, e));
    }
  }
  return edge;
})();

/** A cell's neighbour k: 0 west, 1 east, 2 south, 3 north on its face. */
function neighbour(c: number, k: number): number {
  const i = c & (N - 1), j = (c >> LOG) & (N - 1), e = (c >> (2 * LOG)) * 4 * N;
  if (k === 0) return i > 0 ? c - 1 : EDGE[e + j];
  if (k === 1) return i < N - 1 ? c + 1 : EDGE[e + N + j];
  if (k === 2) return j > 0 ? c - N : EDGE[e + 2 * N + i];
  return j < N - 1 ? c + N : EDGE[e + 3 * N + i];
}

// ---------------------------------------------------------------- the chart

const SOUNDINGS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]] as const;

/** Bakes the chart of the water `depth` gives. */
export const chart = (depth: Depth): Chart => charted(sound(depth));

/** The soundings a chart is made of: which cells are open water, and how many cells each lies from the shore (up to
 *  4). Plain arrays, so a worker can hand them over (play/sounding.ts). */
export interface Soundings { readonly open: Uint8Array; readonly clear: Uint8Array }

/** Sounds the water `depth` gives, cell by cell. */
export function sound(depth: Depth): Soundings {
  const open = new Uint8Array(CELLS), clear = new Uint8Array(CELLS), deep = SHIP.draught + ROUTE.open, s = ROUTE.sounding / R;
  for (let c = 0; c < CELLS; c++) {
    const p = cellCentre(c);
    let ok = depth(p) >= deep;
    if (ok) {
      const { east, north } = frameAt(p);
      for (const [a, b] of SOUNDINGS) if (!(ok = depth(normalize(add(add(p, east, a * s), north, b * s))) >= deep)) break;
    }
    open[c] = ok ? 1 : 0;
  }
  // distance to shore, by a few rounds of erosion
  for (let c = 0; c < CELLS; c++) clear[c] = open[c] ? 4 : 0;
  for (let round = 0; round < 4; round++) {
    for (let c = 0; c < CELLS; c++) {
      if (clear[c] <= round) continue;
      for (let k = 0; k < 4; k++) if (clear[neighbour(c, k)] === round) { clear[c] = round + 1; break; }
    }
  }
  return { open, clear };
}

/** The chart of these soundings, with the pathfinder's working space made now rather than at the first route, which
 *  it would hold up some tens of ms. */
export const charted = (s: Soundings): Chart => ({ open: s.open, clear: s.clear, space: space() });

export const openAt = (ch: Chart, p: Vec3): boolean => ch.open[cellOf(p)] === 1;

/** Open water all along the chord from a to b, looked at every `step` m. */
function clearLine(ch: Chart, a: Vec3, b: Vec3, step = 4): boolean {
  const k = Math.max(1, Math.ceil(distance(a, b) / step));
  for (let s = 1; s <= k; s++) if (!openAt(ch, normalize(add(scale(a, 1 - s / k), b, s / k)))) return false;
  return true;
}

// ---------------------------------------------------------------- finding a route

/** The heap's room: a query pushes at most eight for each cell it looks through, and looks through at most four times
 *  ROUTE.work. */
const HEAP = 8 * ROUTE.work * 4 + 1;
/** A step to a cell further than this, m, is no step: round a cube's corner, where a diagonal has no cell. */
const STRIDE = 12;

/** A fresh working space. */
function space(): Space {
  const centre = new Float64Array(CELLS * 3);
  for (let c = 0; c < CELLS; c++) centre.set(cellCentre(c), 3 * c);
  return {
    g: new Float64Array(CELLS), from: new Int32Array(CELLS), seen: new Int32Array(CELLS), marks: new Int32Array(CELLS), centre,
    heap: new Int32Array(HEAP), key: new Float64Array(HEAP), stamp: 0,
  };
}

/** The nearest open cell to p within `reach` cells, by rings of neighbours: the nearest of the first ring to hold one. */
function nearestOpen(ch: Chart, s: Space, p: Vec3, reach: number): number {
  const start = cellOf(p), mark = ++s.stamp, queue = [start];
  if (ch.open[start]) return start;
  s.marks[start] = mark;
  let best = -1, near = Infinity, depth = 0, end = 1;
  for (let q = 0; q < queue.length; q++) {
    if (q === end) {
      if (best >= 0 || ++depth > reach) break;
      end = queue.length;
    }
    const c = queue[q];
    if (ch.open[c]) {
      const d = gap(s, c, p);
      if (d < near) [near, best] = [d, c];
      continue;
    }
    for (let k = 0; k < 4; k++) {
      const m = neighbour(c, k);
      if (s.marks[m] !== mark) {
        s.marks[m] = mark;
        queue.push(m);
      }
    }
  }
  return best;
}

/** Metres between cell a's centre and cell b's, or the point p (a unit vector). */
function gap(s: Space, a: number, b: number | Vec3): number {
  const C = s.centre, [x, y, z] = typeof b === 'number' ? [C[3 * b], C[3 * b + 1], C[3 * b + 2]] : b;
  return R * Math.hypot(C[3 * a] - x, C[3 * a + 1] - y, C[3 * a + 2] - z);
}

/**
 * A route of cells from p to q over open water, keeping off the shore where it can. Gives up after
 * `work` cells. `found` false when there is none: `cells` then runs to the cell nearest q that it reached, or is empty
 * when p is on land with no open water near.
 */
export function findPath(ch: Chart, p: Vec3, q: Vec3, work: number = ROUTE.work): { cells: number[]; found: boolean } {
  const s = ch.space, { g, from: FROM, seen, heap, key } = s, to = cellOf(q), budget = Math.min(work, ROUTE.work * 4);
  const start = nearestOpen(ch, s, p, ROUTE.wade);
  if (start < 0) return { cells: [], found: false };
  const stamp = ++s.stamp;
  let n = 0;
  const less = (i: number, j: number) => key[i] < key[j] || (key[i] === key[j] && heap[i] < heap[j]);
  const swap = (i: number, j: number) => {
    [heap[i], heap[j]] = [heap[j], heap[i]];
    [key[i], key[j]] = [key[j], key[i]];
  };
  const push = (cell: number, k: number) => {
    let i = n++;
    [heap[i], key[i]] = [cell, k];
    for (let up = (i - 1) >> 1; i > 0 && less(i, up); i = up, up = (i - 1) >> 1) swap(i, up);
  };
  const pop = () => {
    const top = heap[0];
    n--;
    [heap[0], key[0]] = [heap[n], key[n]];
    for (let i = 0; ;) {
      const l = 2 * i + 1, r = l + 1;
      let m = i;
      if (l < n && less(l, m)) m = l;
      if (r < n && less(r, m)) m = r;
      if (m === i) break;
      swap(i, m);
      i = m;
    }
    return top;
  };
  g[start] = 0;
  FROM[start] = -1;
  seen[start] = stamp;
  push(start, gap(s, start, to));
  let best = start, bestH = gap(s, start, to), found = false, left = budget;
  while (n > 0 && left-- > 0) {
    const c = pop(), gc = g[c];
    if (c === to) {
      [best, found] = [c, true];
      break;
    }
    const h = gap(s, c, to);
    if (h < bestH) [bestH, best] = [h, c];
    for (let k = 0; k < 8; k++) {
      let m: number;
      if (k < 4) m = neighbour(c, k);
      else {
        // a diagonal: west or east, then south or north; only with both cells beside it open, so it cuts no corner of
        // land, and only to a cell beside this one
        const x = neighbour(c, k & 1), y = neighbour(c, 2 + ((k >> 1) & 1));
        if (!ch.open[x] || !ch.open[y]) continue;
        m = neighbour(x, 2 + ((k >> 1) & 1));
        if (gap(s, c, m) > STRIDE) continue;
      }
      if (!ch.open[m] && m !== to) continue;
      const gm = gc + gap(s, c, m) * (ch.clear[m] >= ROUTE.offshore ? 1 : ROUTE.hug);
      if (seen[m] === stamp && gm >= g[m]) continue;
      seen[m] = stamp;
      g[m] = gm;
      FROM[m] = c;
      if (n < HEAP) push(m, gm + ROUTE.greed * gap(s, m, to));
    }
  }
  const cells: number[] = [];
  for (let k = best; k >= 0; k = FROM[k]) cells.push(k);
  return { cells: cells.reverse(), found };
}

// ---------------------------------------------------------------- following one

/** A route being followed: its cells, the mark it was found for, the cell being made for, seconds to a new one. */
export interface Route { readonly cells: readonly number[]; readonly to: Vec3; readonly leg: number; readonly repath: number }

/**
 * Where a ship at `at` making for `want` steers this step of dt seconds: null to steer straight for
 * it, as the water there is clear (or it is close); else a point on her route, found afresh every ROUTE.repath s or
 * when the mark moves, and the route as it now stands. From shoal water she follows the route cell by cell, as a line
 * from there isn't to be trusted (a bar under her may lie between her and the water beyond).
 */
export function course(ch: Chart, at: Vec3, want: Vec3, route: Route | null, dt: number): { to: Vec3 | null; route: Route | null } {
  const shoaled = !openAt(ch, at);
  if (distance(at, want) <= ROUTE.far || (!shoaled && clearLine(ch, at, want, ROUTE.step))) return { to: null, route: null };
  // (with no route, as on one, it looks again every `repath` s, not every step)
  let r = route && { ...route, repath: route.repath - dt };
  if (!r || r.repath <= 0 || distance(r.to, want) > ROUTE.moved) {
    const { cells } = findPath(ch, at, want);
    r = { cells, to: want, leg: Math.min(1, cells.length - 1), repath: ROUTE.repath };
  }
  const { cells } = r;
  if (cells.length === 0) return { to: null, route: r };
  let leg = r.leg;
  while (leg < cells.length - 1 && distance(at, cellCentre(cells[leg])) < ROUTE.reached) leg++;
  // look ahead along the route as far as the water is clear
  let k = leg;
  while (!shoaled && k + 1 < cells.length && k < leg + ROUTE.ahead && clearLine(ch, at, cellCentre(cells[k + 1]), ROUTE.step)) k++;
  return { to: cellCentre(cells[k]), route: { ...r, leg } };
}
