// world/turn.ts turns an eye exactly as three does: the same numbers, to the last bit.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Matrix4, Quaternion, Vector3 } from 'three';
import { inverse, lookAt, multiply, rotate, slerp, type Out4, type Turn } from '../src/world/turn.ts';
import type { Out3, Vec3 } from '../src/world/sphere.ts';

/** A deterministic spread of awkward and ordinary vectors. */
const vectors: Vec3[] = [
  [0, 0, 1], [0, 0, -1], [1, 0, 0], [0, 1, 0], [0, -1, 0], [0.3, -2, 5], [-120, 554, 3], [1e-3, 2e-3, -4e-3],
  ...Array.from({ length: 40 }, (_, i): Vec3 => [Math.sin(i * 1.7) * 600, Math.cos(i * 2.3) * 600, Math.sin(i * 0.9 + 1) * 600]),
];
const ups: Vec3[] = [[0, 1, 0], [0, 0, 1], [0, 0, -1], [0.2, 0.9, 0.1], [1, 0, 0]];
const of = (q: Quaternion): Turn => [q.x, q.y, q.z, q.w];

test('lookAt is three\'s Matrix4.lookAt turned to a quaternion', () => {
  const m = new Matrix4(), q = new Quaternion();
  for (const eye of vectors) for (const at of [[0, 0, 0], vectors[5]] as Vec3[]) for (const up of ups) {
    q.setFromRotationMatrix(m.lookAt(new Vector3(...eye), new Vector3(...at), new Vector3(...up)));
    assert.deepEqual(lookAt(eye, at, up), of(q), `eye ${eye} at ${at} up ${up}`);
  }
});

test('slerp and rotate are three\'s', () => {
  const turns = vectors.slice(0, 20).map((v, i) => lookAt(v, [0, 0, 0], ups[i % ups.length]));
  for (const a of turns) for (const b of turns) for (const t of [0, 0.25, 0.5, 1]) {
    const q = new Quaternion().slerpQuaternions(new Quaternion(...a), new Quaternion(...b), t);
    assert.deepEqual(slerp(a, b, t), of(q));
  }
  for (const q of turns) for (const v of vectors) {
    const w = new Vector3(...v).applyQuaternion(new Quaternion(...q).invert());
    assert.deepEqual(rotate(v, inverse(q)), [w.x, w.y, w.z]);
  }
});

test('lookAt, slerp, multiply and rotate written into an out are what they make, even into what they read', () => {
  const turns = vectors.slice(0, 12).map((v, i) => lookAt(v, [0, 0, 0], ups[i % ups.length]));
  const into = <T extends readonly number[]>(made: T, written: T, out: T) => {
    assert.deepEqual(written, made);
    assert.equal(written, out);
  };
  for (const eye of vectors) for (const up of ups) {
    const out: Out4 = [9, 9, 9, 9];
    into(lookAt(eye, [0, 0, 0], up), lookAt(eye, [0, 0, 0], up, out), out);
  }
  for (const a of turns) for (const b of turns) {
    const out: Out4 = [9, 9, 9, 9], own: Out4 = [...a];
    into(slerp(a, b, 0.3), slerp(a, b, 0.3, out), out);
    into(slerp(a, b, 0.3), slerp(own, b, 0.3, own), own);
    const product: Out4 = [...a];
    into(multiply(a, b), multiply(product, b, product), product);
  }
  for (const q of turns) for (const v of vectors) {
    const out: Out3 = [...v];
    into(rotate(v, q), rotate(out, q, out), out);
  }
});
