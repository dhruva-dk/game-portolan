import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FIRE_DRAG, fireDrag, aimed } from '../src/ui/sea/aim.ts';

test('a finger held still on Fire moves no aim, however long it rests within the slop', () => {
  const drag = fireDrag();
  drag.down(100, 100);
  for (const [x, y] of [
    [101, 100],
    [103, 102],
    [100, 98],
    [104, 97],
  ])
    assert.equal(drag.move(x, y), null);
});

test('once a drag from Fire leaves the slop, the aim moves by all of it from where the finger went down, then by each move', () => {
  const drag = fireDrag();
  drag.down(100, 100);
  assert.equal(drag.move(103, 100), null);
  assert.deepEqual(drag.move(100 + FIRE_DRAG.slop + 2, 100), [
    FIRE_DRAG.slop + 2,
    0,
  ]);
  assert.deepEqual(drag.move(120, 90), [20 - FIRE_DRAG.slop - 2, -10]);
  assert.deepEqual(drag.move(120, 90), [0, 0]);
});

test('a lifted finger ends the drag: moves after it, and before the next press, move nothing', () => {
  const drag = fireDrag();
  drag.down(0, 0);
  drag.move(40, 0);
  drag.up();
  assert.equal(drag.move(80, 0), null);
  drag.down(80, 0);
  assert.equal(drag.move(82, 0), null);
});

test('the aim a drag gives is scaled by Sensitivity, the same for either hand', () => {
  assert.deepEqual(aimed([10, -4], 1), [10, -4]);
  assert.deepEqual(aimed([10, -4], 2), [20, -8]);
  assert.deepEqual(aimed([10, -4], 0.5), [5, -2]);
});
