// The Narrows: the Sapphire Seam. A banded ochre-and-rust sandstone hoodoo split open at the top, where a geode of huge
// sapphire crystals bursts out in a fan, with a seam of smaller crystals running down its face. At night the crystals
// glow deep blue from within, light sweeping along their facets, and glints spin round the fan: the one cold light in
// a warm-rocked region. By day they are blue glass catching the sun.
import * as THREE from 'three';
import { Kit, column, crystal, halo, lit, merge, particles, place, tick } from '../kit.ts';
import type { BeaconLook } from '../look.ts';
import { abs, cos, dot, exp, length, max, mix, pow, select, sin, smoothstep, vec3 } from 'three/tsl';
import { bFbm, bNoise, shapeSpark, type V3 } from '../nodes.ts';

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
    const coreN = vec3(CORE.x, CORE.y, CORE.z);

    // the hoodoo: wide foot, waisted middle, a cap-rock lip, split at the top
    const hood = column({
      height: HOOD, radial: 26, rings: 40, seed: seed + 4, bump: 0.9, bumpScale: 0.12, sx: 1.15,
      radius: (f) => 9.4 - 3.2 * Math.sin(f * Math.PI) ** 1.3 + 1.6 * THREE.MathUtils.smoothstep(f, 0.8, 0.94) - (f > 0.97 ? 2.5 : 0),
      shape: (x, y, z, f) => 0.55 * Math.sin(y * 1.05 + Math.sin(x * 0.2 + z * 0.15) * 1.5) - (f > 0.9 ? 1.6 * Math.exp(-(x * x) / 6) : 0),
    });
    const sandstone = lit(k, {
      color: 0xc88a4a, roughness: 0.95,
      albedoNode: ({ local: L }) => {
        const band = sin(L.y.mul(0.95).add(bNoise(L.mul(0.2)).mul(2.5)));
        let c: V3 = mix(vec3(0.62, 0.4, 0.2), vec3(0.45, 0.19, 0.1), smoothstep(-0.3, 0.6, band));
        c = mix(c, vec3(0.72, 0.56, 0.38), smoothstep(0.75, 0.95, band).mul(0.7));
        c = c.mul(bFbm(L.mul(0.6)).mul(0.3).add(0.8));
        return mix(c, c.mul(0.45), smoothstep(2.5, 0, L.y));
      },
      emissiveNode: ({ local: L, night }) => {
        // blue light spilling from the geode onto the rock
        const d = length(L.sub(coreN));
        const seam = exp(abs(L.x).div(-2.5)).mul(smoothstep(0, 6, L.z)).mul(smoothstep(8, 30, L.y));
        return vec3(0.12, 0.3, 1).mul(exp(d.div(-9)).mul(1.2).add(seam.mul(0.25))).mul(night);
      },
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
      albedoNode: ({ local: L }) => mix(vec3(0.03, 0.08, 0.35), vec3(0.15, 0.3, 0.8), bNoise(L.mul(0.7))),
      emissiveNode: ({ local: L, t, night, fres }) => {
        const d = length(L.sub(coreN)), inner = exp(d.div(-8)).mul(2.2).add(0.35);
        const bands = smoothstep(0.55, 0.9, bNoise(L.mul(vec3(0.9, 0.3, 0.9)).add(vec3(0, t.mul(0.3), 0))));
        // light sweeping along the facets
        const sweep = pow(max(0, sin(dot(L, vec3(0.31, 0.53, 0.22)).mul(0.8).sub(t.mul(1.4)))), 24);
        const e = vec3(0.08, 0.28, 1).mul(inner.mul(sin(t.mul(0.7)).mul(0.2).add(0.8)).add(bands.mul(0.9)))
          .add(vec3(0.5, 0.75, 1).mul(fres.mul(1.4).add(sweep.mul(2.5))));
        return e.mul(mix(0.03, 1, night));
      },
    });
    const gems = new THREE.Mesh(merge(cs), sapphire);
    gems.castShadow = true;
    k.add(gems);

    // glints wheeling slowly round the fan
    k.add(particles(k, {
      count: 120, color: 0x9cc4ff, day: 0.4, night: 3.0,
      shapeNode: shapeSpark,
      motionNode: ({ s, t }) => {
        const a = s.x.mul(6.2831).add(t.mul(s.y.mul(0.15).add(0.1)).mul(select(s.z.greaterThan(0.5), 1, -1)));
        const r = s.w.mul(15).add(3);
        const tw = pow(max(0, sin(t.mul(s.z.mul(3).add(1)).add(s.w.mul(50)))), 10);
        return {
          pos: coreN.add(vec3(cos(a).mul(r), s.y.sub(0.35).mul(22).add(sin(t.mul(0.4).add(s.x.mul(9))).mul(1.5)), sin(a).mul(r))),
          size: tw.mul(0.28).add(0.12), alpha: tw.mul(2).add(0.2),
        };
      },
    }));
    k.add(halo(k, [CORE.x, CORE.y + 2, CORE.z], 15, 0x3c78ff, 0, 0.7, 14, ({ t }) => sin(t.mul(0.7)).mul(0.1).add(0.9)));
    k.add(halo(k, [0, 46, 0], 34, 0x2f62ff, 0, 0.12, 34));
    k.setPulse((t) => 0.9 + 0.1 * Math.sin(t * 0.7));
    return k.root;
  },
};
