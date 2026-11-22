// A race's card (race.ts RaceCard) as the sim reads it: which of its ships put
// to sea, and each ship's team. A match with no card has no teams: every ship
// sails for herself.
//
// Pure: no three, so it runs in node for the tests.

import type { RaceCard } from '../race.ts';

/**
 * The card's ships, checked: numbered 0 … n − 1 in order (a ship's id is her
 * place on the card, as it is her place in the fleet), and none but the first
 * without a driver (only ship 0 is ever sailed by hand). An error naming what
 * is wrong otherwise.
 */
export function checked(card: RaceCard): RaceCard {
  card.ships.forEach((s, i) => {
    if (s.id !== i) throw new Error(`card: ship ${i} is numbered ${s.id}`);
    if (i > 0 && !s.driver) throw new Error(`card: ship ${i} has no driver`);
  });
  return card;
}

/** Each ship's team, by her id. */
export const teamsOf = (card: RaceCard): number[] =>
  card.ships.map((s) => s.team);

/** The ids of the ships that put to sea: every one that does not forfeit. */
export const entered = (card: RaceCard): number[] =>
  card.ships.filter((s) => !s.forfeit).map((s) => s.id);
