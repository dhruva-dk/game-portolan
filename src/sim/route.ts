import { cubeCells } from '../world/cells.ts';
import {
  add,
  distance,
  frameAt,
  normalize,
  scale,
  R,
  type Out3,
  type Vec3,
} from '../world/sphere.ts';
import { SHIP } from './handling.ts';
import type { Depth } from './shoal.ts';

export const ROUTE = {
  n: 128,
  open: 0.3,
  sounding: 2.3,
  offshore: 2,
  hug: 2.5,
  greed: 1.2,
  work: 4000,
  wade: 6,
  far: 12,
  repath: 2,
  moved: 30,
  spread: 6,
  reached: 10,
  ahead: 6,
  step: 6,
  wide: 2,
} as const;

export interface Chart {
  readonly open: Uint8Array;
  readonly clear: Uint8Array;
  readonly space: Space;
}

interface Space {
  readonly g: Float64Array;
  readonly from: Int32Array;
  readonly seen: Int32Array;
  readonly marks: Int32Array;
  readonly centre: Float64Array;
  readonly heap: Int32Array;
  readonly key: Float64Array;
  stamp: number;
  size: number;
  readonly queue: number[];
}

const N = ROUTE.n,
  CELLS = 6 * N * N;

const GRID = cubeCells(N),
  cellOf = GRID.cellOf,
  neighbour = GRID.neighbor;
export const cellCentre = GRID.centre;

const SOUNDINGS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, 1],
  [-1, 1],
  [1, -1],
  [-1, -1],
] as const;

export const chart = (depth: Depth): Chart => charted(sound(depth));

interface Soundings {
  readonly open: Uint8Array;
  readonly clear: Uint8Array;
}

export function sound(depth: Depth): Soundings {
  const open = new Uint8Array(CELLS),
    clear = new Uint8Array(CELLS),
    deep = SHIP.draught + ROUTE.open,
    s = ROUTE.sounding / R;
  for (let c = 0; c < CELLS; c++) {
    const p = cellCentre(c);
    let ok = depth(p) >= deep;
    if (ok) {
      const { east, north } = frameAt(p);
      for (const [a, b] of SOUNDINGS)
        if (
          !(ok =
            depth(normalize(add(add(p, east, a * s), north, b * s))) >= deep)
        )
          break;
    }
    open[c] = ok ? 1 : 0;
  }
  for (let c = 0; c < CELLS; c++) clear[c] = open[c] ? 4 : 0;
  for (let round = 0; round < 4; round++) {
    for (let c = 0; c < CELLS; c++) {
      if (clear[c] <= round) continue;
      for (let k = 0; k < 4; k++)
        if (clear[neighbour(c, k)] === round) {
          clear[c] = round + 1;
          break;
        }
    }
  }
  return { open, clear };
}

export const charted = (s: Soundings): Chart => ({
  open: s.open,
  clear: s.clear,
  space: space(),
});

export const openAt = (ch: Chart, p: Vec3): boolean => ch.open[cellOf(p)] === 1;
export const clearAt = (ch: Chart, p: Vec3): number => ch.clear[cellOf(p)];

const looked: Out3 = [0, 0, 0],
  centre: Out3 = [0, 0, 0];

function clearLine(ch: Chart, a: Vec3, b: Vec3, step = 4): boolean {
  const k = Math.max(1, Math.ceil(distance(a, b) / step)),
    need = Math.max(1, Math.min(ROUTE.wide, clearAt(ch, a), clearAt(ch, b)));
  for (let s = 1; s <= k; s++)
    if (
      ch.clear[
        cellOf(
          normalize(add(scale(a, 1 - s / k, looked), b, s / k, looked), looked)
        )
      ] < need
    )
      return false;
  return true;
}

const HEAP = 8 * ROUTE.work * 4 + 1;
const STRIDE = 12;

function space(): Space {
  const centre = new Float64Array(CELLS * 3);
  for (let c = 0; c < CELLS; c++) centre.set(cellCentre(c), 3 * c);
  return {
    g: new Float64Array(CELLS),
    from: new Int32Array(CELLS),
    seen: new Int32Array(CELLS),
    marks: new Int32Array(CELLS),
    centre,
    heap: new Int32Array(HEAP),
    key: new Float64Array(HEAP),
    stamp: 0,
    size: 0,
    queue: [],
  };
}

function nearestOpen(ch: Chart, s: Space, p: Vec3, reach: number): number {
  const start = cellOf(p),
    mark = ++s.stamp,
    queue = s.queue;
  if (ch.open[start]) return start;
  queue.length = 0;
  queue.push(start);
  s.marks[start] = mark;
  let best = -1,
    near = Infinity,
    depth = 0,
    end = 1;
  for (let q = 0; q < queue.length; q++) {
    if (q === end) {
      if (best >= 0 || ++depth > reach) break;
      end = queue.length;
    }
    const c = queue[q];
    if (ch.open[c]) {
      const d = gapTo(s, c, p);
      if (d < near) {
        near = d;
        best = c;
      }
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

function gap(s: Space, a: number, b: number): number {
  const C = s.centre;
  return (
    R *
    Math.hypot(
      C[3 * a] - C[3 * b],
      C[3 * a + 1] - C[3 * b + 1],
      C[3 * a + 2] - C[3 * b + 2]
    )
  );
}

function gapTo(s: Space, a: number, p: Vec3): number {
  const C = s.centre;
  return (
    R * Math.hypot(C[3 * a] - p[0], C[3 * a + 1] - p[1], C[3 * a + 2] - p[2])
  );
}

const less = (s: Space, i: number, j: number) =>
  s.key[i] < s.key[j] || (s.key[i] === s.key[j] && s.heap[i] < s.heap[j]);

function swap(s: Space, i: number, j: number) {
  const { heap, key } = s,
    c = heap[i],
    k = key[i];
  heap[i] = heap[j];
  heap[j] = c;
  key[i] = key[j];
  key[j] = k;
}

function push(s: Space, cell: number, k: number) {
  let i = s.size++;
  s.heap[i] = cell;
  s.key[i] = k;
  for (
    let up = (i - 1) >> 1;
    i > 0 && less(s, i, up);
    i = up, up = (i - 1) >> 1
  )
    swap(s, i, up);
}

function pop(s: Space): number {
  const top = s.heap[0],
    n = --s.size;
  s.heap[0] = s.heap[n];
  s.key[0] = s.key[n];
  for (let i = 0; ; ) {
    const l = 2 * i + 1,
      r = l + 1;
    let m = i;
    if (l < n && less(s, l, m)) m = l;
    if (r < n && less(s, r, m)) m = r;
    if (m === i) break;
    swap(s, i, m);
    i = m;
  }
  return top;
}

const STEPS = new Int32Array(8);

function stepsOf(ch: Chart, c: number, out: Int32Array): number {
  let n = 0;
  for (let k = 0; k < 4; k++) out[n++] = neighbour(c, k);
  for (let k = 4; k < 8; k++) {
    const x = neighbour(c, k & 1),
      y = neighbour(c, 2 + ((k >> 1) & 1));
    if (!ch.open[x] || !ch.open[y]) continue;
    const m = neighbour(x, 2 + ((k >> 1) & 1));
    if (gap(ch.space, c, m) > STRIDE) continue;
    out[n++] = m;
  }
  return n;
}

export function findPath(
  ch: Chart,
  p: Vec3,
  q: Vec3,
  work: number = ROUTE.work
): { cells: number[]; found: boolean } {
  const s = ch.space,
    { g, from: FROM, seen } = s,
    to = cellOf(q),
    budget = Math.min(work, ROUTE.work * 4);
  const start = nearestOpen(ch, s, p, ROUTE.wade);
  if (start < 0) return { cells: [], found: false };
  const stamp = ++s.stamp;
  s.size = 0;
  g[start] = 0;
  FROM[start] = -1;
  seen[start] = stamp;
  push(s, start, gap(s, start, to));
  let best = start,
    bestH = gap(s, start, to),
    found = false,
    left = budget;
  while (s.size > 0 && left-- > 0) {
    const c = pop(s),
      gc = g[c];
    if (c === to) {
      best = c;
      found = true;
      break;
    }
    const h = gap(s, c, to);
    if (h < bestH) {
      bestH = h;
      best = c;
    }
    const n = stepsOf(ch, c, STEPS);
    for (let i = 0; i < n; i++) {
      const m = STEPS[i];
      if (!ch.open[m] && m !== to) continue;
      const gm =
        gc + gap(s, c, m) * (ch.clear[m] >= ROUTE.offshore ? 1 : ROUTE.hug);
      if (seen[m] === stamp && gm >= g[m]) continue;
      seen[m] = stamp;
      g[m] = gm;
      FROM[m] = c;
      if (s.size < HEAP) push(s, m, gm + ROUTE.greed * gap(s, m, to));
    }
  }
  const cells: number[] = [];
  for (let k = best; k >= 0; k = FROM[k]) cells.push(k);
  return { cells: cells.reverse(), found };
}

export type Field = Float32Array;

interface Building {
  readonly field: Field;
  build(work: number): boolean;
}

export function building(ch: Chart, into: (p: Vec3) => boolean): Building {
  const cost = new Float32Array(CELLS).fill(Infinity),
    heap = new Int32Array(CELLS),
    at = new Int32Array(CELLS).fill(-1),
    steps = new Int32Array(8);
  let size = 0,
    seeded = 0;
  const before = (a: number, b: number) =>
    cost[a] < cost[b] || (cost[a] === cost[b] && a < b);
  const put = (i: number, c: number) => {
    heap[i] = c;
    at[c] = i;
  };
  const up = (i: number) => {
    const c = heap[i];
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (!before(c, heap[p])) break;
      put(i, heap[p]);
      i = p;
    }
    put(i, c);
  };
  const down = (i: number) => {
    const c = heap[i];
    for (;;) {
      const l = 2 * i + 1;
      if (l >= size) break;
      const k = l + 1 < size && before(heap[l + 1], heap[l]) ? l + 1 : l;
      if (!before(heap[k], c)) break;
      put(i, heap[k]);
      i = k;
    }
    put(i, c);
  };
  const build = (work: number): boolean => {
    for (; seeded < CELLS && work > 0; seeded++, work--) {
      const c = seeded;
      if (ch.open[c] && into(cellCentre(c, looked))) {
        cost[c] = 0;
        put(size, c);
        up(size++);
      }
    }
    for (; size > 0 && work > 0; work--) {
      const c = heap[0];
      at[c] = -2;
      if (--size > 0) {
        put(0, heap[size]);
        down(0);
      }
      const step = ch.clear[c] >= ROUTE.offshore ? 1 : ROUTE.hug,
        n = stepsOf(ch, c, steps);
      for (let i = 0; i < n; i++) {
        const m = steps[i];
        if (!ch.open[m] || at[m] === -2) continue;
        const g = cost[c] + gap(ch.space, m, c) * step;
        if (g >= cost[m]) continue;
        cost[m] = g;
        if (at[m] < 0) {
          put(size, m);
          up(size++);
        } else up(at[m]);
      }
    }
    return seeded === CELLS && size === 0;
  };
  return { field: cost, build };
}

export function downField(ch: Chart, f: Field, at: Vec3): Vec3 | null {
  let c = nearestOpen(ch, ch.space, at, ROUTE.wade);
  if (c < 0 || !(f[c] > 0 && f[c] < Infinity)) return null;
  let to = -1;
  for (let k = 0; k < ROUTE.ahead && f[c] > 0; k++) {
    const n = stepsOf(ch, c, STEPS);
    let next = -1;
    for (let i = 0; i < n; i++) {
      const m = STEPS[i];
      if (ch.open[m] && f[m] < (next < 0 ? f[c] : f[next])) next = m;
    }
    if (next < 0) break;
    c = next;
    if (to >= 0 && !clearLine(ch, at, cellCentre(c, centre), ROUTE.step)) break;
    to = c;
  }
  return to < 0 ? null : cellCentre(to);
}

export function fieldAt(ch: Chart, f: Field, at: Vec3): number {
  const c = nearestOpen(ch, ch.space, at, ROUTE.wade);
  return c < 0 ? Infinity : f[c];
}

export function downTo(
  ch: Chart,
  f: Field,
  at: Vec3,
  until: number,
  most: number
): Vec3 | null {
  let c = nearestOpen(ch, ch.space, at, ROUTE.wade);
  if (c < 0 || !(f[c] < Infinity)) return null;
  for (let k = 0; k < most && f[c] > until; k++) {
    const n = stepsOf(ch, c, STEPS);
    let next = -1;
    for (let i = 0; i < n; i++) {
      const m = STEPS[i];
      if (ch.open[m] && f[m] < (next < 0 ? f[c] : f[next])) next = m;
    }
    if (next < 0) break;
    c = next;
  }
  return cellCentre(c);
}

export interface Route {
  readonly cells: readonly number[];
  readonly to: Vec3;
  readonly leg: number;
  readonly repath: number;
  readonly found: boolean;
}

export function course(
  ch: Chart,
  at: Vec3,
  want: Vec3,
  route: Route | null,
  dt: number
): { to: Vec3 | null; route: Route | null } {
  const shoaled = !openAt(ch, at);
  if (
    distance(at, want) <= ROUTE.far ||
    (!shoaled && clearLine(ch, at, want, ROUTE.step))
  )
    return { to: null, route: null };
  let r = route && { ...route, repath: route.repath - dt };
  const wait = r || shoaled ? 0 : cellOf(at) % ROUTE.spread;
  if (wait > 0)
    return {
      to: null,
      route: {
        cells: [],
        to: want,
        leg: 0,
        repath: (wait - 0.5) * dt,
        found: false,
      },
    };
  if (!r || r.repath <= 0 || distance(r.to, want) > ROUTE.moved) {
    const { cells, found } = findPath(ch, at, want);
    r = {
      cells,
      to: want,
      leg: Math.min(1, cells.length - 1),
      repath: ROUTE.repath + ((cellOf(at) % ROUTE.spread) - 2.5) * dt,
      found,
    };
  }
  const { cells } = r;
  if (cells.length === 0) return { to: null, route: r };
  let leg = r.leg;
  while (
    leg < cells.length - 1 &&
    distance(at, cellCentre(cells[leg], centre)) < ROUTE.reached
  )
    leg++;
  let k = leg;
  while (
    !shoaled &&
    k + 1 < cells.length &&
    k < leg + ROUTE.ahead &&
    clearLine(ch, at, cellCentre(cells[k + 1], centre), ROUTE.step)
  ) {
    k++;
  }
  return { to: cellCentre(cells[k]), route: { ...r, leg } };
}
