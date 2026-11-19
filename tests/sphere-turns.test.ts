// world/sphere.ts's turns of directions: the tangent at a point, a turn about an axis, and the great circle's slerp.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { arc, dot, length, normalize, rotateAbout, tangent, type Vec3 } from '../src/world/sphere.ts';

const near = (a: Vec3, b: Vec3, eps = 1e-12, what = '') =>
  assert.ok(Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) <= eps, `${what} ${a} vs ${b}`);
const ups: Vec3[] = [[0, 1, 0], [1, 0, 0], normalize([0.3, -0.8, 0.5]), normalize([-2, 1, 7])];

test('tangent takes away the part along up, and nothing else', () => {
  for (const up of ups) {
    const v: Vec3 = [0.4, -1.3, 2.2], t = tangent(v, up);
    assert.ok(Math.abs(dot(t, up)) < 1e-12);
    near(tangent(t, up), t);
  }
});

test('rotateAbout turns a tangent at up to port, keeps lengths, and leaves the axis where it is', () => {
  // at the north pole (+y), east is −z there by sphere.ts's frame at the pole, so +x turned a quarter to port is −z
  near(rotateAbout([1, 0, 0], [0, 1, 0], Math.PI / 2), [0, 0, -1]);
  for (const up of ups) {
    const v: Vec3 = [0.4, -1.3, 2.2];
    for (const a of [0, 0.3, -1.2, Math.PI]) {
      const w = rotateAbout(v, up, a);
      assert.ok(Math.abs(length(w) - length(v)) < 1e-12);
      assert.ok(Math.abs(dot(w, up) - dot(v, up)) < 1e-12, 'its part along the axis kept');
    }
    near(rotateAbout(up, up, 1.1), up);
    near(rotateAbout(rotateAbout(v, up, 0.7), up, -0.7), v, 1e-12, 'undone');
  }
});

test('arc runs evenly in angle along the great circle from a to b', () => {
  const a = normalize([1, 0.2, -0.3]), b = normalize([-0.2, 1, 0.4]);
  near(arc(a, b, 0), a);
  near(arc(a, b, 1), b);
  const angle = Math.acos(dot(a, b));
  for (const f of [0.1, 0.5, 0.8]) {
    const p = arc(a, b, f);
    assert.ok(Math.abs(length(p) - 1) < 1e-12);
    assert.ok(Math.abs(Math.acos(Math.min(1, dot(a, p))) - f * angle) < 1e-9, `f ${f}`);
  }
  // all but the same, or opposite: b
  near(arc(a, a, 0.3), a);
  near(arc(a, [-a[0], -a[1], -a[2]], 0.3), [-a[0], -a[1], -a[2]]);
});
