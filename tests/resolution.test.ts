// The scene's share of the canvas, from frame times.
//   node --test tests/resolution.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Resolution } from '../src/render/gpu/resolution.ts';

const GOOD = 1 / 30, SLOW = 1 / 20;
const run = (r: Resolution, dt: number, seconds: number) => {
  let changed = 0;
  for (let t = 0; t < seconds; t += dt) if (r.frame(dt)) changed++;
  return changed;
};

test('steady frames leave the scale alone', () => {
  const r = new Resolution(0.66);
  assert.equal(run(r, GOOD, 120), 0);
  assert.equal(r.scale, 0.66);
});

test('slow frames give ground, down to a floor', () => {
  const r = new Resolution(0.66);
  run(r, SLOW, 60);
  assert.ok(r.scale < 0.66 * 0.7);
  assert.ok(r.scale >= 0.66 * 0.64);
});

test('one hitch costs nothing', () => {
  const r = new Resolution(0.66);
  run(r, GOOD, 5);
  r.frame(0.25);
  run(r, GOOD, 5);
  assert.equal(r.scale, 0.66);
});

test('the ground comes back when the frames are easy, and never past the device\'s share', () => {
  const r = new Resolution(0.66);
  run(r, SLOW, 3);
  const low = r.scale;
  assert.ok(low < 0.66);
  run(r, GOOD, 200);
  assert.equal(r.scale, 0.66);
});

test('a step that fails soon after it came back stays barred for a minute', () => {
  const r = new Resolution(0.66);
  run(r, SLOW, 1.5);
  const one = r.scale;
  assert.ok(one < 0.66);
  while (r.scale < 0.66) r.frame(GOOD);    // back to full, and only just
  run(r, SLOW, 1.5);             // and it fails again at once
  assert.ok(r.scale < 0.66);
  run(r, GOOD, 40);              // easy frames, but not for long enough
  assert.ok(r.scale < 0.66, 'still barred');
  run(r, GOOD, 60);
  assert.equal(r.scale, 0.66);
});

test('a held scale does not move', () => {
  Resolution.held = true;
  try {
    const r = new Resolution(0.66);
    assert.equal(run(r, SLOW, 30), 0);
  } finally {
    Resolution.held = false;
  }
});

test('sustained severe overload loses steps instead of renewing the hitch hold forever', () => {
  for (const fps of [12, 3, 1]) {
    const r = new Resolution(0.66);
    run(r, 1 / fps, 15);
    assert.ok(Math.abs(r.scale - 0.66 * 0.65) < 1e-12, `${fps} FPS must reach the bounded floor`);
  }
});

test('repeated hitches cannot count as calm recovery', () => {
  const r = new Resolution(0.66);
  run(r, SLOW, 1.5);
  const low = r.scale;
  for (let i = 0; i < 100; i++) {
    r.frame(0.25);
    run(r, GOOD, 0.75);
  }
  assert.ok(r.scale <= low, 'hitches must reset the recovery clock');
});


test('an optional 40 FPS target keeps 40 FPS steady and gives ground at 30 FPS', () => {
  const r = new Resolution(0.66, 40);
  assert.equal(run(r, 1 / 40, 60), 0);
  assert.ok(run(r, 1 / 30, 3) > 0);
  for (const fps of [12, 3]) {
    const severe = new Resolution(0.66, 40);
    run(severe, 1 / fps, 15);
    assert.ok(Math.abs(severe.scale - 0.66 * 0.65) < 1e-12);
  }
});
