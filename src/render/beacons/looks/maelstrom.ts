// The Maelstrom: the Eye's Fire. The storm that never leaves the pole charges the air round the Eye, and its broken tip
// burns with a corona of blue-white fire: crackling streamers that flicker up off the rock, and sparks torn away
// downwind by the gale. It never quite goes out by day, a faint blue flicker on the spire. At night it is a star on the
// top of the Eye that the whole whirlpool turns around.
import * as THREE from 'three';
import { Kit, halo, lit, merge, mound, particles, strip, surface, tick, SHAPE_SPARK } from '../kit.ts';
import type { BeaconLook } from '../look.ts';
import { abs, cos, exp, fract, mix, sin, smoothstep, vec3 } from 'three/tsl';
import { bNoise, shapeSpark } from '../nodes.ts';

export const maelstrom: BeaconLook = {
  name: 'the Eye\'s Fire',
  what: 'A crackling corona of blue-white fire on the broken tip of the Eye, its sparks torn away downwind.',
  color: 0x9cc8ff,
  lightHeight: 4,
  height: 14,
  radius: 8,
  ground: 'shore',
  update: tick,
  build(seed) {
    const k = new Kit(seed, 'beacon:maelstrom');

    // the broken tip: a few jagged knuckles of wet black rock for the fire to cling to
    const knuckles: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 5; i++) {
      const a = k.r(0, Math.PI * 2), d = i === 0 ? 0 : k.r(1.5, 3.5), r = k.r(1.2, 2.2);
      const g = mound(r, r * k.r(1.4, 2.4), { seed: seed + i, bump: 0.4, bumpScale: 1.2, segs: 12 });
      g.translate(Math.cos(a) * d, -1.2, Math.sin(a) * d);
      knuckles.push(g);
    }
    const rock = lit(k, {
      color: 0x1e2228, roughness: 0.35, flat: true,
      albedo: `diffuseColor.rgb = mix(vec3(0.06, 0.07, 0.09), vec3(0.16, 0.18, 0.21), bNoise(vLocal * 2.0));`,
      emissive: /* glsl */ `float flick = 0.6 + 0.4 * bNoise(vec3(uTime * 6.0, vLocal.y, 0.0));
        totalEmissiveRadiance += vec3(0.45, 0.65, 1.0) * smoothstep(0.0, 3.0, vLocal.y) * (0.5 + fres * 1.5) * flick * mix(0.1, 1.0, uNight);`,
      albedoNode: ({ local: L }) => mix(vec3(0.06, 0.07, 0.09), vec3(0.16, 0.18, 0.21), bNoise(L.mul(2))),
      emissiveNode: ({ local: L, t, fres, night }) => {
        const flick = bNoise(vec3(t.mul(6), L.y, 0)).mul(0.4).add(0.6);
        return vec3(0.45, 0.65, 1).mul(smoothstep(0, 3, L.y)).mul(fres.mul(1.5).add(0.5)).mul(flick).mul(mix(0.1, 1, night));
      },
    });
    k.add(new THREE.Mesh(merge(knuckles), rock));

    // the streamers: thin ribbons of fire licking up off the points, each flickering on its own
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2 + k.r(-0.3, 0.3), d = k.r(0, 2.5), len = k.r(4, 9);
      const pts: THREE.Vector3[] = [], ws: number[] = [];
      let x = Math.cos(a) * d, z = Math.sin(a) * d;
      for (let j = 0; j <= 8; j++) {
        const f = j / 8;
        pts.push(new THREE.Vector3(x, 1.5 + f * len, z));
        ws.push(0.9 * (1 - f) + 0.1);
        x += k.r(-0.4, 0.4) + 0.25 * f; z += k.r(-0.4, 0.4);
      }
      const g = strip(pts, ws, new THREE.Vector3(Math.cos(a), 0, Math.sin(a)));
      const ph = k.r(0, 100);
      k.add(surface(k, g, {
        color: 0xa8d0ff, day: 0.4, night: 2.4,
        paint: /* glsl */ `float x = abs(vUv.x - 0.5) * 2.0, f = vUv.y / ${len.toFixed(2)};
          float flick = smoothstep(0.35, 0.75, bNoise(vec3(uTime * 7.0, ${ph.toFixed(2)}, 0.0)));
          float reach = smoothstep(flick * 1.1, flick * 1.1 - 0.25, f);
          glow = exp(-x * x * 5.0) * reach * (0.6 + 0.4 * bNoise(vec3(vUv.y * 2.0 - uTime * 9.0, ${ph.toFixed(2)}, 1.0)));`,
        paintNode: ({ uv: u, t }) => {
          const x = abs(u.x.sub(0.5)).mul(2), f = u.y.div(len);
          const flick = smoothstep(0.35, 0.75, bNoise(vec3(t.mul(7), ph, 0))).mul(1.1);
          const reach = smoothstep(flick, flick.sub(0.25), f);
          return { glow: exp(x.mul(x).mul(-5)).mul(reach).mul(bNoise(vec3(u.y.mul(2).sub(t.mul(9)), ph, 1)).mul(0.4).add(0.6)) };
        },
      }));
    }

    // sparks torn off and carried away by the gale
    k.add(particles(k, {
      count: 160, color: 0xc0deff, day: 0.4, night: 2.8, shape: SHAPE_SPARK,
      motion: /* glsl */ `float f = fract(s.y + t * (0.4 + s.z * 0.5));
        float a = s.x * 6.2831;
        pos = vec3(cos(a) * 2.0 + f * (8.0 + s.w * 14.0), 2.0 + s.w * 6.0 + sin(f * 6.0 + s.x * 20.0) * 1.5, sin(a) * 2.0 + (s.z - 0.5) * f * 8.0);
        size = 0.06 + 0.1 * (1.0 - f); alpha = (1.0 - f) * (0.6 + 0.4 * sin(t * 30.0 + s.w * 100.0));`,
      shapeNode: shapeSpark,
      motionNode: ({ s, t }) => {
        const f = fract(s.y.add(t.mul(s.z.mul(0.5).add(0.4)))), a = s.x.mul(6.2831);
        return {
          pos: vec3(cos(a).mul(2).add(f.mul(s.w.mul(14).add(8))), s.w.mul(6).add(2).add(sin(f.mul(6).add(s.x.mul(20))).mul(1.5)), sin(a).mul(2).add(s.z.sub(0.5).mul(f).mul(8))),
          size: f.oneMinus().mul(0.1).add(0.06), alpha: f.oneMinus().mul(sin(t.mul(30).add(s.w.mul(100))).mul(0.4).add(0.6)),
        };
      },
    }));

    k.add(halo(k, [0, 4, 0], 12, 0xa0c8ff, 0.08, 0.8, '0.75 + 0.25 * bNoise(vec3(uTime * 5.0, 0.0, 0.0))', 10, '',
      ({ t }) => bNoise(vec3(t.mul(5), 0, 0)).mul(0.25).add(0.75)));
    k.add(halo(k, [0, 8, 0], 40, 0x8ab8ff, 0, 0.3, '1.0', 40));
    k.setPulse((t) => 0.8 + 0.2 * Math.sin(t * 11) * Math.sin(t * 3.7));
    return k.root;
  },
};
