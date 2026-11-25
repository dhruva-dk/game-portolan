import { test } from 'node:test';
import assert from 'node:assert/strict';
import { linearToHex } from '../src/world/color.ts';
import type { Sea } from '../src/render/snapshot.ts';
import { INK, dyeOn, percent } from '../src/ui/base/ink.ts';

test('the sea held, as a per cent: always to a tenth, never below none', () => {
  assert.equal(percent(0), '0.0%');
  assert.equal(percent(0.0004), '0.0%');
  assert.equal(percent(0.0006), '0.1%');
  assert.equal(percent(0.123), '12.3%');
  assert.equal(percent(1), '100.0%');
  assert.equal(percent(-0.2), '0.0%');
});

test("its dye, from the sea's colors: its own by its id, white while it is not known", () => {
  const colors: Sea['colors'] = [
    [1, 0, 0],
    [0.9, 0.7, 0.1],
  ];
  const on = (own: number | null | undefined) => dyeOn({ colors }, own);
  assert.equal(on(0), '#ff0000');
  assert.equal(on(1), linearToHex([0.9, 0.7, 0.1]));
  assert.equal(on(2), INK.white);
  assert.equal(on(null), INK.white);
  assert.equal(dyeOn(undefined, 0), INK.white);
});
