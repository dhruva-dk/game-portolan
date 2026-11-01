// The Fjords: the Glowfall. A granite slab with a ribbon of glacial meltwater pouring off its lip. By day it is white
// water on grey rock; at night the water carries a cold turquoise light, as if the glacier's melt were alive, and the
// plunge pool and its mist glow at the foot. From far off it is a thin turquoise thread standing on a bright foot.
import * as THREE from 'three';
import { Kit, column, disc, halo, lit, particles, strip, surface, tick, SHAPE_PUFF, SHAPE_SPARK } from '../kit.ts';
import type { BeaconLook } from '../look.ts';

const TOP = 57, LIP_Z = 7, FOOT_Z = 13.5;

export const fjords: BeaconLook = {
  name: 'the Glowfall',
  what: 'A granite slab with a ribbon of glacial meltwater that glows turquoise at night, lighting its plunge pool and mist.',
  color: 0x38f2d8,
  lightHeight: 8,
  height: 60,
  radius: 22,
  ground: 'shore',
  update: tick,
  build(seed) {
    const k = new Kit(seed, 'beacon:fjords');

    // the slab: a wide block of granite with a notch at the lip where the water leaves
    const slab = column({
      height: 60, radial: 22, rings: 30, seed: seed + 3, bump: 1.6, bumpScale: 0.07, sx: 1.5, sz: 0.75,
      radius: (f) => 13.5 - 3 * f + (f > 0.96 ? -2.5 * (f - 0.96) * 25 : 0),
      shape: (x, y, _z, _f, a) => {
        const front = Math.max(0, Math.sin(a));
        const notch = y > 50 ? -2 * Math.exp(-(x * x) / 10) * front * Math.min(1, (y - 50) / 4) : 0;
        const joints = -0.6 * Math.abs(Math.sin(x * 0.55 + Math.sin(y * 0.05) * 1.5)) * front;
        return notch + joints;
      },
    });
    const granite = lit(k, {
      color: 0x8a8a86, roughness: 0.85,
      albedo: /* glsl */ `float n = bFbm(vLocal * 0.09);
        float speck = smoothstep(0.62, 0.7, bNoise(vLocal * 2.3));
        vec3 g = mix(vec3(0.32, 0.32, 0.31), vec3(0.55, 0.55, 0.53), n);
        g = mix(g, vec3(0.2, 0.2, 0.2), speck * 0.25);
        // wet and dark where the fall runs, heather and pine-dark on the top
        float wet = exp(-vLocal.x * vLocal.x / 40.0) * smoothstep(4.0, 9.0, vLocal.z);
        g = mix(g, g * 0.35, wet);
        g = mix(g, vec3(0.16, 0.2, 0.13), smoothstep(0.7, 0.9, vLN.y) * smoothstep(40.0, 55.0, vLocal.y));
        diffuseColor.rgb = g;`,
      rough: `roughnessFactor = mix(roughnessFactor, 0.25, exp(-vLocal.x * vLocal.x / 40.0) * smoothstep(4.0, 9.0, vLocal.z));`,
      emissive: /* glsl */ `// glowing algae streaks in the wet rock beside the fall
        float wet = exp(-vLocal.x * vLocal.x / 60.0) * smoothstep(5.0, 9.0, vLocal.z);
        float streak = smoothstep(0.55, 0.8, bNoise(vec3(vLocal.x * 1.4, vLocal.y * 0.08 + uTime * 0.05, vLocal.z * 0.3)));
        float foot = exp(-max(vLocal.y, 0.0) / 6.0);
        totalEmissiveRadiance += vec3(0.1, 0.9, 0.78) * (wet * (streak * 0.9 + 0.12) + foot * 0.35 * smoothstep(6.0, 12.0, vLocal.z)) * mix(0.0, 1.0, uNight);`,
    });
    const rock = new THREE.Mesh(slab, granite);
    rock.castShadow = rock.receiveShadow = true;
    k.add(rock);

    // the ribbon: a parabola from the lip to the pool, widening as it falls
    const pts: THREE.Vector3[] = [], widths: number[] = [];
    for (let i = 0; i <= 40; i++) {
      const y = TOP - (i / 40) * (TOP + 0.5), drop = TOP - y;
      pts.push(new THREE.Vector3(Math.sin(i * 0.4) * 0.15, y, LIP_Z + 1.5 * Math.sqrt((2 * drop) / 9.8) + drop * 0.02));
      widths.push(4.2 + (drop / TOP) * 5.5);
    }
    const ribbon = surface(k, strip(pts, widths), {
      color: 0x38f2d8, day: 0, night: 2.8, blend: 'alpha', matter: 0xe6f2f2,
      paint: /* glsl */ `float x = vUv.x, v = vUv.y;
        float edge = smoothstep(0.0, 0.2, x) * smoothstep(1.0, 0.8, x);
        float n1 = bNoise(vec3(x * 8.0, v * 0.22 - uTime * 2.4, 0.0));
        float n2 = bNoise(vec3(x * 21.0, v * 0.55 - uTime * 4.3, 3.0));
        float n3 = bNoise(vec3(x * 40.0, v * 1.4 - uTime * 7.0, 9.0));
        float streak = smoothstep(0.35, 0.95, n1 * 0.55 + n2 * 0.35 + n3 * 0.25);
        float body = edge * (0.4 + 0.6 * streak) * smoothstep(0.0, 1.5, v);
        alpha = body * (0.5 + 0.5 * n2);
        col = mix(vec3(0.55, 1.0, 0.92), vec3(1.25), streak * streak * 0.7);
        glow = body * (0.55 + 0.9 * streak);`,
    });
    k.add(ribbon);

    // the plunge pool: rings of light spreading over the water
    const pool = surface(k, disc(16, 0.08), {
      color: 0x38f2d8, day: 0, night: 1.5,
      paint: /* glsl */ `vec2 p = (vUv - 0.5) * 2.0; float r = length(p);
        float ring = 0.5 + 0.5 * sin(r * 26.0 - uTime * 3.2 + bNoise(vec3(p * 3.0, uTime * 0.3)) * 3.0);
        glow = exp(-r * 3.2) * (0.5 + 0.5 * ring) * smoothstep(1.0, 0.7, r);`,
    });
    pool.position.set(0, 0, FOOT_Z);
    k.add(pool);

    // plunge mist: puffs rising and spreading from the foot, white by day and turquoise at night
    k.add(particles(k, {
      count: 110, color: 0x38f2d8, day: 0, night: 0.4, blend: 'alpha', matter: 0xdfe9ea, shape: SHAPE_PUFF,
      motion: /* glsl */ `float life = fract(s.x + t * (0.05 + s.y * 0.05));
        float a = s.z * 6.2831;
        float rr = 1.5 + life * (6.0 + s.w * 7.0);
        pos = vec3(cos(a) * rr, 0.6 + life * (8.0 + s.y * 16.0), ${FOOT_Z.toFixed(1)} + sin(a) * rr * 0.8);
        size = 1.6 + life * 4.5;
        alpha = sin(life * 3.14159) * 0.2;`,
    }));
    // spray: droplets thrown out of the plunge
    k.add(particles(k, {
      count: 140, color: 0x7ffff0, day: 0.0, night: 3.0, shape: SHAPE_SPARK,
      motion: /* glsl */ `float T = 1.6 + s.y; float tt = mod(t + s.x * T, T);
        float a = s.z * 6.2831; float v = 4.0 + s.w * 7.0;
        pos = vec3(cos(a) * v * 0.6 * tt, 0.5 + v * tt - 4.9 * tt * tt, ${FOOT_Z.toFixed(1)} + sin(a) * v * 0.6 * tt);
        size = 0.09 + 0.08 * s.w;
        alpha = step(0.0, pos.y) * (1.0 - tt / T);`,
    }));
    // falling sparks of light down the ribbon, the beacon's detail at 10 m
    k.add(particles(k, {
      count: 90, color: 0xb8fff4, day: 0.0, night: 4.0, shape: SHAPE_SPARK,
      motion: /* glsl */ `float T = 3.4; float tt = mod(t * (0.9 + s.y * 0.3) + s.x * T, T);
        float drop = 4.9 * tt * tt;
        pos = vec3((s.z - 0.5) * (4.0 + drop * 0.09), ${TOP.toFixed(1)} - drop, ${LIP_Z.toFixed(1)} + 1.5 * tt + drop * 0.02 + 0.3);
        size = 0.12; stretch = 3.0 + tt * 3.0; alpha = step(0.5, pos.y) * (0.4 + 0.6 * s.w);`,
    }));

    k.add(halo(k, [0, 4, FOOT_Z], 14, 0x38f2d8, 0, 0.55, '0.9 + 0.1 * sin(uTime * 1.3)', 12));
    k.add(halo(k, [0, 32, LIP_Z + 3], 28, 0x2fd8c4, 0, 0.12, '1.0', 30));
    k.setPulse((t) => 0.9 + 0.1 * Math.sin(t * 1.3));
    return k.root;
  },
};
