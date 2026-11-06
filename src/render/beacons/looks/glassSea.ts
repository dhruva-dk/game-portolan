// The Glass Sea: the Glasswater Pillar. A cluster of clear quartz breaks the surface at the heart of the crystal pool,
// and light rises off it in a pale pillar. By day the crystals are glass in clear water over white sand. At night the
// pool glows aqua from below, caustics ripple across it, and the pillar stands up out of the flat sea: the one tall
// thing on the emptiest skyline.
import * as THREE from 'three';
import { Kit, crystal, disc, halo, lit, merge, particles, pillar, place, surface, tick } from '../kit.ts';
import type { BeaconLook } from '../look.ts';
import { abs, cos, exp, length, max, mix, mod, pow, sin, smoothstep, vec3 } from 'three/tsl';
import { bNoise, shapeSpark } from '../nodes.ts';

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
      albedoNode: ({ local: L }) => mix(vec3(0.7, 0.9, 0.92), vec3(0.95, 1, 1), bNoise(L.mul(0.8))),
      emissiveNode: ({ local: L, t, fres, night }) => {
        const inner = exp(max(0, L.y.add(2)).div(-9)), sweep = pow(max(0, sin(L.y.mul(0.5).sub(t.mul(0.9)))), 16);
        return vec3(0.55, 0.95, 1).mul(inner.mul(1.6).add(sweep.mul(2)).add(fres.mul(1.2))).mul(mix(0.02, 1, night));
      },
    });
    k.add(new THREE.Mesh(merge(cs), quartz));

    // the pool lit from below, caustics crawling across it
    k.add(surface(k, disc(36, 0.08, 72), {
      color: 0x7ff0ff, day: 0.05, night: 0.55,
      paintNode: ({ local, t }) => {
        const p = local.xz, r = length(p);
        const c = bNoise(vec3(p.mul(0.35), t.mul(0.3))).add(bNoise(vec3(p.mul(0.7).add(9), t.mul(-0.25))));
        const caustic = pow(abs(c.sub(1)).oneMinus(), 6);
        return { glow: caustic.mul(1.4).add(0.25).mul(smoothstep(36, 20, r)).add(exp(r.div(-6)).mul(1.5)) };
      },
    }));

    // the pillar: pale, soft-edged, breathing slowly, fading as it climbs
    k.add(pillar(k, 0, TOP, 16, {
      color: 0xc8f8ff, day: 0.03, night: 0.5,
      paintNode: ({ uv: f, t }) => {
        const x = abs(f.x.sub(0.5)).mul(2), x2 = x.mul(x);
        const core = exp(x2.mul(-9)).add(exp(x2.mul(-2)).mul(0.35));
        const rise = bNoise(vec3(f.x.mul(3), f.y.mul(4).sub(t.mul(0.35)), 2));
        return {
          glow: core.mul(rise.mul(0.35).add(0.75)).mul(smoothstep(0, 0.06, f.y)).mul(pow(f.y.oneMinus(), 1.4)).mul(sin(t.mul(0.6)).mul(0.1).add(0.9)),
        };
      },
    }));

    // motes drifting up the pillar
    k.add(particles(k, {
      count: 160, color: 0xdffcff, day: 0, night: 2.4,
      shapeNode: shapeSpark,
      motionNode: ({ s, t }) => {
        const y = mod(s.y.mul(TOP).add(t.mul(s.z.mul(1.4).add(0.8))), TOP);
        const a = s.x.mul(6.2831).add(t.mul(0.2)), r = s.w.mul(3.5).add(0.5);
        const tw = pow(sin(t.mul(s.z.mul(2.5).add(1)).add(s.w.mul(40))).mul(0.5).add(0.5), 3);
        return { pos: vec3(cos(a).mul(r), y, sin(a).mul(r)), size: tw.mul(0.14).add(0.1), alpha: tw.mul(0.8).add(0.3).mul(smoothstep(TOP, TOP * 0.6, y)) };
      },
    }));

    k.add(halo(k, [0, 4, 0], 18, 0xa8f6ff, 0, 0.45, 16, ({ t }) => sin(t.mul(0.6)).mul(0.1).add(0.9)));
    k.add(halo(k, [0, TOP * 0.55, 0], 34, 0x9aeeff, 0, 0.12, 34));
    k.setPulse((t) => 0.9 + 0.1 * Math.sin(t * 0.6));
    return k.root;
  },
};
