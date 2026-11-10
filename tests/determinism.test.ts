// One seed gives one match, and a snapshot taken partway carries on as if nothing had happened.
//   node --test tests/determinism.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMatch, encodeMatch, decodeMatch, matchHash, step, over, type MatchState } from '../src/sim/match.ts';

const SEED = 7, TICKS = 90 * 30, HALF = 40 * 30;
const start = (): MatchState => createMatch({ seed: SEED, fleet: [{ captain: true }] });

function run(state: MatchState, to: number): MatchState {
  while (state.tick < to && !over(state)) step(state);
  return state;
}

test('the same seed sails the same match', () => {
  const a = run(start(), TICKS), b = run(start(), TICKS);
  assert.equal(a.tick, b.tick);
  assert.equal(matchHash(a), matchHash(b));
  assert.ok(a.owner.some((o) => o !== 0), 'the run should have inked some water');
});

test('a different seed sails a different one', () => {
  const a = run(start(), HALF), b = run(createMatch({ seed: SEED + 1, fleet: [{ captain: true }] }), HALF);
  assert.notEqual(matchHash(a), matchHash(b));
});

test('a snapshot carries on as the match would have', () => {
  const a = run(start(), HALF);
  const resumed = decodeMatch(encodeMatch(a));
  assert.equal(matchHash(resumed), matchHash(a), 'a snapshot is the state it was taken of');
  run(a, TICKS);
  run(resumed, TICKS);
  assert.equal(matchHash(resumed), matchHash(a));
});
