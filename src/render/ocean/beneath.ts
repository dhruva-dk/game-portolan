// What reaches a surface under the sea: the sun's light and the sky's, after the water above has taken its share on
// the way down (Beer–Lambert, along the sun's refracted path and along a diffuse one for the sky), the sun's gathered
// into caustics by the waves overhead.
//
// It is applied to the whole of a fragment's light, before the haze, so everything under the surface stands in it
// alike: the seabed, the foot of a cliff, a reef, the bottom of a hull, a whale. The sea's own surface takes no part.
//
// The caustics are the waves' focusing worked out in the small-slope limit: light falling through a surface h(x) is
// bent by (1 − 1/n)∇h, so after a path d it lands at x + d(1 − 1/n)∇h(x), and the light that crossed a patch of
// surface is spread over that patch's image, I = 1 / |det(I + d(1 − 1/n)H)| with H the Hessian of h. The Hessian
// comes from the waves' curvature layers, read at the mip whose texels are as wide as the sun's disc blurs a caustic
// at that depth, or as a pixel there, whichever is wider.
//
// One pre-image is all the formula sees. Past a wave's focal depth, 1/(d(1 − 1/n)|H|), the map folds and several
// patches of surface light the same spot; summing one of them loses light, and the floor goes dark in a speckle. So
// each cascade's curvature is weighed down once the path passes its waves' focal depth (from their RMS curvature,
// worked out from the spectrum): a cascade that has overfocused has spread into the even light it averages to, and
// the caustics left are those of the waves whose focus lies about this deep: the ripples' fine bright net in a hand's
// depth of water, only the long waves' broad one in the deep.
import { type Node, type Texture } from 'three/webgpu';
import {
  Fn, If, abs, clamp, dot, exp, float, fwidth, int, length, log2, max, min, mix, smoothstep, sqrt, texture, vec2, vec3,
} from 'three/tsl';
import { CASCADES, N, SIZES } from './spectrum.ts';
import { LAYER, SEA } from './waves.ts';
import { FRAME, FRAMES, inFrame, type Frame } from './surface.ts';
import { BODIES, skyLight, sunlight } from '../atmosphere/light.ts';
import { sunShadow } from '../atmosphere/shadows.ts';
import { seaLevelNode } from '../lift.ts';
import { waterAt } from '../seaTint.ts';
import { P } from '../gpu/uniforms.ts';

type F = Node<'float'>;
type V2 = Node<'vec2'>;
type V3 = Node<'vec3'>;

/** How far light falling through the surface is turned per unit of slope: 1 − 1/n for water. */
const BEND = 1 - 1 / 1.333;
/** The sun's angular radius, which blurs a caustic by this much per metre of depth. */
const SUN_BLUR = 0.0047;
/** The bend times RMS curvature at which a cascade's waves have reached their focus, past which they are weighed
 *  down: a little under one, so the brightest lines still come through. */
const FOCUS = 0.7;
/** The brightest a caustic gets, times the light that fell on the surface. */
const BRIGHTEST = 7;
/** Metres of water past which the floor takes no caustics and no shadow of its own (from 0.6 of it they fade). */
const CAUSTICS = 16;

const luma = (c: V3): F => dot(c, vec3(0.2126, 0.7152, 0.0722));

/**
 * Where the shadow map is read for a point under the sea. The sun's light reaches p bent toward the vertical where it
 * entered the water, so what shades p is whatever stands on the straight line from the sun to that entry point: the
 * shadow map answers for the point at p's depth on that straight line, a little further from the sun than p. A hull's
 * shadow on the seabed lies as close under it as it does in the sea, not as far as it would on dry land.
 */
export const refractedShadowPosition = (p: V3): V3 => {
  const r = p.length();
  const up = p.div(r);
  const depth = max(seaLevelNode(up, true).sub(r), 0);
  const mu = max(dot(up, P.sunDir), 0.1);
  const sinI = sqrt(max(float(1).sub(mu.mul(mu)), 1e-6));
  const sinT = sinI.div(1.333);
  const cosT = sqrt(max(float(1).sub(sinT.mul(sinT)), 1e-6));
  const toward = P.sunDir.sub(up.mul(dot(up, P.sunDir))).div(sinI);
  const entry = p.add(up.mul(depth)).add(toward.mul(depth.mul(sinT).div(cosT)));
  return entry.sub(P.sunDir.mul(depth.div(mu)));
};

/** A filter that takes a fragment's light at p to what it is under the waves of `field`. */
export function beneath(field: Texture): (colour: V3, p: V3) => V3 {
  const waves = texture(field);
  const sample = (uv: V2, layer: number) => waves.sample(uv).depth(int(layer));

  /** The waves' height over up, in one frame. */
  const rise = (up: V3, f: Frame): F => {
    const { q } = inFrame(up, f);
    const h = float(0).toVar();
    for (let c = 0; c < CASCADES; c++) h.addAssign(sample(q.div(SIZES[c]), LAYER.displacement + c).level(float(2)).y);
    return h;
  };

  /** The Hessian of the surface (xx, zz, xz) the light came through, in one frame's axes: at the point up, the light
   *  having run `run` from where it fell, blurred over `blur` metres, each cascade weighed by `focus` once its waves
   *  have overfocused over a bend of `k` (path × (1 − 1/n)). */
  const curvature = (up: V3, run: V3, f: Frame, blur: F, k: F): V3 => {
    const { q, e1, e2 } = inFrame(up, f);
    const from = q.sub(vec2(dot(run, e1), dot(run, e2)));
    const H = vec3(0).toVar();
    const rms = [SEA.curvature.x, SEA.curvature.y, SEA.curvature.z];
    for (let c = 0; c < CASCADES; c++) {
      const texel = SIZES[c] / N;
      const lod = max(log2(blur.div(texel)), 0);
      const weight = min(float(1), float(FOCUS).div(max(k.mul(rms[c]), 1e-4)));
      H.addAssign(sample(from.div(SIZES[c]), LAYER.curvature + c).level(lod).xyz.mul(weight));
    }
    return H;
  };

  return (colour: V3, p: V3): V3 =>
    Fn(() => {
      const out = vec3(colour).toVar();
      const r = p.length();
      const up = p.div(r).toVar();
      // (by texel loads: this runs in every material's fragment, the land's among them, which is out of samplers)
      const sea = seaLevelNode(up, true).toVar();
      // (nothing higher than the highest crest is ever under water)
      If(r.lessThan(sea.add(SEA.crest)), () => {
        const w = FRAME.weight;
        const surface = rise(up, FRAMES[0]).mul(w.x).toVar();
        If(w.y.greaterThan(0), () => {
          surface.addAssign(rise(up, FRAMES[1]).mul(w.y));
        });
        const depth = sea.add(surface).sub(r);
        If(depth.greaterThan(0), () => {
          // this region's water (by texel loads too)
          const extinction = waterAt(up, true).extinction.toVar();
          // the sun's way down, bent toward the vertical as it enters
          const mu = dot(up, P.sunDir);
          const cosT = sqrt(max(float(1).sub(float(1).sub(mu.mul(mu)).div(1.333 * 1.333)), 0));
          const path = depth.div(max(cosT, 0.2));
          const down = exp(extinction.mul(path).negate());
          // the sky's light comes down from every side: on average along a path a third longer than the depth
          const diffuse = exp(extinction.mul(depth.mul(1.33)).negate());
          // where the sun's ray through p entered: back along its run under the surface
          const flat = P.sunDir.sub(up.mul(mu));
          const run = flat.div(1.333).mul(path).negate();
          const pixel = length(fwidth(p));
          const blur = max(max(path.mul(SUN_BLUR), pixel.mul(1.5)), 0.01);
          const k = path.mul(BEND);
          // deeper than CAUSTICS the waves' focus has spread into the even light it averages to, and a hull's shadow
          // on the floor is lost in the water over it: neither is worked out there, which spares the open sea's floor
          // the curvature's samples and a second read of the shadow map in every pixel
          // (and at night, with the sun gone from everything in view, there is no sun to move)
          const near = smoothstep(CAUSTICS, CAUSTICS * 0.6, depth).toVar();
          const caustic = float(1).toVar(), shade = float(1).toVar(), sun = float(0).toVar();
          If(BODIES.sun.greaterThan(0.5), () => {
            sun.assign(luma(sunlight).mul(max(mu, 0)));
          });
          If(near.greaterThan(0).and(sun.greaterThan(0)), () => {
            const H = curvature(up, run, FRAMES[0], blur, k).mul(w.x).toVar();
            If(w.y.greaterThan(0), () => {
              H.addAssign(curvature(up, run, FRAMES[1], blur, k).mul(w.y));
            });
            const det = float(1).add(k.mul(H.x)).mul(float(1).add(k.mul(H.y))).sub(k.mul(k).mul(H.z).mul(H.z));
            const focus = clamp(float(1).div(max(abs(det), 1 / BRIGHTEST)), 0, BRIGHTEST);
            // a hand's depth of water is too thin to focus anything yet
            caustic.assign(mix(float(1), mix(float(1), focus, smoothstep(0, 0.25, depth)), near));
            shade.assign(mix(float(1), sunShadow(), near));
          });
          // the sun's share of the light on a level patch here, which is the share the caustics move: none in the
          // shadow of a hull or a cliff
          const sky = luma(skyLight(p, up));
          const share = sun.mul(shade).div(max(sun.mul(shade).add(sky), 1e-6));
          out.assign(colour.mul(down.mul(caustic).mul(share).add(diffuse.mul(float(1).sub(share)))));
        });
      });
      return out;
    })();
}
