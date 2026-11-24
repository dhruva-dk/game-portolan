import {
  LinearFilter,
  RepeatWrapping,
  Storage3DTexture,
  type StorageTexture,
} from 'three/webgpu';
import {
  Fn,
  clamp,
  dot,
  float,
  floor,
  fract,
  instanceIndex,
  length,
  max,
  min,
  mix,
  mod,
  normalize,
  select,
  smoothstep,
  textureStore,
  uvec2,
  uvec3,
  vec2,
  vec3,
  vec4,
} from 'three/tsl';
import { storageTable, type Compute } from '../gpu.ts';
import {
  hash3,
  ramp,
  type FloatNode,
  type Vec2Node,
  type Vec3Node,
} from '../tsl.ts';

const SHAPE_N = 64,
  DETAIL_N = 64,
  WEATHER_N = 1024;

function volume(n: number): Storage3DTexture {
  const t = new Storage3DTexture(n, n, n);
  t.wrapS = t.wrapT = t.wrapR = RepeatWrapping;
  t.minFilter = t.magFilter = LinearFilter;
  t.generateMipmaps = false;
  return t;
}

const worley = Fn(([p, period]: [Vec3Node, FloatNode]) => {
  const cell = floor(p),
    f = fract(p);
  let near: FloatNode = float(4);
  for (let z = -1; z <= 1; z++)
    for (let y = -1; y <= 1; y++)
      for (let x = -1; x <= 1; x++) {
        const o = vec3(x, y, z);
        near = min(near, length(o.add(hash3(mod(cell.add(o), period))).sub(f)));
      }
  return clamp(float(1).sub(near), 0, 1);
}).setLayout({
  name: 'worley',
  type: 'float',
  inputs: [
    { name: 'p', type: 'vec3' },
    { name: 'period', type: 'float' },
  ],
});

const perlin = Fn(([p, period]: [Vec3Node, FloatNode]) => {
  const i = floor(p),
    f = fract(p);
  const u = f
    .mul(f)
    .mul(f)
    .mul(f.mul(f.mul(6).sub(15)).add(10));
  const g = (x: number, y: number, z: number): FloatNode => {
    const o = vec3(x, y, z);
    return dot(
      normalize(
        hash3(mod(i.add(o), period))
          .mul(2)
          .sub(1)
      ),
      f.sub(o)
    );
  };
  const a = mix(
    mix(g(0, 0, 0), g(1, 0, 0), u.x),
    mix(g(0, 1, 0), g(1, 1, 0), u.x),
    u.y
  );
  const b = mix(
    mix(g(0, 0, 1), g(1, 0, 1), u.x),
    mix(g(0, 1, 1), g(1, 1, 1), u.x),
    u.y
  );
  return mix(a, b, u.z);
}).setLayout({
  name: 'perlin',
  type: 'float',
  inputs: [
    { name: 'p', type: 'vec3' },
    { name: 'period', type: 'float' },
  ],
});

const cells = Fn(([p, period]: [Vec2Node, FloatNode]) => {
  const cell = floor(p),
    f = fract(p);
  const best = vec2(0, 0).toVar();
  for (let y = -1; y <= 1; y++)
    for (let x = -1; x <= 1; x++) {
      const o = vec2(x, y);
      const h = hash3(vec3(mod(cell.add(o), period), period));
      const v = h.z.mul(h.z).mul(0.9).add(0.1);
      const c = v.sub(length(o.add(h.xy).sub(f)));
      best.assign(select(c.greaterThan(best.x), vec2(c, v), best));
    }
  return best;
}).setLayout({
  name: 'cells',
  type: 'vec2',
  inputs: [
    { name: 'p', type: 'vec2' },
    { name: 'period', type: 'float' },
  ],
});

const perlinFbm = (p: Vec3Node, f: number, octaves: number): FloatNode => {
  let sum: FloatNode = float(0);
  let amp = 0.5;
  for (let o = 0; o < octaves; o++, f *= 2, amp *= 0.5)
    sum = sum.add(perlin(p.mul(f), float(f)).mul(amp));
  return sum;
};

function texel3(n: number) {
  const x = instanceIndex.mod(n),
    y = instanceIndex.div(n).mod(n),
    z = instanceIndex.div(n * n);
  return { at: uvec3(x, y, z), uvw: vec3(x, y, z).add(0.5).div(n) };
}

const shapeKernel = (shapeVolume: Storage3DTexture) =>
  Fn(() => {
    const { at, uvw } = texel3(SHAPE_N);
    const pn = clamp(perlinFbm(uvw, 4, 3).mul(1.1).add(0.5), 0, 1);
    const w4 = worley(uvw.mul(4), float(4)),
      w8 = worley(uvw.mul(8), float(8)),
      w16 = worley(uvw.mul(16), float(16));
    const wf = w4.mul(0.625).add(w8.mul(0.25)).add(w16.mul(0.125));
    const pw = ramp(pn, wf.sub(1), 1);
    textureStore(shapeVolume, at, vec4(pw, w4, w8, w16));
  })().compute(SHAPE_N ** 3, [64]);

const detailKernel = (detailVolume: Storage3DTexture) =>
  Fn(() => {
    const { at, uvw } = texel3(DETAIL_N);
    textureStore(
      detailVolume,
      at,
      vec4(
        worley(uvw.mul(4), float(4)),
        worley(uvw.mul(8), float(8)),
        worley(uvw.mul(16), float(16)),
        1
      )
    );
  })().compute(DETAIL_N ** 3, [64]);

export const WEATHER_TILE = 40;
const CELL_SIZES = [1, 0.5, 0.25] as const;
export const POTENTIAL_DECILES = [
  0, 0, 0.0187, 0.0773, 0.1297, 0.1812, 0.2356, 0.2972, 0.3745, 0.495, 0.8682,
] as const;

const WARP = 0.8,
  WARP_PERIODS = 16,
  RAGGED = 1.2,
  RAGGED_PERIODS = 32;

const weatherKernel = (weatherMap: StorageTexture) =>
  Fn(() => {
    const x = instanceIndex.mod(WEATHER_N),
      y = instanceIndex.div(WEATHER_N);
    const uv0 = vec2(x, y).add(0.5).div(WEATHER_N);
    const warp = vec2(
      perlinFbm(vec3(uv0, 0.1), WARP_PERIODS, 3),
      perlinFbm(vec3(uv0, 0.7), WARP_PERIODS, 3)
    );
    const uv = uv0.add(warp.mul(WARP / WEATHER_TILE));
    const potential = float(0).toVar();
    for (const size of CELL_SIZES) {
      const n = WEATHER_TILE / size;
      potential.assign(max(potential, cells(uv.mul(n), float(n)).x.mul(size)));
    }
    const ragged = perlinFbm(vec3(uv0, 0.3), RAGGED_PERIODS, 3).mul(RAGGED);
    const field = smoothstep(-0.35, 0.35, perlinFbm(vec3(uv0, 0.5), 3, 3));
    textureStore(
      weatherMap,
      uvec2(x, y),
      vec4(max(potential.add(ragged), 0), field, 0, 1)
    );
  })().compute(WEATHER_N * WEATHER_N, [64]);

export type CloudNoise = ReturnType<typeof createCloudNoise>;

export function createCloudNoise() {
  const shape = volume(SHAPE_N);
  const detail = volume(DETAIL_N);
  const weather = storageTable(WEATHER_N, WEATHER_N, { wrap: RepeatWrapping });
  const bake: Compute[] = [
    shapeKernel(shape),
    detailKernel(detail),
    weatherKernel(weather),
  ];
  return { shape, detail, weather, bake };
}
