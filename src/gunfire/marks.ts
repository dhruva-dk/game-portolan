// The fall marks: where each mortar shell will come down, a ring of its
// splash's size laid on the water, tightening and brightening as the shell nears
// it, for her to steer out of (and to see her own will land). One draw, a
// single instanced mesh, one instance a shell in flight.

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

/** The most fall marks at once. */
const MARKS = 64;
/**
 * A fall mark: its radius (the mortar's splash, sim/handling.ts GUNS;
 * tests/guns.test.ts holds them equal) and the fewest pixels its line is wide;
 * its glow is palette.ts FALL_MARK.
 */
export const MARK = 11;
const MARK_PIXELS = 2;
/**
 * Seconds of a shell's flight its mark counts down over (about its longest
 * lob).
 */
const FLIGHT = 5;

/**
 * The fall marks: a square on the water about each (−1…1 across), a ring drawn
 * at its edge and a second closing in on its middle as the shell nears,
 * brighter the nearer. `pixel` is how wide a pixel is per metre away, `now` the
 * world's clock (gunfire.ts sets both).
 */
export function createMarks(pixel: FloatNode, now: FloatNode) {
  const g = quad(new InstancedBufferGeometry());
  // where it falls (world metres, on the water) and how near the shell is to it
  // (0 just fired … 1 falling)
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
    /** Each frame, a mark for each shell among the first `n` balls in flight. */
    draw(flying: readonly BallDraw[], n: number) {
      let k = 0;
      for (let i = 0; i < n && k < MARKS; i++) {
        const { at, way, gun, to } = flying[i];
        if (gun !== 'mortar') continue;
        // a shell's fall marked: nearer as the seconds it has left to fly
        // (about its distance from it over its speed) run out
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
