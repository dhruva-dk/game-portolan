// The Kelp Shallows: the Lantern Kelp. A stand of giant kelp so tall it rises out of the water in twisting columns,
// hung with gold-brown blades and strung with gas floats. At night the floats glow like lanterns, pulses of cold cyan
// light climb the stipes, the canopy mat on the surface glimmers and plankton sparks drift up through it all. By day it
// is olive-gold kelp swaying over the shallows. From far off: a cluster of swaying cyan columns beaded with light.
import * as THREE from 'three';
import { Kit, halo, lit, merge, particles, strip, surface, tag, tick, tube, disc } from '../kit.ts';
import type { BeaconLook } from '../look.ts';
import { abs, attribute, clamp, cos, length, max, mix, mod, pow, sin, smoothstep, uv, varying, vec2, vec3 } from 'three/tsl';
import { bFbm, bNoise, shapeSpark, type Clocked, type F, type V3 } from '../nodes.ts';

/** The same sway and pulse as nodes, and each part's phase as the vertex and the fragment have it. */
const phase = (): F => attribute<'float'>('aPhase') as unknown as F;
const vPhase = (): F => varying(phase(), 'vKelpPhase') as unknown as F;
const sway = (p: V3, ph: F, t: F): V3 => {
  const h0 = clamp(p.y.add(3).div(58), 0, 1), h = h0.mul(h0);
  return vec3(
    sin(t.mul(0.5).add(ph.mul(6))).mul(3.2).add(sin(t.mul(1.25).add(ph.mul(9)).add(p.y.mul(0.14))).mul(0.7)), 0,
    cos(t.mul(0.43).add(ph.mul(7))).mul(2.4).add(cos(t.mul(1.05).add(p.y.mul(0.11)).add(ph.mul(5))).mul(0.6)),
  ).mul(h);
};
const pulse = (y: F, ph: F, t: F): F => pow(max(0, sin(y.mul(0.2).sub(t.mul(2.1)).add(ph.mul(11)))), 14);
const moveNode = ({ p, t }: Clocked & { p: V3 }): V3 => p.add(sway(p, phase(), t));

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
      color: 0x4c4518, roughness: 0.55,
      vertexNode: moveNode,
      albedoNode: ({ local: L }) => mix(vec3(0.16, 0.13, 0.04), vec3(0.32, 0.26, 0.08), bNoise(L.mul(vec3(2, 0.3, 2)))),
      emissiveNode: ({ local: L, t, night }) =>
        vec3(0.1, 0.8, 1).mul(pulse(L.y, vPhase(), t).mul(4).add(0.25)).mul(smoothstep(-1, 1, L.y)).mul(night),
    });
    const stand = new THREE.Mesh(merge(stipes, ['aPhase']), stipeMat);
    stand.frustumCulled = false;
    k.add(stand);

    const bladeMat = lit(k, {
      color: 0x8a7424, roughness: 0.5, side: THREE.DoubleSide,
      vertexNode: moveNode,
      albedoNode: () => {
        const f = uv(), vein = smoothstep(0.08, 0, abs(f.x.sub(0.5))).mul(0.25);
        return mix(vec3(0.42, 0.33, 0.08), vec3(0.62, 0.5, 0.14), bNoise(vec3(f.mul(vec2(3, 1.2)), vPhase().mul(9)))).mul(vein.oneMinus());
      },
      emissiveNode: ({ local: L, t, night, fres }) =>
        vec3(0.08, 0.6, 0.8).mul(pulse(L.y, vPhase(), t).mul(0.9).add(0.06).add(fres.mul(0.25))).mul(night)
          .add(vec3(0.25, 0.2, 0.04).mul(fres).mul(0.25).mul(night.oneMinus())),
    });
    bladeMat.defines = { USE_UV: '' };
    const leaves = new THREE.Mesh(merge(blades, ['aPhase']), bladeMat);
    leaves.frustumCulled = false;
    k.add(leaves);

    // the floats: lanterns of light strung up every column
    const fg = new THREE.SphereGeometry(1, 10, 8);
    fg.scale(1, 1.3, 1);
    const fl = new THREE.InstancedMesh(fg, lit(k, {
      color: 0xb8a050, roughness: 0.3,
      vertexNode: moveNode,
      emissiveNode: ({ local: L, t, night }) => {
        const ph = vPhase(), p = pulse(L.y, ph, t), lamp = sin(t.mul(1.7).add(ph.mul(40)).add(L.y)).mul(0.4).add(0.6);
        return mix(vec3(0.2, 0.85, 1), vec3(0.85, 1, 1), p).mul(lamp.mul(1.6).add(p.mul(7))).mul(mix(0.02, 1, night));
      },
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
      paintNode: ({ local, t }) => {
        const p = local.xz, d = length(p);
        const mat = smoothstep(0.48, 0.62, bFbm(vec3(p.mul(0.16), 1)).add(d.div(26).oneMinus().mul(0.25)));
        const edge = smoothstep(26, 18, d), spark = pow(bNoise(vec3(p.mul(1.6), t.mul(0.8))), 6).mul(3);
        return {
          alpha: mat.mul(edge).mul(0.85),
          glow: mat.mul(edge).mul(spark.add(0.12).add(pow(max(0, sin(d.mul(0.5).sub(t.mul(1.2)))), 8).mul(0.4))),
        };
      },
    }));

    // plankton sparks drifting up the stand
    k.add(particles(k, {
      count: 280, color: 0x5fe8ff, day: 0, night: 2.6,
      base: (_i, r) => { const a = r() * Math.PI * 2, d = r() * 17; return [Math.cos(a) * d, 0, Math.sin(a) * d]; },
      shapeNode: shapeSpark,
      motionNode: ({ s, pos, t }) => {
        const Hh = 56, y = mod(s.y.mul(Hh).add(t.mul(s.z.mul(0.8).add(0.6))), Hh);
        const tw = pow(sin(t.mul(s.z.mul(3).add(1.5)).add(s.w.mul(40))).mul(0.5).add(0.5), 4);
        return {
          pos: pos.add(vec3(sin(t.mul(0.3).add(s.w.mul(6.28)).add(y.mul(0.12))).mul(1.5), y, cos(t.mul(0.26).add(s.x.mul(6.28))).mul(1.5))),
          size: tw.mul(0.12).add(0.08), alpha: tw.mul(0.9).add(0.2).mul(smoothstep(0, 2, y)).mul(smoothstep(Hh, Hh - 12, y)),
        };
      },
    }));

    k.add(halo(k, [0, 4, 0], 20, 0x1fd6ff, 0, 0.35, 18));
    k.add(halo(k, [0, 34, 0], 32, 0x18c4f0, 0, 0.12, 32));
    k.setPulse((t) => 0.85 + 0.15 * Math.sin(t * 1.7));
    return k.root;
  },
};
