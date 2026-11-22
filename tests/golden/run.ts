// A golden match: a whole match of bots on the game's own planet and seed,
// every ship hers too, stepped on the game's own state (play/state.ts) and
// hashed to the bit. Shared by golden.test.ts (the match the seed deals) and
// golden-types.test.ts (each other type, forced).
import { createMatches } from '../../src/play/setup.ts';
import { createState } from '../../src/play/state.ts';
import type { MatchType } from '../../src/sim/persona.ts';
import { chart } from '../../src/sim/route.ts';
import { berthing } from '../../src/sim/spawn.ts';
import { landOf, planetOf } from '../../src/world/land.ts';
import { SEED } from '../../src/environment.ts';
import type { Vec3 } from '../../src/world/sphere.ts';
import { flat } from '../../src/world/swell.ts';

/** FNV-1a over the bits of every number given, as eight hex digits. */
export function fingerprint(numbers: readonly number[]): string {
  const bytes = new Uint8Array(new Float64Array(numbers).buffer);
  let h = 0x811c9dc5;
  for (const b of bytes) h = Math.imul(h ^ b, 0x01000193) >>> 0;
  return h.toString(16).padStart(8, '0');
}

/**
 * The hash of `seconds` of the game's first match of bots: of the type its
 * seed deals, or of `type` if given. Every ship's place, heading, speed,
 * health, share and whether she floats, and the loot left.
 */
export function golden(seconds: number, type?: MatchType): string {
  const planet = planetOf(SEED, landOf(SEED));
  const depth = (p: Vec3) => -planet.height(p);
  const matches = createMatches(SEED, planet, null, null, type && (() => type));
  const state = createState(
    planet,
    flat,
    { chart: chart(depth), water: berthing(depth) },
    matches.first
  );
  state.start(matches.deal(), false);
  const idle = { course: null, throttle: 0 },
    still = { aim: null, fire: false };
  while (state.time() < seconds) state.advance(idle, still);
  return fingerprint(numbersOf(state));
}

/**
 * What a golden hashes of a match's state: its clock, the loot left, and every
 * ship's place, heading, speed, health, share and whether she floats.
 */
export function numbersOf(state: ReturnType<typeof createState>): number[] {
  const numbers: number[] = [state.time(), state.loot().pieces.length];
  for (const v of state.vessels())
    numbers.push(v.id, ...v.ship.at, ...v.ship.heading, v.ship.speed);
  for (const k of state.ships())
    numbers.push(k.id, k.hull, k.shield, state.share(k.id), k.afloat ? 1 : 0);
  return numbers;
}
