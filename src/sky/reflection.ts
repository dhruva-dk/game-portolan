// The sky as a reflection: a 256×128 panorama of the air and the clouds round the eye, redone every few frames, and
// filtered at once into a chain of levels, each the sky as a surface of one roughness mirrors it. It is the eye's
// sky, so it is laid out in the sky's directions (view.toSky) and read along them. The sun's disc is left out:
// surfaces draw its glint themselves.
//
// The filter is three's PMREM's (GGX, the view along the normal, weighted by n·l; the same roughness at each level and
// the same level read for a roughness), so a surface blurs the sky as it did, but kept in the panorama's own layout
// and done in compute: one pass of seven dispatches, not a cube's 42 render passes and their mip chains, which on the
// phone and the iPad added 13–20 ms of GPU work to the one frame, a frame dropped every half second.

import {
  ClampToEdgeWrapping, HalfFloatType, LinearFilter, LinearMipmapLinearFilter,
  RepeatWrapping, StorageTexture, Vector4, type WebGPURenderer,
} from 'three/webgpu';
import {
  Fn, Loop, abs, cos, cross, dot, equirectUV, float, instanceIndex, max, normalize, select, sin, storageTexture,
  texture, textureLoad, textureStore, uniformArray, uvec2, vec3, vec4,
} from 'three/tsl';
import type { View } from '../view/view';
import { skyRadiance } from './tables';

type N = any;

const W = 256, H = 128;
/** Frames between bakes: the clouds and the sun move slowly. */
const EVERY = 30;
/** Levels below the panorama, each half the size of the one before: 128×64 down to 8×4. */
const LEVELS = 5;
/** Levels from this one on are wide enough to integrate the reduced panorama; those before it sample the panorama. */
const ROUGH = 3;
/** The reduced panorama: 4×4 of the panorama's texels to one. */
const RW = W / 4, RH = H / 4;
/** Samples of the lobe at a sharp level. */
const SAMPLES = 64;

/** The roughness a level holds (three's PMREMGenerator.lodToRoughness); read back by `level` below. */
const roughnessAt = (k: number) => 1 - Math.sqrt(1 - k / LEVELS);
/** The level to read for a roughness: between two levels, the hardware blends them. */
const level = (roughness: N): N => {
  const r = float(roughness).clamp();
  return r.mul(float(2).sub(r)).mul(LEVELS);
};

function storage(width: number, height: number) {
  const t = new StorageTexture(width, height);
  t.type = HalfFloatType;
  t.minFilter = t.magFilter = LinearFilter;
  t.generateMipmaps = false;
  return t;
}

const panorama = storage(W, H);
const reduced = storage(RW, RH);
/** The panorama and its levels, as one texture's mips. */
const reflection = storage(W, H);
reflection.minFilter = LinearMipmapLinearFilter;
reflection.wrapS = RepeatWrapping;
reflection.wrapT = ClampToEdgeWrapping;
reflection.mipmaps = Array.from({ length: LEVELS + 1 }, (_, k) => ({ width: W >> k, height: H >> k })) as any;
reflection.mipmapsAutoUpdate = false;

/** The direction at the centre of texel (x, y) of a w×h panorama: the inverse of three's equirectUV. */
function texelDirection(x: N, y: N, w: number, h: number): N {
  const phi = float(x).add(0.5).div(w).sub(0.5).mul(2 * Math.PI);
  const theta = float(y).add(0.5).div(h).sub(0.5).mul(Math.PI);
  return vec3(cos(theta).mul(cos(phi)), sin(theta), cos(theta).mul(sin(phi)));
}

/**
 * A sharp level: the GGX lobe of its roughness round each texel's direction, in SAMPLES directions drawn from it
 * (Hammersley; three's VNDF sampling with the view along the normal) as (x, y, z) in the lobe's frame and n·l.
 */
function sharp(k: number): N {
  const w = W >> k, h = H >> k, a = roughnessAt(k) ** 2, a2 = a * a;
  const samples: number[][] = [];
  for (let i = 0; i < SAMPLES; i++) {
    let bits = i, inverse = 0;
    for (let b = 0.5; b > 1e-9; b /= 2, bits >>= 1) inverse += (bits & 1) * b;
    const u = i / SAMPLES, q = 1 / (1 - u + a2 * u), nl = (1 - u - a2 * u) * q;
    if (nl <= 0) continue;
    const s = 2 * a * Math.sqrt(u * (1 - u)) * q, phi = 2 * Math.PI * inverse;
    samples.push([s * Math.cos(phi), s * Math.sin(phi), nl]);
  }
  const lobe: N = uniformArray(samples.map(([x, y, z]) => new Vector4(x, y, z, 0)), 'vec4');
  const total = samples.reduce((sum, s) => sum + s[2], 0);
  return Fn(() => {
    const x = instanceIndex.mod(w), y = instanceIndex.div(w);
    const n = texelDirection(x, y, w, h).toVar();
    const t = normalize(cross(select(abs(n.y).lessThan(0.999), vec3(0, 1, 0), vec3(1, 0, 0)), n)).toVar();
    const b = cross(n, t).toVar();
    const sum = vec3(0).toVar();
    Loop(samples.length, ({ i }: { i: N }) => {
      const s = lobe.element(i);
      const l = t.mul(s.x).add(b.mul(s.y)).add(n.mul(s.z));
      sum.addAssign(texture(panorama, equirectUV(l)).level(float(0)).rgb.mul(s.z));
    });
    textureStore(storageTexture(reflection).setMipLevel(k), uvec2(x, y), vec4(sum.div(total), 1));
  })().compute(w * h, [64]);
}

/** A rough level: every texel of the reduced panorama, weighted by the GGX lobe, n·l and its solid angle. */
function rough(k: number): N {
  const w = W >> k, h = H >> k, a = roughnessAt(k) ** 2, a2 = a * a;
  return Fn(() => {
    const x = instanceIndex.mod(w), y = instanceIndex.div(w);
    const n = texelDirection(x, y, w, h).toVar();
    const sum = vec3(0).toVar(), total = float(0).toVar();
    Loop({ start: 0, end: RH, type: 'uint' }, { start: 0, end: RW, type: 'uint' }, ({ i, j }: { i: N; j: N }) => {
      const l = texelDirection(j, i, RW, RH);
      const nl = max(dot(n, l), 0);
      // with the view along the normal, (n·h)² = (1 + n·l)/2; the cosine of the latitude is the texel's solid angle
      const d = nl.mul(a2 - 1).add(a2 + 1);
      const weight = nl.mul(l.y.mul(l.y).oneMinus().sqrt()).div(d.mul(d));
      sum.addAssign(textureLoad(reduced, uvec2(j, i)).rgb.mul(weight));
      total.addAssign(weight);
    });
    textureStore(storageTexture(reflection).setMipLevel(k), uvec2(x, y), vec4(sum.div(total), 1));
  })().compute(w * h, [64]);
}

/**
 * sunDirection: toward the sun, as the eye's sky shows it; cloudsAlong: the clouds' light (rgb) and transmittance (a)
 * along a sky direction, marched in at most so many steps.
 */
export function createReflection(renderer: WebGPURenderer, view: View, sunDirection: N, cloudsAlong: (d: N, steps: number) => N) {
  const bake = Fn(() => {
    const x = instanceIndex.mod(W), y = instanceIndex.div(W);
    const d = texelDirection(x, y, W, H);
    const clouds = cloudsAlong(d, 24);
    const sky = vec4(skyRadiance(d, sunDirection).mul(clouds.a).add(clouds.rgb), 1).toVar();
    textureStore(panorama, uvec2(x, y), sky);
    textureStore(storageTexture(reflection).setMipLevel(0), uvec2(x, y), sky);
  })().compute(W * H, [64]);

  const reduce = Fn(() => {
    const x = instanceIndex.mod(RW), y = instanceIndex.div(RW);
    const sum = vec3(0).toVar();
    Loop({ start: 0, end: 4, type: 'uint' }, { start: 0, end: 4, type: 'uint' }, ({ i, j }: { i: N; j: N }) => {
      sum.addAssign(textureLoad(panorama, uvec2(x.mul(4).add(j), y.mul(4).add(i))).rgb);
    });
    textureStore(reduced, uvec2(x, y), vec4(sum.div(16), 1));
  })().compute(RW * RH, [64]);

  const passes = [bake, reduce, ...Array.from({ length: LEVELS }, (_, i) => (i + 1 < ROUGH ? sharp(i + 1) : rough(i + 1)))];

  let frame = 0;
  return {
    /**
     * The sky's light reflected toward world direction dir off a surface of the given roughness (0–1). Only the sky
     * above its horizon: a ray from the sea past the horizon's edge still meets the sky's horizon.
     */
    reflect: (dir: N, roughness: N): N => {
      const d = view.toSky(dir);
      return texture(reflection, equirectUV(normalize(vec3(d.x, max(d.y, 0), d.z)))).level(level(roughness)).rgb;
    },
    update() {
      if (frame++ % EVERY === 0) renderer.compute(passes);
    },
  };
}
