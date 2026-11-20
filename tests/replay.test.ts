// The replay (tools/harness/replay.ts): a short match set down holds her shots,
// each of a gun and most come down somewhere, some struck home, the blows
// those dealt, and who each bot is: her persona and her gunner's skill.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { recorded } from '../tools/harness/replay.ts';

test('a replay holds the shots, where they came down, and who each bot is', () => {
  const r = recorded({ match: 1, brain: 'default', seconds: 40 });
  assert.ok(r.marks.length > 0, 'shots were fired');
  const down = r.marks.filter((m) => m.length === 7);
  assert.ok(down.length > r.marks.length / 2, 'most came down somewhere');
  assert.ok(
    down.some((m) => m[4] === 1),
    'some struck home'
  );
  for (const m of r.marks) {
    assert.ok(m[3] >= 0 && m[3] < r.kinds.length, 'each of a gun');
    assert.ok(m[1] >= 0, 'none came down before it was fired');
  }
  assert.ok(
    r.blows.some((b) => b[4] === 0 && b[3] > 0),
    'blows were dealt'
  );
  assert.equal(r.crew.length, r.frames[0].ships.length);
  for (const c of r.crew) {
    assert.ok(c.persona.length > 0, `ship ${c.id} has a persona`);
    assert.ok(c.skill >= 0 && c.skill <= 1);
  }
  assert.ok(new Set(r.crew.map((c) => c.persona)).size > 1, 'of several');
});
