// The Spice Isles: the Ember Swarm. Fireflies breed in the flame trees round Spice Cove, and at dusk they pour out over
// the water in a slow wheeling column, thick near the surface and thinning as it climbs, each one flashing ember
// orange. Under them the cove is carpeted with fallen flame-tree petals that catch the light. By day it is a cove of
// floating red petals with blossom drifting down.
import { Kit, disc, halo, particles, surface, tick, SHAPE_SPARK } from '../kit.ts';
import type { BeaconLook } from '../look.ts';

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
      paint: /* glsl */ `vec2 p = vLocal.xz; float r = length(p);
        float petals = smoothstep(0.5, 0.62, bNoise(vec3(p * 1.3, 3.0))) + 0.6 * smoothstep(0.6, 0.7, bNoise(vec3(p * 2.7, 8.0)));
        float drift = smoothstep(0.35, 0.65, bFbm(vec3(p * 0.12 + uTime * 0.01, 1.0)));
        alpha = clamp(petals, 0.0, 1.0) * drift * smoothstep(26.0, 14.0, r) * 0.95;
        col = mix(vec3(1.0, 0.5, 0.3), vec3(1.0, 0.85, 0.4), bNoise(vec3(p * 3.0, 5.0)));
        glow = alpha * (0.25 + exp(-r / 8.0));`,
    }));

    // the swarm: a slow vortex rising off the water, each firefly flashing on its own beat
    k.add(particles(k, {
      count: 600, color: 0xff8a30, day: 0, night: 3.0, shape: SHAPE_SPARK,
      motion: /* glsl */ `float f = mod(s.y * s.y + t * (0.004 + s.z * 0.006), 1.0);
        float y = 1.0 + f * ${(TOP - 1).toFixed(1)};
        float a = s.x * 6.2831 + t * (0.12 + 0.08 * s.w) - f * 2.0;
        float r = (3.0 + s.w * 13.0) * (0.7 + 0.6 * f) + sin(t * 0.7 + s.z * 30.0) * 1.2;
        pos = vec3(cos(a) * r, y + sin(t * 1.3 + s.x * 40.0) * 0.6, sin(a) * r);
        float beat = fract(t / (1.6 + s.z * 2.2) + s.w);
        float flash = exp(-pow((beat - 0.1) / 0.05, 2.0));
        col = mix(vec3(1.0, 0.45, 0.12), vec3(1.0, 0.8, 0.35), flash);
        size = 0.1 + 0.18 * flash; alpha = (0.12 + 1.6 * flash) * smoothstep(1.0, 0.75, f);`,
    }));

    // blossom drifting down out of the trees: red matter by day, catching the swarm's light at night
    k.add(particles(k, {
      count: 90, color: 0xff7a40, day: 0, night: 0.25, blend: 'alpha', matter: 0xd0301c,
      base: (_i, r) => { const a = r() * Math.PI * 2, d = 4 + r() * 18; return [Math.cos(a) * d, 0, Math.sin(a) * d]; },
      motion: /* glsl */ `float f = fract(s.y + t * (0.02 + s.z * 0.02));
        pos.y = 34.0 * (1.0 - f);
        pos.x += sin(t * 0.9 + s.w * 20.0) * 1.5 + f * 6.0; pos.z += cos(t * 0.7 + s.x * 20.0) * 1.5;
        size = 0.18 + s.w * 0.12; alpha = 0.9 * smoothstep(0.0, 0.05, f) * smoothstep(1.0, 0.95, f);`,
      renderOrder: 9,
    }));

    k.add(halo(k, [0, 8, 0], 22, 0xff7a2a, 0, 0.38, '0.88 + 0.12 * sin(uTime * 0.5)', 20));
    k.add(halo(k, [0, TOP * 0.55, 0], 36, 0xff8a3a, 0, 0.12, '1.0', 36));
    k.setPulse((t) => 0.88 + 0.12 * Math.sin(t * 0.5));
    return k.root;
  },
};
