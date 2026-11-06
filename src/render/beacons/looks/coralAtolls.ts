// The Coral Atolls: the Spawning Light. In the heart of the Great Reef's lagoon a field of coral heads spawns every
// night: they glow coral-pink and orange, and their spawn rises off the water in a slow, widening column of drifting
// sparks, high enough to read from the neighbouring seas. By day it is a garden of brain and antler coral in clear
// water, its tips just breaking the surface.
import * as THREE from 'three';
import { Kit, disc, halo, lit, merge, mound, particles, place, surface, tick, tube, SHAPE_SPARK } from '../kit.ts';
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
      albedo: /* glsl */ `float groove = 0.5 + 0.5 * sin(bNoise(vLocal * 0.9) * 18.0);
        diffuseColor.rgb = mix(vec3(0.78, 0.36, 0.3), vec3(0.95, 0.62, 0.42), groove * 0.7 + 0.3 * bNoise(vLocal * 3.0));`,
      emissive: /* glsl */ `float wave = 0.6 + 0.4 * sin(uTime * 0.8 - length(vLocal.xz) * 0.35);
        float polyps = pow(bNoise(vLocal * 5.0), 3.0) * 3.0;
        totalEmissiveRadiance += mix(vec3(1.0, 0.35, 0.4), vec3(1.0, 0.62, 0.28), bNoise(vLocal * 0.4)) * (0.5 + polyps + fres) * wave * uNight;`,
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
      paint: /* glsl */ `float r = length(vLocal.xz);
        float spawn = pow(bNoise(vec3(vLocal.xz * 0.8, uTime * 0.4)), 4.0) * 2.5;
        glow = (0.35 + spawn) * smoothstep(30.0, 6.0, r) + exp(-r / 8.0);`,
      paintNode: ({ local, t }) => {
        const r = length(local.xz), spawn = pow(bNoise(vec3(local.xz.mul(0.8), t.mul(0.4))), 4).mul(2.5);
        return { glow: spawn.add(0.35).mul(smoothstep(30, 6, r)).add(exp(r.div(-8))) };
      },
    }));

    // the spawn: sparks rising slowly off the water, the column widening and thinning as it climbs
    k.add(particles(k, {
      count: 520, color: 0xffa080, day: 0, night: 2.4, shape: SHAPE_SPARK,
      base: (_i, r) => { const a = r() * Math.PI * 2, d = Math.sqrt(r()) * 13; return [Math.cos(a) * d, 0, Math.sin(a) * d]; },
      motion: /* glsl */ `float y = mod(s.y * ${TOP.toFixed(1)} + t * (0.9 + s.z * 1.1), ${TOP.toFixed(1)});
        float f = y / ${TOP.toFixed(1)};
        pos.xz *= 1.0 + f * 1.6;
        pos.x += sin(t * 0.2 + s.w * 6.28 + y * 0.07) * (1.0 + f * 6.0);
        pos.z += cos(t * 0.17 + s.x * 6.28 + y * 0.06) * (1.0 + f * 6.0);
        pos.y = y;
        col = mix(vec3(1.0, 0.55, 0.6), vec3(1.0, 0.78, 0.45), s.z);
        float tw = pow(0.5 + 0.5 * sin(t * (0.8 + s.z * 2.0) + s.w * 50.0), 3.0);
        size = 0.12 + 0.16 * tw; alpha = (0.35 + 0.8 * tw) * smoothstep(0.0, 2.0, y) * (1.0 - f * f);`,
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

    k.add(halo(k, [0, 4, 0], 20, 0xff8f7a, 0, 0.4, '0.9 + 0.1 * sin(uTime * 0.8)', 18, '', ({ t }) => sin(t.mul(0.8)).mul(0.1).add(0.9)));
    k.add(halo(k, [0, TOP * 0.5, 0], 40, 0xff9a80, 0, 0.11, '1.0', 40));
    k.setPulse((t) => 0.9 + 0.1 * Math.sin(t * 0.8));
    return k.root;
  },
};
