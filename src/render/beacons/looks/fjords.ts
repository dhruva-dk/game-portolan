// The Fjords: the Glowfall. A granite crag with a ribbon of glacial meltwater pouring off its lip. By day it is white
// water on grey rock; at night the water carries a cold turquoise light, as if the glacier's melt were alive, and the
// plunge pool and its mist glow at the foot. From far off it is a thin turquoise thread standing on a bright foot.
import * as THREE from 'three';
import { Kit, column, disc, fbm3, halo, lit, merge, noise3, particles, place, strip, surface, tick, SHAPE_PUFF, SHAPE_SPARK } from '../kit.ts';
import type { BeaconLook } from '../look.ts';

const TOP = 57, LIP_Z = 7, FOOT_Z = 13.5;
const smoothstep = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

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

    // the slab: a wide crag of granite, its sides broken into strata that undercut and step back to mossy shelves and
    // split by vertical joints, a talus apron running down under the water at its back and sides, and a notch at the
    // lip where the water leaves
    const slab = column({
      height: 66, radial: 64, rings: 80, seed: seed + 3, bump: 2.4, bumpScale: 0.06, sx: 1.5, sz: 0.75,
      radius: (f) => 13.2 - 2.2 * f + (f > 0.95 ? -2.5 * (f - 0.95) * 20 : 0),
      shape: (x, y, z, _f, a) => {
        const h = y - 6, front = Math.max(0, Math.sin(a));
        const notch = h > 50 ? -2 * Math.exp(-(x * x) / 10) * front * Math.min(1, (h - 50) / 4) : 0;
        // vertical joints split the crag into blocks; in each block the strata sit at their own heights and depths,
        // each band leaning out as it climbs and stepping back at its top, so its top is a shelf
        const ja = a * 4 + Math.sin(h * 0.06) * 0.8 + seed, block = Math.floor(ja / Math.PI);
        const band = (h + 4 * noise3(block * 1.7, 0, 0, seed) + 2.2 * Math.sin(a * 2 + seed)) / (6 + 1.5 * noise3(block * 2.3, 1, 0, seed));
        const amp = 1.7 * (0.65 + 0.35 * noise3(block * 0.9, Math.floor(band) * 0.7, 0, seed + 3));
        const strata = -amp * (1 - (band - Math.floor(band))) ** 2.5 * (1 - 0.6 * front);
        const joint = -2 * (1 - smoothstep(0, 0.3, Math.abs(Math.sin(ja))));
        const apron = 5 * Math.exp(-Math.max(0, h + 4) / 4.5) * (1 - 0.9 * front);
        return notch + strata + joint * (1 - 0.5 * front) + apron + fbm3(x * 0.25, h * 0.25, z * 0.25, seed + 9) * 0.6;
      },
    });
    slab.translate(0, -6, 0);
    // a broken crown: the top rises and falls instead of standing flat
    const sp = slab.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < sp.count; i++) {
      const y = sp.getY(i);
      if (y > 52) sp.setY(i, y + fbm3(sp.getX(i) * 0.12, 0, sp.getZ(i) * 0.12, seed + 5) * 4 * smoothstep(52, 60, y));
    }
    slab.computeVertexNormals();
    const albedo = /* glsl */ `float n = bFbm(vLocal * 0.09), n2 = bFbm(vLocal * vec3(0.5, 0.18, 0.5));
        float speck = smoothstep(0.62, 0.7, bNoise(vLocal * 2.3));
        vec3 g = mix(vec3(0.19, 0.195, 0.2), vec3(0.42, 0.42, 0.4), clamp(n * 0.75 + n2 * 0.45 - 0.1, 0.0, 1.0));
        g = mix(g, vec3(0.1), speck * 0.3);
        // dark streaks where water has run down the faces from the shelves
        float stain = smoothstep(0.5, 0.8, bNoise(vec3(vLocal.x * 0.7, vLocal.y * 0.035, vLocal.z * 0.7)));
        g *= 1.0 - stain * 0.45 * (1.0 - smoothstep(0.3, 0.6, vLN.y));
        // wet and dark where the fall runs, and along the waterline
        float wet = exp(-vLocal.x * vLocal.x / 40.0) * smoothstep(4.0, 9.0, vLocal.z);
        g = mix(g, g * 0.35, wet);
        g *= mix(1.0, 0.5, smoothstep(1.5, -0.5, vLocal.y));
        // yellow-grey lichen on the dry faces, moss and heather on every shelf and over the top
        float lichen = smoothstep(0.58, 0.75, bNoise(vLocal * 0.32 + 7.0)) * (1.0 - wet) * step(1.5, vLocal.y);
        g = mix(g, vec3(0.5, 0.48, 0.3), lichen * 0.45);
        float shelf = smoothstep(0.45, 0.8, vLN.y) * step(0.8, vLocal.y);
        g = mix(g, mix(vec3(0.11, 0.15, 0.08), vec3(0.2, 0.18, 0.11), n2), shelf * (0.7 + 0.3 * smoothstep(20.0, 55.0, vLocal.y)));
        diffuseColor.rgb = g;`;
    const granite = lit(k, {
      color: 0x8a8a86, roughness: 0.9, albedo,
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

    // boulders fallen from the crag, half sunk round its foot, none in the plunge pool
    const stones: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 16; i++) {
      const a = Math.PI * 0.5 + 0.75 + (i / 16) * (Math.PI * 2 - 1.5) + k.r(-0.08, 0.08);
      const r = k.r(1.4, 4.2), d = k.r(0.95, 1.2);
      // faceted, not rounded: granite splits along its joints
      const g = new THREE.IcosahedronGeometry(1, 1);
      const gp = g.attributes.position as THREE.BufferAttribute;
      for (let j = 0; j < gp.count; j++) {
        const f = 1 + fbm3(gp.getX(j) * 1.3, gp.getY(j) * 1.3, gp.getZ(j) * 1.3, seed + 40 + i) * 0.45;
        gp.setXYZ(j, gp.getX(j) * f * k.r(0.95, 1.05), gp.getY(j) * f * 0.6, gp.getZ(j) * f);
      }
      g.computeVertexNormals();
      stones.push(place(g, { x: Math.cos(a) * 19.5 * d, y: r * k.r(-0.1, 0.3), z: Math.sin(a) * 10.5 * d }, new THREE.Euler(k.r(-0.3, 0.3), k.r(0, 6.28), k.r(-0.3, 0.3)), { x: r, y: r, z: r }));
    }
    const boulders = new THREE.Mesh(merge(stones), lit(k, { color: 0x8a8a86, roughness: 0.9, albedo }));
    boulders.castShadow = boulders.receiveShadow = true;
    k.add(boulders);

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
