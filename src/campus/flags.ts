// The crew's flags over its rookery: one cloth, instanced at the head of every flagpole the buildings and the quay
// put up, flying downwind and rippling (in the vertex shader, by the clock), in the crew's first colour with its
// emblem (one of twelve marks, drawn as distance fields over the cloth) in its second. Lit as a sail is, from either
// side and through it (sky/light.ts leaf).

import { DoubleSide, InstancedMesh, Matrix4, MeshBasicNodeMaterial, PlaneGeometry, Vector3 } from 'three/webgpu';
import {
  Fn, abs, atan, cos, faceDirection, float, fwidth, instanceIndex, length, max, min, mix, normalWorld, normalize, positionLocal,
  positionWorld, select, sin, smoothstep, uniform, uv, vec2, vec3,
} from 'three/tsl';
import { DYE_SHADE, type Rgb } from '../palette';
import type { Light } from '../sky/light';
import type { FloatNode, Vec2Node } from '../tsl';

/** A flag's size, metres (it flies along its x, hangs down its y), and its cloth's divisions; the most flown at once. */
export const FLAG = { long: 3.4, deep: 2.2, along: 12, down: 6, most: 40 } as const;

/** The emblem's marks (0–11), each a distance field over the flag (p: its middle at 0, a unit its depth; inside < 0). */
const box = (p: Vec2Node, w: number, h: number) => max(abs(p.x).sub(w), abs(p.y).sub(h));
const turned = (p: Vec2Node) => vec2(p.x.add(p.y), p.y.sub(p.x)).mul(Math.SQRT1_2);
const MARKS: readonly ((p: Vec2Node) => FloatNode)[] = [
  (p) => length(p).sub(0.3),
  (p) => abs(length(p).sub(0.26)).sub(0.075),
  (p) => abs(p.x).add(abs(p.y)).sub(0.36),
  (p) => min(box(p, 0.36, 0.09), box(p, 0.09, 0.36)),
  (p) => min(box(turned(p), 0.4, 0.085), box(turned(p), 0.085, 0.4)),
  (p) => length(p).sub(float(0.21).add(cos(atan(p.y, p.x).mul(5).sub(Math.PI / 2)).mul(0.11))),
  (p) => max(length(p).sub(0.3), length(p.sub(vec2(0.13, 0.07))).sub(0.25).negate()),
  (p) => max(abs(p.x).mul(1.732).add(p.y).sub(0.3), p.y.negate().sub(0.22)),
  (p) => max(abs(p.y.add(abs(p.x).mul(0.8)).sub(0.06)).sub(0.08), abs(p.x).sub(0.4)),
  (p) => max(abs(abs(p.y).sub(0.15)).sub(0.065), abs(p.x).sub(0.4)),
  (p) => max(box(p.sub(vec2(-0.38, 0.25)), 0.38, 0.25), float(-1)),
  (p) => length(p).sub(float(0.17).add(smoothstep(0.2, 0.3, cos(atan(p.y, p.x).mul(8))).mul(0.12))),
];

export function createFlags(light: Light) {
  const geometry = new PlaneGeometry(FLAG.long, FLAG.deep, FLAG.along, FLAG.down);
  // (from the pole out along x, hanging down from its head)
  geometry.translate(FLAG.long / 2, -FLAG.deep / 2, 0);
  const clock = uniform(0), emblem = uniform(0, 'int');
  const first = uniform(new Vector3(1, 1, 1)), second = uniform(new Vector3(0, 0, 0));
  const material = new MeshBasicNodeMaterial({ side: DoubleSide });
  material.positionNode = Fn(() => {
    // a ripple running out along the cloth, freest at its fly; each flag at its own phase
    const s = positionLocal.x.div(FLAG.long), phase = float(instanceIndex).mul(1.7);
    const wave = sin(clock.mul(4.2).sub(positionLocal.x.mul(1.9)).add(phase)).mul(0.22).add(sin(clock.mul(6.1).sub(positionLocal.x.mul(3.1)).add(phase.mul(2))).mul(0.07));
    return positionLocal.add(vec3(0, s.mul(s).mul(-0.25), wave.mul(s)));
  })();
  material.colorNode = Fn(() => {
    const p = uv().sub(0.5).mul(vec2(FLAG.long / FLAG.deep, 1));
    let d: FloatNode = MARKS[MARKS.length - 1](p);
    for (let i = MARKS.length - 2; i >= 0; i--) d = select(emblem.equal(i), MARKS[i](p), d);
    const w = max(fwidth(d), 0.004), mark = smoothstep(w, w.negate(), d);
    const lit = mix(first, second, mark);
    return light.leaf(positionWorld, normalize(normalWorld).mul(faceDirection), lit, lit.mul(vec3(...DYE_SHADE)));
  })();
  const mesh = new InstancedMesh(geometry, material, FLAG.most);
  mesh.count = 0;
  mesh.frustumCulled = false;
  mesh.name = 'flags';
  const m = new Matrix4(), x = new Vector3(), y = new Vector3(), z = new Vector3();
  return {
    mesh,
    /** Flies a flag at each head (world metres), its staff upright (`up`), blowing toward `downwind` (a tangent). */
    fly(heads: readonly { at: readonly [number, number, number]; up: readonly [number, number, number] }[], downwind: readonly [number, number, number]) {
      mesh.count = Math.min(heads.length, FLAG.most);
      for (let i = 0; i < mesh.count; i++) {
        y.set(...heads[i].up);
        x.set(...downwind).addScaledVector(y, -x.dot(y)).normalize();
        z.crossVectors(x, y);
        mesh.setMatrixAt(i, m.makeBasis(x, y, z).setPosition(...heads[i].at));
      }
      mesh.instanceMatrix.needsUpdate = true;
    },
    /** The crew's colours (linear rgb) and its emblem (0–11). */
    crew(a: Rgb, b: Rgb, mark: number) {
      first.value.set(...a);
      second.value.set(...b);
      emblem.value = ((Math.round(mark) % 12) + 12) % 12;
    },
    /** The world's clock, s. */
    tick(seconds: number) {
      clock.value = seconds;
    },
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}
