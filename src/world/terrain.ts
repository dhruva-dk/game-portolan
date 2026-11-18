// Terrain over the whole planet: a prototype of the planet-wide model, not yet what the game stands on (planet.ts).
// Land is random, never placed by hand; only its share of the planet and the sea's connection are guaranteed.
//
// On the sea's cells (cells.ts, 6 × 256², about 3.4 m a cell), in stages, each a pure function of the last:
//   relief     domain-warped fractal noise over the sphere (noise3.ts), read at each cell's centre
//   sea level  the area-weighted quantile of the relief that leaves `land` of the planet dry, exactly
//   repair     the sailable water (a ship's centre at least `clear` metres from any shore) must be one body: every
//              other body large enough is joined to the largest by a channel dug along the cheapest way through the
//              relief (low ground first, so it follows a valley), wide enough to sail; ponds too small to join, and
//              water no ship fits in that leads nowhere, are filled
//   shore      the signed distance to the coast, metres (positive at sea), by nearest-cell propagation
//   height     land rising from a beach to its relief, no steeper than `slope` from the coast inward; the sea
//              shelving from the beach down to its banks
//
// Pure arithmetic: no three, so it runs in node for the tests; deterministic for the seed.

import { CELLS, N, PLANET_QUANTA, areaQuanta, centreOf, neighbor } from './cells.ts';
import { R } from './sphere.ts';
import { createNoise3 } from './noise3.ts';

export const TERRAIN = {
  /** The share of the planet's area that is land. */
  land: 0.5,
  /** The relief's coarsest features, metres; its octaves, each half the last's size, and each's share of the last's. */
  size: 420, octaves: 5, gain: 0.5,
  /** How far the relief's domain is warped, in units of `size`. */
  warp: 0.55,
  /** How far a ship's centre keeps from any shore, metres: half the narrowest strait. */
  clear: 14,
  /** Sailable water smaller than this, square metres, is filled rather than joined. */
  pond: 3000,
  /** The highest the land stands, metres; the steepest it rises from the coast inward (rise over run). */
  summit: 48, slope: 0.8,
  /** The beach's slope at the waterline, and the berm it levels at, metres. */
  beach: 1 / 8, berm: 1.5,
  /** The banks' depth, shallowest to deepest, metres. */
  bank: [4, 16] as readonly [number, number],
};

export type TerrainOptions = typeof TERRAIN;

export interface Terrain {
  /** The relief after repair, and the sea level in it: water where relief < level. */
  relief: Float32Array; level: number;
  /** 1 where the cell is water. */
  water: Uint8Array;
  /** Signed distance to the coast, metres, positive at sea. */
  shore: Float32Array;
  /** Metres above the sea (negative below). */
  height: Float32Array;
  /** 1 where the repair dug a channel, 2 where it filled water. */
  changed: Uint8Array;
  stats: TerrainStats;
}

export interface TerrainStats {
  /** Land's share before and after the repair. */
  landBefore: number; landAfter: number;
  /** Sailable bodies before and after the repair (after must be 1); water bodies after. */
  sailableBefore: number; sailableAfter: number; waterBodies: number;
  /** Channels dug, ponds filled, and the area each changed, square metres. */
  channels: number; filled: number; dugArea: number; filledArea: number;
  /** Landmasses, the largest's share of the land, and the highest point, metres. */
  landmasses: number; largestLand: number; summit: number;
}

// ---------------------------------------------------------------- the grid

const AREA_M2 = (4 * Math.PI * R * R) / PLANET_QUANTA;
const areaOf = (c: number) => areaQuanta(c) * AREA_M2;
/** A cell's breadth at a face's middle, metres. */
const CELL = (R * Math.PI) / 2 / N;

let XYZ: Float64Array | null = null;
/** Every cell centre's unit vector, x, y, z a cell. */
function centres(): Float64Array {
  if (XYZ) return XYZ;
  XYZ = new Float64Array(3 * CELLS);
  for (let c = 0; c < CELLS; c++) XYZ.set(centreOf(c), 3 * c);
  return XYZ;
}

/** Metres along the surface between two cells' centres. */
function arc(a: number, b: number): number {
  const p = centres(), dx = p[3 * a] - p[3 * b], dy = p[3 * a + 1] - p[3 * b + 1], dz = p[3 * a + 2] - p[3 * b + 2];
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(dx * dx + dy * dy + dz * dz) / 2));
}

/** A binary min-heap of cells by key. */
function heap() {
  let key = new Float64Array(4096), val = new Int32Array(4096), n = 0;
  return {
    get size() { return n; },
    push(k: number, v: number) {
      if (n === key.length) {
        const k2 = new Float64Array(n * 2), v2 = new Int32Array(n * 2);
        k2.set(key); v2.set(val); key = k2; val = v2;
      }
      let i = n++;
      while (i > 0) {
        const p = (i - 1) >> 1;
        if (key[p] <= k) break;
        key[i] = key[p]; val[i] = val[p]; i = p;
      }
      key[i] = k; val[i] = v;
    },
    /** The least key's cell; its key in `top`. */
    pop(): number {
      const v = val[0];
      this.top = key[0];
      const k = key[--n], x = val[n];
      let i = 0;
      for (;;) {
        let c = 2 * i + 1;
        if (c >= n) break;
        if (c + 1 < n && key[c + 1] < key[c]) c++;
        if (key[c] >= k) break;
        key[i] = key[c]; val[i] = val[c]; i = c;
      }
      key[i] = k; val[i] = x;
      return v;
    },
    top: 0,
  };
}

// ---------------------------------------------------------------- the stages

/** The relief at every cell: domain-warped fractal noise, about −1…1. */
export function relief(seed: number, o: TerrainOptions = TERRAIN): Float32Array {
  const noise = createNoise3(seed), warpNoise = createNoise3(seed + 7919), p = centres(), out = new Float32Array(CELLS);
  const fbm = (x: number, y: number, z: number, octaves: number) => {
    let v = 0, amp = 1, f = 1, sum = 0;
    for (let i = 0; i < octaves; i++, amp *= o.gain, f *= 2) {
      v += amp * noise.value(x * f + i * 17.1, y * f, z * f);
      sum += amp;
    }
    return v / sum;
  };
  for (let c = 0; c < CELLS; c++) {
    const x = (p[3 * c] * R) / o.size, y = (p[3 * c + 1] * R) / o.size, z = (p[3 * c + 2] * R) / o.size;
    const wx = warpNoise.value(x + 31.4, y, z), wy = warpNoise.value(x, y + 47.2, z), wz = warpNoise.value(x, y, z + 63.9);
    out[c] = fbm(x + o.warp * wx, y + o.warp * wy, z + o.warp * wz, o.octaves);
  }
  return out;
}

/** The level in `field` below which `1 − share` of the planet's area lies. */
export function seaLevel(field: Float32Array, share: number): number {
  const order = Int32Array.from({ length: CELLS }, (_, c) => c).sort((a, b) => field[a] - field[b]);
  const wet = (1 - share) * PLANET_QUANTA;
  let sum = 0;
  for (const c of order) {
    sum += areaQuanta(c);
    if (sum >= wet) return field[c];
  }
  return field[order[CELLS - 1]];
}

/** Metres from each cell's centre to the nearest cell where `from` is 1 (0 there), by nearest-cell propagation. */
export function distanceTo(from: Uint8Array): Float64Array {
  // (float64: a float32 rounding a distance up would let the same distance improve on itself, without end)
  const dist = new Float64Array(CELLS).fill(Infinity), src = new Int32Array(CELLS).fill(-1), h = heap();
  for (let c = 0; c < CELLS; c++) if (from[c]) { dist[c] = 0; src[c] = c; h.push(0, c); }
  while (h.size) {
    const c = h.pop();
    if (h.top > dist[c]) continue;
    for (let k = 0; k < 4; k++) {
      const n = neighbor(c, k), d = arc(n, src[c]);
      if (d < dist[n]) { dist[n] = d; src[n] = src[c]; h.push(d, n); }
    }
  }
  return dist;
}

/** Signed distance to the coast, metres, positive at sea: half a cell short of the nearest cell across it. */
export function shoreOf(water: Uint8Array): Float32Array {
  const land = water.map((w) => 1 - w), toLand = distanceTo(land), toWater = distanceTo(water);
  return Float32Array.from({ length: CELLS }, (_, c) => (water[c] ? toLand[c] - CELL / 2 : -(toWater[c] - CELL / 2)));
}

/** The connected parts of `mask` (sides shared): each cell's part (−1 off the mask), and each part's area, m². */
export function components(mask: Uint8Array): { part: Int32Array; area: number[] } {
  const part = new Int32Array(CELLS).fill(-1), area: number[] = [], stack: number[] = [];
  for (let s = 0; s < CELLS; s++) {
    if (!mask[s] || part[s] >= 0) continue;
    const id = area.length;
    let a = 0;
    part[s] = id; stack.push(s);
    while (stack.length) {
      const c = stack.pop()!;
      a += areaOf(c);
      for (let k = 0; k < 4; k++) {
        const n = neighbor(c, k);
        if (mask[n] && part[n] < 0) { part[n] = id; stack.push(n); }
      }
    }
    area.push(a);
  }
  return { part, area };
}

const below = (field: Float32Array, level: number) => Uint8Array.from(field, (v) => +(v < level));
const share = (mask: Uint8Array, value: number) => {
  let a = 0;
  for (let c = 0; c < CELLS; c++) if (mask[c] === value) a += areaQuanta(c);
  return a / PLANET_QUANTA;
};
const largest = (area: number[]) => area.reduce((best, a, i) => (a > area[best] ? i : best), 0);

/** Every cell within `radius` metres of cell `c`'s centre, passed to `visit`. */
function disc(c: number, radius: number, seen: Int32Array, mark: number, visit: (n: number) => void) {
  const stack = [c];
  seen[c] = mark;
  while (stack.length) {
    const x = stack.pop()!;
    visit(x);
    for (let k = 0; k < 4; k++) {
      const n = neighbor(x, k);
      if (seen[n] !== mark && arc(n, c) <= radius) { seen[n] = mark; stack.push(n); }
    }
  }
}

/**
 * The relief repaired so the sailable water is one body: rounds of filling what can't be joined and digging a channel
 * from each other sailable body to the largest along the cheapest way through the relief. Changes `field` in place.
 */
export function repair(field: Float32Array, level: number, o: TerrainOptions = TERRAIN) {
  const changed = new Uint8Array(CELLS), seen = new Int32Array(CELLS).fill(-1), span = 1 - level;
  let channels = 0, filled = 0, sailableBefore = -1, mark = 0;
  const dig = (n: number) => { if (field[n] >= level) { field[n] = level - 0.02; changed[n] = 1; } };
  const fill = (n: number) => { field[n] = level + 0.002; changed[n] = 2; };
  for (let round = 0; round < 8; round++) {
    const water = below(field, level), shore = shoreOf(water);
    const sail = Uint8Array.from({ length: CELLS }, (_, c) => +(water[c] && shore[c] >= o.clear));
    const S = components(sail), W = components(water);
    if (sailableBefore < 0) sailableBefore = S.area.length;
    const main = largest(S.area);
    // the water bodies, and how much sailable water each holds that isn't the main body's
    const holdsMain = new Uint8Array(W.area.length), sailIn = new Float64Array(W.area.length);
    for (let c = 0; c < CELLS; c++) {
      if (!sail[c]) continue;
      if (S.part[c] === main) holdsMain[W.part[c]] = 1;
      else sailIn[W.part[c]] += areaOf(c);
    }
    // fill each water body that doesn't hold the main and has too little sailable water to be worth a channel
    let any = false;
    for (let c = 0; c < CELLS; c++) {
      const w = W.part[c];
      if (w >= 0 && !holdsMain[w] && sailIn[w] < o.pond) { fill(c); any = true; }
    }
    for (let w = 0; w < W.area.length; w++) if (!holdsMain[w] && sailIn[w] < o.pond) filled++;
    // the sailable bodies left to join: those in bodies big enough (in the main water, or apart from it)
    const join = new Set<number>();
    for (let c = 0; c < CELLS; c++) if (sail[c] && S.part[c] !== main && (holdsMain[W.part[c]] || sailIn[W.part[c]] >= o.pond)) join.add(S.part[c]);
    if (!join.size && !any) break;
    if (!join.size) continue;
    // the cheapest way from the main body to every cell: free across sailable water, cheap across water too narrow
    // to sail, dearer the higher the ground
    const cost = new Float64Array(CELLS).fill(Infinity), from = new Int32Array(CELLS).fill(-1), h = heap();
    for (let c = 0; c < CELLS; c++) if (S.part[c] === main) { cost[c] = 0; h.push(0, c); }
    while (h.size) {
      const c = h.pop();
      if (h.top > cost[c]) continue;
      for (let k = 0; k < 4; k++) {
        const n = neighbor(c, k);
        const step = sail[n] ? 0.02 : water[n] ? 0.4 : 1 + 12 * Math.max(0, (field[n] - level) / span);
        const total = cost[c] + step * CELL;
        if (total < cost[n]) { cost[n] = total; from[n] = c; h.push(total, n); }
      }
    }
    // each body joined from its cheapest cell back to the main, a channel `clear` and a cell and a half to either side
    const nearest = new Map<number, number>();
    for (let c = 0; c < CELLS; c++) {
      const s = S.part[c];
      if (join.has(s) && (!nearest.has(s) || cost[c] < cost[nearest.get(s)!])) nearest.set(s, c);
    }
    for (const start of nearest.values()) {
      channels++;
      for (let c = start; c >= 0 && S.part[c] !== main; c = from[c]) disc(c, o.clear + 1.5 * CELL, seen, ++mark, dig);
    }
  }
  return { changed, channels, filled, sailableBefore };
}

/** Metres above the sea at every cell, from the repaired relief and the signed distance to the coast. */
export function heightOf(field: Float32Array, level: number, shore: Float32Array, o: TerrainOptions = TERRAIN): Float32Array {
  let lo = Infinity, hi = -Infinity;
  for (const v of field) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
  return Float32Array.from({ length: CELLS }, (_, c) => {
    const s = shore[c];
    if (s < 0) {
      const u = -s, t = Math.min(Math.max((field[c] - level) / (hi - level), 0), 1);
      const berm = o.berm * (1 - Math.exp((-u * o.beach) / o.berm));
      return Math.min(berm + o.summit * t ** 1.1, berm + o.slope * Math.max(0, u - 4));
    }
    const t = Math.min(Math.max((level - field[c]) / (level - lo), 0), 1);
    const bank = o.bank[0] + (o.bank[1] - o.bank[0]) * t;
    const q = s * o.beach + 0.7 * Math.max(0, s - 3);
    return -bank * (1 - Math.exp(-q / bank));
  });
}

/** The planet's terrain for `seed`. */
export function createTerrain(seed: number, o: TerrainOptions = TERRAIN): Terrain {
  const field = relief(seed, o), level = seaLevel(field, o.land);
  const landBefore = share(below(field, level), 0);
  const { changed, channels, filled, sailableBefore } = repair(field, level, o);
  const water = below(field, level), shore = shoreOf(water), height = heightOf(field, level, shore, o);
  const S = components(Uint8Array.from({ length: CELLS }, (_, c) => +(water[c] && shore[c] >= o.clear)));
  const L = components(water.map((w) => 1 - w)), W = components(water);
  let dugArea = 0, filledArea = 0, summit = 0;
  for (let c = 0; c < CELLS; c++) {
    if (changed[c] === 1) dugArea += areaOf(c);
    if (changed[c] === 2) filledArea += areaOf(c);
    summit = Math.max(summit, height[c]);
  }
  const landArea = L.area.reduce((a, b) => a + b, 0);
  return {
    relief: field, level, water, shore, height, changed,
    stats: {
      landBefore, landAfter: share(water, 0), sailableBefore, sailableAfter: S.area.length, waterBodies: W.area.length,
      channels, filled, dugArea, filledArea, landmasses: L.area.length, largestLand: Math.max(...L.area) / landArea, summit,
    },
  };
}
