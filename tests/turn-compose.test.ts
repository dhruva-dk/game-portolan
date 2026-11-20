// world/turn.ts's axisAngle and multiply are three's setFromAxisAngle and
// multiplyQuaternions, to the last bit.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Quaternion, Vector3 } from 'three';
import { axisAngle, lookAt, multiply, type Turn } from '../src/world/turn.ts';
import { normalize, type Vec3 } from '../src/world/sphere.ts';

const of = (q: Quaternion): Turn => [q.x, q.y, q.z, q.w];
const axes: Vec3[] = [
  [1, 0, 0],
  [0, 1, 0],
  [0, 0, 1],
  normalize([0.3, -0.8, 0.5]),
  normalize([-2, 1, 7]),
];
const angles = [0, 0.01, -0.4, 1.3, Math.PI, -2.9];

test("axisAngle is three's Quaternion.setFromAxisAngle", () => {
  for (const k of axes)
    for (const a of angles) {
      assert.deepEqual(
        axisAngle(k, a),
        of(new Quaternion().setFromAxisAngle(new Vector3(...k), a))
      );
    }
});

test("multiply is three's Quaternion.multiplyQuaternions", () => {
  const turns = axes.flatMap((k, i) => [
    axisAngle(k, angles[i]),
    lookAt([i, 3, -2 * i], [0, 0, 0], [0, 1, 0]),
  ]);
  for (const a of turns)
    for (const b of turns) {
      assert.deepEqual(
        multiply(a, b),
        of(
          new Quaternion().multiplyQuaternions(
            new Quaternion(...a),
            new Quaternion(...b)
          )
        )
      );
    }
});
