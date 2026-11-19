// world/scalar.ts: the single numbers' arithmetic, at its ends and in its middle.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clamp, easeInOut, lerp, smoother, smootherIntegral, smoothstep, wrapAngle } from '../src/world/scalar.ts';

const near = (a: number, b: number, eps = 1e-12, what = '') => assert.ok(Math.abs(a - b) <= eps, `${what} ${a} vs ${b}`);

test('clamp holds within 0…1 by default, or the bounds given', () => {
  assert.equal(clamp(-0.5), 0);
  assert.equal(clamp(0.25), 0.25);
  assert.equal(clamp(3), 1);
  assert.equal(clamp(5, -2, 2), 2);
  assert.equal(clamp(-5, -2, 2), -2);
});

test('lerp runs from a to b, and past them', () => {
  assert.equal(lerp(2, 6, 0), 2);
  assert.equal(lerp(2, 6, 1), 6);
  assert.equal(lerp(2, 6, 0.25), 3);
  assert.equal(lerp(2, 6, 2), 10);
});

test('smoothstep is 3t² − 2t³ between its edges and held past them', () => {
  assert.equal(smoothstep(1, 3, 0), 0);
  assert.equal(smoothstep(1, 3, 4), 1);
  assert.equal(smoothstep(1, 3, 2), 0.5);
  near(smoothstep(0, 1, 0.25), 0.15625);
  // edges reversed: falling
  assert.equal(smoothstep(3, 1, 0), 1);
});

test('smoother is eased at both ends, symmetric, and its integral is its area', () => {
  assert.equal(smoother(0), 0);
  assert.equal(smoother(1), 1);
  assert.equal(smoother(0.5), 0.5);
  for (const t of [0.1, 0.3, 0.7]) near(smoother(t) + smoother(1 - t), 1, 1e-12, `t ${t}`);
  // the slope at the ends is nil
  near((smoother(1e-4) - smoother(0)) / 1e-4, 0, 1e-6, 'slope at 0');
  assert.equal(smootherIntegral(0), 0);
  assert.equal(smootherIntegral(1), 0.5);
  // its derivative is smoother
  for (const t of [0.2, 0.5, 0.9]) near((smootherIntegral(t + 1e-6) - smootherIntegral(t - 1e-6)) / 2e-6, smoother(t), 1e-6, `t ${t}`);
});

test('easeInOut is the cubic in and out', () => {
  assert.equal(easeInOut(0), 0);
  assert.equal(easeInOut(1), 1);
  assert.equal(easeInOut(0.5), 0.5);
  near(easeInOut(0.25), 0.0625);
  near(easeInOut(0.75), 0.9375);
});

test('wrapAngle brings an angle within ±π', () => {
  near(wrapAngle(0), 0);
  near(wrapAngle(3 * Math.PI / 2), -Math.PI / 2, 1e-12);
  near(wrapAngle(-5 * Math.PI / 2), -Math.PI / 2, 1e-12);
  near(wrapAngle(1), 1);
});
