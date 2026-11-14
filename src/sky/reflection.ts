// The sky as the sea mirrors it: a few broad shapes of cloud and sky, no detail. A 64×32 panorama of the air and the
// clouds round the eye, redone every few frames, and blurred at once into a 16×8 one: the sky as a surface of one
// roughness (BLURRED) mirrors it. It is the eye's sky, so it is laid out in the sky's directions (view.toSky) and read
// along them. The sun's disc is left out: surfaces draw its glint themselves.
//
// The blur is a GGX lobe's (the view along the normal, weighted by n·l), done in compute: two small dispatches.

import { ClampToEdgeWrapping, HalfFloatType, LinearFilter, RepeatWrapping, StorageTexture } from 'three/webgpu';
import {
  Fn, Loop, cos, dot, equirectUV, float, instanceIndex, max, normalize, sin, texture, textureLoad, textureStore, uvec2, vec3, vec4,
} from 'three/tsl';
import type { Compute } from '../gpu';
import type { View } from '../view/view';
import type { UintNode, Vec3Node, Vec4Node } from '../tsl';
import type { Tables } from './tables';

/** The panorama, and the blurred one the sea reads. */
const W = 64, H = 32, BW = 16, BH = 8;
/** Frames between bakes: the clouds and the sun move slowly. */
const EVERY = 30;
/** The roughness the sky's reflection is blurred to. */
const BLURRED = 0.55;

function storage(width: number, height: number) {
  const t = new StorageTexture(width, height);
  t.type = HalfFloatType;
  t.minFilter = t.magFilter = LinearFilter;
  t.wrapS = RepeatWrapping;
  t.wrapT = ClampToEdgeWrapping;
  t.generateMipmaps = false;
  return t;
}

/** The direction at the centre of texel (x, y) of a w×h panorama: the inverse of three's equirectUV. */
function texelDirection(x: UintNode, y: UintNode, w: number, h: number): Vec3Node {
  const phi = float(x).add(0.5).div(w).sub(0.5).mul(2 * Math.PI);
  const theta = float(y).add(0.5).div(h).sub(0.5).mul(Math.PI);
  return vec3(cos(theta).mul(cos(phi)), sin(theta), cos(theta).mul(sin(phi)));
}

/**
 * skyRadiance: the air's (tables.ts); sunDirection: toward the sun, as the eye's sky shows it; cloudsAlong: the
 * clouds' light (rgb) and transmittance (a) along a sky direction, marched in at most so many steps.
 */
export function createReflection(
  view: View, skyRadiance: Tables['skyRadiance'], sunDirection: Vec3Node, cloudsAlong: (d: Vec3Node, steps: number) => Vec4Node,
) {
  const panorama = storage(W, H), blurred = storage(BW, BH);

  /** The panorama: the sky, and the clouds in it unless they are left out (seen from space). */
  const bakeOf = (cloudy: boolean) => Fn(() => {
    const x = instanceIndex.mod(W), y = instanceIndex.div(W);
    const d = texelDirection(x, y, W, H);
    const air = skyRadiance(d, sunDirection);
    const clouds = cloudy ? cloudsAlong(d, 24) : null;
    textureStore(panorama, uvec2(x, y), vec4(clouds ? air.mul(clouds.a).add(clouds.rgb) : air, 1));
  })().compute(W * H, [64]);

  /** Every texel of the panorama, weighted by the GGX lobe round this one's direction, n·l and its solid angle. */
  const a2 = BLURRED ** 4;
  const blur = Fn(() => {
    const x = instanceIndex.mod(BW), y = instanceIndex.div(BW);
    const n = texelDirection(x, y, BW, BH).toVar();
    const sum = vec3(0).toVar(), total = float(0).toVar();
    Loop({ start: 0, end: H, type: 'uint' }, { start: 0, end: W, type: 'uint' }, ({ i, j }) => {
      const l = texelDirection(j, i, W, H);
      const nl = max(dot(n, l), 0);
      // with the view along the normal, (n·h)² = (1 + n·l)/2; the cosine of the latitude is the texel's solid angle
      const d = nl.mul(a2 - 1).add(a2 + 1);
      const weight = nl.mul(l.y.mul(l.y).oneMinus().sqrt()).div(d.mul(d));
      sum.addAssign(textureLoad(panorama, uvec2(j, i)).rgb.mul(weight));
      total.addAssign(weight);
    });
    textureStore(blurred, uvec2(x, y), vec4(sum.div(total), 1));
  })().compute(BW * BH, [64]);

  const passes = { cloudy: [bakeOf(true), blur], clear: [bakeOf(false), blur] };

  let frame = 0, wasClear = false;
  return {
    /**
     * The sky's light a surface mirrors along world direction dir, blurred. Only the sky above its horizon: a ray
     * from the sea past the horizon's edge still meets the sky's horizon.
     */
    reflect: (dir: Vec3Node): Vec3Node => {
      const d = view.toSky(dir);
      return texture(blurred, equirectUV(normalize(vec3(d.x, max(d.y, 0), d.z)))).level(float(0)).rgb;
    },
    /** The passes due this frame: both, one after the other in one pass, every EVERY frames, and at once when the
     *  clouds are left out or put back (clear: the sky alone, for an eye in space). */
    update(clear: boolean): Compute[] {
      if (clear !== wasClear) frame = 0;
      wasClear = clear;
      return frame++ % EVERY === 0 ? [clear ? passes.clear : passes.cloudy] : [];
    },
  };
}
