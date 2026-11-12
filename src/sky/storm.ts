// The storm as the eye sees it (its rules are sim/storm.ts): outside the safe cap, from the sea up to TOP metres,
// the air is rain and low cloud. Seen from the calm it is a wall standing at the cap's edge; from inside it, everything
// fades into it within a few score metres and the sky overhead goes dark.
//
// No march: the cap's edge is a cone from the planet's centre, so the eye's ray crosses it at the roots of a
// quadratic, and the storm's air between the sea and its TOP is that cone's outside cut by a sphere. The ray's length
// through it, up to whatever the pixel shows, is summed over the (at most three) pieces the roots cut it into, each
// weighed by how deep in the storm its middle lies (so the wall's foot and its edges, where the ray only grazes it,
// are soft). One noise read where the ray enters it breaks the wall into curtains of rain, streaked up and down and
// falling, with a ragged top: the light in it is the sky's, dimmed (sky.ts gives it).
//
// What it gives the sky (sky.ts):
//   depth(p)           0…1, how deep in the storm world position p lies: 0 in the cap, 1 SOFT metres past its edge
//   veil(c, dir, m)    colour c seen m metres away along world direction dir from the eye, through the storm
//   dim(c, dir)        the same for the sky beyond it, without the curtains: for what a mirror shows (sky.reflect)
//   deck(c, dir, m)    the same seen from high over its top (the full map's eye, in space): its billowed cloud top

import { Vector3 } from 'three/webgpu';
import { Fn, abs, acos, clamp, dot, exp, float, max, min, mix, mx_noise_float, normalize, select, smoothstep, sqrt, uniform, vec3 } from 'three/tsl';
import type { Cap } from '../sim/storm';
import type { View } from '../view/view';
import { R } from '../world/sphere';

type N = any;

/** The storm's air reaches this high over the sea, metres: over the horizon from 650 m away. */
const TOP = 320;
/** Its density rises from nothing at the cap's edge to full this many metres past it. */
const SOFT = 25;
/**
 * Extinction in the storm, per metre: rain and low cloud through which a ship 80 m off is a shadow (e⁻³ at 1/σ·3).
 * Its curtains thin it by up to CURTAIN of itself; it thins from FADE of TOP up, to nothing at TOP.
 */
const SIGMA = 1 / 28, CURTAIN = 0.7, FADE = 0.45;
/**
 * The rain's curtains' size, metres: across, and up and down (streaks); how far they lean with height (metres across
 * a metre up), and how fast they fall, metres a second. They hang from a cloud BASE metres up, whose billows are
 * BILLOW across.
 */
const ACROSS = 22, ALONG = 140, LEAN = 0.3, FALL = 9, BASE = 150, BILLOW = 60;
/** The light at the storm's foot and at its top, as shares of what sky.ts gives it. */
const FOOT = 0.45, CROWN = 1.3;
/** The light in a shaft of heavy rain and in the thinner air between shafts, as shares of the storm's. */
const SHAFT = 0.55, GAP = 1.5;

export function createStormLook(view: View) {
  const centre = uniform(new Vector3(0, 1, 0));
  const radius = uniform(Math.PI);
  const cosine = uniform(-1);
  const clock = uniform(0);

  /** 0…1 how deep in the storm world position p lies. */
  const depth = (p: N): N => smoothstep(0, SOFT, acos(clamp(dot(normalize(p), centre), -1, 1)).sub(radius).mul(R));

  /**
   * The eye's ray along world direction dir, up to `metres`, through the storm: how far it runs in it (weighed by
   * depth), and a point a mean free path in from where it enters (or its end, if it runs less), whose rain is what
   * the eye sees most of.
   */
  const path = (dir: N, metres: N): { length: N; q: N } => {
    const o: N = view.position, d: N = dir;
    const a = dot(o, centre), b = dot(d, centre), oo = dot(o, o), od = dot(o, d), k2 = cosine.mul(cosine);
    // the storm's shell: where the ray is below TOP, and in front of what the pixel shows
    const h = od.mul(od).sub(oo.sub((R + TOP) * (R + TOP)));
    const half = sqrt(max(h, 0));
    const lo = max(od.negate().sub(half), 0);
    const hi = select(h.lessThan(0), lo, max(min(od.negate().add(half), metres), lo));
    // (a + tb)² = cos²·|o + td|²: the cone and its mirror, which the midpoints' depths tell apart
    const A = b.mul(b).sub(k2), B = a.mul(b).sub(k2.mul(od)).mul(2), C = a.mul(a).sub(k2.mul(oo));
    const disc = B.mul(B).sub(A.mul(C).mul(4));
    const A2 = select(abs(A).lessThan(1e-7), float(1e-7), A).mul(2), root = sqrt(max(disc, 0));
    const r1 = B.negate().sub(root).div(A2), r2 = B.negate().add(root).div(A2);
    const t1 = select(disc.lessThan(0), hi, clamp(min(r1, r2), lo, hi));
    const t2 = select(disc.lessThan(0), hi, clamp(max(r1, r2), lo, hi));
    const at = (t: N): N => o.add(d.mul(t));
    const w0 = depth(at(lo.add(t1).mul(0.5))), w1 = depth(at(t1.add(t2).mul(0.5))), w2 = depth(at(t2.add(hi).mul(0.5)));
    const length = t1.sub(lo).mul(w0).add(t2.sub(t1).mul(w1)).add(hi.sub(t2).mul(w2));
    const enter = select(w0.greaterThan(0), lo, select(w1.greaterThan(0), t1, t2));
    return { length, q: at(min(enter.add(1 / SIGMA), hi)) };
  };

  /** The storm's light at altitude: dark at its foot, where the rain falls out of it, paler up in the cloud. */
  const shade = (light: N, altitude: N): N => light.mul(mix(FOOT, CROWN, smoothstep(0, TOP, altitude)));

  /** Colour c seen m metres along world direction dir from the eye, through the storm lit by `light`. */
  const veil = (c: N, dir: N, metres: N, light: N): N =>
    Fn(() => {
      const { length, q } = path(dir, metres);
      const up: N = normalize(q), altitude: N = dot(q, up).sub(R);
      // Below the cloud's base, curtains of rain: streaks up and down, leaning with the wind, falling, a finer set
      // in the coarser. Above it, the cloud's billows, which fray its top.
      const across: N = up.mul(R / ACROSS).add(vec3(altitude.mul(LEAN / ACROSS), 0, 0));
      const streak = (k: number): N => mx_noise_float(across.mul(k).add(vec3(0, altitude.add(clock.mul(FALL)).div(ALONG), k * 7)));
      const shafts = streak(1).mul(0.7).add(streak(3).mul(0.3)).mul(0.5).add(0.5);
      const billow = mx_noise_float(up.mul(R / BILLOW).add(vec3(clock.mul(0.02), altitude.div(BILLOW), 0)));
      const cloud = smoothstep(BASE * 0.7, BASE * 1.3, altitude.add(billow.mul(BASE * 0.3)));
      const rain = mix(shafts, billow.mul(0.5).add(0.5), cloud);
      const thick = float(1).sub(rain.mul(CURTAIN));
      const top = float(1).sub(smoothstep(TOP * FADE, TOP, altitude.add(billow.mul(TOP * 0.3))));
      const T = exp(length.mul(thick).mul(top).mul(-SIGMA));
      // a shaft of heavy rain is darker than the thin air between; the cloud's billows lit on their tops
      const glow = shade(light, altitude).mul(mix(SHAFT, GAP, rain));
      return c.mul(T).add(glow.mul(float(1).sub(T)));
    })();

  /** The same, with no curtains and to the top of the storm: what a mirror (the sea) shows of it, cheaply. */
  const dim = (c: N, dir: N, light: N): N =>
    Fn(() => {
      const { length, q } = path(dir, float(1e5));
      const T = exp(length.mul(-SIGMA * (1 - CURTAIN / 2)));
      return c.mul(T).add(shade(light, dot(q, normalize(q)).sub(R)).mul(float(1).sub(T)));
    })();

  /**
   * Colour c seen m metres along world direction dir from an eye high over the storm (the full map's, from space):
   * its cloud's top, billowed and lit unevenly, over everything under it; no curtains, which only show from beside.
   */
  const deck = (c: N, dir: N, metres: N, light: N): N =>
    Fn(() => {
      const { length, q } = path(dir, metres);
      const up: N = normalize(q), altitude: N = dot(q, up).sub(R);
      const billow = mx_noise_float(up.mul(R / BILLOW).add(vec3(clock.mul(0.02), 0, 0))).mul(0.6)
        .add(mx_noise_float(up.mul((R / BILLOW) * 3.1).add(vec3(0, clock.mul(0.05), 7))).mul(0.4));
      const T = exp(length.mul(-SIGMA * (1 - CURTAIN / 2)));
      return c.mul(T).add(shade(light, altitude).mul(billow.mul(0.45).add(1)).mul(float(1).sub(T)));
    })();

  return {
    depth,
    veil,
    dim,
    deck,
    /** The storm now (sim/storm.ts); seconds: the world's clock (Environment.clock), which its rain and billows run on. */
    update(cap: Cap, seconds: number) {
      centre.value.set(...cap.centre);
      radius.value = cap.radius;
      cosine.value = Math.cos(cap.radius);
      clock.value = seconds;
    },
  };
}
