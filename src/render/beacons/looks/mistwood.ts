// Mistwood: the Foxfire Snag. A colossal dead cedar standing on a rooty islet, its bark grown over with shelf fungi
// in a spiral to the broken top. At night the fungi burn with cold green foxfire in a slow wave that climbs the trunk,
// spores drift up through the light, and the fog around the snag glows green: a tall soft lantern in the murk.
import * as THREE from 'three';
import { Kit, column, halo, instances, lit, mat4, merge, mound, particles, place, tick, tube, SHAPE_PUFF, SHAPE_SPARK } from '../kit.ts';
import type { BeaconLook } from '../look.ts';

const H = 62;
// the trunk's radius at height fraction f, shared by the bark and the fungi placed on it
const trunkR = (f: number) => 3.3 * (1 - f) ** 0.85 + 0.75 + 2.4 * Math.exp(-f * 16);
const WAVE = '(0.5 + 0.5 * sin(vLocal.y * 0.16 - uTime * 0.85))';

export const mistwood: BeaconLook = {
  name: 'the Foxfire Snag',
  what: 'A colossal dead cedar spiralled with shelf fungi that burn with green foxfire, glowing up through the fog.',
  color: 0x9cff3a,
  lightHeight: 26,
  height: 64,
  radius: 16,
  ground: 'shore',
  update: tick,
  build(seed) {
    const k = new Kit(seed, 'beacon:mistwood');

    // the islet and the roots
    const islet = new THREE.Mesh(mound(15, 1.6, { seed: seed + 2, bump: 0.6, bumpScale: 0.2 }), lit(k, {
      color: 0x2f3a24, roughness: 0.95,
      albedo: `diffuseColor.rgb = mix(vec3(0.09, 0.08, 0.06), vec3(0.16, 0.22, 0.09), bFbm(vLocal * 0.4));`,
    }));
    islet.receiveShadow = true;
    k.add(islet);
    const roots: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 11; i++) {
      const a = (i / 11) * Math.PI * 2 + k.r(-0.2, 0.2), out = k.r(9, 15);
      const pts = [0, 0.3, 0.6, 1].map((f) => {
        const d = 2.6 + f * (out - 2.6);
        return new THREE.Vector3(Math.cos(a + f * 0.2) * d, 2.5 * (1 - f) ** 1.6 + Math.sin(f * Math.PI) * 0.9 - f * 1.2, Math.sin(a + f * 0.2) * d);
      });
      roots.push(tube(pts, k.r(0.9, 1.4), 0.25, 7, 14));
    }

    // the snag: grooved bark, a slight lean, a broken top, stubs of old limbs
    const trunk = column({
      height: H, radius: trunkR, radial: 20, rings: 48, seed: seed + 5, bump: 0.3, bumpScale: 0.35, lean: 2.2,
      shape: (_x, y, _z, f, a) => 0.16 * Math.sin(a * 15 + Math.sin(y * 0.11) * 2) + (f > 0.97 ? -0.6 * Math.abs(Math.sin(a * 3)) : 0),
    });
    const stubs: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 8; i++) {
      const y = k.r(22, 57), a = k.r(0, Math.PI * 2), r = trunkR(y / H) + 2.2 * (y / H) ** 2, len = k.r(2.5, 6);
      const g = new THREE.ConeGeometry(0.45, len, 6);
      g.translate(0, len / 2, 0);
      stubs.push(place(g, { x: Math.cos(a) * r * 0.8, y, z: Math.sin(a) * r * 0.8 }, new THREE.Euler(0, -a, -Math.PI / 2 + k.r(-0.4, 0.5), 'YZX')));
    }
    const bark = lit(k, {
      color: 0x3a332c, roughness: 0.92,
      albedo: /* glsl */ `float grain = bNoise(vec3(atan(vLocal.z, vLocal.x) * 6.0, vLocal.y * 0.12, 0.0));
        vec3 c = mix(vec3(0.11, 0.095, 0.085), vec3(0.24, 0.21, 0.18), grain);
        // silver weathered wood high up, moss low down
        c = mix(c, vec3(0.36, 0.35, 0.33), smoothstep(35.0, 60.0, vLocal.y) * 0.6);
        float moss = smoothstep(0.5, 0.7, bFbm(vLocal * 0.3)) * smoothstep(18.0, 2.0, vLocal.y);
        diffuseColor.rgb = mix(c, vec3(0.1, 0.17, 0.05), moss);`,
      emissive: /* glsl */ `// faint foxfire in the cracks of the bark
        float crack = smoothstep(0.72, 0.8, bNoise(vec3(atan(vLocal.z, vLocal.x) * 9.0, vLocal.y * 0.35, 1.0)));
        totalEmissiveRadiance += vec3(0.45, 1.0, 0.12) * crack * (0.25 + 0.6 * ${WAVE}) * uNight;`,
    });
    const snag = new THREE.Mesh(merge([trunk, ...stubs, ...roots]), bark);
    snag.castShadow = snag.receiveShadow = true;
    k.add(snag);

    // the fungi: shelves in a climbing spiral, their gills glowing
    // half a flattened lens: a curved cap above, the gills below, the cut face against the bark
    const shelf = new THREE.SphereGeometry(1, 14, 8, 0, Math.PI);
    shelf.scale(1, 0.3, 1);
    const ms: THREE.Matrix4[] = [];
    for (let i = 0; i < 90; i++) {
      const y = 3 + i * 0.6 + k.r(-0.5, 0.5), f = y / H;
      const a = i * 0.72 + k.r(-0.3, 0.3);
      const r = trunkR(f) - 0.2, lean = 2.2 * f * f;
      const s = k.r(0.7, 1.6) * (1.2 - f * 0.5);
      // the half-dome's flat side against the bark, opening outward
      ms.push(mat4(Math.cos(a) * r + lean, y, Math.sin(a) * r, 0, -a + Math.PI / 2, 0, [s * 1.3, s, s]));
      if (k.rand() < 0.45) ms.push(mat4(Math.cos(a) * r + lean, y - s * 0.55, Math.sin(a) * r, 0, -a + Math.PI / 2, 0, [s, s * 0.8, s * 0.8]));
    }
    const fungus = lit(k, {
      color: 0xb8b098, roughness: 0.7,
      albedo: `diffuseColor.rgb = mix(vec3(0.42, 0.38, 0.3), vec3(0.72, 0.68, 0.55), bNoise(vLocal * 3.0));`,
      emissive: /* glsl */ `float under = smoothstep(0.1, -0.6, vLN.y);
        float gills = 0.75 + 0.25 * sin(length(vLocal.xz) * 30.0);
        vec3 fox = vec3(0.5, 1.0, 0.12);
        totalEmissiveRadiance += fox * (under * gills * 3.2 + 0.35 + fres * 0.6) * (0.35 + 0.9 * ${WAVE}) * mix(0.0, 1.0, uNight);`,
    });
    k.add(instances(shelf, fungus, ms));

    // spores drifting up through the light
    k.add(particles(k, {
      count: 260, color: 0xb6ff5a, day: 0, night: 2.6, shape: SHAPE_SPARK,
      base: (_i, r) => { const a = r() * Math.PI * 2, d = 2 + r() * 9; return [Math.cos(a) * d, 0, Math.sin(a) * d]; },
      motion: /* glsl */ `float Hh = 64.0; float y = mod(s.y * Hh + t * (0.35 + s.z * 0.5), Hh);
        pos.x += sin(t * 0.21 + s.w * 6.28 + y * 0.1) * 2.0 + 2.2 * (y / 62.0) * (y / 62.0);
        pos.z += cos(t * 0.17 + s.x * 6.28 + y * 0.1) * 2.0;
        pos.y = y;
        float tw = 0.5 + 0.5 * sin(t * (1.0 + s.z * 2.0) + s.w * 30.0);
        size = 0.09 + 0.1 * tw;
        alpha = (0.3 + 0.7 * tw) * smoothstep(0.0, 3.0, y) * smoothstep(Hh, Hh - 10.0, y);`,
    }));
    // the fog: white by day, glowing green round the snag at night
    k.add(particles(k, {
      count: 26, color: 0x7cff40, day: 0, night: 0.16, blend: 'alpha', matter: 0xbfc9c6, shape: SHAPE_PUFF,
      base: (i, r) => { const a = r() * Math.PI * 2, d = 6 + r() * 12; return [Math.cos(a) * d, 2 + (i % 13) * 3.2, Math.sin(a) * d]; },
      motion: /* glsl */ `pos.x += sin(t * 0.05 + s.x * 6.28) * 4.0; pos.z += cos(t * 0.04 + s.y * 6.28) * 4.0;
        size = 9.0 + s.z * 8.0;
        alpha = 0.22 * (1.0 - pos.y / 50.0);`,
      renderOrder: 9,
    }));

    k.add(halo(k, [1, 28, 0], 30, 0x8cff36, 0, 0.13, '0.85 + 0.15 * sin(uTime * 0.85)', 26));
    k.add(halo(k, [0, 12, 0], 16, 0x9cff3a, 0, 0.3, '1.0', 14));
    k.setPulse((t) => 0.8 + 0.2 * Math.sin(t * 0.85));
    return k.root;
  },
};
