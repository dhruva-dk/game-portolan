// The chartroom kit's own rules: the quality ladder's steps, a size in units,
// and the cut edge that runs on unbroken however long its side.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TILE, cutPath, tiles } from '../src/ui/chartroom/paper.ts';
import { LADDER, TOKENS, step, u } from '../src/ui/chartroom/tokens.ts';
import { CHARTROOM, INK } from '../src/ui/ink.ts';

test('the ladder: 0–5 silver, 6–9 verdigris, 10–13 azurite, 14–17 purpure, 18–20 gold', () => {
  const steps = Array.from({ length: 21 }, (_, v) => step(v));
  assert.deepEqual(
    steps,
    [0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4]
  );
  // the middle steps are the pale washes, iron set on them (D5); only verdigris takes the light ink
  assert.equal(LADDER[2].wash, CHARTROOM.azurite);
  assert.equal(LADDER[3].wash, CHARTROOM.purpure);
  assert.deepEqual(
    LADDER.map((q) => q.on === INK.iron),
    [true, false, true, true, true]
  );
  for (let q = 0; q < 5; q++)
    for (const name of [`q${q}`, `q${q}-rim`, `q${q}-on`])
      assert.ok(name in TOKENS, name);
});

test("a size in units is written against the page's unit", () => {
  assert.equal(u(3), 'calc(3 * var(--u))');
});

test('the cut edge lies straight where its tile is sliced, so the slices meet unbroken', () => {
  const pts = (d: string) =>
    d
      .slice(1, -1)
      .split('L')
      .map((p) => p.split(' ').map(Number));
  for (const seed of [1, 7, 42]) {
    const all = pts(cutPath(seed));
    const top = all.filter(([, y]) => Math.abs((y ?? 0) - TILE.in) < 2);
    for (const cut of [
      TILE.slice,
      TILE.side - TILE.slice,
      TILE.formal,
      TILE.side - TILE.formal,
    ]) {
      const at = top.find(([x]) => x === cut);
      assert.ok(at, `a point at ${cut}`);
      assert.equal(at[1], TILE.in, `straight at ${cut}, seed ${seed}`);
    }
    // and it wanders between them
    assert.ok(top.some(([, y]) => y !== TILE.in));
  }
  assert.equal(cutPath(3), cutPath(3));
  assert.notEqual(cutPath(3), cutPath(4));
});

test("a cut's tiles are images, its shadow on a layer of its own", () => {
  const t = tiles(7);
  for (const image of Object.values(t))
    assert.match(image, /^url\("data:image\/svg\+xml,/);
  assert.ok(!decodeURIComponent(t.ink).includes('feGaussianBlur'));
  assert.ok(decodeURIComponent(t.shadow).includes('feGaussianBlur'));
});
