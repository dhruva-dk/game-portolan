// The Mangrove Labyrinth: the Firefly Gate. Thousands of fireflies gather in the canopy round the Root Gate and flash
// together, in waves that sweep through the swarm, while the black water under the gate sparks green where the roots
// stir it. By day it is a cloud of tiny insects in the dappled light and a channel of dark water.
import { Kit, disc, halo, particles, surface, tick } from '../kit.ts';
import type { BeaconLook } from '../look.ts';
import { cos, exp, fract, length, max, pow, sin, smoothstep, vec3 } from 'three/tsl';
import { bNoise, shapeSpark, type F } from '../nodes.ts';

const TOP = 58;
const bump = (x: F, at: number, w: number): F => exp(pow(x.sub(at).div(w), 2).negate());

export const mangroveLabyrinth: BeaconLook = {
  name: 'the Firefly Gate',
  what: 'A swarm of fireflies round the Root Gate flashing together in sweeping waves, over water that sparks green beneath it.',
  color: 0xd4ff5a,
  lightHeight: TOP - 8,
  height: TOP,
  radius: 18,
  ground: 'sea',
  update: tick,
  build(seed) {
    const k = new Kit(seed, 'beacon:mangroveLabyrinth');

    // the water under the gate, sparking where it's stirred
    k.add(surface(k, disc(22, 0.08, 64), {
      color: 0x9cff6a, day: 0, night: 0.6,
      paintNode: ({ local, t }) => {
        const p = local.xz, r = length(p);
        const spark = pow(bNoise(vec3(p.mul(1.2), t.mul(0.9))), 8).mul(6);
        const ripple = pow(max(0, sin(r.mul(0.8).sub(t.mul(0.9)))), 10).mul(0.6);
        return { glow: spark.add(ripple).add(0.1).mul(smoothstep(22, 10, r)) };
      },
    }));

    // the swarm: a broad cloud in and under the canopy the Gate's tree holds over the channel, flashing in waves that
    // sweep across it; a few stray down round the roots
    k.add(particles(k, {
      count: 700, color: 0xd8ff60, day: 0, night: 3.0,
      base: (i, r) => {
        const a = r() * Math.PI * 2, d = Math.sqrt(r()) * 30, y = i % 6 ? TOP - 26 + Math.pow(r(), 0.7) * 34 : 4 + r() * (TOP - 30);
        return [Math.cos(a) * d, y, Math.sin(a) * d * 0.75];
      },
      shapeNode: shapeSpark,
      motionNode: ({ s, pos, t }) => {
        const p = pos.add(vec3(sin(t.mul(0.6).add(s.x.mul(30))), sin(t.mul(0.8).add(s.y.mul(30))).mul(0.6), cos(t.mul(0.5).add(s.z.mul(30)))).mul(1.4));
        // waves of light sweeping through, every firefly flashing as one passes
        const wave = fract(t.div(4.5).sub(p.x.mul(0.6).add(p.z.mul(0.8)).add(p.y.mul(0.3)).div(60)));
        const flash = bump(wave, 0.5, 0.03).add(bump(wave, 0.56, 0.02).mul(0.25));
        const own = pow(sin(t.mul(s.w.mul(2).add(1)).add(s.z.mul(40))).mul(0.5).add(0.5), 8).mul(0.15);
        return { pos: p, size: flash.mul(0.16).add(0.09), alpha: flash.mul(1.8).add(0.06).add(own) };
      },
    }));

    // a soft glow in the canopy where the swarm is thickest, not a lamp filling the arch
    k.add(halo(k, [0, TOP - 6, 0], 24, 0xc8ff5a, 0, 0.14, 24,
      ({ t }) => bump(fract(t.div(4.5)), 0.5, 0.08).mul(0.35).add(0.8)));
    k.add(halo(k, [0, TOP - 14, 0], 40, 0xc0ff50, 0, 0.05, 36));
    k.setPulse((t) => 0.8 + 0.35 * Math.exp(-((((t / 4.5) % 1) - 0.5) ** 2) / 0.0064));
    return k.root;
  },
};
