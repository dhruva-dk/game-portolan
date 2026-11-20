// The golden match: a whole match of bots, every ship hers too, stepped for
// SECONDS on the game's own state (play/state.ts), hashed to the bit. A change
// that should leave the bots as they were (a refactor) leaves this hash; one
// meant to change them records the new hash and, in BOTS.md's log, what the
// harness measured before and after.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMatches } from '../src/play/setup.ts';
import { createState } from '../src/play/state.ts';
import { chart } from '../src/sim/route.ts';
import { berthing } from '../src/sim/spawn.ts';
import { landOf, planetOf } from '../src/world/land.ts';
import { SEED } from '../src/environment.ts';
import type { Vec3 } from '../src/world/sphere.ts';
import { flat } from '../src/world/swell.ts';

/** Seconds of the match stepped; the hash it comes to. */
const SECONDS = 300,
  GOLDEN = 'e9be4e05';

/** FNV-1a over the bits of every number given, as eight hex digits. */
function fingerprint(numbers: readonly number[]): string {
  const bytes = new Uint8Array(new Float64Array(numbers).buffer);
  let h = 0x811c9dc5;
  for (const b of bytes) h = Math.imul(h ^ b, 0x01000193) >>> 0;
  return h.toString(16).padStart(8, '0');
}

test(`golden: ${SECONDS} s of a match of bots come out the same, to the bit`, () => {
  const planet = planetOf(SEED, landOf(SEED));
  const depth = (p: Vec3) => -planet.height(p);
  const matches = createMatches(SEED, planet, null, null);
  const state = createState(
    planet,
    flat,
    { chart: chart(depth), water: berthing(depth) },
    matches.first
  );
  state.start(matches.deal(), false);
  const idle = { course: null, throttle: 0 },
    still = { aim: null, fire: false };
  while (state.time() < SECONDS) state.advance(idle, still);
  const numbers: number[] = [state.time(), state.loot().pieces.length];
  for (const v of state.vessels())
    numbers.push(v.id, ...v.ship.at, ...v.ship.heading, v.ship.speed);
  for (const k of state.ships())
    numbers.push(k.id, k.hull, k.shield, state.share(k.id), k.afloat ? 1 : 0);
  assert.equal(fingerprint(numbers), GOLDEN);
});
