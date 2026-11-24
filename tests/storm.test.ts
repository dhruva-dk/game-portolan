import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  STORM,
  calm,
  createStorm,
  outside,
  planStorm,
  toEdge,
  type Cap,
} from '../src/sim/storm.ts';
import { landOf, planetOf } from '../src/world/land.ts';
import { SEED } from '../src/environment.ts';
import {
  R,
  add,
  along,
  cross,
  dot,
  normalize,
  scale,
  type Vec3,
} from '../src/world/sphere.ts';

const SEEDS = [1, 2, 3, 4, 5, 6];
const DURATION = STORM.phases.reduce((s, p) => s + p.wait + p.close, 0);
const planet = planetOf(SEED, landOf(SEED));
const depth = (p: Vec3) => -planet.height(p);
const between = (a: Vec3, b: Vec3) =>
  Math.atan2(Math.hypot(...cross(a, b)), dot(a, b));
const holds = (a: Cap, b: Cap) =>
  between(a.centre, b.centre) + b.radius <= a.radius + 0.01 / R;
const match = (seed: number, step = 0.5) => {
  const storm = createStorm(seed, depth);
  return Array.from({ length: Math.ceil((DURATION + 30) / step) }, (_, i) =>
    storm(i * step)
  );
};

test('the same seed gives the same storm', () => {
  const a = createStorm(3, depth),
    b = createStorm(3, depth);
  for (const t of [0, 61, 200, 333.3, DURATION, DURATION + 25])
    assert.deepEqual(a(t), b(t));
  assert.notDeepEqual(
    createStorm(4, depth)(DURATION).centre,
    a(DURATION).centre
  );
});

test('the match runs six to eight minutes, and its phases add up to it', () => {
  assert.ok(DURATION >= 360 && DURATION <= 480, `${DURATION} s`);
  const storm = createStorm(3, depth);
  let t = 0;
  STORM.phases.forEach((p, k) => {
    assert.deepEqual(
      [storm(t + 0.01).phase, storm(t + 0.01).closing],
      [k, false]
    );
    assert.ok(Math.abs(storm(t + 0.01).secondsToNext - (p.wait - 0.01)) < 1e-9);
    t += p.wait;
    assert.deepEqual(
      [storm(t + 0.01).phase, storm(t + 0.01).closing],
      [k, true]
    );
    assert.ok(
      Math.abs(storm(t + 0.01).secondsToNext - (p.close - 0.01)) < 1e-9
    );
    t += p.close;
  });
  assert.equal(t, DURATION);
  assert.equal(storm(t + 0.01).phase, STORM.phases.length);
  assert.equal(storm(t + 0.01).secondsToNext, Infinity);
});

test('it starts as the whole planet and closes to a cap small enough to force a fight, wide enough for the eye', () => {
  const storm = createStorm(3, depth);
  assert.equal(storm(0).radius, Math.PI);
  assert.ok(!outside([0, -R, 0], storm(0)) && !outside([0, R, 0], storm(0)));
  assert.ok(storm(DURATION).radius * R <= 100);
  assert.ok(storm(DURATION).radius * R >= 70);
});

test('each cap lies within the last, and holds the one it closes to; the radius never grows', () => {
  for (const seed of SEEDS) {
    const all = match(seed);
    for (let i = 1; i < all.length; i++) {
      assert.ok(
        all[i].radius <= all[i - 1].radius + 1e-12,
        `seed ${seed} at ${i}`
      );
      assert.ok(
        holds(all[i - 1], all[i]),
        `seed ${seed}: cap at ${i} leaves the last`
      );
      assert.ok(
        holds(all[i], all[i].next),
        `seed ${seed}: cap at ${i} leaves its next`
      );
    }
  }
});

test('every centre lies over water, the last over open water with water all round its rim', () => {
  for (const seed of SEEDS) {
    const centres = planStorm(seed, depth),
      last = centres[centres.length - 1];
    centres.forEach((c, k) =>
      assert.ok(depth(scale(c, R)) > 0, `seed ${seed}: centre ${k} on land`)
    );
    assert.ok(
      depth(scale(last, R)) >= STORM.open,
      `seed ${seed}: final centre in ${depth(scale(last, R)).toFixed(1)} m`
    );
  }
});

test('damage rises by phase, and keeps rising once the last cap has closed', () => {
  const storm = createStorm(3, depth);
  const d = match(3, 1).map((s) => s.damage);
  for (let i = 1; i < d.length; i++) assert.ok(d[i] >= d[i - 1]);
  assert.ok(storm(DURATION + 25).damage > storm(DURATION - 1).damage);
});

test('outside is past the edge and inside short of it', () => {
  const storm = createStorm(5, depth)(200),
    c = storm.centre;
  const t = normalize(add([0, 1, 0], c, -dot([0, 1, 0], c)));
  const edge = storm.radius * R;
  const at = (m: number) => scale(along(c, t, m).p, R + 3);
  assert.ok(
    !outside(at(edge - 0.05), storm) && outside(at(edge + 0.05), storm)
  );
  assert.ok(Math.abs(toEdge(at(edge - 10), storm) - 10) < 1e-6);
  assert.ok(!outside(scale(c, R), storm));
});

test("the calm (the lobby's sea) is the whole planet, held for ever, harming no one anywhere", () => {
  const c = calm([0, 1, 0]);
  assert.equal(c.radius, Math.PI);
  assert.equal(c.next.radius, Math.PI);
  assert.equal(c.damage, 0);
  assert.equal(c.secondsToNext, Infinity);
  for (const p of [
    [0, 1, 0],
    [1, 0, 0],
    [0, -1, 0],
    normalize([1, -1, 2]),
  ] as Vec3[])
    assert.ok(!outside(p, c));
});
