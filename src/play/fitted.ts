// A ship fitted out by her card (race.ts RaceShip.parts): her six parts make
// her own build (sim/battle.ts Build) and her most hull (health.ts Health.most).
//
// A part's performance is so many times the spec part's (1 is spec), and makes
// her handling: her sails her top speed, her rigging how fast she gathers way,
// her rudder her fastest turn, her hull her most hull; and, where less is
// better, one over it: her keel her guns' spread, her gun mounts her reload.
// A spec ship's handling is the tables' own, to the bit.
//
// A part of no performance is an error naming it.
//
// Pure arithmetic: no three, so it runs in node for the tests. (Here, and not
// in sim/: the card's word for what a part gives is the clock's name, which
// nothing in sim/ may say.)

import { PARTS, type RaceShip } from '../race.ts';
import type { Crew } from '../sim/battle.ts';
import { HEALTH, SPEC } from '../sim/handling.ts';

/**
 * The crew `c` of the ship `ship` of a card, fitted out by her parts: her own
 * build, and her hull whole at her own most. With no ship (a match with no
 * card), the crew as it is.
 */
export function fitted(c: Crew, ship?: RaceShip): Crew {
  if (!ship) return c;
  for (const part of PARTS) {
    const { performance } = ship.parts[part];
    if (!(performance > 0))
      throw new Error(`card: ship ${ship.id}'s ${part} are ${performance}`);
  }
  const p = ship.parts,
    most = HEALTH.hull * p.hull.performance;
  return {
    ...c,
    health: { ...c.health, hull: most, most },
    build: {
      fit: {
        top: SPEC.top * p.sails.performance,
        turn: SPEC.turn * p.rudder.performance,
        reload: SPEC.reload / p.mounts.performance,
        gather: SPEC.gather * p.rigging.performance,
        spread: SPEC.spread / p.keel.performance,
      },
    },
  };
}
