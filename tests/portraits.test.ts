import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  JACKETS,
  SHADES,
  lookOf,
  portrait,
  uncle,
} from '../src/ui/base/gull.ts';
import { INK } from '../src/ui/base/ink.ts';

const SIZES = [28, 80];
const SEEDS = 20_000;

test('the same seed gives the same portrait', () => {
  for (const seed of [0, 1, 7, 4096, 123_456_789, 2 ** 32 - 1]) {
    for (const size of SIZES) {
      assert.equal(portrait(seed, size), portrait(seed, size));
    }
    assert.deepEqual(lookOf(seed), lookOf(seed));
  }
});

test('there are six sunglasses styles and at least ten jackets, none a meaning ink', () => {
  assert.equal(SHADES.length, 6);
  assert.equal(new Set(SHADES).size, 6);
  assert.ok(JACKETS.length >= 10);
  assert.equal(new Set(JACKETS).size, JACKETS.length);
  const meaning: readonly string[] = [
    INK.gold,
    INK.green,
    INK.blue,
    INK.storm,
    INK.rubric,
    INK.iron,
  ];
  for (const jacket of JACKETS) assert.ok(!meaning.includes(jacket), jacket);
});

test('every jacket and every style occurs, independently of each other', () => {
  const counts = new Map<string, number>();
  for (let seed = 0; seed < SEEDS; seed++) {
    const { jacket, shades } = lookOf(seed);
    const key = `${jacket} ${shades}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const cells = JACKETS.length * SHADES.length,
    expected = SEEDS / cells;
  assert.equal(counts.size, cells);
  let chi = 0;
  for (const n of counts.values()) chi += (n - expected) ** 2 / expected;
  assert.ok(
    chi < 2 * cells,
    `chi-square ${chi.toFixed(1)} over ${cells} cells`
  );
  for (const jacket of JACKETS) {
    const row = SHADES.map((s) => counts.get(`${jacket} ${s}`) ?? 0);
    assert.ok(Math.min(...row) > expected * 0.6, `${jacket}: ${row.join(' ')}`);
  }
});

test('a portrait shows its jacket and differs from every other look', () => {
  const seen = new Map<string, string>();
  for (let seed = 0; seen.size < JACKETS.length * SHADES.length; seed++) {
    const { jacket, shades } = lookOf(seed),
      markup = portrait(seed, 80);
    assert.ok(markup.includes(jacket));
    seen.set(`${jacket} ${shades}`, markup);
  }
  assert.equal(new Set(seen.values()).size, seen.size);
});

test("Uncle's portrait is fixed and no seed draws it", () => {
  for (const size of SIZES) {
    assert.equal(uncle(size), uncle(size));
    const his = uncle(size),
      looks = new Set<string>();
    for (let seed = 0; looks.size < JACKETS.length * SHADES.length; seed++) {
      const { jacket, shades } = lookOf(seed);
      looks.add(`${jacket} ${shades}`);
      assert.notEqual(portrait(seed, size), his);
    }
  }
  for (const jacket of JACKETS) assert.ok(!uncle(80).includes(jacket));
});
