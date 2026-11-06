// The aurora over the Ice Crown: curtains of light folded round the pole, high over the air, that show wherever the
// sky under them is dark. The Ice Crown has them overhead in its polar night, and the northern ring sees them low on
// the horizon.
//
// Each curtain is a thin vertical sheet, as Lawlor and Genetti draw them ("Interactive Volume Rendering Aurora on the
// GPU", WSCG 2011): a line of the electrons' fall traced round the pole, extruded upward, glowing by height. Oxygen's
// green at 557.7 nm starts sharply at the lower hem, where the electrons stop, and fades upward over a few tens of
// metres. A violet fringe of nitrogen's 427.8 nm lines the hem. Oxygen's red at 630 nm glows faint and broad high up.
// Fine rays ripple along each sheet, and patches of it brighten and fade.
//
// The sheets are a few metres thick, far thinner than any step a march could afford, so they are not sampled. The
// march finds where the ray crosses each sheet, where the sheet's equation changes sign between steps, and places
// the crossing by the secant. It takes the sheet's whole light there at once: its emission through its thickness,
// over the cosine at which the ray goes through it. So the hem is as sharp as the pixels, the folds seen edge-on
// blaze as they do in the sky, and there is no noise to settle.
import { Vector3, type Node, type Texture } from 'three/webgpu';
import { Fn, If, abs, acos, atan, clamp, exp, float, max, min, sin, smoothstep, texture, uniform, vec2, vec3 } from 'three/tsl';
import { R } from '../../sim/sphere.ts';
import { raySphere } from './model.ts';
import { P } from '../gpu/uniforms.ts';
import { sharedNoise } from '../gpu/noise.ts';
import { loop } from '../gpu/tsl.ts';

type F = Node<'float'>;
type V3 = Node<'vec3'>;

/** The curtains' lower hem and their tops, metres over the sea. */
const HEM = 112, TOP = 390;
/** The curtains, ring by ring out from the pole. */
const BANDS = 3;
/** Steps along the ray through the curtains' shell. */
const STEPS = 40;
/** The sheets' light seen square on, per unit of their profile. */
const BRIGHT = 0.0065;
/** The most a sheet seen edge-on is brighter than seen square on: the depth of a fold the ray runs along. */
const EDGE_ON = 16;
/** The colatitude the oval stays inside, radians. */
export const OVAL = 0.5;

/** How strong the aurora is tonight, 0 to 1. */
export const AURORA = { strength: uniform(0) };

const GREEN = vec3(0.16, 1, 0.42);
const VIOLET = vec3(0.55, 0.16, 1);
const RED = vec3(1, 0.1, 0.16);

// a sphere round the whole oval, to skip the rays that never come near it
const BOUND = (() => {
  const lo = R + HEM - 10, hi = R + TOP + 10;
  const pts = [[Math.sin(OVAL) * lo, Math.cos(OVAL) * lo], [Math.sin(OVAL) * hi, Math.cos(OVAL) * hi], [0, lo], [0, hi]];
  let best = { y: 0, r: Infinity };
  for (let y = lo; y <= hi; y += 2) {
    const r = Math.max(...pts.map(([px, py]) => Math.hypot(px, py - y)));
    if (r < best.r) best = { y, r };
  }
  return { centre: new Vector3(0, best.y, 0), radius: best.r + 1 };
})();

/** Curtain b's colatitude at longitude phi: a ring round the pole, folded at several scales, slowly writhing. */
function curtain(b: number, phi: F): F {
  const t = P.time;
  return float(0.2 + b * 0.075)
    .add(sin(phi.mul(3).add(t.mul(0.045)).add(b * 2)).mul(0.045))
    .add(sin(phi.mul(7).sub(t.mul(0.1)).add(b * 5)).mul(0.022))
    .add(sin(phi.mul(19).add(t.mul(0.21)).add(b)).mul(0.008));
}

/** Curtain b's light where the ray crosses it at p, at slope: how fast the ray goes through the sheet, per metre. */
function crossing(b: number, p: V3, slope: F, noise: Texture): V3 {
  const t = P.time;
  const r = p.length(), up = p.div(r);
  const phi = atan(p.z, p.x);
  const s = phi.mul(1 / (2 * Math.PI));
  // the hem rises and falls slowly along the curtain
  const hem = float(R + HEM + b * 9).add(sin(phi.mul(5).add(t.mul(0.03)).add(b * 1.7)).mul(7));
  const h = r.sub(hem);
  const green = smoothstep(-1, 2, h).mul(exp(h.max(0).div(-38)));
  const violet = exp(h.sub(1).div(3.5).pow(2).negate()).mul(0.4);
  // the red thins out with the air it comes from, well before the top of the shell the march stops at
  const red = smoothstep(45, 110, h).mul(exp(h.sub(110).max(0).div(-55))).mul(smoothstep(TOP - HEM - 15, TOP - HEM - 110, h)).mul(0.2);
  // the rays along the sheet, the patches that brighten and fade, and the pulses that run along it
  const rays = smoothstep(0.3, 0.85, texture(noise, vec2(s.mul(11).add(t.mul(0.004)), t.mul(0.002).add(b * 0.37))).b).mul(0.7).add(0.3);
  const patch = smoothstep(0.25, 0.72, texture(noise, vec2(s.mul(2).sub(t.mul(0.0025)), t.mul(0.001).add(b * 0.53))).r);
  const pulse = sin(t.mul(0.6).add(s.mul(40 * Math.PI)).add(b * 3)).mul(0.2).add(0.8);
  // only where the sky is dark
  const night = clamp(float(0.08).sub(up.dot(P.sunDir)).div(0.2), 0, 1);
  const light = GREEN.mul(green).add(VIOLET.mul(violet)).mul(rays).add(RED.mul(red).mul(rays.mul(0.5).add(0.5)));
  return light.mul(patch.mul(pulse).mul(night).mul(BRIGHT)).div(max(slope, 1 / EDGE_ON));
}

/** The aurora's light along d from eye, before the air between takes its share. */
export const auroraAlong = (eye: V3, d: V3): V3 =>
  Fn(() => {
    const L = vec3(0).toVar();
    If(AURORA.strength.greaterThan(0.001), () => {
      const bound = raySphere(eye.sub(vec3(BOUND.centre.x, BOUND.centre.y, BOUND.centre.z)), d, float(BOUND.radius));
      const outer = raySphere(eye, d, float(R + TOP));
      const inner = raySphere(eye, d, float(R + HEM - 10));
      const ground = raySphere(eye, d, float(R));
      const t0 = max(max(bound.x, outer.x), 0).toVar();
      const t1 = min(bound.y, outer.y).toVar();
      If(eye.length().lessThan(R + HEM - 10), () => {
        t0.assign(max(t0, inner.y));
      }).ElseIf(inner.x.greaterThan(0), () => {
        t1.assign(min(t1, inner.x));
      });
      If(ground.x.greaterThan(0), () => {
        t1.assign(min(t1, ground.x));
      });
      If(t1.greaterThan(t0).and(bound.y.greaterThan(0)), () => {
        const noise = sharedNoise();
        const where = (t: F) => {
          const p = eye.add(d.mul(t));
          const r = p.length();
          return { p, r, theta: acos(clamp(p.y.div(r), -1, 1)), phi: atan(p.z, p.x) };
        };
        // each curtain's equation where the ray comes in: its colatitude less the curtain's there
        const first = where(t0);
        const before = Array.from({ length: BANDS }, (_, b) => first.theta.sub(curtain(b, first.phi)).toVar());
        const tPrev = t0.toVar();
        const dt = t1.sub(t0).div(STEPS);
        loop('auroraStep', STEPS, (i) => {
          const t = t0.add(dt.mul(float(i).add(1)));
          const at = where(t);
          for (let b = 0; b < BANDS; b++) {
            const f = at.theta.sub(curtain(b, at.phi)).toVar();
            const f0 = before[b];
            If(f.mul(f0).lessThan(0), () => {
              // the crossing by the secant, and how squarely the ray goes through the sheet there
              const tc = tPrev.add(t.sub(tPrev).mul(f0.div(f0.sub(f))));
              const c = eye.add(d.mul(tc));
              const slope = abs(f.sub(f0)).div(max(t.sub(tPrev), 1e-3)).mul(c.length());
              L.addAssign(crossing(b, c, slope, noise));
            });
            f0.assign(f);
          }
          tPrev.assign(t);
        });
        L.mulAssign(AURORA.strength);
      });
    });
    return L;
  })() as unknown as V3;
