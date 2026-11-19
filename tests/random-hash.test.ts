// world/random.ts hash01: steady, within [0, 1), and spread evenly over it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hash, hash01 } from '../src/world/random.ts';

test('hash01 is hash over 2³², steady, in [0, 1) and even', () => {
  const bins = new Array(10).fill(0);
  for (let i = 0; i < 10000; i++) {
    const h = hash01(i, 7);
    assert.equal(h, hash(i, 7) / 4294967296);
    assert.equal(h, hash01(i, 7));
    assert.ok(h >= 0 && h < 1);
    bins[Math.floor(h * 10)]++;
  }
  for (const n of bins) assert.ok(Math.abs(n - 1000) < 120, `bins ${bins}`);
  assert.notEqual(hash01(3, 1), hash01(3, 2));
});
