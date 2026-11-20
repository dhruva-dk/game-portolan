import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BEAM, SCALE, halfAt, zOf } from '../src/ship/lines.ts';
import { WATERLINE } from '../src/ship/waterline.ts';

const { stern, stem, half } = WATERLINE;
/**
 * The outline's half-breadth at z, as the sea's shader reads it: linear between
 * the points.
 */
const at = (z: number) => {
  const t =
      Math.max(0, Math.min(1, (z - stern) / (stem - stern))) *
      (half.length - 1),
    i = Math.floor(t);
  return half[i] + (half[Math.min(i + 1, half.length - 1)] - half[i]) * (t - i);
};

test('the waterline runs from the transom to the stem, no wider than her beam', () => {
  assert.ok(
    Math.abs(stern - zOf(0, 0) * SCALE) < 1e-9 &&
      Math.abs(stem - zOf(1, 0) * SCALE) < 1e-9
  );
  assert.ok(half[0] > 0.5, 'a flat transom, not a point');
  assert.equal(half[half.length - 1], 0);
  for (const h of half) assert.ok(h >= 0 && h <= (BEAM / 2) * SCALE);
});

test('the outline follows the lines to within a few centimetres', () => {
  for (let s = 0.02; s < 0.97; s += 0.05) {
    const off = Math.abs(at(zOf(s, 0) * SCALE) - halfAt(s, 0) * SCALE);
    assert.ok(off < 0.06, `${off.toFixed(3)} m off at station ${s.toFixed(2)}`);
  }
});
