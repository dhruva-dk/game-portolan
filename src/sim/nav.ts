// The captains' chart: a coarse grid of open water over the sphere, baked once from the world's heights,
// with routes found by A*. Built lazily on first use; the world is fixed, so it is the same for every match.
import { addScaled, cross, dot, normalize, set, v3, type V3 } from './math.ts';
import { R, cellDir, cellOf, cubeGrid, localFrame, neighbor, type CubeGrid } from './sphere.ts';
import { DRAFT, OBSTACLES, REGION_EVENTS, blockAt, heightAt, liftOf, roofAt } from './world/index.ts';

/** About 6.8 m cells. */
export const NAV: CubeGrid = cubeGrid(128);

/** Water open to the captains: deep enough at mean tide with a little to spare. */
const OPEN = -(DRAFT + 0.3);
/** Line of sight is blocked by ground higher than this. */
const SIGHT_LINE = 2.5;
/** Soundings across a cell besides its centre, metres east and north of it. */
const SOUNDINGS = [[2.3, 0], [-2.3, 0], [0, 2.3], [0, -2.3], [2.3, 2.3], [-2.3, 2.3], [2.3, -2.3], [-2.3, -2.3]];

export interface Nav {
  readonly height: Float32Array;
  /** The shallowest of a few soundings across the cell: a bar thinner than a cell still shows. */
  readonly crest: Float32Array;
  /** Open at mean tide. */
  readonly open: Uint8Array;
  /** Shut whatever the tide: a column or a log's wall stands there. */
  readonly shut: Uint8Array;
  /** Cells of open water to the nearest shore, up to 4. */
  readonly clear: Uint8Array;
  /** The region whose event raises or draws down the sea over the cell, or -1. */
  readonly liftRegion: Int8Array;
  /** That event's rise at full strength over the cell, for an even spot and an odd one. */
  readonly liftEven: Float32Array;
  readonly liftOdd: Float32Array;
  /** The code of an event's fallen rock or roof over the cell (see EVENT_CODES), or 0. */
  readonly code: Uint8Array;
}

/**
 * What the regions' events are doing to the chart now, set by the simulation at the start of every step (regionEvents.ts),
 * so every route a captain plans in that step sees the same sea.
 */
export const NAV_EVENTS = {
  /** The share of each region's rise to count: the least it will be over the next while, so a falling sea strands no one. */
  up: new Float64Array(16),
  /** The share of each region's drawdown to count: the most it will be over the next while. */
  down: new Float64Array(16),
  /** Each region's spot this match. */
  k: new Int32Array(16),
  /** Whether each code's rock or roof is shut. */
  shut: new Uint8Array(64),
};

/** The codes of the events' rocks and roofs: block[ri][k] for region ri's rock at spot k, roof[ri][o] for its roof o. */
export const EVENT_CODES = ((): { block: number[][]; roof: number[][] } => {
  let next = 1;
  return {
    block: REGION_EVENTS.map((e) => (e.block === null ? [] : e.spots.map(() => next++))),
    roof: REGION_EVENTS.map((e) => e.roofs.map(() => next++)),
  };
})();

/** Margins kept off an event's fallen rock and under-roof, metres: a cell is coded when its centre is this close. */
const ROCK_BERTH = 4, ROOF_BERTH = 2;

let built: Nav | null = null;

export function nav(): Nav {
  if (built) return built;
  const cells = NAV.cells, height = new Float32Array(cells), crest = new Float32Array(cells), open = new Uint8Array(cells), shut = new Uint8Array(cells), clear = new Uint8Array(cells);
  const p = v3(), q = v3(), e = v3(), nn = v3();
  shutObstacles(shut);
  for (let c = 0; c < cells; c++) {
    height[c] = heightAt(cellDir(NAV, c, p));
    localFrame(p, e, nn);
    let top = height[c];
    for (const [a, b] of SOUNDINGS) top = Math.max(top, heightAt(normalize(addScaled(q, addScaled(q, p, e, a / R), nn, b / R))));
    crest[c] = top;
    open[c] = top < OPEN && !shut[c] ? 1 : 0;
  }
  // distance to shore, by a few rounds of erosion
  for (let c = 0; c < cells; c++) clear[c] = open[c] ? 4 : 0;
  for (let round = 0; round < 4; round++) {
    for (let c = 0; c < cells; c++) {
      if (clear[c] <= round) continue;
      for (let k = 0; k < 4; k++) if (clear[neighbor(NAV, c, k)] === round) { clear[c] = round + 1; break; }
    }
  }
  const liftRegion = new Int8Array(cells).fill(-1), liftEven = new Float32Array(cells), liftOdd = new Float32Array(cells), code = new Uint8Array(cells);
  for (let c = 0; c < cells; c++) {
    cellDir(NAV, c, p);
    for (const e of REGION_EVENTS) {
      const ri = e.region;
      if (e.lift.length > 0 && liftRegion[c] < 0) {
        const a = liftOf(ri, 0, p), b = liftOf(ri, 1, p);
        if (a !== 0 || b !== 0) {
          liftRegion[c] = ri;
          liftEven[c] = a;
          liftOdd[c] = b;
        }
      }
      if (code[c] !== 0) continue;
      for (let k = 0; k < EVENT_CODES.block[ri].length; k++) if (blockAt(ri, k, p, ROCK_BERTH)) { code[c] = EVENT_CODES.block[ri][k]; break; }
      const o = e.roofs.length > 0 ? roofAt(ri, p, ROOF_BERTH) : -1;
      if (o >= 0 && code[c] === 0) code[c] = EVENT_CODES.roof[ri][o];
    }
  }
  built = { height, crest, open, shut, clear, liftRegion, liftEven, liftOdd, code };
  return built;
}

/**
 * Whether cell c is open water with the sea at `level`: a falling tide closes the shallows, a rising one opens them, and
 * so do the regions' events, which can also drop rock across the water or bring a roof down to it.
 */
function openCell(n: Nav, c: number, level: number): boolean {
  if (n.shut[c] !== 0 || NAV_EVENTS.shut[n.code[c]] !== 0) return false;
  const ri = n.liftRegion[c];
  if (ri >= 0) {
    const v = NAV_EVENTS.k[ri] % 2 === 1 ? n.liftOdd[c] : n.liftEven[c];
    level += v * (v > 0 ? NAV_EVENTS.up[ri] : NAV_EVENTS.down[ri]);
  }
  return n.crest[c] < level + OPEN;
}

/** Margin kept off a column or a log's wall, metres. */
const BERTH = 1.5;

/** Shuts every cell a column or a log's wall stands in, with a little to spare; a log's bore stays open. */
function shutObstacles(shut: Uint8Array): void {
  const p = v3(), side = v3();
  for (const o of OBSTACLES) {
    if (o.kind !== 'trunk' && o.kind !== 'log') continue;
    cross(side, o.pos, o.facing);
    const reach = Math.max(o.r, o.length / 2) + BERTH;
    for (let a = -reach; a <= reach; a += 1) {
      for (let b = -reach; b <= reach; b += 1) {
        const out = Math.abs(b);
        const hit = o.kind === 'trunk' ? Math.sqrt(a * a + b * b) < o.r + BERTH : Math.abs(a) < o.length / 2 + BERTH && out > o.inner && out < o.r + BERTH;
        if (!hit) continue;
        set(p, o.pos.x, o.pos.y, o.pos.z);
        addScaled(p, p, o.facing, a / R);
        shut[cellOf(NAV, normalize(addScaled(p, p, side, b / R)))] = 1;
      }
    }
  }
}

export const navCell = (p: V3): number => cellOf(NAV, p);

export const openAt = (p: V3, level = 0): boolean => openCell(nav(), navCell(p), level);

const S = v3();

/** Open water all along the chord from a to b, with the sea at `level`. */
export function clearLine(a: V3, b: V3, step = 4, level = 0): boolean {
  const n = nav(), d = R * Math.sqrt(Math.max(0, 2 - 2 * dot(a, b))), k = Math.max(1, Math.ceil(d / step));
  for (let s = 1; s <= k; s++) {
    const f = s / k;
    normalize(set(S, a.x + (b.x - a.x) * f, a.y + (b.y - a.y) * f, a.z + (b.z - a.z) * f));
    if (!openCell(n, navCell(S), level)) return false;
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

/** The centre of the nearest open cell to p, within `reach` cells, with the sea at `level`. Returns false if there is none. */
export function nearestOpen(p: V3, out: V3, reach = 40, level = 0): boolean {
  const n = nav(), start = navCell(p);
  if (openCell(n, start, level)) {
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
    if (openCell(n, c, level)) {
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
 * A route of nav cells from p to q over open water with the sea at `level`, keeping off the shore where it can. Gives up
 * after `work` cells. Returns false when there is no route; `out` then holds the route to the closest cell it reached.
 */
export function findPath(p: V3, q: V3, out: number[], work = 6000, level = 0): boolean {
  const n = nav();
  centres();
  out.length = 0;
  const to = navCell(q);
  let from = navCell(p);
  if (!openCell(n, from, level)) {
    if (!nearestOpen(p, S, 6, level)) return false;
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
      if (!openCell(n, m, level) && m !== to) continue;
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
