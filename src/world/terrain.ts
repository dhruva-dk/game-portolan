import {
  CELLS,
  N,
  PLANET_QUANTA,
  areaQuanta,
  beyond,
  neighbor,
} from './cells.ts';
import { STRIDE } from './random.ts';
import { clamp } from './scalar.ts';
import { R, type Vec3 } from './sphere.ts';
import { createNoise3 } from './noise3.ts';
import {
  CELL,
  areaOf,
  between,
  centres,
  components,
  disc,
  heap,
  locate,
  seaLevel,
  shoreOf,
  taps,
} from './terrain-grid.ts';

export const TERRAIN = {
  land: 0.45,
  size: 220,
  octaves: 5,
  gain: 0.5,
  warp: 0.55,
  clear: 14,
  pond: 3000,
  summit: 50,
  slope: 0.35,
  beach: 1 / 8,
  berm: 1.5,
  bank: [4, 16] satisfies readonly [number, number],
};

type TerrainOptions = typeof TERRAIN;

export interface Terrain {
  relief: Float32Array;
  level: number;
  lo: number;
  hi: number;
  water: Uint8Array;
  shore: Float32Array;
  height: Float32Array;
  changed: Uint8Array;
  options: TerrainOptions;
  stats: TerrainStats;
}

interface TerrainStats {
  landBefore: number;
  landAfter: number;
  sailableBefore: number;
  sailableAfter: number;
  waterBodies: number;
  channels: number;
  filled: number;
  dugArea: number;
  filledArea: number;
  landmasses: number;
  largestLand: number;
  summit: number;
}

function relief(seed: number, o: TerrainOptions = TERRAIN): Float32Array {
  const noise = createNoise3(seed),
    warpNoise = createNoise3(seed + STRIDE),
    p = centres(),
    out = new Float32Array(CELLS);
  const fbm = (x: number, y: number, z: number, octaves: number) => {
    let v = 0,
      amp = 1,
      f = 1,
      sum = 0;
    for (let i = 0; i < octaves; i++, amp *= o.gain, f *= 2) {
      v += amp * noise.value(x * f + i * 17.1, y * f, z * f);
      sum += amp;
    }
    return v / sum;
  };
  for (let c = 0; c < CELLS; c++) {
    const x = (p[3 * c] * R) / o.size,
      y = (p[3 * c + 1] * R) / o.size,
      z = (p[3 * c + 2] * R) / o.size;
    const wx = warpNoise.value(x + 31.4, y, z),
      wy = warpNoise.value(x, y + 47.2, z),
      wz = warpNoise.value(x, y, z + 63.9);
    out[c] = fbm(x + o.warp * wx, y + o.warp * wy, z + o.warp * wz, o.octaves);
  }
  return out;
}

const below = (field: Float32Array, level: number) =>
  Uint8Array.from(field, (v) => +(v < level));
const share = (mask: Uint8Array, value: number) => {
  let a = 0;
  for (let c = 0; c < CELLS; c++) if (mask[c] === value) a += areaQuanta(c);
  return a / PLANET_QUANTA;
};
const largest = (area: number[]) =>
  area.reduce((best, a, i) => (a > area[best] ? i : best), 0);

function repair(
  field: Float32Array,
  level: number,
  o: TerrainOptions = TERRAIN
) {
  const changed = new Uint8Array(CELLS),
    seen = new Int32Array(CELLS).fill(-1),
    span = 1 - level;
  let channels = 0,
    filled = 0,
    sailableBefore = -1,
    mark = 0;
  const dig = (n: number) => {
    if (field[n] >= level) {
      field[n] = level - 0.02;
      changed[n] = 1;
    }
  };
  const fill = (n: number) => {
    field[n] = Math.max(2 * level - field[n], level + 0.002);
    changed[n] = 2;
  };
  for (let round = 0; round < 8; round++) {
    const water = below(field, level),
      shore = shoreOf(field, level);
    const sail = Uint8Array.from(
      { length: CELLS },
      (_, c) => +(water[c] && shore[c] >= o.clear)
    );
    const S = components(sail),
      W = components(water);
    if (sailableBefore < 0) sailableBefore = S.area.length;
    const main = largest(S.area);
    const holdsMain = new Uint8Array(W.area.length),
      sailIn = new Float64Array(W.area.length);
    for (let c = 0; c < CELLS; c++) {
      if (!sail[c]) continue;
      if (S.part[c] === main) holdsMain[W.part[c]] = 1;
      else sailIn[W.part[c]] += areaOf(c);
    }
    let any = false;
    for (let c = 0; c < CELLS; c++) {
      const w = W.part[c];
      if (w >= 0 && !holdsMain[w] && sailIn[w] < o.pond) {
        fill(c);
        any = true;
      }
    }
    for (let w = 0; w < W.area.length; w++)
      if (!holdsMain[w] && sailIn[w] < o.pond) filled++;
    const join = new Set<number>();
    for (let c = 0; c < CELLS; c++) {
      if (
        sail[c] &&
        S.part[c] !== main &&
        (holdsMain[W.part[c]] || sailIn[W.part[c]] >= o.pond)
      )
        join.add(S.part[c]);
    }
    if (!join.size && !any) break;
    if (!join.size) continue;
    const cost = new Float64Array(CELLS).fill(Infinity),
      from = new Int32Array(CELLS).fill(-1),
      h = heap();
    for (let c = 0; c < CELLS; c++)
      if (S.part[c] === main) {
        cost[c] = 0;
        h.push(0, c);
      }
    while (h.size) {
      const c = h.pop();
      if (h.top > cost[c]) continue;
      for (let k = 0; k < 4; k++) {
        const n = neighbor(c, k);
        const step = sail[n]
          ? 0.02
          : water[n]
            ? 0.4
            : 1 + 12 * Math.max(0, (field[n] - level) / span);
        const total = cost[c] + step * CELL;
        if (total < cost[n]) {
          cost[n] = total;
          from[n] = c;
          h.push(total, n);
        }
      }
    }
    const nearest = new Map<number, number>();
    for (let c = 0; c < CELLS; c++) {
      const s = S.part[c];
      if (join.has(s) && (!nearest.has(s) || cost[c] < cost[nearest.get(s)!]))
        nearest.set(s, c);
    }
    for (const start of nearest.values()) {
      channels++;
      for (let c = start; c >= 0 && S.part[c] !== main; c = from[c])
        disc(c, o.clear + 1.5 * CELL, seen, ++mark, dig);
    }
  }
  return { changed, channels, filled, sailableBefore };
}

const soft = (x: number, w: number) =>
  x > 30 * w ? x : w * Math.log1p(Math.exp(x / w));
function softMin(a: number, b: number) {
  const lo = Math.min(a, b),
    hi = Math.max(a, b);
  return hi <= 0 ? 0 : lo * (1 + (lo / hi) ** 6) ** (-1 / 6);
}

export function profile(
  t: Pick<Terrain, 'level' | 'lo' | 'hi' | 'options'>,
  f: number,
  s: number
): number {
  const o = t.options;
  if (s < 0) {
    const u = -s,
      berm = o.berm * (1 - Math.exp((-u * o.beach) / o.berm));
    const rise = o.summit * clamp((f - t.level) / (t.hi - t.level)) ** 1.1;
    return berm + softMin(rise, o.slope * (soft(u - 4, 1) - soft(-4, 1)));
  }
  const bank =
    o.bank[0] +
    (o.bank[1] - o.bank[0]) * clamp((t.level - f) / (t.level - t.lo));
  const q = s * o.beach + 0.7 * (soft(s - 3, 1) - soft(-3, 1));
  return -bank * (1 - Math.exp(-q / bank));
}

export function heightAt(t: Terrain): (p: Vec3) => number {
  const at = taps();
  return (p) => {
    locate(p, at);
    return profile(t, between(t.relief, at), between(t.shore, at));
  };
}

export function heightBounds(
  t: Terrain,
  n: number
): { lo: Float32Array; hi: Float32Array } {
  const lo = new Float32Array(6 * n * n),
    hi = new Float32Array(6 * n * n),
    B = N / n;
  for (let face = 0; face < 6; face++)
    for (let bj = 0; bj < n; bj++)
      for (let bi = 0; bi < n; bi++) {
        let a = Infinity,
          b = -Infinity;
        for (let j = bj * B - 2; j < (bj + 1) * B + 2; j++)
          for (let i = bi * B - 2; i < (bi + 1) * B + 2; i++) {
            const h = t.height[beyond(face, i, j)];
            a = Math.min(a, h);
            b = Math.max(b, h);
          }
        const k = (face * n + bj) * n + bi;
        lo[k] = a - 0.5;
        hi[k] = b + 0.5;
      }
  return { lo, hi };
}

export function createTerrain(
  seed: number,
  o: TerrainOptions = TERRAIN
): Terrain {
  const field = relief(seed, o),
    level = seaLevel(field, o.land);
  const landBefore = share(below(field, level), 0);
  const { changed, channels, filled, sailableBefore } = repair(field, level, o);
  let lo = Infinity,
    hi = -Infinity;
  for (const v of field) {
    lo = Math.min(lo, v);
    hi = Math.max(hi, v);
  }
  const water = below(field, level),
    shore = shoreOf(field, level),
    shape = { level, lo, hi, options: o };
  const height = Float32Array.from({ length: CELLS }, (_, c) =>
    profile(shape, field[c], shore[c])
  );
  const S = components(
    Uint8Array.from(
      { length: CELLS },
      (_, c) => +(water[c] && shore[c] >= o.clear)
    )
  );
  const L = components(water.map((w) => 1 - w)),
    W = components(water);
  let dugArea = 0,
    filledArea = 0,
    summit = 0;
  for (let c = 0; c < CELLS; c++) {
    if (changed[c] === 1) dugArea += areaOf(c);
    if (changed[c] === 2) filledArea += areaOf(c);
    summit = Math.max(summit, height[c]);
  }
  const landArea = L.area.reduce((a, b) => a + b, 0);
  return {
    relief: field,
    level,
    lo,
    hi,
    water,
    shore,
    height,
    changed,
    options: o,
    stats: {
      landBefore,
      landAfter: share(water, 0),
      sailableBefore,
      sailableAfter: S.area.length,
      waterBodies: W.area.length,
      channels,
      filled,
      dugArea,
      filledArea,
      landmasses: L.area.length,
      largestLand: Math.max(...L.area) / landArea,
      summit,
    },
  };
}
