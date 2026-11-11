// The clouds' patterns (clouds.ts), baked once into textures: a Perlin-Worley volume for the billows, a Worley volume
// to erode their edges, and a weather map of where cloud may form and how tall it grows. All tile.

import { LinearFilter, RepeatWrapping, Storage3DTexture, StorageTexture, type WebGPURenderer } from 'three/webgpu';
import {
  Fn, clamp, dot, float, floor, fract, instanceIndex, length, max, min, mix, mod, normalize, sin, textureStore, uvec2,
  uvec3, vec2, vec3, vec4,
} from 'three/tsl';

type N = any;

const SHAPE_N = 64, DETAIL_N = 32, WEATHER_N = 256;

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
weatherMap.generateMipmaps = false;

const hash33 = (c: N): N =>
  fract(sin(vec3(dot(c, vec3(127.1, 311.7, 74.7)), dot(c, vec3(269.5, 183.3, 246.1)), dot(c, vec3(113.5, 271.9, 124.6)))).mul(43758.5453));

/** Tiling Worley noise, inverted: 1 at feature points. */
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

const worleyFbm = (p: N, f: number): N =>
  worley(p.mul(f), float(f)).mul(0.625).add(worley(p.mul(2 * f), float(2 * f)).mul(0.25)).add(worley(p.mul(4 * f), float(4 * f)).mul(0.125));

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

/** R: Perlin-Worley billows; G, B, A: Worley at rising frequencies, to lift the billows' floor. */
const shapeKernel = Fn(() => {
  const { at, uvw } = texel3(SHAPE_N);
  const pn = clamp(perlinFbm(uvw, 4, 3).mul(1.1).add(0.5), 0, 1);
  const w2 = worleyFbm(uvw, 2), w4 = worleyFbm(uvw, 4), w8 = worleyFbm(uvw, 8);
  const pw = clamp(remap(pn, w2.sub(1), float(1), float(0), float(1)), 0, 1);
  textureStore(shapeVolume, at, vec4(pw, w2, w4, w8));
})().compute(SHAPE_N ** 3, [64]);

const detailKernel = Fn(() => {
  const { at, uvw } = texel3(DETAIL_N);
  textureStore(detailVolume, at, vec4(worleyFbm(uvw, 2), worleyFbm(uvw, 4), worleyFbm(uvw, 8), 1));
})().compute(DETAIL_N ** 3, [64]);

/** R: where cloud may form; G: how tall it grows there. */
const weatherKernel = Fn(() => {
  const x = instanceIndex.mod(WEATHER_N), y = instanceIndex.div(WEATHER_N);
  const uv = vec3(vec2(x, y).add(0.5).div(WEATHER_N), 0.5);
  const cover = clamp(perlinFbm(uv, 4, 5).mul(1.3).add(0.5), 0, 1);
  const height = clamp(perlinFbm(uv.add(vec3(0.37, 0.71, 0)), 2, 3).add(0.5), 0, 1);
  textureStore(weatherMap, uvec2(x, y), vec4(cover, height, 0, 1));
})().compute(WEATHER_N * WEATHER_N, [64]);

/** Bakes the patterns; once, before the clouds are first drawn. */
export function bakeCloudNoise(renderer: WebGPURenderer) {
  renderer.compute(shapeKernel);
  renderer.compute(detailKernel);
  renderer.compute(weatherKernel);
}
