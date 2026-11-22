// A race's card (race.ts RaceCard) as the sim reads it: which of its ships put
// to sea, each ship's team, and when a race of teams is over. A match with no
// card has no teams: every ship sails for herself.
//
// A race is over when every ship afloat is of one team, or none is afloat. And
// one still on RACE.overtime seconds after the storm's last cap has closed is
// called there, as it stands: the calm that is left is a ship's turning circle
// or two across, and ships that will not close in it (unarmed, or each
// outrunning the other) would sail it for ever.
//
// Pure: no three, so it runs in node for the tests.

import type { RaceCard } from '../race.ts';

/** What a race of teams is tuned by. Seconds. */
export const RACE = {
  /**
   * A race still on this long after the storm's last cap has closed is called.
   */
  overtime: 180,
} as const;

/**
 * The card's ships, checked: numbered 0 … n − 1 in order (a ship's id is her
 * place on the card, as it is her place in the fleet), none but the first
 * without a driver (only ship 0 is ever sailed by hand), and every pit crew of
 * a pace above nought and a chance to slip of 0 to 1. An error naming what is
 * wrong otherwise.
 */
export function checked(card: RaceCard): RaceCard {
  card.ships.forEach((s, i) => {
    if (s.id !== i) throw new Error(`card: ship ${i} is numbered ${s.id}`);
    if (i > 0 && !s.driver) throw new Error(`card: ship ${i} has no driver`);
    const { pace, slip } = s.pit;
    if (!(pace > 0 && slip >= 0 && slip <= 1))
      throw new Error(`card: ship ${i}'s pit crew is ${pace} by ${slip}`);
  });
  return card;
}

/** Each ship's team, by her id. */
export const teamsOf = (card: RaceCard): number[] =>
  card.ships.map((s) => s.team);

/** The ids of the ships that put to sea: every one that does not forfeit. */
export const entered = (card: RaceCard): number[] =>
  card.ships.filter((s) => !s.forfeit).map((s) => s.id);

/**
 * Whether a race of `teams` (by id) is over, the ships `alive` afloat,
 * `closed` seconds after the storm's last cap closed (negative before): one
 * team afloat or none, or called on its overtime.
 */
export function over(
  teams: readonly number[],
  alive: readonly number[],
  closed: number
): boolean {
  if (closed >= RACE.overtime) return true;
  for (let i = 1; i < alive.length; i++)
    if (teams[alive[i]] !== teams[alive[0]]) return false;
  return true;
}

/**
 * Whether ships `a` and `b` sail for one team (`teams` by id; none: no ship
 * has a mate).
 */
export const mates = (
  teams: readonly number[] | undefined,
  a: number,
  b: number
): boolean => !!teams && a !== b && teams[a] === teams[b];
