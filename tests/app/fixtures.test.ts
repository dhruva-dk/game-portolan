// The screens' fixture models look like a real career: the rivals page tags no more captains Rival than a
// mid-career player would have, by the career's own measure.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RIVAL_AT, rivalry } from '../../src/career/fleet.ts';
import { GRUDGE } from '../../src/career/habits.ts';
import { fxRivals } from '../../src/ui/fixtures.ts';

test('the fixture rivals: at most a third are tagged Rival, by the career\'s own measure', (t) => {
  const { rivals } = fxRivals(), tagged = rivals.filter((r) => r.isRival);
  t.diagnostic(`${tagged.length} of ${rivals.length} tagged Rival`);
  assert.ok(tagged.length >= 3, 'a few rivals to show');
  assert.ok(tagged.length <= rivals.length / 3, 'no more than a third');
  for (const r of rivals) {
    const level = rivalry({ grudge: r.grudge, sank: r.sankYou, sunk: r.sunkByYou } as Parameters<typeof rivalry>[0]);
    assert.ok(Math.abs(level - r.rivalry) < 1e-9, `${r.name}: rivalry measured as the career measures it`);
    assert.equal(r.isRival, level >= RIVAL_AT, `${r.name}: tagged as the career tags it`);
    assert.ok(r.grudge <= GRUDGE.max);
  }
});
