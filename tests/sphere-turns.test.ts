// world/sphere.ts's turns of directions: the tangent at a point, a turn about an axis, and the great circle's slerp;
// and its helpers written into an out.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  add, along, arc, bearingAt, cross, dot, frameAt, length, normalize, rotateAbout, scale, tangent, toSky, toward,
  type CourseOut, type Out3, type Vec3,
} from '../src/world/sphere.ts';

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

test('the helpers written into an out are what they make, to the bit, even into a vector they read', () => {
  const vs: Vec3[] = [[0.4, -1.3, 2.2], [3, 0, -1], [1e-3, 5, 2e-4], ...ups];
  /** Written into a fresh out and into a copy of its first argument, and each the same as made. */
  const both = (made: Vec3, write: (out: Out3, own: Out3) => Vec3, first: Vec3, what: string) => {
    const out: Out3 = [9, 9, 9], own: Out3 = [...first];
    assert.equal(write(out, own), out, what);
    assert.deepEqual(out, made, what);
    assert.equal(write(own, own), own, what);
    assert.deepEqual(own, made, `${what}, into what it reads`);
  };
  for (const a of vs) for (const b of vs) for (const up of ups) {
    both(cross(a, b), (o, own) => cross(own, b, o), a, 'cross');
    both(scale(a, 0.7), (o, own) => scale(own, 0.7, o), a, 'scale');
    both(add(a, b, -1.3), (o, own) => add(own, b, -1.3, o), a, 'add');
    both(normalize(a), (o, own) => normalize(own, o), a, 'normalize');
    both(tangent(a, up), (o, own) => tangent(own, up, o), a, 'tangent');
    both(rotateAbout(a, up, 0.9), (o, own) => rotateAbout(own, up, 0.9, o), a, 'rotateAbout');
    both(bearingAt(up, 1.1), (o) => bearingAt(up, 1.1, o), up, 'bearingAt');
    both(toSky(frameAt(up), 0.05, a), (o, own) => toSky(frameAt(up), 0.05, own, o), a, 'toSky');
    const way = toward(up, a);
    if (way) both(way, (o) => toward(up, a, o)!, up, 'toward');
    const t = tangent(b, up), course = along(up, t, 37), out: CourseOut = { p: [9, 9, 9], t: [9, 9, 9] };
    assert.equal(along(up, t, 37, out), out);
    assert.deepEqual(out, course, 'along');
  }
});

test('toward is the unit tangent from p toward q, and bearingAt the bearing clockwise from north', () => {
  for (const up of ups) {
    const f = frameAt(up);
    near(bearingAt(up, 0), f.north);
    near(bearingAt(up, Math.PI / 2), f.east);
    near(toward(up, along(up, f.east, 20).p)!, f.east, 1e-9);
    assert.equal(toward(up, up), null);
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
