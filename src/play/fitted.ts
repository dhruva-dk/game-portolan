import { PARTS, type RaceShip } from '../race.ts';
import type { Crew } from '../sim/battle.ts';
import { HEALTH, SPEC } from '../sim/handling.ts';

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
