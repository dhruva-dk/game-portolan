// A line of sight (sim/sight.ts): where it meets the sea and the land, and how far off it a ship's body stands.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SHIP } from '../src/sim/handling.ts';
import { meets, offSight, pointOn, seaAlong } from '../src/sim/sight.ts';
import { shipAt } from '../src/sim/ship.ts';
import { R, add, along, distance, dot, frameAt, fromLatLon, length, normalize, scale, type Vec3 } from '../src/world/sphere.ts';

const at = fromLatLon(0.4, -0.7), f = frameAt(at), deep = () => 30;
/** A sight from `height` m over `at` onto the sea `metres` north. */
const onto = (height: number, metres: number) => {
  const from = scale(at, R + height);
  return { from, dir: normalize(add(scale(along(at, f.north, metres).p, R), from, -1)) };
};

test('a sight onto the sea meets it there; one level or above the horizon never meets it', () => {
  for (const [h, m] of [[20, 40], [20, 120], [5, 30], [40, 190]]) {
    const s = onto(h, m), t = seaAlong(s)!;
    assert.ok(Math.abs(length(pointOn(s, t)) - R) < 1e-6);
    assert.ok(distance(normalize(pointOn(s, t)), along(at, f.north, m).p) < 1e-6, `${h} m up, ${m} m off`);
    assert.ok(Math.abs(meets(s, deep)! - t) < 1e-9, 'with no land, meets() is the sea');
  }
  const level = { from: scale(at, R + 20), dir: f.north };
  assert.equal(seaAlong(level), null);
  assert.equal(meets(level, deep), null);
});

test('the land in the way is met first, within a few centimetres of its face', () => {
  // a cliff 15 m high from 60 m north on
  const cliff = (p: Vec3) => (dot(p, f.north) > Math.sin(60 / R) ? -15 : 30);
  const s = onto(20, 120), t = meets(s, cliff)!, p = pointOn(s, t);
  assert.ok(t < seaAlong(s)!);
  assert.ok(Math.abs(R * Math.asin(dot(normalize(p), f.north)) - 60) < 0.05, `${R * Math.asin(dot(normalize(p), f.north))} m`);
  assert.ok(length(p) - R <= 15 + 1e-6);
});

test("a ship's body: on the line it stands 0 off; beside it, the angle to her nearest point; behind the eye, nowhere", () => {
  const her = shipAt(along(at, f.north, 100).p, f.east);
  // through her hull, through her rig
  assert.equal(offSight(onto(20, 100), her)!.angle, 0);
  const from = scale(at, R + 20), high = { from, dir: normalize(add(scale(her.at, R + SHIP.rig - 1), from, -1)) };
  assert.equal(offSight(high, her)!.angle, 0);
  // lying across the line, her bow 13 m off to the east: a line 10 m past it (and slanting to it) stands 9–10 m off her
  const past = along(her.at, her.heading, SHIP.length / 2 + 10).p;
  const beside = { from, dir: normalize(add(scale(past, R + 5), from, -1)) }, o = offSight(beside, her)!;
  assert.ok(Math.tan(o.angle) * o.along > 9 && Math.tan(o.angle) * o.along <= 10, `${Math.tan(o.angle) * o.along} m`);
  // looking away from her
  assert.equal(offSight({ from, dir: scale(f.north, -1) }, her), null);
});
