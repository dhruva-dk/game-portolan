import {
  LinearMipmapLinearFilter,
  RepeatWrapping,
  Vector4,
  type ComputeNode,
  type StorageTexture,
} from 'three/webgpu';
import {
  Fn,
  abs,
  cos,
  cross,
  dot,
  equirectUV,
  float,
  instanceIndex,
  ivec2,
  max,
  normalize,
  select,
  sin,
  storageTexture,
  texture,
  textureLoad,
  textureStore,
  uint,
  uniformArray,
  uvec2,
  vec3,
  vec4,
} from 'three/tsl';
import { storageTable, type Compute } from '../gpu.ts';
import type { View } from '../view/view.ts';
import {
  loop,
  type FloatNode,
  type IntNode,
  type UintNode,
  type Vec3Node,
  type Vec4Node,
} from '../tsl.ts';
import type { Tables } from './tables.ts';

const W = 256,
  H = 128;
const EVERY = 30;
const LEVELS = 5;
const ROUGH = 3;
const RW = W / 4,
  RH = H / 4;
const SAMPLES = 64;

const roughnessAt = (k: number) => 1 - Math.sqrt(1 - k / LEVELS);
const level = (roughness: FloatNode): FloatNode => {
  const r = float(roughness).clamp();
  return r.mul(float(2).sub(r)).mul(LEVELS);
};

function texelDirection(
  x: UintNode | IntNode,
  y: UintNode | IntNode,
  w: number,
  h: number
): Vec3Node {
  const phi = float(x)
    .add(0.5)
    .div(w)
    .sub(0.5)
    .mul(2 * Math.PI);
  const theta = float(y).add(0.5).div(h).sub(0.5).mul(Math.PI);
  return vec3(cos(theta).mul(cos(phi)), sin(theta), cos(theta).mul(sin(phi)));
}

function sharp(
  k: number,
  panorama: StorageTexture,
  reflection: StorageTexture
): ComputeNode {
  const w = W >> k,
    h = H >> k,
    a = roughnessAt(k) ** 2,
    a2 = a * a;
  const samples: number[][] = [];
  for (let i = 0; i < SAMPLES; i++) {
    let bits = i,
      inverse = 0;
    for (let b = 0.5; b > 1e-9; b /= 2, bits >>= 1) inverse += (bits & 1) * b;
    const u = i / SAMPLES,
      q = 1 / (1 - u + a2 * u),
      nl = (1 - u - a2 * u) * q;
    if (nl <= 0) continue;
    const s = 2 * a * Math.sqrt(u * (1 - u)) * q,
      phi = 2 * Math.PI * inverse;
    samples.push([s * Math.cos(phi), s * Math.sin(phi), nl]);
  }
  const lobe = uniformArray<'vec4'>(
    samples.map(([x, y, z]) => new Vector4(x, y, z, 0)),
    'vec4'
  );
  const total = samples.reduce((sum, s) => sum + s[2], 0);
  return Fn(() => {
    const x = instanceIndex.mod(w),
      y = instanceIndex.div(w);
    const n = texelDirection(x, y, w, h).toVar();
    const t = normalize(
      cross(select(abs(n.y).lessThan(0.999), vec3(0, 1, 0), vec3(1, 0, 0)), n)
    ).toVar();
    const b = cross(n, t).toVar();
    const sum = vec3(0).toVar();
    loop('sample', samples.length, (i) => {
      const s = lobe.element(i);
      const l = t.mul(s.x).add(b.mul(s.y)).add(n.mul(s.z));
      sum.addAssign(
        texture(panorama, equirectUV(l)).level(float(0)).rgb.mul(s.z)
      );
    });
    textureStore(
      storageTexture(reflection).setMipLevel(k),
      uvec2(x, y),
      vec4(sum.div(total), 1)
    );
  })().compute(w * h, [64]);
}

function rough(
  k: number,
  reduced: StorageTexture,
  reflection: StorageTexture
): ComputeNode {
  const w = W >> k,
    h = H >> k,
    a = roughnessAt(k) ** 2,
    a2 = a * a;
  return Fn(() => {
    const x = instanceIndex.mod(w),
      y = instanceIndex.div(w);
    const n = texelDirection(x, y, w, h).toVar();
    const sum = vec3(0).toVar(),
      total = float(0).toVar();
    loop('row', RH, (i) =>
      loop('column', RW, (j) => {
        const l = texelDirection(j, i, RW, RH);
        const nl = max(dot(n, l), 0);
        const d = nl.mul(a2 - 1).add(a2 + 1);
        const weight = nl.mul(l.y.mul(l.y).oneMinus().sqrt()).div(d.mul(d));
        sum.addAssign(textureLoad(reduced, ivec2(j, i)).rgb.mul(weight));
        total.addAssign(weight);
      })
    );
    textureStore(
      storageTexture(reflection).setMipLevel(k),
      uvec2(x, y),
      vec4(sum.div(total), 1)
    );
  })().compute(w * h, [64]);
}

export function createReflection(
  view: View,
  skyRadiance: Tables['skyRadiance'],
  sunDirection: Vec3Node,
  cloudsAlong: (d: Vec3Node, steps: number) => Vec4Node
) {
  const panorama = storageTable(W, H);
  const reduced = storageTable(RW, RH);
  const reflection = storageTable(W, H, {
    min: LinearMipmapLinearFilter,
    mipmaps: true,
  });
  reflection.wrapS = RepeatWrapping;
  reflection.mipmapsAutoUpdate = false;

  const bakeOf = (cloudy: boolean) =>
    Fn(() => {
      const x = instanceIndex.mod(W),
        y = instanceIndex.div(W);
      const d = texelDirection(x, y, W, H);
      const air = skyRadiance(d, sunDirection);
      const clouds = cloudy ? cloudsAlong(d, 24) : null;
      const sky = vec4(
        clouds ? air.mul(clouds.a).add(clouds.rgb) : air,
        1
      ).toVar();
      textureStore(panorama, uvec2(x, y), sky);
      textureStore(storageTexture(reflection).setMipLevel(0), uvec2(x, y), sky);
    })().compute(W * H, [64]);

  const reduce = Fn(() => {
    const x = instanceIndex.mod(RW),
      y = instanceIndex.div(RW);
    const sum = vec3(0).toVar();
    loop('row', 4, (i) =>
      loop('column', 4, (j) => {
        sum.addAssign(
          textureLoad(
            panorama,
            uvec2(x.mul(4).add(uint(j)), y.mul(4).add(uint(i)))
          ).rgb
        );
      })
    );
    textureStore(reduced, uvec2(x, y), vec4(sum.div(16), 1));
  })().compute(RW * RH, [64]);

  const filter = (n: number) =>
    n < ROUGH ? sharp(n, panorama, reflection) : rough(n, reduced, reflection);
  const levels = [
    reduce,
    ...Array.from({ length: LEVELS }, (_, i) => filter(i + 1)),
  ];
  const due: Record<'cloudy' | 'clear' | 'none', readonly Compute[]> = {
    cloudy: [[bakeOf(true), ...levels]],
    clear: [[bakeOf(false), ...levels]],
    none: [],
  };

  let frame = 0,
    wasClear = false;
  return {
    reflect: (dir: Vec3Node, roughness: FloatNode): Vec3Node => {
      const d = view.toSky(dir);
      return texture(
        reflection,
        equirectUV(normalize(vec3(d.x, max(d.y, 0), d.z)))
      ).level(level(roughness)).rgb;
    },
    update(clear: boolean): readonly Compute[] {
      if (clear !== wasClear) frame = 0;
      wasClear = clear;
      return frame++ % EVERY === 0 ? due[clear ? 'clear' : 'cloudy'] : due.none;
    },
  };
}
