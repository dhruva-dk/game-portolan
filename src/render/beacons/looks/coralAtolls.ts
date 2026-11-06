// The Coral Atolls: the Spawning Light. In the heart of the Great Reef's lagoon a field of coral heads spawns every
// night: they glow coral-pink and orange, and their spawn rises off the water in a slow, widening column of drifting
// sparks, high enough to read from the neighbouring seas. By day it is a garden of brain and antler coral in clear
// water, its tips just breaking the surface.
import * as THREE from 'three';
import { Kit, disc, halo, lit, merge, mound, particles, place, surface, tick, tube } from '../kit.ts';
import type { BeaconLook } from '../look.ts';
import { cos, exp, length, mix, mod, pow, sin, smoothstep, vec3 } from 'three/tsl';
import { bNoise, shapeSpark } from '../nodes.ts';

const TOP = 88;

export const coralAtolls: BeaconLook = {
  name: 'the Spawning Light',
  what: 'A field of coral heads in the Great Reef\'s lagoon, glowing pink and orange, their spawn rising off the water in a column of sparks.',
  color: 0xff9a7a,
  lightHeight: 4,
  height: TOP,
  radius: 16,
  ground: 'sea',
  update: tick,
  build(seed) {
    const k = new Kit(seed, 'beacon:coralAtolls');

    // brain coral heads on the lagoon floor, and antler coral reaching up to break the surface
    const heads: THREE.BufferGeometry[] = [], antlers: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 16; i++) {
      const a = k.r(0, Math.PI * 2), d = i === 0 ? 0 : k.r(3, 15), r = k.r(1.8, 3.6);
      heads.push(place(mound(r, r * 0.8, { seed: seed + i, bump: 0.3, bumpScale: 1.4, segs: 20 }), { x: Math.cos(a) * d, y: -5.6, z: Math.sin(a) * d }));
    }
    for (let i = 0; i < 12; i++) {
      const a = k.r(0, Math.PI * 2), d = k.r(1, 12), x0 = Math.cos(a) * d, z0 = Math.sin(a) * d;
      for (let b = 0; b < 4; b++) {
        const ba = k.r(0, Math.PI * 2), spread = k.r(0.2, 0.55), len = k.r(4.5, 7);
        const pts = [0, 0.35, 0.7, 1].map((f) => new THREE.Vector3(
          x0 + Math.cos(ba) * Math.sin(spread) * len * f * f * 1.4, -5.6 + len * f, z0 + Math.sin(ba) * Math.sin(spread) * len * f * f * 1.4));
        antlers.push(tube(pts, 0.32, 0.12, 5, 8));
      }
    }
    const coral = lit(k, {
      color: 0xe8806a, roughness: 0.85,
      albedoNode: ({ local: L }) => {
        const groove = sin(bNoise(L.mul(0.9)).mul(18)).mul(0.5).add(0.5);
        return mix(vec3(0.78, 0.36, 0.3), vec3(0.95, 0.62, 0.42), groove.mul(0.7).add(bNoise(L.mul(3)).mul(0.3)));
      },
      emissiveNode: ({ local: L, t, fres, night }) => {
        const wave = sin(t.mul(0.8).sub(length(L.xz).mul(0.35))).mul(0.4).add(0.6);
        const polyps = pow(bNoise(L.mul(5)), 3).mul(3);
        return mix(vec3(1, 0.35, 0.4), vec3(1, 0.62, 0.28), bNoise(L.mul(0.4))).mul(polyps.add(0.5).add(fres)).mul(wave).mul(night);
      },
    });
    k.add(new THREE.Mesh(merge([...heads, ...antlers]), coral));

    // the lagoon lit pink from below
    k.add(surface(k, disc(30, 0.08, 64), {
      color: 0xff8a7a, day: 0, night: 0.45,
      paintNode: ({ local, t }) => {
        const r = length(local.xz), spawn = pow(bNoise(vec3(local.xz.mul(0.8), t.mul(0.4))), 4).mul(2.5);
        return { glow: spawn.add(0.35).mul(smoothstep(30, 6, r)).add(exp(r.div(-8))) };
      },
    }));

    // the spawn: sparks rising slowly off the water, the column widening and thinning as it climbs
    k.add(particles(k, {
      count: 520, color: 0xffa080, day: 0, night: 2.4,
      base: (_i, r) => { const a = r() * Math.PI * 2, d = Math.sqrt(r()) * 13; return [Math.cos(a) * d, 0, Math.sin(a) * d]; },
      shapeNode: shapeSpark,
      motionNode: ({ s, pos, t }) => {
        const y = mod(s.y.mul(TOP).add(t.mul(s.z.mul(1.1).add(0.9))), TOP), f = y.div(TOP), w = f.mul(6).add(1);
        const xz = pos.xz.mul(f.mul(1.6).add(1));
        const tw = pow(sin(t.mul(s.z.mul(2).add(0.8)).add(s.w.mul(50))).mul(0.5).add(0.5), 3);
        return {
          pos: vec3(xz.x.add(sin(t.mul(0.2).add(s.w.mul(6.28)).add(y.mul(0.07))).mul(w)), y, xz.y.add(cos(t.mul(0.17).add(s.x.mul(6.28)).add(y.mul(0.06))).mul(w))),
          col: mix(vec3(1, 0.55, 0.6), vec3(1, 0.78, 0.45), s.z),
          size: tw.mul(0.16).add(0.12), alpha: tw.mul(0.8).add(0.35).mul(smoothstep(0, 2, y)).mul(f.mul(f).oneMinus()),
        };
      },
    }));

    k.add(halo(k, [0, 4, 0], 20, 0xff8f7a, 0, 0.4, 18, ({ t }) => sin(t.mul(0.8)).mul(0.1).add(0.9)));
    k.add(halo(k, [0, TOP * 0.5, 0], 40, 0xff9a80, 0, 0.11, 40));
    k.setPulse((t) => 0.9 + 0.1 * Math.sin(t * 0.8));
    return k.root;
  },
};
