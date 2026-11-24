import {
  DoubleSide,
  DynamicDrawUsage,
  InstancedBufferGeometry,
  InstancedInterleavedBuffer,
  InterleavedBufferAttribute,
  Mesh,
  MeshBasicNodeMaterial,
} from 'three/webgpu';
import {
  Fn,
  abs,
  attribute,
  cameraPosition,
  float,
  max,
  normalize,
  sin,
  smoothstep,
  varying,
  vec3,
} from 'three/tsl';
import { FALL_MARK } from '../palette.ts';
import type { BallDraw } from '../snapshot.ts';
import * as sphere from '../world/sphere.ts';
import { additive, quad } from '../gpu.ts';
import { tangentFrame, type FloatNode } from '../tsl.ts';

const MARKS = 64;
export const MARK = 11;
const MARK_PIXELS = 2;
const FLIGHT = 5;

export function createMarks(pixel: FloatNode, now: FloatNode) {
  const g = quad(new InstancedBufferGeometry());
  const data = new Float32Array(MARKS * 4);
  const buffer = new InstancedInterleavedBuffer(data, 4).setUsage(
    DynamicDrawUsage
  );
  g.setAttribute('markAt', new InterleavedBufferAttribute(buffer, 4, 0));
  g.instanceCount = 0;
  const mark = attribute('markAt', 'vec4'),
    at = mark.xyz,
    up = normalize(at),
    local = attribute('position', 'vec3');
  const { e1, e2 } = tangentFrame(up);
  const m = additive(
    new MeshBasicNodeMaterial({
      transparent: true,
      depthWrite: false,
      side: DoubleSide,
    })
  );
  m.positionNode = at
    .add(e1.mul(local.x.mul(MARK)))
    .add(e2.mul(local.y.mul(MARK)));
  const far = cameraPosition.sub(at).length(),
    line = varying(max(float(0.35), far.mul(pixel).mul(MARK_PIXELS)).div(MARK));
  const uv = varying(local.xy),
    near = varying(mark.w);
  m.colorNode = Fn(() => {
    const r = uv.length(),
      ring = (at: FloatNode) => smoothstep(line, line.mul(0.4), abs(r.sub(at)));
    const pulse = sin(now.mul(9)).mul(0.2).add(0.8);
    const inner = float(1).sub(near).mul(0.92).add(0.04);
    return vec3(...FALL_MARK)
      .mul(ring(float(0.97)).add(ring(inner).mul(0.7)))
      .mul(near.mul(0.7).add(0.3))
      .mul(pulse);
  })();
  const mesh = new Mesh(g, m);
  mesh.frustumCulled = false;
  mesh.renderOrder = 2;

  return {
    mesh,
    draw(flying: readonly BallDraw[], n: number) {
      let k = 0;
      for (let i = 0; i < n && k < MARKS; i++) {
        const { at, way, gun, to } = flying[i];
        if (gun !== 'mortar') continue;
        const speed = Math.max(1e-3, Math.hypot(way[0], way[1], way[2])),
          q = 4 * k++,
          R = sphere.R,
          rx = at[0] - to[0] * R,
          ry = at[1] - to[1] * R,
          rz = at[2] - to[2] * R;
        for (let j = 0; j < 3; j++) data[q + j] = to[j] * (R + 0.15);
        data[q + 3] = 1 - Math.min(1, Math.hypot(rx, ry, rz) / speed / FLIGHT);
      }
      buffer.needsUpdate = k > 0;
      g.instanceCount = k;
    },
  };
}
