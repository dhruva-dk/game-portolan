import { test } from 'node:test';
import assert from 'node:assert/strict';
import { signedField } from '../src/render/ship/field.ts';
import { DEVICES, EMBLEMS, deviceOf } from '../src/world/livery.ts';

function disc(w: number, cx: number, cy: number, r: number) {
  const inside = new Uint8Array(w * w);
  for (let y = 0; y < w; y++)
    for (let x = 0; x < w; x++)
      inside[y * w + x] = (x - cx) ** 2 + (y - cy) ** 2 <= r * r ? 1 : 0;
  return inside;
}

test('the signed field is negative inside a shape, positive outside, and grows with distance from its edge', () => {
  const w = 41,
    field = signedField(disc(w, 20, 20, 8), w, w);
  const at = (x: number, y: number) => field[y * w + x];
  assert.ok(at(20, 20) < -6.5 && at(20, 20) > -9);
  assert.ok(at(20, 13) < 0 && at(20, 13) > -1.5);
  assert.ok(at(20, 11) > 0 && at(20, 11) < 1.5);
  assert.ok(Math.abs(at(20, 2) - 10) < 1);
  assert.ok(Math.abs(at(38, 20) - 10) < 1);
});

test('a field of nothing inside is far everywhere, and of everything is deep everywhere', () => {
  const w = 9;
  const none = signedField(new Uint8Array(w * w), w, w),
    all = signedField(new Uint8Array(w * w).fill(1), w, w);
  assert.ok(none.every((d) => d > 1e6));
  assert.ok(all.every((d) => d < -1e6));
});

test('there is one outline for each emblem, and any emblem number names one of them', () => {
  assert.equal(EMBLEMS, 12);
  assert.equal(new Set(DEVICES).size, EMBLEMS);
  assert.deepEqual([-1, 0, 11, 12, 25].map(deviceOf), [11, 0, 11, 0, 1]);
});
