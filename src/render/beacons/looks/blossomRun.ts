// Blossom Run: the Firefly Cherry. An old cherry in full bloom on a grassy knoll. At night fireflies gather to it in
// thousands, swarming through the crown and rising above it in a slow spiral, flashing together in waves the way
// synchronous fireflies do, and the blossom glows pink in their light while petals drift down. By day it is a cherry
// in bloom shedding petals. From far off: a pink glow under a tall spiral of yellow-green sparks.
import * as THREE from 'three';
import { Kit, halo, lit, mat4, merge, mound, noise3, particles, smooth, tick, tube, SHAPE_SPARK } from '../kit.ts';
import type { BeaconLook } from '../look.ts';

const KNOLL = 4;
const SWAY = /* glsl */ `vec3 treeSway(vec3 p) { float h = max(0.0, p.y - 6.0) / 14.0;
  return vec3(sin(uTime * 0.9 + p.y * 0.2) * 0.25, 0.0, cos(uTime * 0.7 + p.x * 0.2) * 0.2) * h * h; }`;
// the synchronised flash: a wave that rolls out from the tree and up the spiral
const BLINK = /* glsl */ `float flyBlink(vec3 p, float t, float jitter) {
  float ph = t * 0.55 - length(p.xz) * 0.035 - p.y * 0.02 + jitter * 0.12;
  float burst = smoothstep(0.35, 0.0, abs(fract(ph * 0.25) - 0.25));
  return pow(max(0.0, sin(ph * 6.2831 * 1.6)), 10.0) * (0.25 + 0.75 * burst); }`;

export const blossomRun: BeaconLook = {
  name: 'the Firefly Cherry',
  what: 'An old cherry in bloom where fireflies gather in thousands at night, spiralling above it and flashing together in waves.',
  color: 0xd8ff50,
  lightHeight: 12,
  height: 60,
  radius: 18,
  ground: 'shore',
  update: tick,
  build(seed) {
    const k = new Kit(seed, 'beacon:blossomRun');

    k.add(new THREE.Mesh(mound(18, KNOLL, { seed: seed + 1, bump: 0.35, bumpScale: 0.15 }), lit(k, {
      color: 0x4f7a2c, roughness: 0.95,
      albedo: /* glsl */ `vec3 c = mix(vec3(0.16, 0.3, 0.07), vec3(0.32, 0.45, 0.12), bFbm(vLocal * 0.5));
        c = mix(c, vec3(0.9, 0.62, 0.72), smoothstep(0.62, 0.72, bNoise(vLocal * 1.7)) * 0.6);
        c = mix(c, vec3(0.3, 0.27, 0.22), smoothstep(1.0, 0.0, vLocal.y));
        diffuseColor.rgb = c;`,
      emissive: `totalEmissiveRadiance += vec3(0.6, 0.9, 0.2) * exp(-length(vLocal.xz) / 6.0) * 0.08 * uNight;`,
    })));

    // the tree: a short thick trunk splitting into wide, low limbs
    const wood: THREE.BufferGeometry[] = [];
    const tips: THREE.Vector3[] = [];
    const grow = (p0: THREE.Vector3, dir: THREE.Vector3, len: number, r: number, depth: number) => {
      const bend = new THREE.Vector3(k.r(-1, 1), k.r(-0.2, 0.6), k.r(-1, 1)).multiplyScalar(len * 0.12);
      const p1 = p0.clone().addScaledVector(dir, len);
      const mid = p0.clone().lerp(p1, 0.5).add(bend);
      wood.push(tube([p0, mid, p1], r, r * 0.68, depth > 2 ? 9 : 6, 6));
      if (depth === 0) { tips.push(p1); return; }
      const n = depth >= 3 ? 3 : 2;
      for (let i = 0; i < n; i++) {
        const turn = new THREE.Vector3(k.r(-1, 1), 0, k.r(-1, 1)).normalize();
        const d = dir.clone().addScaledVector(turn, k.r(0.5, 0.95)).add(new THREE.Vector3(0, depth < 2 ? 0.25 : 0.05, 0)).normalize();
        grow(p1, d, len * k.r(0.66, 0.8), r * 0.64, depth - 1);
      }
      if (depth <= 2) tips.push(p1);
    };
    grow(new THREE.Vector3(0, KNOLL - 0.8, 0), new THREE.Vector3(0.1, 1, 0).normalize(), 5.2, 0.95, 4);
    const bark = lit(k, {
      color: 0x3a2a26, roughness: 0.9, defs: SWAY, vertex: 'transformed += treeSway(vLocal);',
      albedo: `diffuseColor.rgb = mix(vec3(0.09, 0.06, 0.055), vec3(0.22, 0.15, 0.13), bNoise(vec3(vLocal.x * 3.0, vLocal.y * 0.6, vLocal.z * 3.0)));`,
      emissive: `totalEmissiveRadiance += vec3(0.7, 0.9, 0.25) * fres * 0.08 * uNight;`,
    });
    const tree = new THREE.Mesh(merge(wood), bark);
    tree.castShadow = true;
    k.add(tree);

    // the blossom: lumpy clouds of flowers round every tip
    const puff = new THREE.IcosahedronGeometry(1, 2);
    const pp = puff.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pp.count; i++) {
      const v = new THREE.Vector3().fromBufferAttribute(pp, i);
      v.multiplyScalar(1 + 0.28 * noise3(v.x * 2.2, v.y * 2.2, v.z * 2.2, 5));
      pp.setXYZ(i, v.x, v.y, v.z);
    }
    const puffGeo = smooth(puff);
    const ms: THREE.Matrix4[] = [];
    for (const t of tips) {
      const n = 2 + Math.floor(k.r(0, 3));
      for (let i = 0; i < n; i++) {
        const s = k.r(1.0, 2.0);
        ms.push(mat4(t.x + k.r(-1.4, 1.4), t.y + k.r(-0.6, 1.0), t.z + k.r(-1.4, 1.4), k.r(0, 3), k.r(0, 3), 0, [s * 1.2, s * 0.8, s * 1.2]));
      }
    }
    const bloom = new THREE.InstancedMesh(puffGeo, lit(k, {
      color: 0xf2a7c3, roughness: 0.85, defs: SWAY, vertex: 'transformed += inverse(mat3(instanceMatrix)) * treeSway(vLocal);',
      albedo: /* glsl */ `float n = bNoise(vLocal * 3.5);
        diffuseColor.rgb = mix(vec3(0.85, 0.42, 0.58), vec3(1.0, 0.86, 0.92), n);
        diffuseColor.rgb *= 0.75 + 0.25 * smoothstep(0.4, 0.7, bNoise(vLocal * 9.0));`,
      emissive: /* glsl */ `// the fireflies' light on the petals, flaring with their waves
        float wave = 0.5 + 0.5 * sin(uTime * 0.55 * 6.2831 * 0.4 - length(vLocal.xz) * 0.1);
        totalEmissiveRadiance += vec3(1.0, 0.45, 0.65) * (0.22 + 0.25 * wave + fres * 0.3) * uNight;`,
    }), ms.length);
    ms.forEach((m, i) => bloom.setMatrixAt(i, m));
    bloom.castShadow = true;
    bloom.frustumCulled = false;
    k.add(bloom);

    // the swarm in and round the crown
    const crownTop = Math.max(...tips.map((t) => t.y));
    k.add(particles(k, {
      count: 420, color: 0xd8ff50, day: 0, night: 6.0, shape: SHAPE_SPARK, defs: BLINK,
      base: (_i, r) => {
        const a = r() * Math.PI * 2, d = Math.sqrt(r()) * 13;
        return [Math.cos(a) * d, KNOLL + 1 + r() * (crownTop - KNOLL + 4), Math.sin(a) * d];
      },
      motion: /* glsl */ `pos += vec3(sin(t * (0.3 + s.x * 0.4) + s.y * 20.0), sin(t * (0.25 + s.z * 0.3) + s.w * 20.0) * 0.6,
          cos(t * (0.28 + s.w * 0.35) + s.x * 20.0)) * (0.8 + s.z * 1.6);
        float b = flyBlink(pos, t, s.w);
        size = 0.1 + 0.16 * b; alpha = 0.05 + b;`,
    }));
    // the spiral: fireflies climbing in a loose helix above the tree
    k.add(particles(k, {
      count: 300, color: 0xd8ff50, day: 0, night: 6.0, shape: SHAPE_SPARK, defs: BLINK,
      motion: /* glsl */ `float Hh = 60.0 - ${crownTop.toFixed(1)};
        float y = mod(s.y * Hh + t * (0.5 + s.z * 0.4), Hh);
        float a = s.x * 6.2831 + y * 0.16 + t * 0.12;
        float r = 3.0 + 6.0 * (1.0 - y / Hh) + s.w * 3.5;
        pos = vec3(cos(a) * r, ${crownTop.toFixed(1)} + y, sin(a) * r) + vec3(sin(t + s.w * 30.0), 0.0, cos(t * 1.1 + s.z * 30.0)) * 0.7;
        float b = flyBlink(pos, t, s.w);
        size = 0.12 + 0.16 * b; alpha = (0.05 + b) * smoothstep(Hh, Hh - 15.0, y);`,
    }));
    // petals drifting down
    k.add(particles(k, {
      count: 170, color: 0xff9ac8, day: 0, night: 0.5, blend: 'alpha', matter: 0xf6c4d6,
      shape: 'shape = smoothstep(1.0, 0.6, r2 + abs(c.x * c.y) * 0.8);',
      base: (_i, r) => { const a = r() * Math.PI * 2, d = Math.sqrt(r()) * 11; return [Math.cos(a) * d, 0, Math.sin(a) * d]; },
      motion: /* glsl */ `float T = 9.0 + s.y * 6.0; float tt = mod(t + s.x * T, T);
        float y = ${(crownTop + 1).toFixed(1)} - tt * 1.4;
        pos += vec3(sin(tt * 1.3 + s.z * 9.0) * 1.2 + tt * 0.6, y, cos(tt * 1.1 + s.w * 9.0) * 1.0);
        size = 0.13; alpha = step(${KNOLL.toFixed(1)}, pos.y - length(pos.xz) * 0.12) * 0.95;
        dir = vec3(sin(tt * 4.0 + s.z * 9.0), 0.4, cos(tt * 3.0)); stretch = 0.6;`,
    }));

    k.add(halo(k, [0, crownTop - 2, 0], 17, 0xffa0c8, 0, 0.32, '0.85 + 0.15 * sin(uTime * 1.2)', 14));
    k.add(halo(k, [0, 38, 0], 30, 0xc8f050, 0, 0.11, '1.0', 30));
    k.setPulse((t) => 0.75 + 0.25 * Math.max(0, Math.sin(t * 0.55 * Math.PI * 2 * 1.6)) ** 4);
    return k.root;
  },
};
