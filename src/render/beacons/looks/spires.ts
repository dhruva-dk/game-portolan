// The Spires: St Elmo's Crowns. Four pale limestone needles, each crowned with dark pines, standing from the sea. At
// night the storm-charged air burns on the pine tips as violet corona fire that crackles and leaps, and now and then
// an arc jumps between two crowns. From far off: four violet sparks hung high over the sea, flickering.
import * as THREE from 'three';
import { Kit, column, noise3, halo, instances, lit, mat4, merge, particles, strip, surface, tick, SHAPE_FLAME, SHAPE_SPARK } from '../kit.ts';
import type { BeaconLook } from '../look.ts';
import { abs, clamp, cos, exp, float, floor, fract, mix, mod, sin, smoothstep, step, vec2, vec3 } from 'three/tsl';
import { bFbm, bHash1, bNoise, shapeFlame, shapeSpark, type F } from '../nodes.ts';

const NEEDLES: [number, number, number, number][] = [
  // x, z, height, base radius
  [0, 0, 64, 6.4], [13, -6, 51, 5.4], [-11, -9, 45, 5.0], [5, 13, 37, 4.6],
];

export const spires: BeaconLook = {
  name: "St Elmo's Crowns",
  what: 'Pale limestone needles whose crowns of pines burn with crackling violet corona fire, arcs leaping between them.',
  color: 0x8f6bff,
  lightHeight: 60,
  height: 72,
  radius: 22,
  ground: 'sea',
  update: tick,
  build(seed) {
    const k = new Kit(seed, 'beacon:spires');
    const tips: THREE.Vector3[] = [];
    const rocks: THREE.BufferGeometry[] = [];
    const pines: THREE.Matrix4[] = [];
    NEEDLES.forEach(([x, z, h, r0], i) => {
      const lean = k.r(-1.5, 1.5);
      const g = column({
        height: h, radial: 16, rings: 40, seed: seed + 7 * i, bump: 0.7, bumpScale: 0.16, lean,
        radius: (f) => r0 * (1 - 0.72 * f ** 1.2) * (f < 0.06 ? 0.86 + f * 2.3 : 1),
        shape: (x, y, z) => 0.45 * Math.sin(y * 0.9 + noise3(x * 0.2, y * 0.07, z * 0.2, i) * 5) ** 3 - (y < 2.5 ? 0.6 : 0),
      });
      g.translate(x, -1, z);
      rocks.push(g);
      const top = new THREE.Vector3(x + lean, h - 1, z);
      tips.push(top.clone().setY(h + 4));
      // the crown of pines on the flat top
      for (let j = 0; j < 6; j++) {
        const a = k.r(0, Math.PI * 2), d = k.r(0, 1.6), s = k.r(2.2, 4.2);
        pines.push(mat4(top.x + Math.cos(a) * d, top.y - 0.3, top.z + Math.sin(a) * d, k.r(-0.1, 0.1), 0, k.r(-0.1, 0.1), [s * 0.32, s, s * 0.32]));
      }
    });
    const lime = lit(k, {
      color: 0xd8d2c2, roughness: 0.9,
      albedo: /* glsl */ `float bed = 0.5 + 0.5 * sin(vLocal.y * 1.25 + bNoise(vLocal * 0.3) * 2.0);
        float n = bFbm(vLocal * vec3(0.4, 0.05, 0.4));
        vec3 c = mix(vec3(0.62, 0.6, 0.55), vec3(0.85, 0.83, 0.77), bed * 0.4 + n * 0.6);
        c = mix(c, vec3(0.35, 0.34, 0.32), smoothstep(0.6, 0.8, bNoise(vec3(vLocal.x * 0.9, vLocal.y * 0.04, vLocal.z * 0.9))) * 0.5);
        c = mix(c, vec3(0.1, 0.13, 0.1), smoothstep(3.0, 0.5, vLocal.y));
        diffuseColor.rgb = c;`,
      emissive: /* glsl */ `// the corona's light falling on the upper rock
        float top = smoothstep(24.0, 60.0, vLocal.y);
        float fl = 0.7 + 0.3 * bNoise(vec3(uTime * 9.0, vLocal.y * 0.1, 0.0));
        totalEmissiveRadiance += vec3(0.4, 0.28, 1.0) * top * top * 0.22 * fl * uNight;`,
      albedoNode: ({ local: L }) => {
        const bed = sin(L.y.mul(1.25).add(bNoise(L.mul(0.3)).mul(2))).mul(0.5).add(0.5);
        const n = bFbm(L.mul(vec3(0.4, 0.05, 0.4)));
        const c = mix(vec3(0.62, 0.6, 0.55), vec3(0.85, 0.83, 0.77), bed.mul(0.4).add(n.mul(0.6)));
        const streaked = mix(c, vec3(0.35, 0.34, 0.32), smoothstep(0.6, 0.8, bNoise(vec3(L.x.mul(0.9), L.y.mul(0.04), L.z.mul(0.9)))).mul(0.5));
        return mix(streaked, vec3(0.1, 0.13, 0.1), smoothstep(3, 0.5, L.y));
      },
      emissiveNode: ({ local: L, t, night }) => {
        // the corona's light falling on the upper rock
        const top = smoothstep(24, 60, L.y), fl = bNoise(vec3(t.mul(9), L.y.mul(0.1), 0)).mul(0.3).add(0.7);
        return vec3(0.4, 0.28, 1).mul(top.mul(top).mul(0.22).mul(fl).mul(night));
      },
    });
    const rock = new THREE.Mesh(merge(rocks), lime);
    rock.castShadow = rock.receiveShadow = true;
    k.add(rock);
    const pineGeo = merge([
      new THREE.ConeGeometry(1, 0.55, 7).translate(0, 0.42, 0),
      new THREE.ConeGeometry(0.8, 0.5, 7).translate(0, 0.66, 0),
      new THREE.ConeGeometry(0.55, 0.42, 7).translate(0, 0.86, 0),
      new THREE.CylinderGeometry(0.06, 0.08, 0.3, 5).translate(0, 0.15, 0),
    ]);
    k.add(instances(pineGeo, lit(k, {
      color: 0x1d2a1e, roughness: 0.9,
      emissive: /* glsl */ `totalEmissiveRadiance += vec3(0.5, 0.35, 1.0) * fres * 0.6 * (0.6 + 0.4 * sin(uTime * 23.0 + vLocal.x)) * uNight;`,
      emissiveNode: ({ local: L, t, night, fres }) => vec3(0.5, 0.35, 1).mul(fres).mul(0.6).mul(sin(t.mul(23).add(L.x)).mul(0.4).add(0.6)).mul(night),
    }), pines));

    // the corona: tongues of violet fire licking up from every pine tip
    const tipArr = tips.map((v) => [v.x, v.y, v.z] as [number, number, number]);
    k.add(particles(k, {
      count: 4 * 34, color: 0x9a78ff, day: 0.0, night: 5.0, shape: SHAPE_FLAME,
      base: (i, r) => { const t = tipArr[i % 4], a = r() * Math.PI * 2, d = Math.sqrt(r()) * 1.8; return [t[0] + Math.cos(a) * d, t[1] - r() * 2.5, t[2] + Math.sin(a) * d]; },
      motion: /* glsl */ `float f = bNoise(vec3(t * 11.0 + s.x * 40.0, s.y * 9.0, 0.0));
        float g = bNoise(vec3(t * 3.0 + s.z * 20.0, 1.0, 0.0));
        size = 0.25 + 0.5 * f * f + 0.25 * s.w;
        stretch = 1.5 + 2.5 * f;
        pos.y += size * stretch * 0.7;
        pos.xz += vec2(sin(t * 7.0 + s.x * 30.0), cos(t * 6.0 + s.y * 30.0)) * 0.15;
        alpha = smoothstep(0.25, 0.7, f * 0.7 + g * 0.5);
        col = mix(vec3(0.7, 0.45, 1.0), vec3(0.85, 0.9, 1.4), f * f);`,
      shapeNode: shapeFlame,
      motionNode: ({ s, pos, t }) => {
        const f = bNoise(vec3(t.mul(11).add(s.x.mul(40)), s.y.mul(9), 0)), g = bNoise(vec3(t.mul(3).add(s.z.mul(20)), 1, 0));
        const size = f.mul(f).mul(0.5).add(s.w.mul(0.25)).add(0.25), stretch = f.mul(2.5).add(1.5);
        const sway = vec2(sin(t.mul(7).add(s.x.mul(30))), cos(t.mul(6).add(s.y.mul(30)))).mul(0.15);
        return {
          pos: vec3(pos.x.add(sway.x), pos.y.add(size.mul(stretch).mul(0.7)), pos.z.add(sway.y)), size, stretch,
          alpha: smoothstep(0.25, 0.7, f.mul(0.7).add(g.mul(0.5))), col: mix(vec3(0.7, 0.45, 1), vec3(0.85, 0.9, 1.4), f.mul(f)),
        };
      },
    }));
    // sparks spitting off the crowns
    k.add(particles(k, {
      count: 4 * 14, color: 0xd6c8ff, day: 0.0, night: 4.0, shape: SHAPE_SPARK,
      base: (i) => tipArr[i % 4],
      motion: /* glsl */ `float T = 0.7 + s.y * 0.8; float tt = mod(t + s.x * 9.0, T);
        float a = s.z * 6.2831;
        pos += vec3(cos(a) * tt * 3.0, tt * 4.0 - 3.0 * tt * tt, sin(a) * tt * 3.0);
        size = 0.08; alpha = (1.0 - tt / T) * step(0.6, bNoise(vec3(floor((t + s.x * 9.0) / T), s.w * 10.0, 0.0)) + 0.35);`,
      shapeNode: shapeSpark,
      motionNode: ({ s, pos, t }) => {
        const T = s.y.mul(0.8).add(0.7), tt = mod(t.add(s.x.mul(9)), T), a = s.z.mul(6.2831);
        return {
          pos: pos.add(vec3(cos(a).mul(tt).mul(3), tt.mul(4).sub(tt.mul(tt).mul(3)), sin(a).mul(tt).mul(3))), size: 0.08,
          alpha: float(1).sub(tt.div(T)).mul(step(0.6, bNoise(vec3(floor(t.add(s.x.mul(9)).div(T)), s.w.mul(10), 0))).add(0.35)),
        };
      },
    }));
    for (const tip of tips) {
      k.add(halo(k, [tip.x, tip.y + 0.5, tip.z], 7, 0x8a66ff, 0.0, 1.1, '0.7 + 0.3 * bNoise(vec3(uTime * 8.0, s.x * 10.0, 0.0))', 0, '',
        ({ t, s }) => bNoise(vec3(t.mul(8), s.x.mul(10), 0)).mul(0.3).add(0.7)));
    }
    k.add(halo(k, [0, 54, 0], 36, 0x7a5cff, 0, 0.11, '1.0', 36));

    // arcs: now and then a jagged line of light jumps between two crowns
    const pairs: [number, number][] = [[0, 1], [0, 2], [0, 3], [1, 3]];
    pairs.forEach(([a, b], i) => {
      const A = tips[a], B = tips[b];
      const pts: THREE.Vector3[] = [], widths: number[] = [];
      for (let j = 0; j <= 30; j++) {
        const f = j / 30;
        pts.push(new THREE.Vector3().lerpVectors(A, B, f).add(new THREE.Vector3(0, Math.sin(f * Math.PI) * 5, 0)));
        widths.push(0.5);
      }
      const side = new THREE.Vector3().subVectors(B, A).normalize();
      const n1 = new THREE.Vector3(0, 1, 0).cross(side).normalize();
      const geo = merge([strip(pts, widths, n1), strip(pts, widths, new THREE.Vector3(0, 1, 0))]);
      const period = 2.3 + i * 0.9;
      let len = 0;
      for (let j = 1; j < pts.length; j++) len += pts[j].distanceTo(pts[j - 1]);
      const arcOn = (t: F): F => {
        const ph = t.div(period).add(i * 0.37), f = fract(ph), n = floor(ph);
        return step(f, 0.05).mul(step(0.45, bHash1(n.mul(1.7).add(i)))).mul(step(0.5, fract(f.mul(60))).mul(0.4).add(0.6));
      };
      k.add(surface(k, geo, {
        color: 0xc8b8ff, day: 0, night: 9.0,
        defs: /* glsl */ `float arcOn(float t) { float ph = t / ${period.toFixed(2)} + ${(i * 0.37).toFixed(2)};
          float f = fract(ph); float n = floor(ph);
          return step(f, 0.05) * step(0.45, bHash1(n * 1.7 + ${i.toFixed(1)})) * (0.6 + 0.4 * step(0.5, fract(f * 60.0))); }`,
        vertex: /* glsl */ `float n = floor(uTime * 18.0);
          float L = ${len.toFixed(2)};
          float j = sin(uv.y * 0.9 + n * 1.3) * 1.2 + (bNoise(vec3(uv.y * 0.6, n, 0.0)) - 0.5) * 2.6;
          float env = sin(clamp(uv.y / max(L, 1.0), 0.0, 1.0) * 3.14159);
          p += vec3(j, (bNoise(vec3(uv.y * 0.8, n, 5.0)) - 0.5) * 2.0, -j) * env;`,
        paint: /* glsl */ `float x = abs(vUv.x - 0.5) * 2.0;
          glow = arcOn(uTime) * (exp(-x * x * 10.0) + 0.3);
          col = mix(vec3(0.75, 0.65, 1.0), vec3(1.2), exp(-x * x * 30.0));`,
        vertexNode: ({ p, uv: f, t }) => {
          const n = floor(t.mul(18));
          const j = sin(f.y.mul(0.9).add(n.mul(1.3))).mul(1.2).add(bNoise(vec3(f.y.mul(0.6), n, 0)).sub(0.5).mul(2.6));
          const env = sin(clamp(f.y.div(Math.max(len, 1)), 0, 1).mul(Math.PI));
          return p.add(vec3(j, bNoise(vec3(f.y.mul(0.8), n, 5)).sub(0.5).mul(2), j.negate()).mul(env));
        },
        paintNode: ({ uv: f, t }) => {
          const x = abs(f.x.sub(0.5)).mul(2), x2 = x.mul(x);
          return { glow: arcOn(t).mul(exp(x2.mul(-10)).add(0.3)), col: mix(vec3(0.75, 0.65, 1), vec3(1.2), exp(x2.mul(-30))) };
        },
      }));
    });

    k.setPulse((t) => 0.75 + 0.25 * Math.sin(t * 17) * Math.sin(t * 7.3));
    return k.root;
  },
};
