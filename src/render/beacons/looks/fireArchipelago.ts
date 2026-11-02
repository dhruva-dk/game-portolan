// The Fire Archipelago: the Caldera Vent. In the flooded heart of Cinder Peak a black spatter cone stands out of the
// water, its throat full of lava that fountains and spits. Where it meets the lake, steam boils up in a column that
// climbs out over the caldera rim, lit orange from below at night. By day it is a smoking black cone in a steaming lake.
import * as THREE from 'three';
import { Kit, disc, halo, lit, mound, particles, surface, tick, SHAPE_FLAME, SHAPE_PUFF, SHAPE_SPARK } from '../kit.ts';
import type { BeaconLook } from '../look.ts';

const TOP = 145;
const CONE = 7;

export const fireArchipelago: BeaconLook = {
  name: 'the Caldera Vent',
  what: 'A black spatter cone in the flooded caldera, fountaining lava, its steam column lit orange from below.',
  color: 0xff5a1a,
  lightHeight: CONE + 2,
  height: TOP,
  radius: 12,
  ground: 'sea',
  update: tick,
  build(seed) {
    const k = new Kit(seed, 'beacon:fireArchipelago');

    // the cone: black lava rock with a lava-filled throat and glowing cracks down its flanks
    const cone = mound(12, CONE + 4, {
      seed: seed + 3, bump: 0.9, bumpScale: 0.35, segs: 48,
      profile: (d) => (d < 0.25 ? 1 - 0.35 * (1 - d / 0.25) ** 2 : Math.max(0, Math.cos((Math.min(1, (d - 0.25) / 0.75) * Math.PI) / 2)) ** 1.2),
    });
    cone.translate(0, -4, 0);
    const rock = lit(k, {
      color: 0x1d1a19, roughness: 0.95, flat: true,
      albedo: `diffuseColor.rgb = mix(vec3(0.05, 0.045, 0.045), vec3(0.16, 0.13, 0.12), bNoise(vLocal * 1.2));`,
      emissive: /* glsl */ `float r = length(vLocal.xz);
        float throat = smoothstep(3.6, 2.4, r) * smoothstep(${(CONE - 3).toFixed(1)}, ${(CONE - 1).toFixed(1)}, vLocal.y);
        float crack = smoothstep(0.78, 0.86, bNoise(vec3(atan(vLocal.z, vLocal.x) * 5.0, vLocal.y * 0.6, 3.0)));
        float churn = 0.7 + 0.3 * bNoise(vec3(vLocal.xz * 0.8, uTime * 0.7));
        vec3 lava = mix(vec3(1.0, 0.25, 0.03), vec3(1.0, 0.7, 0.2), churn);
        totalEmissiveRadiance += lava * (throat * 6.0 * churn + crack * 1.4 * smoothstep(-1.0, 3.0, vLocal.y)) * mix(0.5, 1.0, uNight);`,
    });
    k.add(new THREE.Mesh(cone, rock));

    // the lake round the cone, glowing where lava runs in
    k.add(surface(k, disc(22, 0.1, 64), {
      color: 0xff5a1a, day: 0.15, night: 0.6,
      paint: /* glsl */ `float r = length(vLocal.xz);
        float flow = smoothstep(0.62, 0.75, bNoise(vec3(atan(vLocal.z, vLocal.x) * 2.0, r * 0.15 - uTime * 0.1, 4.0)));
        glow = (exp(-(r - 10.0) * (r - 10.0) / 8.0) * (0.4 + flow * 1.5)) * smoothstep(22.0, 12.0, r);`,
    }));

    // the fountain: tongues of lava thrown up out of the throat
    k.add(particles(k, {
      count: 120, color: 0xff7a24, day: 1.2, night: 3.2, shape: SHAPE_FLAME,
      motion: /* glsl */ `float life = fract(s.y + t * (0.5 + s.z * 0.6));
        float a = s.x * 6.2831, v = 5.0 + s.w * 9.0;
        pos = vec3(cos(a) * life * 2.5, ${CONE.toFixed(1)} + v * life - 9.0 * life * life, sin(a) * life * 2.5);
        col = mix(vec3(1.0, 0.85, 0.4), vec3(1.0, 0.3, 0.05), life);
        size = 0.6 + 0.8 * (1.0 - life); alpha = smoothstep(0.0, 0.05, life) * (1.0 - life);`,
    }));

    // the steam: a boiling column climbing out over the rim, lit orange from below at night
    k.add(particles(k, {
      count: 70, color: 0xff6a20, day: 0.04, night: 0.5, blend: 'alpha', matter: 0x9a958e, shape: SHAPE_PUFF,
      motion: /* glsl */ `float f = fract(s.y + t * (0.012 + s.z * 0.01));
        float y = ${CONE.toFixed(1)} + f * ${(TOP - CONE).toFixed(1)};
        pos = vec3(sin(t * 0.08 + s.x * 6.28) * (2.0 + f * 16.0) + f * 18.0, y, cos(t * 0.07 + s.w * 6.28) * (2.0 + f * 14.0));
        // the lava lights the column from below, fading to ash-grey steam high over the rim
        col = vec3(exp(-f * 2.5));
        size = 5.0 + f * 22.0 + s.w * 5.0; alpha = 0.32 * smoothstep(0.0, 0.06, f) * (1.0 - f);`,
      renderOrder: 9,
    }));

    // embers riding the updraught
    k.add(particles(k, {
      count: 200, color: 0xffa040, day: 0.3, night: 2.6, shape: SHAPE_SPARK,
      motion: /* glsl */ `float f = fract(s.y + t * (0.03 + s.z * 0.04));
        pos = vec3(sin(t * 0.5 + s.x * 30.0) * (1.5 + f * 12.0) + f * 14.0, ${CONE.toFixed(1)} + f * 90.0, cos(t * 0.4 + s.w * 30.0) * (1.5 + f * 10.0));
        float tw = pow(0.5 + 0.5 * sin(t * (2.0 + s.z * 5.0) + s.w * 70.0), 3.0);
        size = 0.1 + 0.16 * tw; alpha = (0.4 + 0.9 * tw) * (1.0 - f);`,
    }));

    k.add(halo(k, [0, CONE + 3, 0], 22, 0xff5a1a, 0.08, 0.6, '0.85 + 0.15 * bNoise(vec3(uTime * 1.3, 0.0, 0.0))', 18));
    k.add(halo(k, [3, 30, 0], 40, 0xff6a24, 0, 0.08, '1.0', 40));
    k.setPulse((t) => 0.85 + 0.15 * Math.sin(t * 1.3) * Math.sin(t * 0.37));
    return k.root;
  },
};
