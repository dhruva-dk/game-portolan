import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createBolt } from '../src/sky/storm-bolt.ts';
import type { StormDraw } from '../src/snapshot.ts';
import { R } from '../src/world/sphere.ts';

const eye: [number, number, number] = [0, 0, R + 20];
const storm = (closing: boolean): StormDraw => ({
  centre: [0, 0, 1],
  radius: 1,
  closing,
});

const quiet = (from: number) => {
  const probe = createBolt(false);
  for (let t = from; ; t += 0.05) {
    let dark = true;
    for (let s = t - 1.5; s < t + 1; s += 0.02) {
      probe.update(storm(false), s, eye, false);
      if (probe.flash.value > 0) dark = false;
    }
    if (dark) return t;
  }
};

test('a closing begun strikes at once at the edge nearest the eye; closing on, a pause and the first frame do not', () => {
  const bolt = createBolt(false);
  const lit = (t: number, closing: boolean) => {
    bolt.update(storm(closing), t, eye, false);
    return bolt.flash.value;
  };
  const t0 = quiet(10);
  assert.equal(lit(t0 - 1, true), 0, 'first frame: dark');
  for (let t = t0 - 1; t < t0; t += 1 / 30) lit(t, false);
  assert.equal(lit(t0, false), 0, 'held: dark');
  assert.ok(lit(t0 + 1 / 30, true) > 0, 'a closing begun: struck');
  let after = 0;
  for (let t = t0 + 2 / 30; t < t0 + 0.6; t += 1 / 30)
    after += lit(t, true) > 0 ? 1 : 0;
  assert.ok(after >= 3, `it flickers on: ${after} frames`);
  const t1 = quiet(t0 + 1);
  for (let t = t0 + 0.6; t < t1; t += 1 / 30) lit(t, true);
  assert.equal(lit(t1, true), 0, 'closing on: no second stroke');
  for (let k = 0; k < 90; k++) lit(t1 + 0.05, true);
  const t2 = quiet(t1 + 0.1);
  for (let t = t1 + 0.1; t < t2; t += 1 / 30) lit(t, true);
  assert.equal(lit(t2, true), 0, 'after a pause: none');
});

test('a new sea (the clock run back) strikes nothing, closing or not; its next closing does', () => {
  const bolt = createBolt(false);
  const lit = (t: number, closing: boolean) => {
    bolt.update(storm(closing), t, eye, false);
    return bolt.flash.value;
  };
  const t0 = quiet(40),
    t1 = quiet(10);
  for (let t = t0 - 1; t < t0; t += 1 / 30) lit(t, false);
  assert.equal(lit(t1, true), 0, 'a new sea, closing: dark');
  for (let t = t1; t < t1 + 0.6; t += 1 / 30)
    assert.equal(lit(t, true), 0, 'nor after');
  const t2 = quiet(t1 + 1);
  for (let t = t1 + 0.6; t < t2; t += 1 / 30) lit(t, false);
  assert.ok(lit(t2, true) > 0, 'its closing: struck');
});

test('the bolt is drawn over the whole planet never; held (?bolt), always', () => {
  const bolt = createBolt(false),
    held = createBolt(true);
  const t = quiet(10);
  bolt.update(storm(false), t - 1, eye, true);
  assert.equal(bolt.flash.value, 0);
  bolt.update(storm(true), t, eye, true);
  assert.equal(bolt.flash.value, 0, 'from over the whole planet: none');
  held.update(storm(false), t, eye, false);
  assert.ok(held.flash.value > 0);
});
