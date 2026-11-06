// The gulls and the whales as node materials.
//
// A gull's wings beat in its own space before its instance's matrix places it, as skinning does: the arm turns at
// the shoulder and the hand at the wrist, a beat behind, with the normals turned alike. A whale's flanks glow with
// spots and stripes after dark. The GL version also faded the whale toward the water's blue below the surface; the
// WebGPU sea draws what lies beneath it through its own refraction and Beer–Lambert absorption, so the whale is
// drawn as it is.
import { MeshStandardNodeMaterial, type MeshStandardMaterialParameters, type NodeBuilder, type Texture } from 'three/webgpu';
import {
  Fn, abs, attribute, cos, dot, float, normalGeometry, normalLocal, positionGeometry, positionLocal, positionWorld, select,
  sign, sin, smoothstep, step, texture, vec2, vec3,
} from 'three/tsl';
import { LAMP, P } from '../../gpu/uniforms.ts';
import { moved, read, type F, type Uniforms, type V2, type V3 } from './kit.ts';

/** `v` turned by `a` radians about `o`. */
const turn = (v: V2, o: V2, a: F): V2 => {
  const c = cos(a), s = sin(a), q = v.sub(o);
  return o.add(vec2(c.mul(q.x).sub(s.mul(q.y)), s.mul(q.x).add(c.mul(q.y))));
};

const flap = Fn(() => {
  const part = attribute<'float'>('aPart') as F, beat = attribute<'vec2'>('aFlap') as V2;
  const side = sign(part), joint = abs(part);
  const arm = sin(beat.x).mul(beat.y).mul(side), hand = sin(beat.x.sub(0.8)).mul(beat.y).mul(0.8).mul(side);
  const p0 = positionGeometry, n0 = normalGeometry;
  // the hand at the wrist, then the whole wing at the shoulder
  const wrist = vec2(side.mul(0.74), 0.1), shoulder = vec2(side.mul(0.14), 0.1);
  const p1 = select(joint.greaterThan(1.5), turn(p0.xy, wrist, hand), p0.xy);
  const n1 = select(joint.greaterThan(1.5), turn(n0.xy, vec2(0), hand), n0.xy);
  const p2 = select(joint.greaterThan(0.5), turn(p1, shoulder, arm), p1);
  const n2 = select(joint.greaterThan(0.5), turn(n1, vec2(0), arm), n1);
  positionLocal.assign(moved(vec3(p2, p0.z)));
  normalLocal.assign(vec3(n2, n0.z));
});

class Gull extends MeshStandardNodeMaterial {
  override setupPosition(builder: NodeBuilder): ReturnType<MeshStandardNodeMaterial['setupPosition']> {
    flap();
    return super.setupPosition(builder);
  }
}

export function gullNodeMaterial(base: MeshStandardMaterialParameters): MeshStandardNodeMaterial {
  return new Gull(base);
}

export function whaleNodeMaterial(base: MeshStandardMaterialParameters, u: Uniforms, noise: Texture, scale: number): MeshStandardNodeMaterial {
  const m = new MeshStandardNodeMaterial(base);
  const glow = read(u, 'uGlow', 'float');
  const lp = positionGeometry.div(scale);
  // bioluminescent spots and stripes along the flanks, strong at night, faint by day
  const spots = smoothstep(0.62, 0.7, texture(noise, lp.xz.mul(0.06).add(lp.y.mul(0.02))).r);
  const stripe = smoothstep(0.92, 1, sin(lp.z.mul(0.9)).mul(0.5).add(0.5)).mul(smoothstep(0.5, 2.5, abs(lp.x))).mul(step(lp.y, 0.5));
  const night = float(1).sub(smoothstep(-0.14, 0.12, dot(positionWorld.normalize(), P.sunDir)));
  const pulse = sin(P.time.mul(2).add(lp.z.mul(0.3))).mul(0.3).add(0.7);
  m.emissiveNode = (m.emissive ? vec3(m.emissive.r, m.emissive.g, m.emissive.b) : vec3(0) as V3)
    .mul(spots.mul(1.5).add(stripe.mul(0.8))).mul(glow).mul(night.mul(0.88).add(0.12)).mul(pulse).mul(LAMP).mul(2.5);
  return m;
}
