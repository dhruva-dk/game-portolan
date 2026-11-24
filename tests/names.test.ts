import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BANNED, allowed } from '../src/career/names.ts';

test('the banned rule: a banned word as a whole word, in any case', () => {
  assert.deepEqual(BANNED, ['mara']);
  for (const bad of [
    'Mara',
    'MARA',
    'mara',
    'Mara People',
    'The mara',
    'People of Mara',
    'Hale & Mara, Coopers',
    'x-Mara',
  ])
    assert.equal(allowed(bad), false, bad);
  for (const ok of ['Marat', 'Amara', 'Maraton People', 'Samara', 'Mar a'])
    assert.equal(allowed(ok), true, ok);
});
