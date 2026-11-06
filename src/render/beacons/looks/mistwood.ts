// Mistwood: the Foxfire Snag. A colossal dead cedar standing on a rooty islet, its bark grown over with shelf fungi
// in a spiral to the broken top. At night the fungi burn with cold green foxfire in a slow wave that climbs the trunk,
// spores drift up through the light, and the fog around the snag glows green: a tall soft lantern in the murk.
import * as THREE from 'three';
import { Kit, column, halo, instances, lit, mat4, merge, mound, particles, place, tick, tube } from '../kit.ts';
import type { BeaconLook } from '../look.ts';
import { atan, cos, length, mix, mod, sin, smoothstep, vec3 } from 'three/tsl';
import { bFbm, bNoise, shapePuff, shapeSpark, type Clocked, type F, type V3 } from '../nodes.ts';

const H = 62;
// the trunk's radius at height fraction f, shared by the bark and the fungi placed on it
const trunkR = (f: number) => 3.3 * (1 - f) ** 0.85 + 0.75 + 2.4 * Math.exp(-f * 16);
/** The foxfire's wave climbing the trunk, at a point. */
const wave = (c: Clocked & { local: V3 }): F => sin(c.local.y.mul(0.16).sub(c.t.mul(0.85))).mul(0.5).add(0.5);

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
      albedoNode: (c) => mix(vec3(0.09, 0.08, 0.06), vec3(0.16, 0.22, 0.09), bFbm(c.local.mul(0.4))),
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
      albedoNode: ({ local: L }) => {
        const grain = bNoise(vec3(atan(L.z, L.x).mul(6), L.y.mul(0.12), 0));
        let c: V3 = mix(vec3(0.11, 0.095, 0.085), vec3(0.24, 0.21, 0.18), grain);
        // silver weathered wood high up, moss low down
        c = mix(c, vec3(0.36, 0.35, 0.33), smoothstep(35, 60, L.y).mul(0.6));
        const moss = smoothstep(0.5, 0.7, bFbm(L.mul(0.3))).mul(smoothstep(18, 2, L.y));
        return mix(c, vec3(0.1, 0.17, 0.05), moss);
      },
      emissiveNode: (c) => {
        // faint foxfire in the cracks of the bark
        const L = c.local, crack = smoothstep(0.72, 0.8, bNoise(vec3(atan(L.z, L.x).mul(9), L.y.mul(0.35), 1)));
        return vec3(0.45, 1, 0.12).mul(crack).mul(wave(c).mul(0.6).add(0.25)).mul(c.night);
      },
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
      albedoNode: (c) => mix(vec3(0.42, 0.38, 0.3), vec3(0.72, 0.68, 0.55), bNoise(c.local.mul(3))),
      emissiveNode: (c) => {
        const under = smoothstep(0.1, -0.6, c.ln.y), gills = sin(length(c.local.xz).mul(30)).mul(0.25).add(0.75);
        return vec3(0.5, 1, 0.12).mul(under.mul(gills).mul(3.2).add(0.35).add(c.fres.mul(0.6))).mul(wave(c).mul(0.9).add(0.35)).mul(c.night);
      },
    });
    k.add(instances(shelf, fungus, ms));

    // spores drifting up through the light
    k.add(particles(k, {
      count: 260, color: 0xb6ff5a, day: 0, night: 2.6,
      base: (_i, r) => { const a = r() * Math.PI * 2, d = 2 + r() * 9; return [Math.cos(a) * d, 0, Math.sin(a) * d]; },
      shapeNode: shapeSpark,
      motionNode: ({ s, pos, t }) => {
        const Hh = 64, y = mod(s.y.mul(Hh).add(t.mul(s.z.mul(0.5).add(0.35))), Hh), f = y.div(62);
        const x = pos.x.add(sin(t.mul(0.21).add(s.w.mul(6.28)).add(y.mul(0.1))).mul(2)).add(f.mul(f).mul(2.2));
        const z = pos.z.add(cos(t.mul(0.17).add(s.x.mul(6.28)).add(y.mul(0.1))).mul(2));
        const tw = sin(t.mul(s.z.mul(2).add(1)).add(s.w.mul(30))).mul(0.5).add(0.5);
        return { pos: vec3(x, y, z), size: tw.mul(0.1).add(0.09), alpha: tw.mul(0.7).add(0.3).mul(smoothstep(0, 3, y)).mul(smoothstep(Hh, Hh - 10, y)) };
      },
    }));
    // the fog: white by day, glowing green round the snag at night
    k.add(particles(k, {
      count: 26, color: 0x7cff40, day: 0, night: 0.16, blend: 'alpha', matter: 0xbfc9c6,
      base: (i, r) => { const a = r() * Math.PI * 2, d = 6 + r() * 12; return [Math.cos(a) * d, 2 + (i % 13) * 3.2, Math.sin(a) * d]; },
      shapeNode: shapePuff,
      motionNode: ({ s, pos, t }) => ({
        pos: vec3(pos.x.add(sin(t.mul(0.05).add(s.x.mul(6.28))).mul(4)), pos.y, pos.z.add(cos(t.mul(0.04).add(s.y.mul(6.28))).mul(4))),
        size: s.z.mul(8).add(9), alpha: pos.y.div(-50).add(1).mul(0.22),
      }),
      renderOrder: 9,
    }));

    k.add(halo(k, [1, 28, 0], 30, 0x8cff36, 0, 0.13, 26, (c) => sin(c.t.mul(0.85)).mul(0.15).add(0.85)));
    k.add(halo(k, [0, 12, 0], 16, 0x9cff3a, 0, 0.3, 14));
    k.setPulse((t) => 0.8 + 0.2 * Math.sin(t * 0.85));
    return k.root;
  },
};
