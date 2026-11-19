// Gust, a ship's one ability. She carries GUST.charges of it; spent,
// a burst of wind fills her canvas for GUST.time seconds (ship.ts: her speed asked rises and is reached hard, her turn
// quickens; battle.ts: her balls go off wider) and she hops off the water (ride.ts hopped). Charges come back one at
// a time, GUST.recharge seconds each, from the moment she has fewer than her most. One can't be spent while another
// still blows, nor while she is mending (hold.ts using), nor once she has sunk.
//
// Pure arithmetic: no three, so it runs in node for the tests; deterministic for the same inputs.

import { GUST } from './handling.ts';

/** Her gust: charges ready, seconds toward the next coming back, and seconds left of one blowing (0: none). */
export interface Gust { charges: number; recharge: number; blowing: number }

/** As she puts to sea: every charge ready. */
export const gustOf = (): Gust => ({ charges: GUST.charges, recharge: 0, blowing: 0 });

/** Whether she may spend one now. */
export const ready = (g: Gust) => g.charges > 0 && g.blowing <= 0;

/** A charge spent, if one may be: the gust after it, and whether it blew. */
export function spent(g: Gust): { gust: Gust; blew: boolean } {
  if (!ready(g)) return { gust: g, blew: false };
  return { gust: { ...g, charges: g.charges - 1, blowing: GUST.time }, blew: true };
}

/** dt seconds on: the one blowing dies down, and charges come back. */
export function stepGust(g: Gust, dt: number): Gust {
  const blowing = Math.max(0, g.blowing - dt);
  if (g.charges >= GUST.charges) return { charges: g.charges, recharge: 0, blowing };
  const recharge = g.recharge + dt;
  return recharge >= GUST.recharge ? { charges: g.charges + 1, recharge: 0, blowing } : { charges: g.charges, recharge, blowing };
}

/** How far the next charge has come back, 0…1 (1 with every charge ready). */
export const charging = (g: Gust) => (g.charges >= GUST.charges ? 1 : g.recharge / GUST.recharge);
