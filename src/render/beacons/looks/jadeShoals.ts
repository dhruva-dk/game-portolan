// The Jade Shoals: the Sandbar Light. The crest of the tallest dune is glass sand, fused here and there by old
// lightning into crooked glass roots that stand out of it. By day it glitters amber and jade in the sun. At night the
// sand glows from within in drifting veins of gold, the glass roots burn green-gold, and the wind lifts glowing grains
// off the crest in a long streamer: a warm light high on the dune that reads across the flat sandbars.
import * as THREE from 'three';
import { Kit, halo, lit, merge, mound, particles, tick, tube } from '../kit.ts';
import type { BeaconLook } from '../look.ts';
import { fract, length, mix, pow, sin, smoothstep, vec3 } from 'three/tsl';
import { bFbm, bNoise, shapeSpark } from '../nodes.ts';

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
      albedoNode: ({ local: L }) => {
        const ripple = sin(L.x.mul(1.6).add(bNoise(L.mul(0.3)).mul(4))).mul(0.5).add(0.5);
        return mix(vec3(0.7, 0.5, 0.22), vec3(0.86, 0.68, 0.34), ripple.mul(0.6).add(bNoise(L.mul(2)).mul(0.4)));
      },
      roughNode: ({ local: L }) => mix(0.25, 0.75, bNoise(L.mul(6))),
      emissiveNode: ({ local: L, t, night }) => {
        const vein = smoothstep(0.55, 0.75, bFbm(vec3(L.xz.mul(0.18), t.mul(0.05))));
        const glint = pow(bNoise(vec3(L.xz.mul(4), t.mul(1.5))), 10).mul(6);
        const d = length(L.xz);
        return vec3(1, 0.72, 0.28).mul(vein.mul(1.3).add(0.25).mul(smoothstep(13, 4, d)).add(glint)).mul(night)
          .add(vec3(1, 0.9, 0.6).mul(glint).mul(0.15).mul(night.oneMinus()));
      },
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
      albedoNode: ({ local: L }) => mix(vec3(0.35, 0.6, 0.4), vec3(0.8, 0.7, 0.35), bNoise(L.mul(1.5))),
      emissiveNode: ({ local: L, t, fres, night }) =>
        vec3(0.85, 1, 0.4).mul(fres.mul(1.5).add(1.4)).mul(sin(t.mul(2.3).add(L.y.mul(1.7))).mul(0.2).add(0.8)).mul(mix(0.03, 1, night)),
    });
    k.add(new THREE.Mesh(merge(roots), glass));

    // glowing grains blown off the crest in a long streamer downwind
    k.add(particles(k, {
      count: 240, color: 0xffd27a, day: 0.2, night: 2.6,
      base: (_i, r) => { const a = r() * Math.PI * 2, d = r() * 9; return [Math.cos(a) * d, 1.5, Math.sin(a) * d]; },
      shapeNode: shapeSpark,
      motionNode: ({ s, pos, t }) => {
        const life = fract(s.y.add(t.mul(s.z.mul(0.05).add(0.06))));
        const p = pos.add(vec3(life.mul(34).add(sin(t.add(s.w.mul(9)))), sin(life.mul(Math.PI)).mul(s.w.mul(8).add(4)), s.x.sub(0.5).mul(life).mul(10)));
        const tw = pow(sin(t.mul(s.z.mul(4).add(2)).add(s.w.mul(60))).mul(0.5).add(0.5), 4);
        return { pos: p, size: tw.mul(0.1).add(0.07), alpha: tw.mul(0.9).add(0.3).mul(life.oneMinus()) };
      },
    }));

    k.add(halo(k, [0, 3, 0], 16, 0xffc25a, 0, 0.5, 14, ({ t }) => sin(t.mul(0.9)).mul(0.1).add(0.9)));
    k.add(halo(k, [0, 12, 0], 30, 0xffb84a, 0, 0.14, 30));
    k.setPulse((t) => 0.9 + 0.1 * Math.sin(t * 0.9));
    return k.root;
  },
};
