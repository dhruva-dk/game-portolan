// Gust, a ship's one ability: 0117's (src/sim/sailing.ts gust, rechargeGust). She carries GUST.charges of it; spent,
// a burst of wind fills her canvas for GUST.time seconds (ship.ts: her speed asked rises and is reached hard, her turn
// quickens; battle.ts: her balls go off wider) and she hops off the water (ride.ts hopped). Charges come back one at
// a time, GUST.recharge seconds each, from the moment she has fewer than her most. One can't be spent while another
// still blows, nor while she is mending (hold.ts using), nor once she has sunk.
//
// Pure arithmetic: no three, so it runs in node for the tests; deterministic for the same inputs.

import { GUST } from './handling.ts';

/** Her gust: charges ready, seconds toward the next coming back, and seconds left of one blowing (0: none); and the
 *  seconds a charge takes her to come back (GUST.recharge unless her bosun's bond says otherwise: race.ts Service). */
export interface Gust { charges: number; recharge: number; blowing: number; every?: number }

/** As she puts to sea: every charge ready, each coming back in `every` s if given. */
export const gustOf = (every?: number): Gust => (every === undefined ? { charges: GUST.charges, recharge: 0, blowing: 0 } : { charges: GUST.charges, recharge: 0, blowing: 0, every });

/** The seconds a charge of hers takes to come back. */
const everyOf = (g: Gust) => g.every ?? GUST.recharge;

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
  if (g.charges >= GUST.charges) return { ...g, charges: g.charges, recharge: 0, blowing };
  const recharge = g.recharge + dt;
  return recharge >= everyOf(g) ? { ...g, charges: g.charges + 1, recharge: 0, blowing } : { ...g, charges: g.charges, recharge, blowing };
}

/** A charge given her (the flight's), up to her most. */
export const charged = (g: Gust): Gust => (g.charges >= GUST.charges ? g : { ...g, charges: g.charges + 1, recharge: 0 });

/** How far the next charge has come back, 0…1 (1 with every charge ready). */
export const charging = (g: Gust) => (g.charges >= GUST.charges ? 1 : g.recharge / everyOf(g));
