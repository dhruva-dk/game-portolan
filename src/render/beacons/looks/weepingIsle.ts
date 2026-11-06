// The Weeping Isle: the Moss Spring. On the crown of the Isle, where its hundred falls begin, a spring wells up among
// boulders deep in moss. At night the moss glows pale green-white, the spring shines up through the cloud that sits on
// the summit, and luminous droplets spill away from it toward the cliffs: the cloud cap glows like a lamp-lit fog
// from far off. By day it is a ring of mossy boulders round a clear spring in the mist.
import * as THREE from 'three';
import { Kit, disc, halo, lit, merge, mound, particles, place, surface, tick, SHAPE_PUFF, SHAPE_SPARK } from '../kit.ts';
import type { BeaconLook } from '../look.ts';
import { cos, exp, fract, length, mix, pow, sin, smoothstep, vec3 } from 'three/tsl';
import { bFbm, bNoise, shapePuff, shapeSpark, type F, type V3 } from '../nodes.ts';

const mossy = (L: V3, ln: V3): F => smoothstep(0.35, 0.6, bFbm(L.mul(0.6)).add(ln.y.mul(0.4)));

export const weepingIsle: BeaconLook = {
  name: 'the Moss Spring',
  what: 'A spring among boulders deep in glowing moss on the Isle\'s crown, shining up through the cloud that sits on the summit.',
  color: 0x9fffc8,
  lightHeight: 3,
  height: 58,
  radius: 14,
  ground: 'shore',
  update: tick,
  build(seed) {
    const k = new Kit(seed, 'beacon:weepingIsle');

    // the boulders round the spring, swallowed in moss
    const stones: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 11; i++) {
      const a = (i / 11) * Math.PI * 2 + k.r(-0.25, 0.25), d = k.r(5.5, 9), r = k.r(1.6, 3.4);
      const g = mound(r, r * k.r(0.8, 1.4), { seed: seed + i, bump: 0.5, bumpScale: 0.7, segs: 18 });
      stones.push(place(g, { x: Math.cos(a) * d, y: -0.6, z: Math.sin(a) * d }));
    }
    const moss = lit(k, {
      color: 0x3f7a3a, roughness: 0.95,
      albedo: /* glsl */ `float m = smoothstep(0.35, 0.6, bFbm(vLocal * 0.6) + vLN.y * 0.4);
        diffuseColor.rgb = mix(vec3(0.24, 0.25, 0.22), mix(vec3(0.16, 0.38, 0.12), vec3(0.3, 0.55, 0.2), bNoise(vLocal * 2.0)), m);`,
      emissive: /* glsl */ `float m = smoothstep(0.35, 0.6, bFbm(vLocal * 0.6) + vLN.y * 0.4);
        float spot = pow(bNoise(vLocal * 3.0 + vec3(0.0, uTime * 0.05, 0.0)), 2.0);
        float breathe = 0.75 + 0.25 * sin(uTime * 0.5 + length(vLocal.xz) * 0.4);
        totalEmissiveRadiance += vec3(0.55, 1.0, 0.7) * m * (0.4 + spot * 2.2) * breathe * uNight;`,
      albedoNode: ({ local: L, ln }) =>
        mix(vec3(0.24, 0.25, 0.22), mix(vec3(0.16, 0.38, 0.12), vec3(0.3, 0.55, 0.2), bNoise(L.mul(2))), mossy(L, ln)),
      emissiveNode: ({ local: L, ln, t, night }) => {
        const spot = pow(bNoise(L.mul(3).add(vec3(0, t.mul(0.05), 0))), 2);
        const breathe = sin(t.mul(0.5).add(length(L.xz).mul(0.4))).mul(0.25).add(0.75);
        return vec3(0.55, 1, 0.7).mul(mossy(L, ln)).mul(spot.mul(2.2).add(0.4)).mul(breathe).mul(night);
      },
    });
    k.add(new THREE.Mesh(merge(stones), moss));

    // the spring, shining up from below
    k.add(surface(k, disc(5.5, 0.15, 40), {
      color: 0xb8ffe0, day: 0.06, night: 0.9,
      paint: /* glsl */ `float r = length(vLocal.xz);
        float well = 0.6 + 0.4 * sin(r * 3.0 - uTime * 1.6);
        glow = (exp(-r / 2.0) * 1.8 + well * 0.3) * smoothstep(5.5, 4.0, r);`,
      paintNode: ({ local, t }) => {
        const r = length(local.xz), well = sin(r.mul(3).sub(t.mul(1.6))).mul(0.4).add(0.6);
        return { glow: exp(r.div(-2)).mul(1.8).add(well.mul(0.3)).mul(smoothstep(5.5, 4, r)) };
      },
    }));

    // luminous droplets spilling away over the summit toward the cliffs
    k.add(particles(k, {
      count: 180, color: 0xc0ffe0, day: 0, night: 2.2, shape: SHAPE_SPARK,
      motion: /* glsl */ `float f = fract(s.y + t * (0.05 + s.z * 0.05));
        float a = s.x * 6.2831, r = 4.0 + f * 16.0;
        pos = vec3(cos(a) * r, 0.4 - f * f * 6.0 + sin(f * 9.0 + s.w * 6.0) * 0.2, sin(a) * r);
        float tw = pow(0.5 + 0.5 * sin(t * (1.5 + s.z * 2.5) + s.w * 50.0), 3.0);
        size = 0.07 + 0.08 * tw; alpha = (0.3 + 0.8 * tw) * (1.0 - f);`,
      shapeNode: shapeSpark,
      motionNode: ({ s, t }) => {
        const f = fract(s.y.add(t.mul(s.z.mul(0.05).add(0.05)))), a = s.x.mul(6.2831), r = f.mul(16).add(4);
        const tw = pow(sin(t.mul(s.z.mul(2.5).add(1.5)).add(s.w.mul(50))).mul(0.5).add(0.5), 3);
        return {
          pos: vec3(cos(a).mul(r), f.mul(f).mul(-6).add(0.4).add(sin(f.mul(9).add(s.w.mul(6))).mul(0.2)), sin(a).mul(r)),
          size: tw.mul(0.08).add(0.07), alpha: tw.mul(0.8).add(0.3).mul(f.oneMinus()),
        };
      },
    }));

    // the cloud on the summit, lit from inside at night
    k.add(particles(k, {
      count: 30, color: 0x8affc0, day: 0, night: 0.45, blend: 'alpha', matter: 0xd4dbd8, shape: SHAPE_PUFF,
      base: (i, r) => { const a = r() * Math.PI * 2, d = r() * 16; return [Math.cos(a) * d, 6 + (i % 10) * 4.6, Math.sin(a) * d]; },
      motion: /* glsl */ `pos.x += sin(t * 0.05 + s.x * 6.28) * 5.0; pos.z += cos(t * 0.04 + s.y * 6.28) * 5.0;
        size = 9.0 + s.z * 9.0; alpha = 0.3 * (1.0 - pos.y / 58.0);`,
      shapeNode: shapePuff,
      motionNode: ({ s, pos, t }) => ({
        pos: vec3(pos.x.add(sin(t.mul(0.05).add(s.x.mul(6.28))).mul(5)), pos.y, pos.z.add(cos(t.mul(0.04).add(s.y.mul(6.28))).mul(5))),
        size: s.z.mul(9).add(9), alpha: pos.y.div(58).oneMinus().mul(0.3),
      }),
      renderOrder: 9,
    }));

    k.add(halo(k, [0, 3, 0], 16, 0xa8ffd0, 0, 0.5, '0.85 + 0.15 * sin(uTime * 0.5)', 14, '', ({ t }) => sin(t.mul(0.5)).mul(0.15).add(0.85)));
    // the cloud cap's glow stands well over the summit, so it shows from the sea below the crown's rim
    k.add(halo(k, [0, 40, 0], 56, 0x90ffc0, 0, 0.32, '1.0', 52));
    k.setPulse((t) => 0.85 + 0.15 * Math.sin(t * 0.5));
    return k.root;
  },
};
