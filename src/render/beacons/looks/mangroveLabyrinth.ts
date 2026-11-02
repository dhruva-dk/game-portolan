// The Mangrove Labyrinth: the Firefly Gate. Thousands of fireflies gather in the canopy round the Root Gate and flash
// together, in waves that sweep through the swarm, while the black water under the gate sparks green where the roots
// stir it. By day it is a cloud of tiny insects in the dappled light and a channel of dark water.
import { Kit, disc, halo, particles, surface, tick, SHAPE_SPARK } from '../kit.ts';
import type { BeaconLook } from '../look.ts';

const TOP = 58;

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
      paint: /* glsl */ `vec2 p = vLocal.xz; float r = length(p);
        float spark = pow(bNoise(vec3(p * 1.2, uTime * 0.9)), 8.0) * 6.0;
        float ripple = pow(max(0.0, sin(r * 0.8 - uTime * 0.9)), 10.0) * 0.6;
        glow = (0.1 + spark + ripple) * smoothstep(22.0, 10.0, r);`,
    }));

    // the swarm: a broad cloud in and under the canopy the Gate's tree holds over the channel, flashing in waves that
    // sweep across it; a few stray down round the roots
    k.add(particles(k, {
      count: 700, color: 0xd8ff60, day: 0, night: 3.0, shape: SHAPE_SPARK,
      base: (i, r) => {
        const a = r() * Math.PI * 2, d = Math.sqrt(r()) * 30, y = i % 6 ? TOP - 26 + Math.pow(r(), 0.7) * 34 : 4 + r() * (TOP - 30);
        return [Math.cos(a) * d, y, Math.sin(a) * d * 0.75];
      },
      motion: /* glsl */ `pos += vec3(sin(t * 0.6 + s.x * 30.0), sin(t * 0.8 + s.y * 30.0) * 0.6, cos(t * 0.5 + s.z * 30.0)) * 1.4;
        // waves of light sweeping through, every firefly flashing as one passes
        float wave = fract(t / 4.5 - (pos.x * 0.6 + pos.z * 0.8 + pos.y * 0.3) / 60.0);
        float flash = exp(-pow((wave - 0.5) / 0.03, 2.0)) + 0.25 * exp(-pow((wave - 0.56) / 0.02, 2.0));
        float own = 0.15 * pow(0.5 + 0.5 * sin(t * (1.0 + s.w * 2.0) + s.z * 40.0), 8.0);
        size = 0.09 + 0.16 * flash; alpha = 0.06 + 1.8 * flash + own;`,
    }));

    // a soft glow in the canopy where the swarm is thickest, not a lamp filling the arch
    k.add(halo(k, [0, TOP - 6, 0], 24, 0xc8ff5a, 0, 0.14, '0.8 + 0.35 * exp(-pow((fract(uTime / 4.5) - 0.5) / 0.08, 2.0))', 24));
    k.add(halo(k, [0, TOP - 14, 0], 40, 0xc0ff50, 0, 0.05, '1.0', 36));
    k.setPulse((t) => 0.8 + 0.35 * Math.exp(-((((t / 4.5) % 1) - 0.5) ** 2) / 0.0064));
    return k.root;
  },
};
