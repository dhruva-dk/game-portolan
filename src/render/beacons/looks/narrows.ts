// The Narrows: the Sapphire Seam. A banded ochre-and-rust sandstone hoodoo split open at the top, where a geode of huge
// sapphire crystals bursts out in a fan, with a seam of smaller crystals running down its face. At night the crystals
// glow deep blue from within, light sweeping along their facets, and glints spin round the fan: the one cold light in
// a warm-rocked region. By day they are blue glass catching the sun.
import * as THREE from 'three';
import { Kit, column, crystal, halo, lit, merge, particles, place, tick, SHAPE_SPARK } from '../kit.ts';
import type { BeaconLook } from '../look.ts';

const HOOD = 34;
const CORE = new THREE.Vector3(0, HOOD + 5, 0);

export const narrows: BeaconLook = {
  name: 'the Sapphire Seam',
  what: 'A sandstone hoodoo split open by a geode of huge sapphire crystals that glow deep blue from within.',
  color: 0x3c78ff,
  lightHeight: CORE.y,
  height: 58,
  radius: 16,
  ground: 'sea',
  update: tick,
  build(seed) {
    const k = new Kit(seed, 'beacon:narrows');
    const core = `vec3(${CORE.x.toFixed(1)}, ${CORE.y.toFixed(1)}, ${CORE.z.toFixed(1)})`;

    // the hoodoo: wide foot, waisted middle, a cap-rock lip, split at the top
    const hood = column({
      height: HOOD, radial: 26, rings: 40, seed: seed + 4, bump: 0.9, bumpScale: 0.12, sx: 1.15,
      radius: (f) => 9.4 - 3.2 * Math.sin(f * Math.PI) ** 1.3 + 1.6 * THREE.MathUtils.smoothstep(f, 0.8, 0.94) - (f > 0.97 ? 2.5 : 0),
      shape: (x, y, z, f) => 0.55 * Math.sin(y * 1.05 + Math.sin(x * 0.2 + z * 0.15) * 1.5) - (f > 0.9 ? 1.6 * Math.exp(-(x * x) / 6) : 0),
    });
    const sandstone = lit(k, {
      color: 0xc88a4a, roughness: 0.95,
      albedo: /* glsl */ `float band = sin(vLocal.y * 0.95 + bNoise(vLocal * 0.2) * 2.5);
        vec3 ochre = vec3(0.62, 0.4, 0.2), rust = vec3(0.45, 0.19, 0.1), cream = vec3(0.72, 0.56, 0.38);
        vec3 c = mix(ochre, rust, smoothstep(-0.3, 0.6, band));
        c = mix(c, cream, smoothstep(0.75, 0.95, band) * 0.7);
        c *= 0.8 + 0.3 * bFbm(vLocal * 0.6);
        c = mix(c, c * 0.45, smoothstep(2.5, 0.0, vLocal.y));
        diffuseColor.rgb = c;`,
      emissive: /* glsl */ `// blue light spilling from the geode onto the rock
        float d = length(vLocal - ${core});
        float seam = exp(-abs(vLocal.x) / 2.5) * smoothstep(0.0, 6.0, vLocal.z) * smoothstep(8.0, 30.0, vLocal.y);
        totalEmissiveRadiance += vec3(0.12, 0.3, 1.0) * (exp(-d / 9.0) * 1.2 + seam * 0.25) * uNight;`,
    });
    const rock = new THREE.Mesh(hood, sandstone);
    rock.castShadow = rock.receiveShadow = true;
    k.add(rock);

    // the crystals: a fan bursting from the split top, and a seam of small ones down the front face
    const cs: THREE.BufferGeometry[] = [];
    const up = new THREE.Vector3(0, 1, 0);
    for (let i = 0; i < 17; i++) {
      const a = k.r(0, Math.PI * 2), tilt = k.r(0.05, 0.85) * (i < 3 ? 0.3 : 1);
      const dir = new THREE.Vector3(Math.cos(a) * Math.sin(tilt), Math.cos(tilt), Math.sin(a) * Math.sin(tilt));
      const len = i < 3 ? k.r(16, 21) : k.r(6, 14), r = len * k.r(0.09, 0.13);
      const g = crystal(r, len);
      g.rotateY(k.r(0, 1));
      g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(up, dir));
      cs.push(place(g, { x: Math.cos(a) * k.r(0, 2.5), y: HOOD - 2.5, z: Math.sin(a) * k.r(0, 2.5) }));
    }
    for (let i = 0; i < 14; i++) {
      const y = k.r(8, 30), x = k.r(-1.8, 1.8);
      const out = new THREE.Vector3(k.r(-0.5, 0.5), k.r(0.1, 0.8), 1).normalize();
      const len = k.r(2, 5.5), g = crystal(len * 0.14, len);
      g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(up, out));
      const f = y / HOOD, rr = (9.4 - 3.2 * Math.sin(f * Math.PI) ** 1.3) * 0.98 - 1;
      cs.push(place(g, { x, y, z: rr }));
    }
    for (let i = 0; i < 9; i++) {
      const a = k.r(0, Math.PI * 2), d = k.r(9.5, 12), len = k.r(1.2, 3);
      const g = crystal(len * 0.18, len);
      g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(up, new THREE.Vector3(k.r(-0.6, 0.6), 1, k.r(-0.6, 0.6)).normalize()));
      cs.push(place(g, { x: Math.cos(a) * d, y: 0.2, z: Math.sin(a) * d }));
    }
    const sapphire = lit(k, {
      color: 0x1d3fa8, roughness: 0.06, metalness: 0.2, flat: true,
      albedo: `diffuseColor.rgb = mix(vec3(0.03, 0.08, 0.35), vec3(0.15, 0.3, 0.8), bNoise(vLocal * 0.7));`,
      emissive: /* glsl */ `float d = length(vLocal - ${core});
        float inner = exp(-d / 8.0) * 2.2 + 0.35;
        float bands = smoothstep(0.55, 0.9, bNoise(vLocal * vec3(0.9, 0.3, 0.9) + vec3(0.0, uTime * 0.3, 0.0)));
        // light sweeping along the facets
        float sweep = pow(max(0.0, sin(dot(vLocal, vec3(0.31, 0.53, 0.22)) * 0.8 - uTime * 1.4)), 24.0);
        vec3 blue = vec3(0.08, 0.28, 1.0);
        vec3 e = blue * (inner * (0.8 + 0.2 * sin(uTime * 0.7)) + bands * 0.9) + vec3(0.5, 0.75, 1.0) * (fres * 1.4 + sweep * 2.5);
        totalEmissiveRadiance += e * mix(0.03, 1.0, uNight);`,
    });
    const gems = new THREE.Mesh(merge(cs), sapphire);
    gems.castShadow = true;
    k.add(gems);

    // glints wheeling slowly round the fan
    k.add(particles(k, {
      count: 120, color: 0x9cc4ff, day: 0.4, night: 3.0, shape: SHAPE_SPARK,
      motion: /* glsl */ `float a = s.x * 6.2831 + t * (0.1 + s.y * 0.15) * (s.z > 0.5 ? 1.0 : -1.0);
        float r = 3.0 + s.w * 15.0;
        pos = ${core} + vec3(cos(a) * r, (s.y - 0.35) * 22.0 + sin(t * 0.4 + s.x * 9.0) * 1.5, sin(a) * r);
        float tw = pow(max(0.0, sin(t * (1.0 + s.z * 3.0) + s.w * 50.0)), 10.0);
        size = 0.12 + 0.28 * tw; alpha = 0.2 + 2.0 * tw;`,
    }));
    k.add(halo(k, [CORE.x, CORE.y + 2, CORE.z], 15, 0x3c78ff, 0, 0.7, '0.9 + 0.1 * sin(uTime * 0.7)', 14));
    k.add(halo(k, [0, 46, 0], 34, 0x2f62ff, 0, 0.12, '1.0', 34));
    k.setPulse((t) => 0.9 + 0.1 * Math.sin(t * 0.7));
    return k.root;
  },
};
