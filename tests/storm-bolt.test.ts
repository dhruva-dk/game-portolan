// The storm's lightning as its closing begins (sky/storm-bolt.ts): a stroke of
// its own at once on the edge nearest the eye, once a closing; none on the first
// frame, nor after a pause.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createBolt } from '../src/sky/storm-bolt.ts';
import type { Cap } from '../src/sim/storm.ts';
import { R } from '../src/world/sphere.ts';

test('a closing begun strikes at once at the edge nearest the eye; a pause and the first frame do not', () => {
  const bolt = createBolt(false),
    probe = createBolt(false),
    eye: [number, number, number] = [0, 0, R + 20];
  const cap = (radius: number): Cap => ({ centre: [0, 0, 1], radius });
  // lit at `t` with the cap at `radius`: the stroke's flicker
  const lit = (t: number, radius: number) => {
    bolt.update(cap(radius), t, eye, false);
    return bolt.flash.value;
  };
  // the regular strokes fall at a moment of each 4.5 s: a moment of the clock
  // they leave dark about (seen by a bolt of its own, the storm held)
  const quiet = (from: number) => {
    for (let t = from; ; t += 0.05) {
      let dark = true;
      for (let s = t - 1.5; s < t + 1; s += 0.02) {
        probe.update(cap(1), s, eye, false);
        if (probe.flash.value > 0) dark = false;
      }
      if (dark) return t;
    }
  };
  const t0 = quiet(10);
  // the first frames (from far back, so it has held), held; then shrinking
  for (let t = t0 - 1.5; t < t0; t += 1 / 30) lit(t, 1);
  assert.equal(lit(t0, 1), 0, 'held: dark');
  assert.ok(lit(t0 + 1 / 30, 1 - 1e-4) > 0, 'a closing begun: struck');
  let after = 0;
  for (let t = t0 + 2 / 30, r = 1 - 2e-4; t < t0 + 0.6; t += 1 / 30, r -= 1e-4)
    after += lit(t, r) > 0 ? 1 : 0;
  assert.ok(after >= 3, `it flickers on: ${after} frames`);
  // still closing a second on: no new stroke of its own
  const t1 = quiet(t0 + 1);
  for (let t = t0 + 0.6, r = 0.99; t < t1; t += 1 / 30, r -= 1e-4) lit(t, r);
  assert.equal(lit(t1, 0.98), 0, 'closing on: no second stroke');
  // the clock held (paused) mid-closing, then going on: no stroke of its own
  for (let k = 0; k < 90; k++) lit(t1 + 0.05, 0.979);
  const t2 = quiet(t1 + 0.1);
  for (let t = t1 + 0.1, r = 0.979; t < t2; t += 1 / 30, r -= 1e-4) lit(t, r);
  assert.equal(lit(t2, 0.97), 0, 'after a pause: none');
});
