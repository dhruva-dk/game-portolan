// Held water as a watercolour wash.
//   node --test tests/wash.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { paintWash, rasterHeld, type Rgb } from '../src/screens/wash.ts';

const N = 32;
const PIGMENT: Rgb = [200, 40, 30], OTHER: Rgb = [30, 60, 200];
const colour = (id: number): Rgb => (id === 1 ? PIGMENT : OTHER);
const at = (x: number, y: number) => (y * N + x) * 4;

/** A square of water held by `id`, from 8 to 23 each way. */
function square(id: number): Uint8Array {
  const ids = new Uint8Array(N * N);
  for (let y = 8; y < 24; y++) for (let x = 8; x < 24; x++) ids[y * N + x] = id;
  return ids;
}

/** The mean alpha over a few texels, which averages the grain away. */
const mean = (d: Uint8ClampedArray, cells: readonly [number, number][]): number => cells.reduce((s, [x, y]) => s + d[at(x, y) + 3], 0) / cells.length;

test('pigment pools at the edge of a wash', () => {
  const d = new Uint8ClampedArray(N * N * 4);
  paintWash(d, square(1), N, 1, colour);
  const edge = Array.from({ length: 12 }, (_, i) => [8, 10 + i] as [number, number]);
  const middle = Array.from({ length: 12 }, (_, i) => [15, 10 + i] as [number, number]);
  assert.ok(mean(d, edge) > mean(d, middle) * 1.2);
});

test('one\'s own water is deeper than another\'s', () => {
  const a = new Uint8ClampedArray(N * N * 4), b = new Uint8ClampedArray(N * N * 4);
  paintWash(a, square(1), N, 1, colour);
  paintWash(b, square(2), N, 1, colour);
  const c = Array.from({ length: 8 }, (_, i) => [16, 12 + i] as [number, number]);
  assert.ok(mean(a, c) > mean(b, c));
  assert.equal(b[at(16, 16)], OTHER[0]);
});

test('a wash bleeds a little past its edge and no further', () => {
  const d = new Uint8ClampedArray(N * N * 4);
  paintWash(d, square(1), N, 1, colour);
  assert.ok(d[at(7, 16) + 3] > 0, 'beside the edge');
  assert.ok(d[at(7, 16) + 3] < d[at(8, 16) + 3], 'fainter than the wash');
  assert.equal(d[at(2, 16) + 3], 0, 'far off');
});

test('the rim of the grid is not taken for a shore', () => {
  const ids = new Uint8Array(N * N).fill(1), d = new Uint8ClampedArray(N * N * 4);
  paintWash(d, ids, N, 1, colour);
  const rim = Array.from({ length: 12 }, (_, i) => [0, 10 + i] as [number, number]);
  const middle = Array.from({ length: 12 }, (_, i) => [15, 10 + i] as [number, number]);
  assert.ok(mean(d, rim) < mean(d, middle) * 1.2);
});

test('the same water paints the same', () => {
  const a = new Uint8ClampedArray(N * N * 4), b = new Uint8ClampedArray(N * N * 4);
  paintWash(a, square(1), N, 1, colour);
  paintWash(b, square(1), N, 1, colour);
  assert.deepEqual(a, b);
});

test('held points land where they say, y up', () => {
  const ids = new Uint8Array(N * N);
  rasterHeld(ids, N, [0.9, 0.9], 0.05, 1);
  assert.equal(ids[Math.round(0.05 * (N - 1)) * N + Math.round(0.95 * (N - 1))], 1);
  assert.equal(ids[(N - 1) * N], 0);
});

test('squares laid edge to edge leave no seam', () => {
  const ids = new Uint8Array(N * N), pts: number[] = [], half = 0.05;
  for (let y = -0.4; y <= 0.4; y += half * 2) for (let x = -0.4; x <= 0.4; x += half * 2) pts.push(x, y);
  rasterHeld(ids, N, pts, half, 1);
  for (let y = 12; y < 20; y++) for (let x = 12; x < 20; x++) assert.equal(ids[y * N + x], 1);
});
