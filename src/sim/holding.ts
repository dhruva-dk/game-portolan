// Her own water (territory.ts) as the rules have it: in it she sails faster
// (handling.ts HOLDING speed: her helm's home), and her shield comes back
// (HOLDING shield, hit points a second).
//
// Pure arithmetic: no three, so it runs in node for the tests; deterministic
// for the same inputs, to the bit.

import type { Crew } from './battle.ts';
import { HOLDING } from './handling.ts';
import { healed } from './health.ts';
import type { Helm } from './ship.ts';
import type { Vec3 } from '../world/sphere.ts';

/**
 * Who holds the water at a point (her id, −1 open sea): sim/territory.ts
 * ownerAt.
 */
export interface Waters {
  ownerAt(p: Vec3): number;
}

/** A ship as her water reads her: who she is and where she lies. */
interface Lying {
  id: number;
  ship: { at: Vec3 };
}

/** Whether she lies in her own water (none outside a match). */
export const atHome = (waters: Waters | null, v: Lying): boolean =>
  !!waters && waters.ownerAt(v.ship.at) === v.id;

/** Her helm as her water has it: in her own, she sails faster. */
export const homed = (helm: Helm, waters: Waters | null, v: Lying): Helm => ({
  ...helm,
  home: atHome(waters, v),
});

/**
 * What her water gave a ship back over a step: her id and the hit points of
 * shield.
 */
export interface Regained {
  id: number;
  shield: number;
}

/**
 * The crews after dt seconds in their own water: each of `fleet` lying in hers
 * has her shield come back, at HOLDING shield a second up to its most; and what
 * each so regained (only those that regained any).
 */
export function regain(
  crews: readonly Crew[],
  fleet: readonly Lying[],
  waters: Waters,
  dt: number
): { crews: Crew[]; regained: Regained[] } {
  const home = new Set(fleet.filter((v) => atHome(waters, v)).map((v) => v.id)),
    regained: Regained[] = [];
  const after = crews.map((c) => {
    if (!home.has(c.id)) return c;
    const health = healed(c.health, HOLDING.shield * dt, 'shield');
    if (health === c.health) return c;
    regained.push({ id: c.id, shield: health.shield - c.health.shield });
    return { ...c, health };
  });
  return { crews: after, regained };
}
