// The clouds' patterns (cloud-field.ts), baked once into textures: a Perlin-Worley volume for the billows, a Worley
// volume to erode their edges, and a weather map of where cloud may form. All tile.
//
// Each pattern's finest octave keeps at least four texels per period, so the trilinear reads stay crisp rather than
// aliasing into mush.

import { HalfFloatType, LinearFilter, RepeatWrapping, Storage3DTexture, StorageTexture, type WebGPURenderer } from 'three/webgpu';
import {
  Fn, clamp, dot, float, floor, fract, instanceIndex, length, max, min, mix, mod, normalize, sin, smoothstep,
  textureStore, uvec2, uvec3, vec2, vec3, vec4,
} from 'three/tsl';

type N = any;

const SHAPE_N = 64, DETAIL_N = 64, WEATHER_N = 512;

function volume(n: number): Storage3DTexture {
  const t = new Storage3DTexture(n, n, n);
  t.wrapS = t.wrapT = t.wrapR = RepeatWrapping;
  t.minFilter = t.magFilter = LinearFilter;
  t.generateMipmaps = false;
  return t;
}
export const shapeVolume = volume(SHAPE_N);
export const detailVolume = volume(DETAIL_N);
export const weatherMap = new StorageTexture(WEATHER_N, WEATHER_N);
weatherMap.wrapS = weatherMap.wrapT = RepeatWrapping;
// half floats: it holds a potential in km, from which the clouds' tops are worked out
weatherMap.type = HalfFloatType;
weatherMap.generateMipmaps = false;

const hash33 = (c: N): N =>
  fract(sin(vec3(dot(c, vec3(127.1, 311.7, 74.7)), dot(c, vec3(269.5, 183.3, 246.1)), dot(c, vec3(113.5, 271.9, 124.6)))).mul(43758.5453));

/** Tiling Worley noise of the given period, inverted: 1 at feature points. */
const worley = Fn(([p, period]: [N, N]) => {
  const cell = floor(p), f = fract(p);
  let near: N = float(4);
  for (let z = -1; z <= 1; z++) for (let y = -1; y <= 1; y++) for (let x = -1; x <= 1; x++) {
    const o = vec3(x, y, z);
    near = min(near, length(o.add(hash33(mod(cell.add(o), period))).sub(f)));
  }
  return clamp(float(1).sub(near), 0, 1);
}).setLayout({ name: 'worley', type: 'float', inputs: [{ name: 'p', type: 'vec3' }, { name: 'period', type: 'float' }] });

/** Tiling gradient noise in [-1, 1]. */
const perlin = Fn(([p, period]: [N, N]) => {
  const i: N = floor(p), f: N = fract(p);
  const u: N = f.mul(f).mul(f).mul(f.mul(f.mul(6).sub(15)).add(10));
  const g = (x: number, y: number, z: number): N => {
    const o = vec3(x, y, z);
    return dot(normalize(hash33(mod(i.add(o), period)).mul(2).sub(1)), f.sub(o));
  };
  const a = mix(mix(g(0, 0, 0), g(1, 0, 0), u.x), mix(g(0, 1, 0), g(1, 1, 0), u.x), u.y);
  const b = mix(mix(g(0, 0, 1), g(1, 0, 1), u.x), mix(g(0, 1, 1), g(1, 1, 1), u.x), u.y);
  return mix(a, b, u.z);
}).setLayout({ name: 'perlin', type: 'float', inputs: [{ name: 'p', type: 'vec3' }, { name: 'period', type: 'float' }] });

/**
 * Cumulus cells on a tiling 2D lattice of the given period: each cell's feature point raises a cone of slope 1 (in
 * cells) and random height v = 0.1 + 0.9u², most cells weak and a few strong; the highest cone wins.
 */
const cells = Fn(([p, period]: [N, N]) => {
  const cell = floor(p), f = fract(p);
  let best: N = float(0);
  for (let y = -1; y <= 1; y++) for (let x = -1; x <= 1; x++) {
    const o = vec2(x, y);
    const h = hash33(vec3(mod(cell.add(o), period), period));
    const v = h.z.mul(h.z).mul(0.9).add(0.1);
    best = max(best, v.sub(length(o.add(h.xy).sub(f))));
  }
  return best;
}).setLayout({ name: 'cells', type: 'float', inputs: [{ name: 'p', type: 'vec2' }, { name: 'period', type: 'float' }] });

const perlinFbm = (p: N, f: number, octaves: number): N => {
  let sum: N = float(0);
  let amp = 0.5;
  for (let o = 0; o < octaves; o++, f *= 2, amp *= 0.5) sum = sum.add(perlin(p.mul(f), float(f)).mul(amp));
  return sum;
};

export const remap = (x: N, a: N, b: N, c: N, d: N): N => c.add(x.sub(a).div(max(b.sub(a), 1e-4)).mul(d.sub(c)));

function texel3(n: number) {
  const x = instanceIndex.mod(n), y = instanceIndex.div(n).mod(n), z = instanceIndex.div(n * n);
  return { at: uvec3(x, y, z), uvw: vec3(x, y, z).add(0.5).div(n) };
}

/** R: Perlin-Worley billows (4–16 periods a tile); G, B, A: Worley at 4, 8 and 16, to lift the billows' floor. */
const shapeKernel = Fn(() => {
  const { at, uvw } = texel3(SHAPE_N);
  const pn = clamp(perlinFbm(uvw, 4, 3).mul(1.1).add(0.5), 0, 1);
  const w4 = worley(uvw.mul(4), float(4)), w8 = worley(uvw.mul(8), float(8)), w16 = worley(uvw.mul(16), float(16));
  const wf = w4.mul(0.625).add(w8.mul(0.25)).add(w16.mul(0.125));
  const pw = clamp(remap(pn, wf.sub(1), float(1), float(0), float(1)), 0, 1);
  textureStore(shapeVolume, at, vec4(pw, w4, w8, w16));
})().compute(SHAPE_N ** 3, [64]);

/** Worley at 4, 8 and 16 periods a tile: the erosion's octaves. */
const detailKernel = Fn(() => {
  const { at, uvw } = texel3(DETAIL_N);
  textureStore(detailVolume, at, vec4(worley(uvw.mul(4), float(4)), worley(uvw.mul(8), float(8)), worley(uvw.mul(16), float(16)), 1));
})().compute(DETAIL_N ** 3, [64]);

/** The weather map's tile, km. */
export const WEATHER_TILE = 40;
/** Spacing of the cells at each of the weather map's three sizes of cloud, km. */
const CELL_SIZES = [2, 1, 0.5] as const;
/**
 * The cells' potential (km) at each tenth of the map's area, measured by sampling the same construction (0 to 100%;
 * the last is the 99.5th percentile). Cloud stands where the potential passes its value at the share of the map that
 * is to stay clear. Over the 40 km tile at 40% cover this makes ~650 clouds: half under 270 m across, one in ten
 * over 1.4 km, and a few merged masses of several km.
 */
export const POTENTIAL_DECILES = [0, 0.027, 0.11, 0.181, 0.25, 0.325, 0.415, 0.529, 0.675, 0.908, 1.579] as const;

/**
 * R: cumulus cells at three sizes as a potential in km: past the threshold the cover sets, how far a point lies
 * inside its cloud's edge; G: the large-scale field (0–1) that gathers them into fields of cloud with clear sky between.
 */
const weatherKernel = Fn(() => {
  const x = instanceIndex.mod(WEATHER_N), y = instanceIndex.div(WEATHER_N);
  const uv = vec2(x, y).add(0.5).div(WEATHER_N);
  let potential: N = float(0);
  for (const size of CELL_SIZES) {
    const n = WEATHER_TILE / size;
    potential = max(potential, cells(uv.mul(n), float(n)).mul(size));
  }
  const field = smoothstep(-0.35, 0.35, perlinFbm(vec3(uv, 0.5), 3, 3));
  textureStore(weatherMap, uvec2(x, y), vec4(potential, field, 0, 1));
})().compute(WEATHER_N * WEATHER_N, [64]);

/** Bakes the patterns; once, before the clouds are first drawn. */
export function bakeCloudNoise(renderer: WebGPURenderer) {
  renderer.compute(shapeKernel);
  renderer.compute(detailKernel);
  renderer.compute(weatherKernel);
}
