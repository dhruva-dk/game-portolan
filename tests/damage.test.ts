import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createChanged } from '../src/ui/drawn.ts';
import { GLYPHS, stormMark } from '../src/ui/glyphs.ts';
import { RING, glow, sectorOf } from '../src/ui/hits.ts';

test('a blow on her lights the sector of the ring toward its dealer: eight, ahead first, clockwise', () => {
  const step = Math.PI / 4,
    e = 1e-6;
  for (let i = 0; i < 8; i++) {
    assert.equal(sectorOf(i * step), i);
    assert.equal(sectorOf(i * step - 2 * Math.PI), i);
    assert.equal(sectorOf(i * step - step / 2 + e), i);
    assert.equal(sectorOf(i * step + step / 2 - e), i);
    assert.equal(sectorOf(i * step + step / 2), (i + 1) % 8);
  }
  assert.equal(sectorOf(Math.PI / 2), 2, 'right');
  assert.equal(sectorOf(-Math.PI / 2), 6, 'left');
  assert.equal(sectorOf(Math.PI), 4, 'behind');
  assert.equal(sectorOf(-Math.PI), 4, 'behind, the other way');
});

test("a sector's light: struck at once, brighter the heavier, faded out over 2 s", () => {
  const light = glow(0.4),
    heavy = glow(1.3),
    o = (g: ReturnType<typeof glow>) => g.frames.map((f) => f.opacity);
  assert.equal(light.ms, 2000);
  for (const g of [light, heavy]) {
    const os = o(g);
    for (let i = 1; i < os.length; i++) assert.ok(os[i] <= os[i - 1]);
    assert.equal(os[os.length - 1], 0);
    assert.ok(os[0] > RING.rest, 'lit above the ring at rest');
  }
  assert.ok(o(heavy)[0] > o(light)[0]);
  assert.equal(o(heavy)[0], 1);
  assert.equal(o(glow(0))[0], RING.lit[0]);
});

test("the storm's mark: its bolt hollow while it holds, filled while it closes, the same bolt", () => {
  const held = GLYPHS[stormMark(false)],
    closing = GLYPHS[stormMark(true)];
  assert.ok(held.every((p) => p.k === 's'));
  assert.ok(closing.every((p) => p.k === 'f'));
  assert.equal(held[0]?.d, closing[0]?.d);
});

test('a piece is drawn again only when what it shows changes (the clock turning its bolt filled)', () => {
  const changed = createChanged<object>(),
    clock = {},
    other = {};
  assert.equal(changed(clock, 40, 6, false, false), true, 'first drawn');
  for (let i = 0; i < 5; i++)
    assert.equal(changed(clock, 40, 6, false, false), false);
  assert.equal(changed(clock, 40, 6, true, true), true, 'closing: redrawn');
  assert.equal(changed(clock, 40, 6, true, true), false);
  assert.equal(changed(other, 40, 6, true, true), true, 'each piece its own');
  assert.equal(changed(clock, 39, 6, true, true), true);
});
