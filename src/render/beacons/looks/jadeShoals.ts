// The Jade Shoals: the Sandbar Light. The crest of the tallest dune is glass sand, fused here and there by old
// lightning into crooked glass roots that stand out of it. By day it glitters amber and jade in the sun. At night the
// sand glows from within in drifting veins of gold, the glass roots burn green-gold, and the wind lifts glowing grains
// off the crest in a long streamer: a warm light high on the dune that reads across the flat sandbars.
import * as THREE from 'three';
import { Kit, halo, lit, merge, mound, particles, tick, tube, SHAPE_SPARK } from '../kit.ts';
import type { BeaconLook } from '../look.ts';

export const jadeShoals: BeaconLook = {
  name: 'the Sandbar Light',
  what: 'Glass sand on the crest of the tallest dune, glowing gold from within, with lightning-glass roots standing out of it.',
  color: 0xffc860,
  lightHeight: 3,
  height: 22,
  radius: 13,
  ground: 'shore',
  update: tick,
  build(seed) {
    const k = new Kit(seed, 'beacon:jadeShoals');

    // the crest: a low cap of glass sand, rippled by the wind
    const crest = mound(13, 2, { seed: seed + 2, bump: 0.5, bumpScale: 0.2, segs: 56 });
    const sand = lit(k, {
      color: 0xe0b060, roughness: 0.6,
      albedo: /* glsl */ `float ripple = 0.5 + 0.5 * sin(vLocal.x * 1.6 + bNoise(vLocal * 0.3) * 4.0);
        diffuseColor.rgb = mix(vec3(0.7, 0.5, 0.22), vec3(0.86, 0.68, 0.34), ripple * 0.6 + 0.4 * bNoise(vLocal * 2.0));`,
      rough: `roughnessFactor = mix(0.25, 0.75, bNoise(vLocal * 6.0));`,
      emissive: /* glsl */ `float vein = smoothstep(0.55, 0.75, bFbm(vec3(vLocal.xz * 0.18, uTime * 0.05)));
        float glint = pow(bNoise(vec3(vLocal.xz * 4.0, uTime * 1.5)), 10.0) * 6.0;
        float d = length(vLocal.xz);
        totalEmissiveRadiance += vec3(1.0, 0.72, 0.28) * ((vein * 1.3 + 0.25) * smoothstep(13.0, 4.0, d) + glint) * uNight
          + vec3(1.0, 0.9, 0.6) * glint * 0.15 * (1.0 - uNight);`,
    });
    k.add(new THREE.Mesh(crest, sand));

    // the lightning glass: crooked hollow roots of fused sand standing out of the crest
    const roots: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 9; i++) {
      const a = k.r(0, Math.PI * 2), d = k.r(0, 7), h = k.r(2.5, 6.5) * (1 - d / 12);
      const pts: THREE.Vector3[] = [];
      let x = Math.cos(a) * d, z = Math.sin(a) * d;
      for (let y = -0.5; y <= h; y += h / 6) {
        pts.push(new THREE.Vector3(x, y + 1.6 * (1 - d / 13) ** 1.5, z));
        x += k.r(-0.5, 0.5); z += k.r(-0.5, 0.5);
      }
      roots.push(tube(pts, k.r(0.35, 0.6), 0.08, 6, 16));
    }
    const glass = lit(k, {
      color: 0x8fcf9a, roughness: 0.15, metalness: 0.1, flat: true,
      albedo: `diffuseColor.rgb = mix(vec3(0.35, 0.6, 0.4), vec3(0.8, 0.7, 0.35), bNoise(vLocal * 1.5));`,
      emissive: /* glsl */ `float flick = 0.8 + 0.2 * sin(uTime * 2.3 + vLocal.y * 1.7);
        totalEmissiveRadiance += vec3(0.85, 1.0, 0.4) * (1.4 + fres * 1.5) * flick * mix(0.03, 1.0, uNight);`,
    });
    k.add(new THREE.Mesh(merge(roots), glass));

    // glowing grains blown off the crest in a long streamer downwind
    k.add(particles(k, {
      count: 240, color: 0xffd27a, day: 0.2, night: 2.6, shape: SHAPE_SPARK,
      base: (_i, r) => { const a = r() * Math.PI * 2, d = r() * 9; return [Math.cos(a) * d, 1.5, Math.sin(a) * d]; },
      motion: /* glsl */ `float life = fract(s.y + t * (0.06 + s.z * 0.05));
        pos += vec3(life * 34.0 + sin(t + s.w * 9.0) * 1.0, sin(life * 3.1416) * (4.0 + s.w * 8.0), (s.x - 0.5) * life * 10.0);
        float tw = pow(0.5 + 0.5 * sin(t * (2.0 + s.z * 4.0) + s.w * 60.0), 4.0);
        size = 0.07 + 0.1 * tw; alpha = (0.3 + 0.9 * tw) * (1.0 - life);`,
    }));

    k.add(halo(k, [0, 3, 0], 16, 0xffc25a, 0, 0.5, '0.9 + 0.1 * sin(uTime * 0.9)', 14));
    k.add(halo(k, [0, 12, 0], 30, 0xffb84a, 0, 0.14, '1.0', 30));
    k.setPulse((t) => 0.9 + 0.1 * Math.sin(t * 0.9));
    return k.root;
  },
};
