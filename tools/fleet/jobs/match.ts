// The fleet's jobs on today's match (jobs.ts JOBS match, golden): one seeded
// 80-ship match of bots as the harness runs it, its state hashed on the way and
// at its end; and the repository's own goldens.
//
// Node only (tools/).

import { createHash } from 'node:crypto';
import { TYPES } from '../../../src/sim/persona.ts';
import { fingerprint, golden, numbersOf } from '../../../tests/golden/run.ts';
import { runWatched } from '../../harness/run.ts';

/** Seconds of a match's clock between the states a match job hashes on its way. */
const TRAIL = 30;

/** The goldens' own lengths (tests/golden.test.ts, tests/golden-types.test.ts): the dealt match, and each type forced. */
const GOLDEN = { dealt: 300, forced: 120 };

/**
 * A match (`<match>`, on the game's planet; or `<planet seed>-<match>`): who
 * placed where, its final state's hash, the hashes on the way, and the hash of
 * the harness's whole account of it.
 */
export function match(shard: string) {
  const [dealt, planet] = shard.split('-').map(Number).reverse();
  if (!Number.isInteger(dealt) || dealt < 1)
    throw new Error(`no match "${shard}"`);
  const trail: string[] = [];
  let state = '';
  const r = runWatched({ planet, match: dealt, brains: ['default'] }, (s) => {
    state = fingerprint(numbersOf(s));
    if (Math.round(s.time()) % TRAIL === 0) trail.push(state);
  });
  return {
    planet: planet ?? null,
    match: dealt,
    seed: r.seed,
    type: r.type,
    seconds: r.seconds,
    steps: r.steps,
    left: r.left,
    // each ship's place, in the ships' order; the final state; states on the way
    places: r.ships.map((k) => k.place),
    state,
    trail,
    // the harness's whole account of it (every ship's fighting, the shots,
    // the loot), but its timing, hashed
    account: createHash('sha256')
      .update(JSON.stringify({ ...r, msPerStep: 0 }))
      .digest('hex'),
  };
}

/** A golden: `dealt` (the match the seed deals), or a type's name, dashes for spaces. */
export function pinned(shard: string) {
  if (shard === 'dealt')
    return { seconds: GOLDEN.dealt, hash: golden(GOLDEN.dealt) };
  const type = TYPES.find((t) => t.name.replaceAll(' ', '-') === shard);
  if (!type) throw new Error(`no match type "${shard}"`);
  return { seconds: GOLDEN.forced, hash: golden(GOLDEN.forced, type) };
}
