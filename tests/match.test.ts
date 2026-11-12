import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HOLD, PLAYER, startMatch, stepMatch, tapped, type MatchState, type Sunk } from '../src/sim/match.ts';

/** Steps a match through frames of `dt`, each with what the game reports then. */
const run = (m: MatchState, frames: { landed?: boolean; sinkings: Sunk[]; alive: number[] }[], dt = 1 / 30) =>
  frames.reduce((s, f) => stepMatch(s, { landed: f.landed ?? true, ...f }, dt), m);

test('the drop gives way to the fight when she touches the water', () => {
  let m = startMatch(true);
  m = stepMatch(m, { landed: false, sinkings: [], alive: [0, 1, 2] }, 0.1);
  assert.equal(m.phase, 'dropping');
  m = stepMatch(m, { landed: true, sinkings: [], alive: [0, 1, 2] }, 0.1);
  assert.equal(m.phase, 'fighting');
  assert.equal(startMatch(false).phase, 'fighting');
});

test('sunk, she places one behind the ships still afloat, and watches the one that sank her', () => {
  const sinkings: Sunk[] = [{ id: 4, by: 2 }, { id: 5, by: null }];
  let m = run(startMatch(false), [{ sinkings, alive: [0, 1, 2, 3] }]);
  assert.equal(m.phase, 'fighting');
  sinkings.push({ id: PLAYER, by: 3 });
  m = run(m, [{ sinkings, alive: [1, 2, 3] }]);
  assert.deepEqual([m.phase, m.place, m.watch, m.move], ['spectating', 4, 3, 'cut']);
});

test('sunk by the storm, or by a ship since sunk, she watches the ship afloat that has sunk the most', () => {
  const sinkings: Sunk[] = [{ id: 4, by: 2 }, { id: 5, by: 2 }, { id: 6, by: 1 }, { id: PLAYER, by: null }];
  const m = run(startMatch(false), [{ sinkings, alive: [1, 2, 3] }]);
  assert.deepEqual([m.place, m.watch], [4, 2]);
});

test('when the ship watched sinks, the camera flies to the one that sank her', () => {
  const sinkings: Sunk[] = [{ id: PLAYER, by: 2 }];
  let m = run(startMatch(false), [{ sinkings, alive: [1, 2, 3] }]);
  assert.equal(m.watch, 2);
  m = run(m, [{ sinkings: [...sinkings, { id: 2, by: 3 }], alive: [1, 3] }]);
  assert.deepEqual([m.watch, m.move, m.place], [3, 'fly', 4]);
  // another's sinking leaves the camera where it is
  m = run(m, [{ sinkings: [...sinkings, { id: 2, by: 3 }, { id: 1, by: 3 }], alive: [3] }]);
  assert.equal(m.watch, 3);
});

test('spectating, the match over holds a moment, then moves on; a tap moves on at once', () => {
  const sinkings: Sunk[] = [{ id: PLAYER, by: 1 }, { id: 2, by: 1 }];
  let m = run(startMatch(false), [{ sinkings, alive: [1] }]);
  assert.equal(m.done, false);
  m = run(m, Array.from({ length: Math.ceil(HOLD.spectating * 30) + 1 }, () => ({ sinkings, alive: [1] })));
  assert.equal(m.done, true);
  // while ships still fight, only a tap ends it
  const open = run(startMatch(false), Array.from({ length: 600 }, () => ({ sinkings: [{ id: PLAYER, by: 1 }], alive: [1, 2] })));
  assert.equal(open.done, false);
  assert.equal(tapped(open).done, true);
});

test('the last afloat, she wins: first place, a tap or VICTORY seconds move on', () => {
  const sinkings: Sunk[] = [{ id: 1, by: PLAYER }, { id: 2, by: 1 }];
  let m = run(startMatch(false), [{ sinkings: sinkings.slice(0, 1), alive: [0, 2] }]);
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
  const m = run(startMatch(false), Array.from({ length: 90 }, () => ({ sinkings: [], alive: [0] })));
  assert.equal(m.phase, 'fighting');
  assert.equal(tapped(m), m);
});
