import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WAKE, laid, type WakePoint } from '../src/sim/wake.ts';
import { along, distance, frameAt, fromLatLon, type Vec3 } from '../src/world/sphere.ts';

const start = fromLatLon(0.2, 0.3);
const north = frameAt(start).north;

/** Sails `seconds` north at `speed`, laying the wake every 1/30 s from `points`. */
const sail = (points: WakePoint[], from: Vec3, t0: number, speed: number, seconds: number) => {
  let at = from, t = t0;
  for (let i = 0; i < Math.round(seconds * 30); i++) {
    t += 1 / 30;
    at = along(at, north, speed / 30).p;
    points = laid(points, at, t, speed);
  }
  return { points, at, t };
};

test('the first point is laid where she is; at rest no more are', () => {
  let points = laid([], start, 0, 0);
  assert.equal(points.length, 1);
  for (let t = 0; t < 5; t += 1 / 30) points = laid(points, start, t, 0);
  assert.equal(points.length, 1);
});

test('points lie newest first, a stretch apart that grows with speed, and are capped', () => {
  for (const speed of [2, 12]) {
    const { points } = sail(laid([], start, 0, speed), start, 0, speed, 10);
    assert.ok(points.length <= WAKE.most);
    for (let i = 1; i < points.length; i++) assert.ok(points[i - 1].time > points[i].time);
    const gaps = points.slice(1).map((p, i) => distance(p.at, points[i].at));
    const want = Math.max(WAKE.spacing, speed * WAKE.every);
    for (const g of gaps) assert.ok(g >= want - 1e-6 && g < want + speed / 30 + 1e-6, `gap ${g} at ${speed} m/s`);
  }
});

test('old points are let go, and a stopped ship\'s wake fades away entirely', () => {
  const { points, at, t } = sail(laid([], start, 0, 8), start, 0, 8, 5);
  assert.ok(points.length > 10);
  let still = points;
  for (let s = t; s < t + WAKE.life + 1; s += 0.5) still = laid(still, at, s, 0);
  // only the point she lays where she stands outlives the life
  assert.ok(still.every((p) => t + WAKE.life + 0.5 - p.time < WAKE.life + 0.5));
  assert.ok(still.length <= 1);
});

test('a jump starts a fresh wake', () => {
  const { points, t } = sail(laid([], start, 0, 8), start, 0, 8, 3);
  const far = along(start, north, 200).p;
  const fresh = laid(points, far, t + 0.1, 0);
  assert.deepEqual(fresh, [{ at: far, time: t + 0.1, speed: 0 }]);
});
