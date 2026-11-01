// The Kelp Shallows: the Lantern Kelp. A stand of giant kelp so tall it rises out of the water in twisting columns,
// hung with gold-brown blades and strung with gas floats. At night the floats glow like lanterns, pulses of cold cyan
// light climb the stipes, the canopy mat on the surface glimmers and plankton sparks drift up through it all. By day it
// is olive-gold kelp swaying over the shallows. From far off: a cluster of swaying cyan columns beaded with light.
import * as THREE from 'three';
import { Kit, halo, lit, merge, particles, strip, surface, tag, tick, tube, disc, SHAPE_SPARK } from '../kit.ts';
import type { BeaconLook } from '../look.ts';

// the sway every part of a column shares, so stipes, blades and floats move as one
const SWAY = /* glsl */ `
varying float vPhase;
vec3 kelpSway(vec3 p, float ph) {
  float h = clamp((p.y + 3.0) / 58.0, 0.0, 1.0); h *= h;
  return vec3(sin(uTime * 0.5 + ph * 6.0) * 3.2 + sin(uTime * 1.25 + ph * 9.0 + p.y * 0.14) * 0.7, 0.0,
              cos(uTime * 0.43 + ph * 7.0) * 2.4 + cos(uTime * 1.05 + p.y * 0.11 + ph * 5.0) * 0.6) * h;
}
float kelpPulse(float y, float ph) { return pow(max(0.0, sin(y * 0.2 - uTime * 2.1 + ph * 11.0)), 14.0); }`;
const MOVE = /* glsl */ `vPhase = aPhase; transformed += kelpSway(vLocal, aPhase);`;
const MOVE_INST = /* glsl */ `vPhase = aPhase; transformed += inverse(mat3(instanceMatrix)) * kelpSway(vLocal, aPhase);`;

export const kelpShallows: BeaconLook = {
  name: 'the Lantern Kelp',
  what: 'Giant kelp rising from the water in twisting columns, its gas floats glowing like lanterns and cyan pulses climbing the stipes.',
  color: 0x1fd6ff,
  lightHeight: 22,
  height: 58,
  radius: 22,
  ground: 'sea',
  update: tick,
  build(seed) {
    const k = new Kit(seed, 'beacon:kelpShallows');
    const stipes: THREE.BufferGeometry[] = [], blades: THREE.BufferGeometry[] = [];
    const floats: { p: THREE.Vector3; ph: number; s: number }[] = [];
    const cols = 9;
    for (let c = 0; c < cols; c++) {
      const a = (c / cols) * Math.PI * 2 + k.r(-0.3, 0.3), d = c === 0 ? 0 : k.r(5, 15);
      const cx = Math.cos(a) * d, cz = Math.sin(a) * d;
      const top = c === 0 ? 56 : k.r(28, 50), ph = k.rand();
      const centre = (y: number) => new THREE.Vector3(cx + Math.sin(y * 0.045 + ph * 6) * 1.8, y, cz + Math.cos(y * 0.038 + ph * 5) * 1.4);
      for (let s = 0; s < 3; s++) {
        const pts: THREE.Vector3[] = [];
        const st = top - k.r(0, 6);
        for (let y = -4; y <= st; y += 2) {
          const ang = y * 0.12 + (s / 3) * Math.PI * 2;
          pts.push(centre(y).add(new THREE.Vector3(Math.cos(ang) * 0.75, 0, Math.sin(ang) * 0.75)));
        }
        stipes.push(tag(tube(pts, 0.3, 0.14, 6, pts.length * 3), 'aPhase', ph));
        // blades and floats off the stipe every couple of metres above the water
        for (let y = 1 + k.r(0, 2); y < st - 1; y += k.r(1.6, 2.6)) {
          const ang = y * 0.12 + (s / 3) * Math.PI * 2 + k.r(-0.6, 0.6);
          const base = centre(y).add(new THREE.Vector3(Math.cos(ang) * 0.85, 0, Math.sin(ang) * 0.85));
          const out = new THREE.Vector3(Math.cos(ang), 0, Math.sin(ang));
          const len = k.r(2.4, 4.2), bp: THREE.Vector3[] = [], bw: number[] = [];
          for (let i = 0; i <= 6; i++) {
            const f = i / 6;
            bp.push(base.clone().addScaledVector(out, f * len * 0.7 + 0.3).add(new THREE.Vector3(0, -f * f * len * 0.75 + Math.sin(f * 3) * 0.2, 0)));
            bw.push(Math.sin(Math.min(1, f * 1.3 + 0.08) * Math.PI) * k.r(0.45, 0.75) + 0.05);
          }
          blades.push(tag(strip(bp, bw, new THREE.Vector3(0, 1, 0).cross(out).normalize()), 'aPhase', ph));
          floats.push({ p: base.clone().addScaledVector(out, 0.35), ph, s: k.r(0.22, 0.36) });
        }
      }
    }

    const stipeMat = lit(k, {
      color: 0x4c4518, roughness: 0.55, defs: SWAY, vdefs: 'attribute float aPhase;', vertex: MOVE,
      albedo: `diffuseColor.rgb = mix(vec3(0.16, 0.13, 0.04), vec3(0.32, 0.26, 0.08), bNoise(vLocal * vec3(2.0, 0.3, 2.0)));`,
      emissive: /* glsl */ `float p = kelpPulse(vLocal.y, vPhase);
        totalEmissiveRadiance += vec3(0.1, 0.8, 1.0) * (0.25 + 4.0 * p) * smoothstep(-1.0, 1.0, vLocal.y) * uNight;`,
    });
    const stand = new THREE.Mesh(merge(stipes, ['aPhase']), stipeMat);
    stand.frustumCulled = false;
    k.add(stand);

    const bladeMat = lit(k, {
      color: 0x8a7424, roughness: 0.5, side: THREE.DoubleSide, defs: SWAY, vdefs: 'attribute float aPhase;', vertex: MOVE,
      albedo: /* glsl */ `float vein = smoothstep(0.08, 0.0, abs(vUv.x - 0.5)) * 0.25;
        diffuseColor.rgb = mix(vec3(0.42, 0.33, 0.08), vec3(0.62, 0.5, 0.14), bNoise(vec3(vUv * vec2(3.0, 1.2), vPhase * 9.0))) * (1.0 - vein);`,
      emissive: /* glsl */ `float p = kelpPulse(vLocal.y, vPhase);
        totalEmissiveRadiance += vec3(0.08, 0.6, 0.8) * (0.06 + 0.9 * p + fres * 0.25) * uNight
          + vec3(0.25, 0.2, 0.04) * fres * 0.25 * (1.0 - uNight);`,
    });
    bladeMat.defines = { USE_UV: '' };
    const leaves = new THREE.Mesh(merge(blades, ['aPhase']), bladeMat);
    leaves.frustumCulled = false;
    k.add(leaves);

    // the floats: lanterns of light strung up every column
    const fg = new THREE.SphereGeometry(1, 10, 8);
    fg.scale(1, 1.3, 1);
    const fl = new THREE.InstancedMesh(fg, lit(k, {
      color: 0xb8a050, roughness: 0.3, defs: SWAY, vdefs: 'attribute float aPhase;', vertex: MOVE_INST,
      emissive: /* glsl */ `float p = kelpPulse(vLocal.y, vPhase);
        float lamp = 0.6 + 0.4 * sin(uTime * 1.7 + vPhase * 40.0 + vLocal.y);
        totalEmissiveRadiance += mix(vec3(0.2, 0.85, 1.0), vec3(0.85, 1.0, 1.0), p) * (1.6 * lamp + 7.0 * p) * mix(0.02, 1.0, uNight);`,
    }), floats.length);
    const phases = new Float32Array(floats.length);
    floats.forEach((f, i) => {
      fl.setMatrixAt(i, new THREE.Matrix4().compose(f.p, new THREE.Quaternion(), new THREE.Vector3(f.s, f.s, f.s)));
      phases[i] = f.ph;
    });
    fg.setAttribute('aPhase', new THREE.InstancedBufferAttribute(phases, 1));
    fl.frustumCulled = false;
    k.add(fl);

    // the canopy: a mat of kelp lying on the surface, glimmering at night
    k.add(surface(k, disc(26, 0.12, 64), {
      color: 0x1fd6ff, day: 0, night: 0.9, blend: 'alpha', matter: 0x5a4a14,
      paint: /* glsl */ `vec2 p = vLocal.xz;
        float mat = smoothstep(0.48, 0.62, bFbm(vec3(p * 0.16, 1.0)) + 0.25 * (1.0 - length(p) / 26.0));
        float edge = smoothstep(26.0, 18.0, length(p));
        float spark = pow(bNoise(vec3(p * 1.6, uTime * 0.8)), 6.0) * 3.0;
        alpha = mat * edge * 0.85;
        glow = mat * edge * (0.12 + spark + 0.4 * pow(max(0.0, sin(length(p) * 0.5 - uTime * 1.2)), 8.0));`,
    }));

    // plankton sparks drifting up the stand
    k.add(particles(k, {
      count: 280, color: 0x5fe8ff, day: 0, night: 2.6, shape: SHAPE_SPARK,
      base: (_i, r) => { const a = r() * Math.PI * 2, d = r() * 17; return [Math.cos(a) * d, 0, Math.sin(a) * d]; },
      motion: /* glsl */ `float Hh = 56.0; float y = mod(s.y * Hh + t * (0.6 + s.z * 0.8), Hh);
        pos += vec3(sin(t * 0.3 + s.w * 6.28 + y * 0.12) * 1.5, y, cos(t * 0.26 + s.x * 6.28) * 1.5);
        float tw = pow(0.5 + 0.5 * sin(t * (1.5 + s.z * 3.0) + s.w * 40.0), 4.0);
        size = 0.08 + 0.12 * tw; alpha = (0.2 + 0.9 * tw) * smoothstep(0.0, 2.0, y) * smoothstep(Hh, Hh - 12.0, y);`,
    }));

    k.add(halo(k, [0, 4, 0], 20, 0x1fd6ff, 0, 0.35, '1.0', 18));
    k.add(halo(k, [0, 34, 0], 32, 0x18c4f0, 0, 0.12, '1.0', 32));
    k.setPulse((t) => 0.85 + 0.15 * Math.sin(t * 1.7));
    return k.root;
  },
};
