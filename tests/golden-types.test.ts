// The golden match of each other type: golden.test.ts's match is the type its
// seed deals (a bloodbath), so a change to the rules of a gold rush, a cagey
// or a mixed match (sim/persona.ts) would pass it unseen. Each is the same
// planet and seed with its type forced, stepped for SECONDS and hashed to the
// bit; a change meant to move the bots records the new hashes here, as there.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TYPES } from '../src/sim/persona.ts';
import { golden } from './golden/run.ts';

/** Seconds each match is stepped; the hash each comes to, by type. */
const SECONDS = 120,
  GOLDEN = new Map([
    ['mixed', '13fa6049'],
    ['gold rush', '04ee69c0'],
    ['cagey', '99672501'],
  ]);

for (const type of TYPES)
  if (GOLDEN.has(type.name))
    test(`golden: ${SECONDS} s of a ${type.name} match of bots come out the same, to the bit`, () => {
      assert.equal(golden(SECONDS, type), GOLDEN.get(type.name));
    });
