// The golden match: a whole match of bots, every ship hers too, stepped for
// SECONDS on the game's own state (play/state.ts), hashed to the bit. A change
// that should leave the bots as they were (a refactor) leaves this hash; one
// meant to change them records the new hash and, in BOTS.md's log, what the
// harness measured before and after. Its match is the type the seed deals (a
// bloodbath); golden-types.test.ts holds the others.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { golden } from './golden/run.ts';

/** Seconds of the match stepped; the hash it comes to. */
const SECONDS = 300,
  GOLDEN = '534ad279';

test(`golden: ${SECONDS} s of a match of bots come out the same, to the bit`, () => {
  assert.equal(golden(SECONDS), GOLDEN);
});
