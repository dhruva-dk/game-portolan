// The rookery's slips (ui/stack.ts settled): slips of buildings close together are stacked, never overlapping; a
// slip clear of the others stays on its anchor.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { settled, slipWidth } from '../src/ui/stack.ts';

test('slips that would overlap are stacked upward, the nearest kept on its anchor; a slip clear of them stays put', () => {
  const w = slipWidth('10 days');
  const slips = [{ x: 400, y: 300, w }, { x: 420, y: 310, w }, { x: 395, y: 296, w }, { x: 900, y: 120, w }];
  const at = settled(slips);
  assert.deepEqual(at[1], { x: 420, y: 310 }, 'the lowest kept');
  assert.deepEqual(at[3], { x: 900, y: 120 }, 'the one apart kept');
  for (let i = 0; i < at.length; i++) for (let j = i + 1; j < at.length; j++) {
    const apart = Math.abs(at[i].x - at[j].x) >= w + 4 || Math.abs(at[i].y - at[j].y) >= 24 + 4;
    assert.ok(apart, `slips ${i} and ${j} overlap`);
  }
  assert.ok(at[0].y < 310 && at[2].y < at[0].y, 'stacked in their order, upward');
});

test('a slip on the screen near its edge is kept wholly on it; one off it is left off', () => {
  const w = slipWidth('8 days');
  const [edge, off] = settled([{ x: 6, y: 200, w }, { x: -40, y: 400, w }], 1180);
  assert.ok(edge.x - w / 2 >= 0, 'clipped at the edge');
  assert.equal(off.x, -40);
});
