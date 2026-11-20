// Her water (territory.ts) as the rules have it: her shield comes back
// wherever she is, the faster the more of the sea inside the storm is hers
// (handling.ts HOLDING).
//
// Pure arithmetic: no three, so it runs in node for the tests; deterministic
// for the same inputs, to the bit.

import type { Crew } from './battle.ts';
import { HOLDING } from './handling.ts';
import { healed } from './health.ts';
import type { Cap } from './storm.ts';

/** How much of the planet each ship holds, 0…1: sim/territory.ts share. */
interface Shares {
  share(id: number): number;
}

/**
 * A share of the planet as a share of the calm the storm leaves (`cap`): of
 * the whole planet while it has not closed; at most 1.
 */
export const calmShare = (share: number, cap: Cap) =>
  cap.radius >= Math.PI
    ? share
    : Math.min(1, share / ((1 - Math.cos(cap.radius)) / 2));

/**
 * Hit points of shield a second her water gives back, for `share` of the calm
 * hers: HOLDING shield from HOLDING full of it, in proportion under.
 */
export const regainRate = (share: number) =>
  HOLDING.shield * Math.min(1, share / HOLDING.full);

/**
 * What her water gave a ship back over a step: her id and the hit points of
 * shield.
 */
export interface Regained {
  id: number;
  shield: number;
}

/**
 * The crews after dt seconds: each afloat (by id) has her shield come back by
 * her share of the calm under `cap`, up to its most; and what each so regained
 * (only those that regained any).
 */
export function regain(
  crews: readonly Crew[],
  afloat: readonly number[],
  held: Shares,
  cap: Cap,
  dt: number
): { crews: Crew[]; regained: Regained[] } {
  const regained: Regained[] = [];
  const after = crews.map((c) => {
    if (!afloat.includes(c.id)) return c;
    const rate = regainRate(calmShare(held.share(c.id), cap));
    if (rate <= 0) return c;
    const health = healed(c.health, rate * dt, 'shield');
    if (health === c.health) return c;
    regained.push({ id: c.id, shield: health.shield - c.health.shield });
    return { ...c, health };
  });
  return { crews: after, regained };
}
