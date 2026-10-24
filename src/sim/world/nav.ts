// The coarse navigation graph: the planet on a 128-cell-per-face grid (cells ≈ 2.5 u, fine enough that the
// narrowest designed channel, 7 u, stays connected), each cell and each of its four edges labelled with the sea
// level above which a hull's centre can be there or cross there. Routes for head-home, drawn courses and the
// captains search it at the current tide.
//
// A territory cell lets a hull's centre through once the water is deeper than DRAFT over everything within ≈ CLEAR
// of it: its level is the dilated maximum of (height + DRAFT). Levels below the lowest tide count as always open,
// above the highest as never. A nav cell opens at the lowest level of its sixteen territory cells; the edge to a
// neighbour at the lowest level over the pairs of territory cells that face each other across the shared border.
import { dot, type V3 } from '../math.ts';
import { R, TERRITORY, cellDir, cellOf, cubeGrid, neighbor, type CubeGrid } from '../sphere.ts';
import { DRAFT, TIDE } from './regions.ts';
import { CLEAR, ZONE, type Geography } from './geography.ts';

export const NAV: CubeGrid = cubeGrid(128);
const F = TERRITORY.n / NAV.n; // territory cells per nav cell edge (4)

export interface Nav {
  /** Per nav cell: sea level (u above mean) above which it is open; −∞ always, +∞ never. */
  level: Float32Array;
  /** Per nav cell and side k (0 −u, 1 +u, 2 −v, 3 +v): sea level above which the edge to that neighbour is open. */
  edge: Float32Array;
  /** Per nav cell and side: the cost of the step, u, weighted against hugging coasts and pushing through kelp. */
  cost: Float32Array;
}

/** The nav cell containing direction p. */
export const navCellOf = (p: V3): number => cellOf(NAV, p);

/** The nav cell holding territory cell c. */
function navOfFine(c: number): number {
  const n = TERRITORY.n, i = c & (n - 1), j = (c >> TERRITORY.log) & (n - 1), f = c >> (2 * TERRITORY.log);
  return (f << (2 * NAV.log)) + (((j / F) | 0) << NAV.log) + ((i / F) | 0);
}

export function buildNav(geo: Geography): Nav {
  const total = TERRITORY.cells;
  // Per territory cell: the level at which water covers it (±∞ outside the tide's range), dilated over ≈ CLEAR.
  let need = new Float32Array(total), next = new Float32Array(total);
  for (let c = 0; c < total; c++) {
    const l = geo.heights[c] + DRAFT;
    need[c] = l < -TIDE.amp ? -Infinity : l > TIDE.amp ? Infinity : l;
  }
  for (let it = 0; it < Math.round(CLEAR / 0.6); it++) {
    for (let c = 0; c < total; c++) {
      let m = need[c];
      const w = neighbor(TERRITORY, c, 0), e = neighbor(TERRITORY, c, 1);
      m = Math.max(m, need[w], need[e], need[neighbor(TERRITORY, c, 2)], need[neighbor(TERRITORY, c, 3)]);
      m = Math.max(m, need[neighbor(TERRITORY, w, 2)], need[neighbor(TERRITORY, w, 3)], need[neighbor(TERRITORY, e, 2)], need[neighbor(TERRITORY, e, 3)]);
      next[c] = m;
    }
    const t = need; need = next; next = t;
  }

  const cells = NAV.cells, level = new Float32Array(cells).fill(Infinity), edge = new Float32Array(cells * 4).fill(Infinity);
  const clear = new Float32Array(cells).fill(-Infinity), kelp = new Uint8Array(cells);
  for (let c = 0; c < total; c++) {
    const n = navOfFine(c);
    if (need[c] < level[n]) level[n] = need[c];
    if (geo.coast[c] > clear[n]) clear[n] = geo.coast[c];
    if (geo.zones[c] & ZONE.kelp) kelp[n] = 1;
    // a territory cell on a nav cell's border faces one across it
    const n0 = TERRITORY.n, i = c & (n0 - 1), j = (c >> TERRITORY.log) & (n0 - 1);
    for (let k = 0; k < 4; k++) {
      const onBorder = k === 0 ? i % F === 0 : k === 1 ? i % F === F - 1 : k === 2 ? j % F === 0 : j % F === F - 1;
      if (!onBorder) continue;
      const m = neighbor(TERRITORY, c, k), nm = navOfFine(m);
      for (let s = 0; s < 4; s++) {
        if (neighbor(NAV, n, s) !== nm) continue;
        const l = Math.max(need[c], need[m]);
        if (l < edge[n * 4 + s]) edge[n * 4 + s] = l;
      }
    }
  }

  const cost = new Float32Array(cells * 4), a = { x: 0, y: 0, z: 0 }, b = { x: 0, y: 0, z: 0 };
  for (let n = 0; n < cells; n++) {
    cellDir(NAV, n, a);
    for (let s = 0; s < 4; s++) {
      const m = neighbor(NAV, n, s);
      cellDir(NAV, m, b);
      const d = R * Math.sqrt(2 - 2 * dot(a, b)), hug = clear[m] >= 8 ? 0 : (8 - Math.max(CLEAR, clear[m])) / (8 - CLEAR);
      cost[n * 4 + s] = d * (1 + 1.5 * hug + (kelp[m] ? 0.6 : 0));
    }
  }
  return { level, edge, cost };
}

// ---------------------------------------------------------------------------------------------------------------
// Search: A* (or Dijkstra when no target is given) over the open cells at one sea level, with a binary heap on typed
// arrays. Ties pop in cell order, so a route is a pure function of its inputs.

const G = new Float64Array(NAV.cells), FROM = new Int32Array(NAV.cells), SEEN = new Int32Array(NAV.cells);
const HEAP = new Int32Array(NAV.cells * 4 + 1), KEY = new Float64Array(NAV.cells * 4 + 1); // one push per edge relaxed, at most
let stamp = 0, heapN = 0;
const DIR = { x: 0, y: 0, z: 0 };

function less(i: number, j: number): boolean {
  return KEY[i] < KEY[j] || (KEY[i] === KEY[j] && HEAP[i] < HEAP[j]);
}
function swap(i: number, j: number): void {
  const h = HEAP[i], k = KEY[i];
  HEAP[i] = HEAP[j]; KEY[i] = KEY[j]; HEAP[j] = h; KEY[j] = k;
}
function push(cell: number, key: number): void {
  let i = heapN++;
  HEAP[i] = cell; KEY[i] = key;
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
  HEAP[0] = HEAP[heapN]; KEY[0] = KEY[heapN];
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

/**
 * The cheapest route at sea level `tide` from the nav cell `from` to the first cell that satisfies `goal`, written
 * into `out` as nav cells from start to goal. `toward`, when given, is the goal's direction and steers the search
 * (A*, admissible: steps cost at least their length). Returns the route's cost in u, or −1 if no route exists.
 */
export function findRoute(nav: Nav, from: number, tide: number, goal: (cell: number) => boolean, toward: V3 | null,
  out: number[]): number {
  out.length = 0;
  if (!(nav.level[from] < tide)) return -1;
  stamp++;
  heapN = 0;
  const h = (c: number) => (toward ? R * Math.sqrt(Math.max(0, 2 - 2 * dot(cellDir(NAV, c, DIR), toward))) : 0);
  G[from] = 0;
  FROM[from] = -1;
  SEEN[from] = stamp;
  push(from, h(from));
  while (heapN > 0) {
    const c = pop(), gc = G[c];
    if (goal(c)) {
      for (let k = c; k >= 0; k = FROM[k]) out.push(k);
      out.reverse();
      return gc;
    }
    for (let s = 0; s < 4; s++) {
      if (!(nav.edge[c * 4 + s] < tide)) continue;
      const m = neighbor(NAV, c, s), gm = gc + nav.cost[c * 4 + s];
      if (SEEN[m] === stamp && gm >= G[m]) continue;
      SEEN[m] = stamp;
      G[m] = gm;
      FROM[m] = c;
      push(m, gm + h(m));
    }
  }
  return -1;
}
