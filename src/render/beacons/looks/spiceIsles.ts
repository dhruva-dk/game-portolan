// The Spice Isles: the Ember Swarm. Fireflies breed in the flame trees round Spice Cove, and at dusk they pour out over
// the water in a slow wheeling column, thick near the surface and thinning as it climbs, each one flashing ember
// orange. Under them the cove is carpeted with fallen flame-tree petals that catch the light. By day it is a cove of
// floating red petals with blossom drifting down.
import { Kit, disc, halo, particles, surface, tick } from '../kit.ts';
import type { BeaconLook } from '../look.ts';
import { clamp, cos, exp, fract, length, mix, mod, pow, sin, smoothstep, vec3 } from 'three/tsl';
import { bFbm, bNoise, shapeSpark } from '../nodes.ts';

const TOP = 60;

export const spiceIsles: BeaconLook = {
  name: 'the Ember Swarm',
  what: 'A wheeling column of ember-orange fireflies over Spice Cove, above water carpeted with fallen flame-tree petals.',
  color: 0xff7a2a,
  lightHeight: 14,
  height: TOP,
  radius: 22,
  ground: 'sea',
  update: tick,
  build(seed) {
    const k = new Kit(seed, 'beacon:spiceIsles');

    // the carpet of petals on the water, bright where the swarm's light falls
    k.add(surface(k, disc(26, 0.08, 64), {
      color: 0xff6a20, day: 0, night: 0.5, blend: 'alpha', matter: 0xb8281a,
      paintNode: ({ local, t }) => {
        const p = local.xz, r = length(p);
        const petals = smoothstep(0.5, 0.62, bNoise(vec3(p.mul(1.3), 3))).add(smoothstep(0.6, 0.7, bNoise(vec3(p.mul(2.7), 8))).mul(0.6));
        const drift = smoothstep(0.35, 0.65, bFbm(vec3(p.mul(0.12).add(t.mul(0.01)), 1)));
        const alpha = clamp(petals, 0, 1).mul(drift).mul(smoothstep(26, 14, r)).mul(0.95);
        return { alpha, col: mix(vec3(1, 0.5, 0.3), vec3(1, 0.85, 0.4), bNoise(vec3(p.mul(3), 5))), glow: alpha.mul(exp(r.div(-8)).add(0.25)) };
      },
    }));

    // the swarm: a slow vortex rising off the water, each firefly flashing on its own beat
    k.add(particles(k, {
      count: 600, color: 0xff8a30, day: 0, night: 3.0,
      shapeNode: shapeSpark,
      motionNode: ({ s, t }) => {
        const f = mod(s.y.mul(s.y).add(t.mul(s.z.mul(0.006).add(0.004))), 1), y = f.mul(TOP - 1).add(1);
        const a = s.x.mul(6.2831).add(t.mul(s.w.mul(0.08).add(0.12))).sub(f.mul(2));
        const r = s.w.mul(13).add(3).mul(f.mul(0.6).add(0.7)).add(sin(t.mul(0.7).add(s.z.mul(30))).mul(1.2));
        const beat = fract(t.div(s.z.mul(2.2).add(1.6)).add(s.w)), flash = exp(pow(beat.sub(0.1).div(0.05), 2).negate());
        return {
          pos: vec3(cos(a).mul(r), y.add(sin(t.mul(1.3).add(s.x.mul(40))).mul(0.6)), sin(a).mul(r)),
          col: mix(vec3(1, 0.45, 0.12), vec3(1, 0.8, 0.35), flash),
          size: flash.mul(0.18).add(0.1), alpha: flash.mul(1.6).add(0.12).mul(smoothstep(1, 0.75, f)),
        };
      },
    }));

    // blossom drifting down out of the trees: red matter by day, catching the swarm's light at night
    k.add(particles(k, {
      count: 90, color: 0xff7a40, day: 0, night: 0.25, blend: 'alpha', matter: 0xd0301c,
      base: (_i, r) => { const a = r() * Math.PI * 2, d = 4 + r() * 18; return [Math.cos(a) * d, 0, Math.sin(a) * d]; },
      motionNode: ({ s, pos, t }) => {
        const f = fract(s.y.add(t.mul(s.z.mul(0.02).add(0.02))));
        return {
          pos: vec3(pos.x.add(sin(t.mul(0.9).add(s.w.mul(20))).mul(1.5)).add(f.mul(6)), f.oneMinus().mul(34), pos.z.add(cos(t.mul(0.7).add(s.x.mul(20))).mul(1.5))),
          size: s.w.mul(0.12).add(0.18), alpha: smoothstep(0, 0.05, f).mul(smoothstep(1, 0.95, f)).mul(0.9),
        };
      },
      renderOrder: 9,
    }));

    k.add(halo(k, [0, 8, 0], 22, 0xff7a2a, 0, 0.38, 20, ({ t }) => sin(t.mul(0.5)).mul(0.12).add(0.88)));
    k.add(halo(k, [0, TOP * 0.55, 0], 36, 0xff8a3a, 0, 0.12, 36));
    k.setPulse((t) => 0.88 + 0.12 * Math.sin(t * 0.5));
    return k.root;
  },
};
