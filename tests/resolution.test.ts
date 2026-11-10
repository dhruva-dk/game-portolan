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
