// The Fire Archipelago: the Caldera Vent. In the flooded heart of Cinder Peak a black spatter cone stands out of the
// water, its throat full of lava that fountains and spits. Where it meets the lake, steam boils up in a column that
// climbs out over the caldera rim, lit orange from below at night. By day it is a smoking black cone in a steaming lake.
import * as THREE from 'three';
import { Kit, disc, halo, lit, mound, particles, surface, tick, SHAPE_FLAME, SHAPE_PUFF, SHAPE_SPARK } from '../kit.ts';
import type { BeaconLook } from '../look.ts';
import { atan, cos, exp, fract, length, mix, pow, sin, smoothstep, vec3 } from 'three/tsl';
import { bNoise, shapeFlame, shapePuff, shapeSpark } from '../nodes.ts';

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
      albedoNode: ({ local: L }) => mix(vec3(0.05, 0.045, 0.045), vec3(0.16, 0.13, 0.12), bNoise(L.mul(1.2))),
      emissiveNode: ({ local: L, t, night }) => {
        const r = length(L.xz);
        const throat = smoothstep(3.6, 2.4, r).mul(smoothstep(CONE - 3, CONE - 1, L.y));
        const crack = smoothstep(0.78, 0.86, bNoise(vec3(atan(L.z, L.x).mul(5), L.y.mul(0.6), 3)));
        const churn = bNoise(vec3(L.xz.mul(0.8), t.mul(0.7))).mul(0.3).add(0.7);
        const lava = mix(vec3(1, 0.25, 0.03), vec3(1, 0.7, 0.2), churn);
        return lava.mul(throat.mul(6).mul(churn).add(crack.mul(1.4).mul(smoothstep(-1, 3, L.y)))).mul(mix(0.5, 1, night));
      },
    });
    k.add(new THREE.Mesh(cone, rock));

    // the lake round the cone, glowing where lava runs in
    k.add(surface(k, disc(22, 0.1, 64), {
      color: 0xff5a1a, day: 0.15, night: 0.6,
      paint: /* glsl */ `float r = length(vLocal.xz);
        float flow = smoothstep(0.62, 0.75, bNoise(vec3(atan(vLocal.z, vLocal.x) * 2.0, r * 0.15 - uTime * 0.1, 4.0)));
        glow = (exp(-(r - 10.0) * (r - 10.0) / 8.0) * (0.4 + flow * 1.5)) * smoothstep(22.0, 12.0, r);`,
      paintNode: ({ local: L, t }) => {
        const r = length(L.xz), dr = r.sub(10);
        const flow = smoothstep(0.62, 0.75, bNoise(vec3(atan(L.z, L.x).mul(2), r.mul(0.15).sub(t.mul(0.1)), 4)));
        return { glow: exp(dr.mul(dr).div(-8)).mul(flow.mul(1.5).add(0.4)).mul(smoothstep(22, 12, r)) };
      },
    }));

    // the fountain: tongues of lava thrown up out of the throat
    k.add(particles(k, {
      count: 120, color: 0xff7a24, day: 1.2, night: 3.2, shape: SHAPE_FLAME,
      motion: /* glsl */ `float life = fract(s.y + t * (0.5 + s.z * 0.6));
        float a = s.x * 6.2831, v = 5.0 + s.w * 9.0;
        pos = vec3(cos(a) * life * 2.5, ${CONE.toFixed(1)} + v * life - 9.0 * life * life, sin(a) * life * 2.5);
        col = mix(vec3(1.0, 0.85, 0.4), vec3(1.0, 0.3, 0.05), life);
        size = 0.6 + 0.8 * (1.0 - life); alpha = smoothstep(0.0, 0.05, life) * (1.0 - life);`,
      shapeNode: shapeFlame,
      motionNode: ({ s, t }) => {
        const life = fract(s.y.add(t.mul(s.z.mul(0.6).add(0.5)))), a = s.x.mul(6.2831), v = s.w.mul(9).add(5);
        return {
          pos: vec3(cos(a).mul(life).mul(2.5), v.mul(life).sub(life.mul(life).mul(9)).add(CONE), sin(a).mul(life).mul(2.5)),
          col: mix(vec3(1, 0.85, 0.4), vec3(1, 0.3, 0.05), life),
          size: life.oneMinus().mul(0.8).add(0.6), alpha: smoothstep(0, 0.05, life).mul(life.oneMinus()),
        };
      },
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
      shapeNode: shapePuff,
      motionNode: ({ s, t }) => {
        const f = fract(s.y.add(t.mul(s.z.mul(0.01).add(0.012))));
        return {
          pos: vec3(sin(t.mul(0.08).add(s.x.mul(6.28))).mul(f.mul(16).add(2)).add(f.mul(18)), f.mul(TOP - CONE).add(CONE), cos(t.mul(0.07).add(s.w.mul(6.28))).mul(f.mul(14).add(2))),
          col: vec3(exp(f.mul(-2.5))),
          size: f.mul(22).add(5).add(s.w.mul(5)), alpha: smoothstep(0, 0.06, f).mul(f.oneMinus()).mul(0.32),
        };
      },
      renderOrder: 9,
    }));

    // embers riding the updraught
    k.add(particles(k, {
      count: 200, color: 0xffa040, day: 0.3, night: 2.6, shape: SHAPE_SPARK,
      motion: /* glsl */ `float f = fract(s.y + t * (0.03 + s.z * 0.04));
        pos = vec3(sin(t * 0.5 + s.x * 30.0) * (1.5 + f * 12.0) + f * 14.0, ${CONE.toFixed(1)} + f * 90.0, cos(t * 0.4 + s.w * 30.0) * (1.5 + f * 10.0));
        float tw = pow(0.5 + 0.5 * sin(t * (2.0 + s.z * 5.0) + s.w * 70.0), 3.0);
        size = 0.1 + 0.16 * tw; alpha = (0.4 + 0.9 * tw) * (1.0 - f);`,
      shapeNode: shapeSpark,
      motionNode: ({ s, t }) => {
        const f = fract(s.y.add(t.mul(s.z.mul(0.04).add(0.03))));
        const tw = pow(sin(t.mul(s.z.mul(5).add(2)).add(s.w.mul(70))).mul(0.5).add(0.5), 3);
        return {
          pos: vec3(sin(t.mul(0.5).add(s.x.mul(30))).mul(f.mul(12).add(1.5)).add(f.mul(14)), f.mul(90).add(CONE), cos(t.mul(0.4).add(s.w.mul(30))).mul(f.mul(10).add(1.5))),
          size: tw.mul(0.16).add(0.1), alpha: tw.mul(0.9).add(0.4).mul(f.oneMinus()),
        };
      },
    }));

    k.add(halo(k, [0, CONE + 3, 0], 22, 0xff5a1a, 0.08, 0.6, '0.85 + 0.15 * bNoise(vec3(uTime * 1.3, 0.0, 0.0))', 18, '',
      ({ t }) => bNoise(vec3(t.mul(1.3), 0, 0)).mul(0.15).add(0.85)));
    k.add(halo(k, [3, 30, 0], 40, 0xff6a24, 0, 0.08, '1.0', 40));
    k.setPulse((t) => 0.85 + 0.15 * Math.sin(t * 1.3) * Math.sin(t * 0.37));
    return k.root;
  },
};
