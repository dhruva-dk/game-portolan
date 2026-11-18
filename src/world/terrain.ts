// Terrain over the whole planet: a prototype of the planet-wide model, not yet what the game stands on (planet.ts).
// Land is random, never placed by hand; only its share of the planet and the sea's connection are guaranteed.
//
// On the sea's cells (cells.ts, 6 × 256², about 3.4 m a cell), in stages, each a pure function of the last:
//   relief     domain-warped fractal noise over the sphere (noise3.ts), read at each cell's centre
//   sea level  the area-weighted quantile of the relief that leaves `land` of the planet dry, exactly
//   repair     the sailable water (a ship's centre at least `clear` metres from any shore) must be one body: every
//              other body large enough is joined to the largest by a channel dug along the cheapest way through the
//              relief (low ground first, so it follows a valley), wide enough to sail; ponds too small to join, and
//              water no ship fits in that leads nowhere, are filled (mirrored through the sea level into low rises)
//   shore      the signed distance to the coast, metres (positive at sea), to the sea level's contour between cells
//   height     land rising from a beach to its relief, no steeper than `slope` from the coast inward; the sea
//              shelving from the beach down to its banks
//
// Between the cells' centres, heightAt reads the relief and the shore smoothly (terrain-grid.ts locate, bicubic) and
// shapes the height from them there: the profile is applied after reading, not read from heights the profile made at
// the centres, so a beach a cell wide keeps its curve rather than becoming a straight ramp between two samples.
//
// A Terrain is plain data (typed arrays and numbers), so it can be built once and handed to a worker whole.
// Pure arithmetic: no three, so it runs in node for the tests; deterministic for the seed.

import { CELLS, PLANET_QUANTA, areaQuanta, neighbor } from './cells.ts';
import { R, type Vec3 } from './sphere.ts';
import { createNoise3 } from './noise3.ts';
import { CELL, areaOf, between, centres, components, disc, heap, locate, seaLevel, shoreOf, taps } from './terrain-grid.ts';

export const TERRAIN = {
  /** The share of the planet's area that is land. */
  land: 0.45,
  /** The relief's coarsest features, metres; its octaves, each half the last's size, and each's share of the last's. */
  size: 220, octaves: 5, gain: 0.5,
  /** How far the relief's domain is warped, in units of `size`. */
  warp: 0.55,
  /** How far a ship's centre keeps from any shore, metres: half the narrowest strait. */
  clear: 14,
  /** Sailable water smaller than this, square metres, is filled rather than joined. */
  pond: 3000,
  /** The highest the land stands, metres; the steepest it rises from the coast inward (rise over run). */
  summit: 20, slope: 0.25,
  /** The beach's slope at the waterline, and the berm it levels at, metres. */
  beach: 1 / 8, berm: 1.5,
  /** The banks' depth, shallowest to deepest, metres. */
  bank: [4, 16] as readonly [number, number],
};

export type TerrainOptions = typeof TERRAIN;

export interface Terrain {
  /** The relief after repair, the sea level in it (water where relief < level), and its lowest and highest. */
  relief: Float32Array; level: number; lo: number; hi: number;
  /** 1 where the cell is water. */
  water: Uint8Array;
  /** Signed distance to the coast, metres, positive at sea. */
  shore: Float32Array;
  /** Metres above the sea (negative below) at each cell's centre. */
  height: Float32Array;
  /** 1 where the repair dug a channel, 2 where it filled water. */
  changed: Uint8Array;
  options: TerrainOptions;
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

const below = (field: Float32Array, level: number) => Uint8Array.from(field, (v) => +(v < level));
const share = (mask: Uint8Array, value: number) => {
  let a = 0;
  for (let c = 0; c < CELLS; c++) if (mask[c] === value) a += areaQuanta(c);
  return a / PLANET_QUANTA;
};
const largest = (area: number[]) => area.reduce((best, a, i) => (a > area[best] ? i : best), 0);

/**
 * The relief repaired so the sailable water is one body: rounds of filling what can't be joined and digging a channel
 * from each other sailable body to the largest along the cheapest way through the relief. Changes `field` in place.
 */
export function repair(field: Float32Array, level: number, o: TerrainOptions = TERRAIN) {
  const changed = new Uint8Array(CELLS), seen = new Int32Array(CELLS).fill(-1), span = 1 - level;
  let channels = 0, filled = 0, sailableBefore = -1, mark = 0;
  const dig = (n: number) => { if (field[n] >= level) { field[n] = level - 0.02; changed[n] = 1; } };
  // a pond filled is turned inside out, its depth become a rise as gentle: no flat plain where it was, and no step at
  // its rim, where the relief is the sea level from either side
  const fill = (n: number) => { field[n] = Math.max(2 * level - field[n], level + 0.002); changed[n] = 2; };
  for (let round = 0; round < 8; round++) {
    const water = below(field, level), shore = shoreOf(field, level);
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

// ---------------------------------------------------------------- the height

/** log(1 + eˣ), smoothed over w: 0 well below 0, x well above, and a curve instead of max(0, x)'s corner. */
const soft = (x: number, w: number) => (x > 30 * w ? x : w * Math.log1p(Math.exp(x / w)));
/** The lesser of two non-negative numbers, rounded where they meet (a power mean): never above either, and 0 if either is. */
function softMin(a: number, b: number) {
  const lo = Math.min(a, b), hi = Math.max(a, b);
  return hi <= 0 ? 0 : lo * (1 + (lo / hi) ** 6) ** (-1 / 6);
}
const unit = (x: number) => Math.min(Math.max(x, 0), 1);

/**
 * Metres above the sea, from the relief `f` and the signed distance `s` to the coast (metres, positive at sea). 0 at
 * the coast from either side, and smooth through it and everywhere else: every corner rounded, so slope-banded shading
 * never finds a crease.
 *   land   a beach rising at `beach` to a berm, then the relief's height (up to `summit`), but no higher than `slope`
 *          times the way in from the berm: low land and narrow land both stay gentle
 *   sea    a beach shelving at `beach`, steepening past 3 m out, easing to the bank's depth (deeper where the relief is
 *          lower)
 */
export function profile(t: Pick<Terrain, 'level' | 'lo' | 'hi' | 'options'>, f: number, s: number): number {
  const o = t.options;
  if (s < 0) {
    const u = -s, berm = o.berm * (1 - Math.exp((-u * o.beach) / o.berm));
    const rise = o.summit * unit((f - t.level) / (t.hi - t.level)) ** 1.1;
    return berm + softMin(rise, o.slope * (soft(u - 4, 1) - soft(-4, 1)));
  }
  const bank = o.bank[0] + (o.bank[1] - o.bank[0]) * unit((t.level - f) / (t.level - t.lo));
  const q = s * o.beach + 0.7 * (soft(s - 3, 1) - soft(-3, 1));
  return -bank * (1 - Math.exp(-q / bank));
}

/** A reader of the terrain's height anywhere: metres above the sea at unit vector p, read smoothly between cells. Each
 *  reader keeps its own scratch, so make one a user. */
export function heightAt(t: Terrain): (p: Vec3) => number {
  const at = taps();
  return (p) => {
    locate(p, at);
    return profile(t, between(t.relief, at), between(t.shore, at));
  };
}

/** The planet's terrain for `seed`. */
export function createTerrain(seed: number, o: TerrainOptions = TERRAIN): Terrain {
  const field = relief(seed, o), level = seaLevel(field, o.land);
  const landBefore = share(below(field, level), 0);
  const { changed, channels, filled, sailableBefore } = repair(field, level, o);
  let lo = Infinity, hi = -Infinity;
  for (const v of field) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
  const water = below(field, level), shore = shoreOf(field, level), shape = { level, lo, hi, options: o };
  const height = Float32Array.from({ length: CELLS }, (_, c) => profile(shape, field[c], shore[c]));
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
    relief: field, level, lo, hi, water, shore, height, changed, options: o,
    stats: {
      landBefore, landAfter: share(water, 0), sailableBefore, sailableAfter: S.area.length, waterBodies: W.area.length,
      channels, filled, dugArea, filledArea, landmasses: L.area.length, largestLand: Math.max(...L.area) / landArea, summit,
    },
  };
}
