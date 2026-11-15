// A ship's own handling (race.ts Handling): the seven numbers her parts and her yard make of her, read by the rules
// that sail her (ship.ts, ride.ts, helmsman.ts, claimer.ts), take her hit points (health.ts, battle.ts, hold.ts) and
// work her gun (battle.ts, gun.ts). Every other number of her handling stays global (handling.ts).
//
// SPEC is the ship of handling.ts's tables: a card-less ship's, and every ship's until a card says otherwise. Her
// `spread` and `reload` multiply what her gun's kind and rarity give (gun.ts spreadOf, reloadOf), so at 1 they are
// the tables' own.

import type { Handling } from '../race.ts';
import { HEALTH, SHIP } from './handling.ts';

export type { Handling };

/** The ship of the tables: SHIP's top speed, gathering way, turn and answer; HEALTH's most hull; her gun's spread and
 *  reload as its kind and rarity give them. */
export const SPEC: Handling = {
  top: SHIP.top, gather: SHIP.gather, turn: SHIP.turn, answer: SHIP.answer, hull: HEALTH.hull, spread: 1, reload: 1,
};
