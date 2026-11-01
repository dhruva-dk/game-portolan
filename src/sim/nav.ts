// The captains' chart: a coarse grid of open water over the sphere, baked once from the world's heights,
// with routes found by A*. Built lazily on first use; the world is fixed, so it is the same for every match.
import { dot, normalize, set, v3, type V3 } from './math.ts';
import { R, cellDir, cellOf, cubeGrid, neighbor, type CubeGrid } from './sphere.ts';
import { DRAFT, heightAt } from './world/index.ts';

/** About 6.8 m cells. */
export const NAV: CubeGrid = cubeGrid(128);

/** Water open to the captains: deep enough at mean tide with a little to spare. */
const OPEN = -(DRAFT + 0.3);
/** Line of sight is blocked by ground higher than this. */
const SIGHT_LINE = 2.5;

export interface Nav {
  readonly height: Float32Array;
  readonly open: Uint8Array;
  /** Cells of open water to the nearest shore, up to 4. */
  readonly clear: Uint8Array;
}

let built: Nav | null = null;

export function nav(): Nav {
  if (built) return built;
  const cells = NAV.cells, height = new Float32Array(cells), open = new Uint8Array(cells), clear = new Uint8Array(cells), p = v3();
  for (let c = 0; c < cells; c++) {
    height[c] = heightAt(cellDir(NAV, c, p));
    open[c] = height[c] < OPEN ? 1 : 0;
  }
  // distance to shore, by a few rounds of erosion
  for (let c = 0; c < cells; c++) clear[c] = open[c] ? 4 : 0;
  for (let round = 0; round < 4; round++) {
    for (let c = 0; c < cells; c++) {
      if (clear[c] <= round) continue;
      for (let k = 0; k < 4; k++) if (clear[neighbor(NAV, c, k)] === round) { clear[c] = round + 1; break; }
    }
  }
  built = { height, open, clear };
  return built;
}

export const navCell = (p: V3): number => cellOf(NAV, p);

export const openAt = (p: V3): boolean => nav().open[navCell(p)] === 1;

const S = v3();

/** Open water all along the chord from a to b. */
export function clearLine(a: V3, b: V3, step = 4): boolean {
  const n = nav(), d = R * Math.sqrt(Math.max(0, 2 - 2 * dot(a, b))), k = Math.max(1, Math.ceil(d / step));
  for (let s = 1; s <= k; s++) {
    const f = s / k;
    normalize(set(S, a.x + (b.x - a.x) * f, a.y + (b.y - a.y) * f, a.z + (b.z - a.z) * f));
    if (n.open[navCell(S)] === 0) return false;
  }
  return true;
}

/** No land standing up between a and b. */
export function lineOfSight(a: V3, b: V3): boolean {
  const n = nav(), d = R * Math.sqrt(Math.max(0, 2 - 2 * dot(a, b))), k = Math.ceil(d / 6);
  for (let s = 1; s < k; s++) {
    const f = s / k;
    normalize(set(S, a.x + (b.x - a.x) * f, a.y + (b.y - a.y) * f, a.z + (b.z - a.z) * f));
    if (n.height[navCell(S)] > SIGHT_LINE) return false;
  }
  return true;
}

const QUEUE: number[] = [], MARKS = new Int32Array(NAV.cells);
let mark = 0;

/** The centre of the nearest open cell to p, within `reach` cells. Returns false if there is none. */
export function nearestOpen(p: V3, out: V3, reach = 40): boolean {
  const n = nav(), start = navCell(p);
  if (n.open[start]) {
    set(out, p.x, p.y, p.z);
    return true;
  }
  mark++;
  QUEUE.length = 0;
  QUEUE.push(start);
  MARKS[start] = mark;
  let best = -1, near = -2, depth = 0, end = 1;
  for (let q = 0; q < QUEUE.length; q++) {
    if (q === end) {
      if (best >= 0 || ++depth > reach) break;
      end = QUEUE.length;
    }
    const c = QUEUE[q];
    if (n.open[c]) {
      const d = dot(cellDir(NAV, c, S), p);
      if (d > near) {
        near = d;
        best = c;
      }
      continue;
    }
    for (let k = 0; k < 4; k++) {
      const m = neighbor(NAV, c, k);
      if (MARKS[m] !== mark) {
        MARKS[m] = mark;
        QUEUE.push(m);
      }
    }
  }
  if (best < 0) return false;
  cellDir(NAV, best, out);
  return true;
}

// ---------------------------------------------------------------- routes

const G = new Float64Array(NAV.cells), FROM = new Int32Array(NAV.cells), SEEN = new Int32Array(NAV.cells);
const HEAP = new Int32Array(NAV.cells * 4 + 1), KEY = new Float64Array(NAV.cells * 4 + 1);
const CENTRE = new Float64Array(NAV.cells * 3);
let stamp = 0, heapN = 0, centred = false;

function centres(): void {
  if (centred) return;
  for (let c = 0; c < NAV.cells; c++) {
    cellDir(NAV, c, S);
    CENTRE[3 * c] = S.x;
    CENTRE[3 * c + 1] = S.y;
    CENTRE[3 * c + 2] = S.z;
  }
  centred = true;
}

const less = (i: number, j: number): boolean => KEY[i] < KEY[j] || (KEY[i] === KEY[j] && HEAP[i] < HEAP[j]);

function swap(i: number, j: number): void {
  const h = HEAP[i], k = KEY[i];
  HEAP[i] = HEAP[j];
  KEY[i] = KEY[j];
  HEAP[j] = h;
  KEY[j] = k;
}

function push(cell: number, key: number): void {
  let i = heapN++;
  HEAP[i] = cell;
  KEY[i] = key;
  while (i > 0) {
    const p = (i - 1) >> 1;
    if (!less(i, p)) break;
    swap(i, p);
    i = p;
  }
}

function pop(): number {
  const top = HEAP[0];
  heapN--;
  HEAP[0] = HEAP[heapN];
  KEY[0] = KEY[heapN];
  for (let i = 0; ;) {
    const l = 2 * i + 1, r = l + 1;
    let m = i;
    if (l < heapN && less(l, m)) m = l;
    if (r < heapN && less(r, m)) m = r;
    if (m === i) break;
    swap(i, m);
    i = m;
  }
  return top;
}

const gap = (a: number, b: number): number => {
  const dx = CENTRE[3 * a] - CENTRE[3 * b], dy = CENTRE[3 * a + 1] - CENTRE[3 * b + 1], dz = CENTRE[3 * a + 2] - CENTRE[3 * b + 2];
  return R * Math.sqrt(dx * dx + dy * dy + dz * dz);
};

/**
 * A route of nav cells from p to q over open water, keeping off the shore where it can. Gives up after `work` cells.
 * Returns false when there is no route; `out` then holds the route to the closest cell it reached.
 */
export function findPath(p: V3, q: V3, out: number[], work = 6000): boolean {
  const n = nav();
  centres();
  out.length = 0;
  const to = navCell(q);
  let from = navCell(p);
  if (!n.open[from]) {
    if (!nearestOpen(p, S, 6)) return false;
    from = navCell(S);
  }
  stamp++;
  heapN = 0;
  G[from] = 0;
  FROM[from] = -1;
  SEEN[from] = stamp;
  push(from, gap(from, to));
  let best = from, bestH = gap(from, to), found = false;
  while (heapN > 0 && work-- > 0) {
    const c = pop(), gc = G[c];
    if (c === to) {
      best = c;
      found = true;
      break;
    }
    const h = gap(c, to);
    if (h < bestH) {
      bestH = h;
      best = c;
    }
    for (let k = 0; k < 4; k++) {
      const m = neighbor(NAV, c, k);
      if (!n.open[m] && m !== to) continue;
      const hug = n.clear[m] >= 2 ? 1 : 2.5;
      const gm = gc + gap(c, m) * hug;
      if (SEEN[m] === stamp && gm >= G[m]) continue;
      SEEN[m] = stamp;
      G[m] = gm;
      FROM[m] = c;
      push(m, gm + 1.2 * gap(m, to));
    }
  }
  for (let k = best; k >= 0; k = FROM[k]) out.push(k);
  out.reverse();
  return found;
}

export const cellCentre = (c: number, out: V3): V3 => cellDir(NAV, c, out);
