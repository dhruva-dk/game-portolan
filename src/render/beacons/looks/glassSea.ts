// The Glass Sea: the Glasswater Pillar. A cluster of clear quartz breaks the surface at the heart of the crystal pool,
// and light rises off it in a pale pillar. By day the crystals are glass in clear water over white sand. At night the
// pool glows aqua from below, caustics ripple across it, and the pillar stands up out of the flat sea: the one tall
// thing on the emptiest skyline.
import * as THREE from 'three';
import { Kit, crystal, disc, halo, lit, merge, particles, pillar, place, surface, tick, SHAPE_SPARK } from '../kit.ts';
import type { BeaconLook } from '../look.ts';

const TOP = 70;

export const glassSea: BeaconLook = {
  name: 'the Glasswater Pillar',
  what: 'Clear quartz breaking the surface of the crystal pool, with a pale pillar of light rising off it.',
  color: 0xbff4ff,
  lightHeight: 6,
  height: TOP,
  radius: 12,
  ground: 'sea',
  update: tick,
  build(seed) {
    const k = new Kit(seed, 'beacon:glassSea');

    // the quartz: a cluster from the pool floor, the tallest standing a few metres clear of the water
    const cs: THREE.BufferGeometry[] = [];
    const up = new THREE.Vector3(0, 1, 0);
    for (let i = 0; i < 22; i++) {
      const a = k.r(0, Math.PI * 2), d = i < 4 ? k.r(0, 2) : k.r(1.5, 9);
      const tilt = i < 4 ? k.r(0, 0.2) : k.r(0.15, 0.7);
      const dir = new THREE.Vector3(Math.cos(a) * Math.sin(tilt), Math.cos(tilt), Math.sin(a) * Math.sin(tilt));
      const len = i < 4 ? k.r(13, 17) : k.r(6, 11), g = crystal(len * k.r(0.08, 0.12), len);
      g.rotateY(k.r(0, 1));
      g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(up, dir));
      cs.push(place(g, { x: Math.cos(a) * d, y: -7.5, z: Math.sin(a) * d }));
    }
    const quartz = lit(k, {
      color: 0xd8f6f8, roughness: 0.05, metalness: 0.1, flat: true, transparent: true, opacity: 0.8,
      albedo: `diffuseColor.rgb = mix(vec3(0.7, 0.9, 0.92), vec3(0.95, 1.0, 1.0), bNoise(vLocal * 0.8));`,
      emissive: /* glsl */ `float inner = exp(-max(0.0, vLocal.y + 2.0) / 9.0);
        float sweep = pow(max(0.0, sin(vLocal.y * 0.5 - uTime * 0.9)), 16.0);
        totalEmissiveRadiance += vec3(0.55, 0.95, 1.0) * (inner * 1.6 + sweep * 2.0 + fres * 1.2) * mix(0.02, 1.0, uNight);`,
    });
    k.add(new THREE.Mesh(merge(cs), quartz));

    // the pool lit from below, caustics crawling across it
    k.add(surface(k, disc(36, 0.08, 72), {
      color: 0x7ff0ff, day: 0.05, night: 0.55,
      paint: /* glsl */ `vec2 p = vLocal.xz; float r = length(p);
        float c = bNoise(vec3(p * 0.35, uTime * 0.3)) + bNoise(vec3(p * 0.7 + 9.0, -uTime * 0.25));
        float caustic = pow(1.0 - abs(c - 1.0), 6.0);
        glow = (0.25 + caustic * 1.4) * smoothstep(36.0, 20.0, r) + 1.5 * exp(-r / 6.0);`,
    }));

    // the pillar: pale, soft-edged, breathing slowly, fading as it climbs
    k.add(pillar(k, 0, TOP, 16, {
      color: 0xc8f8ff, day: 0.03, night: 0.5,
      paint: /* glsl */ `float x = abs(vUv.x - 0.5) * 2.0;
        float core = exp(-x * x * 9.0) + 0.35 * exp(-x * x * 2.0);
        float rise = bNoise(vec3(vUv.x * 3.0, vUv.y * 4.0 - uTime * 0.35, 2.0));
        glow = core * (0.75 + 0.35 * rise) * smoothstep(0.0, 0.06, vUv.y) * pow(1.0 - vUv.y, 1.4) * (0.9 + 0.1 * sin(uTime * 0.6));`,
    }));

    // motes drifting up the pillar
    k.add(particles(k, {
      count: 160, color: 0xdffcff, day: 0, night: 2.4, shape: SHAPE_SPARK,
      motion: /* glsl */ `float y = mod(s.y * ${TOP.toFixed(1)} + t * (0.8 + s.z * 1.4), ${TOP.toFixed(1)});
        float a = s.x * 6.2831 + t * 0.2, r = 0.5 + s.w * 3.5;
        pos = vec3(cos(a) * r, y, sin(a) * r);
        float tw = pow(0.5 + 0.5 * sin(t * (1.0 + s.z * 2.5) + s.w * 40.0), 3.0);
        size = 0.1 + 0.14 * tw; alpha = (0.3 + 0.8 * tw) * smoothstep(${TOP.toFixed(1)}, ${(TOP * 0.6).toFixed(1)}, y);`,
    }));

    k.add(halo(k, [0, 4, 0], 18, 0xa8f6ff, 0, 0.45, '0.9 + 0.1 * sin(uTime * 0.6)', 16));
    k.add(halo(k, [0, TOP * 0.55, 0], 34, 0x9aeeff, 0, 0.12, '1.0', 34));
    k.setPulse((t) => 0.9 + 0.1 * Math.sin(t * 0.6));
    return k.root;
  },
};
