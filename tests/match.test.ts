import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CREDIT, HOLD, PLAYER, credited, startMatch, stepMatch, tapped, type MatchState, type Sunk } from '../src/sim/match.ts';

/** Steps a match through frames of `dt`, each with what the game reports then. */
const run = (m: MatchState, frames: { sinkings: Sunk[]; alive: number[] }[], dt = 1 / 30) =>
  frames.reduce((s, f) => stepMatch(s, f, dt), m);

test('sunk, she places one behind the ships still afloat, and watches the one that sank her', () => {
  const sinkings: Sunk[] = [{ id: 4, by: 2, cause: 'shot' }, { id: 5, by: null, cause: 'storm' }];
  let m = run(startMatch(), [{ sinkings, alive: [0, 1, 2, 3] }]);
  assert.equal(m.phase, 'fighting');
  sinkings.push({ id: PLAYER, by: 3, cause: 'shot' });
  m = run(m, [{ sinkings, alive: [1, 2, 3] }]);
  assert.deepEqual([m.phase, m.place, m.watch, m.move], ['spectating', 4, 3, 'cut']);
});

test('sunk by the storm, or by a ship since sunk, she watches the ship afloat that has sunk the most', () => {
  const sinkings: Sunk[] = [{ id: 4, by: 2, cause: 'shot' }, { id: 5, by: 2, cause: 'shot' }, { id: 6, by: 1, cause: 'shot' }, { id: PLAYER, by: null, cause: 'storm' }];
  const m = run(startMatch(), [{ sinkings, alive: [1, 2, 3] }]);
  assert.deepEqual([m.place, m.watch], [4, 2]);
});

test('when the ship watched sinks, the camera flies to the one that sank her', () => {
  const sinkings: Sunk[] = [{ id: PLAYER, by: 2, cause: 'shot' }];
  let m = run(startMatch(), [{ sinkings, alive: [1, 2, 3] }]);
  assert.equal(m.watch, 2);
  m = run(m, [{ sinkings: [...sinkings, { id: 2, by: 3, cause: 'shot' }], alive: [1, 3] }]);
  assert.deepEqual([m.watch, m.move, m.place], [3, 'fly', 4]);
  // another's sinking leaves the camera where it is
  m = run(m, [{ sinkings: [...sinkings, { id: 2, by: 3, cause: 'shot' }, { id: 1, by: 3, cause: 'shot' }], alive: [3] }]);
  assert.equal(m.watch, 3);
});

test('spectating, the match over holds a moment, then moves on; a tap moves on at once', () => {
  const sinkings: Sunk[] = [{ id: PLAYER, by: 1, cause: 'shot' }, { id: 2, by: 1, cause: 'shot' }];
  let m = run(startMatch(), [{ sinkings, alive: [1] }]);
  assert.equal(m.done, false);
  m = run(m, Array.from({ length: Math.ceil(HOLD.spectating * 30) + 1 }, () => ({ sinkings, alive: [1] })));
  assert.equal(m.done, true);
  // while ships still fight, only a tap ends it
  const open = run(startMatch(), Array.from({ length: 600 }, () => ({ sinkings: [{ id: PLAYER, by: 1, cause: 'shot' }], alive: [1, 2] })));
  assert.equal(open.done, false);
  assert.equal(tapped(open).done, true);
});

test('the last afloat, she wins: first place, a tap or VICTORY seconds move on', () => {
  const sinkings: Sunk[] = [{ id: 1, by: PLAYER, cause: 'shot' }, { id: 2, by: 1, cause: 'shot' }];
  let m = run(startMatch(), [{ sinkings: sinkings.slice(0, 1), alive: [0, 2] }]);
  assert.equal(m.phase, 'fighting');
  m = run(m, [{ sinkings, alive: [0] }]);
  assert.deepEqual([m.phase, m.place, m.watch], ['won', 1, PLAYER]);
  assert.equal(tapped(m).done, true);
  m = run(m, Array.from({ length: HOLD.won * 30 - 2 }, () => ({ sinkings, alive: [0] })));
  assert.equal(m.done, false);
  m = run(m, Array.from({ length: 4 }, () => ({ sinkings, alive: [0] })));
  assert.equal(m.done, true);
});

test('alone on the sea from the start is no win, and a tap in the fight does nothing', () => {
  const m = run(startMatch(), Array.from({ length: 90 }, () => ({ sinkings: [], alive: [0] })));
  assert.equal(m.phase, 'fighting');
  assert.equal(tapped(m), m);
});

test('her place and how she sank: by a ball, a ram, or the Storm, one behind every ship afloat', () => {
  for (const cause of ['shot', 'ram', 'storm'] as const) {
    const mine: Sunk = { id: PLAYER, by: cause === 'storm' ? null : 7, cause };
    const m = run(startMatch(), [{ sinkings: [{ id: 3, by: 7, cause: 'shot' }, mine], alive: [1, 2, 7] }]);
    assert.deepEqual([m.phase, m.place, m.sunk], ['spectating', 4, mine], cause);
  }
});

test('sunk in the same step as others, the sinkings count one by one in the order reported (0117 end.ts)', () => {
  // she and two more go down in one step, she second of the three: one sunk after her, two afloat
  const sinkings: Sunk[] = [{ id: 4, by: 1, cause: 'shot' }, { id: PLAYER, by: 1, cause: 'ram' }, { id: 5, by: null, cause: 'storm' }];
  assert.equal(run(startMatch(), [{ sinkings, alive: [1, 2] }]).place, 4);
  // the last two afloat sinking at once: she sank second, so she is the last afloat, and wins (not first by the ships
  // afloat after the step, which would place her first however the two went down)
  const both: Sunk[] = [{ id: 1, by: PLAYER, cause: 'ram' }, { id: PLAYER, by: 1, cause: 'ram' }];
  const m = run(startMatch(), [{ sinkings: both, alive: [] }]);
  assert.deepEqual([m.phase, m.place], ['won', 1]);
  // sinking first of the two, she is second
  const first = run(startMatch(), [{ sinkings: [both[1], both[0]], alive: [] }]);
  assert.deepEqual([first.phase, first.place], ['spectating', 2]);
});

test("the Storm's sinking goes to the ship that last struck her, within CREDIT seconds; a ball's or a ram's always", () => {
  assert.equal(credited('storm', null), null);
  assert.equal(credited('storm', { by: 3, ago: CREDIT - 0.1 }), 3);
  assert.equal(credited('storm', { by: 3, ago: CREDIT + 0.1 }), null);
  assert.equal(credited('shot', { by: 5, ago: 0 }), 5);
  assert.equal(credited('ram', { by: 5, ago: 60 }), 5);
});
