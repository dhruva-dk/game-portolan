// A ship fitted out by her card (race.ts RaceShip.parts): her six parts make
// her own build (faults.ts Build) and her most hull (health.ts Health.most).
//
// A part's performance is so many times the spec part's (1 is spec), and makes
// her handling: her sails her top speed, her rigging how fast she gathers way,
// her rudder her fastest turn, her hull her most hull; and, where less is
// better, one over it: her keel her guns' spread, her gun mounts her reload.
// A spec ship's handling is the tables' own, to the bit.
//
// A part's reliability (0…1; FITTED.spec is spec) moves the hull at or under
// which her zones fault (faults.ts FAULTS.minor, FAULTS.major): a spec part's
// are the tables'; the most reliable part's are FITTED.sway less of them, the
// least reliable's as much more. Her sails and her rigging are her rigging
// zone's (the mean of the two), her rudder her rudder's, her hull and her keel
// her waterline's, her gun mounts her deck's.
//
// A part of no performance, or of a reliability out of 0…1, is an error naming
// it.
//
// Pure arithmetic: no three, so it runs in node for the tests. (Here, and not
// in sim/: the card's word for what a part gives is the clock's name, which
// nothing in sim/ may say.)

import { ZONES, type Zone, type Zones } from '../kinds.ts';
import { PARTS, type PartType, type RaceShip } from '../race.ts';
import type { Crew } from '../sim/battle.ts';
import { FAULTS, type Band } from '../sim/faults.ts';
import { HEALTH, SPEC } from '../sim/handling.ts';

/** What a ship's parts are read by. Starting values. */
export const FITTED = {
  /** The reliability of a spec part: the tables' bands. */
  spec: 0.5,
  /**
   * The share of the tables' bands the most reliable part (1) takes off her
   * zone's, and the least reliable (0) adds to them.
   */
  sway: 0.5,
  /** The parts whose reliability is each zone's. */
  zones: {
    rigging: ['sails', 'rigging'],
    rudder: ['rudder'],
    waterline: ['hull', 'keel'],
    deck: ['mounts'],
  } satisfies Record<Zone, readonly PartType[]>,
} as const;

/** The band of a zone whose parts are `reliability` reliable. */
const bandOf = (reliability: number): Band => {
  const by =
    1 + (FITTED.sway * (FITTED.spec - reliability)) / (1 - FITTED.spec);
  return { minor: FAULTS.minor * by, major: FAULTS.major * by };
};

/** Her zones' bands (ZONES' order), by her parts' reliability. */
function bandsOf(parts: RaceShip['parts']): Zones<Band> {
  const of = (z: number): Band => {
    const zone = ZONES[z],
      made = zone ? FITTED.zones[zone] : [];
    let sum = 0;
    for (const p of made) sum += parts[p].reliability;
    return bandOf(made.length > 0 ? sum / made.length : FITTED.spec);
  };
  return [of(0), of(1), of(2), of(3)];
}

/**
 * The crew `c` of the ship `ship` of a card, fitted out by her parts: her own
 * build, and her hull whole at her own most. With no ship (a match with no
 * card), the crew as it is.
 */
export function fitted(c: Crew, ship?: RaceShip): Crew {
  if (!ship) return c;
  for (const part of PARTS) {
    const { performance, reliability } = ship.parts[part];
    if (!(performance > 0 && reliability >= 0 && reliability <= 1))
      throw new Error(
        `card: ship ${ship.id}'s ${part} are ${performance} by ${reliability}`
      );
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
      bands: bandsOf(p),
    },
  };
}
