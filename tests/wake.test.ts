import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WAKE, lay, type WakePoint } from '../src/sim/wake.ts';
import { along, distance, frameAt, fromLatLon, type Vec3 } from '../src/world/sphere.ts';

const start = fromLatLon(0.2, 0.3);
const north = frameAt(start).north;

/** A wake begun where she is, at `t`, going `speed`. */
const begun = (at: Vec3, t: number, speed: number): WakePoint[] => {
  const points: WakePoint[] = [];
  lay(points, at, t, speed);
  return points;
};

/** Sails `seconds` north at `speed`, laying the wake `points` on every 1/30 s. */
const sail = (points: WakePoint[], from: Vec3, t0: number, speed: number, seconds: number) => {
  let at = from, t = t0;
  for (let i = 0; i < Math.round(seconds * 30); i++) {
    t += 1 / 30;
    at = along(at, north, speed / 30).p;
    assert.ok(lay(points, at, t, speed), 'sailing on, the wake goes on');
  }
  return { points, at, t };
};

test('the first point is laid where she is; at rest no more are', () => {
  const points: WakePoint[] = [];
  assert.equal(lay(points, start, 0, 0), false, 'a wake begun goes on from none');
  assert.equal(points.length, 1);
  for (let t = 0; t < 5; t += 1 / 30) lay(points, start, t, 0);
  assert.equal(points.length, 1);
});

test('points lie newest first, a stretch apart that grows with speed, and are capped', () => {
  for (const speed of [2, 12]) {
    const { points } = sail(begun(start, 0, speed), start, 0, speed, 10);
    assert.ok(points.length <= WAKE.most);
    for (let i = 1; i < points.length; i++) assert.ok(points[i - 1].time > points[i].time);
    const gaps = points.slice(1).map((p, i) => distance(p.at, points[i].at));
    const want = Math.max(WAKE.spacing, speed * WAKE.every);
    for (const g of gaps) assert.ok(g >= want - 1e-6 && g < want + speed / 30 + 1e-6, `gap ${g} at ${speed} m/s`);
  }
});

test('old points are let go, and a stopped ship\'s wake fades away entirely', () => {
  const { points: still, at, t } = sail(begun(start, 0, 8), start, 0, 8, 5);
  assert.ok(still.length > 10);
  for (let s = t; s < t + WAKE.life + 1; s += 0.5) lay(still, at, s, 0);
  // only the point she lays where she stands outlives the life
  assert.ok(still.every((p) => t + WAKE.life + 0.5 - p.time < WAKE.life + 0.5));
  assert.ok(still.length <= 1);
});

test('a jump starts a fresh wake, and the wake keeps none of the vectors it is handed', () => {
  const { points, t } = sail(begun(start, 0, 8), start, 0, 8, 3);
  const far: [number, number, number] = [...along(start, north, 200).p];
  assert.equal(lay(points, far, t + 0.1, 0), false);
  assert.deepEqual(points, [{ at: far, time: t + 0.1, speed: 0 }]);
  far[0] += 1;
  assert.notDeepEqual(points[0].at, far);
});
