// The race the lobby's PLAY deals until the career deals them (Phase C): a seeded card (race.ts RaceCard) of `count`
// ships, two a side (2k and 2k + 1 are side k), every ship on the tables' handling (sim/fit.ts SPEC) with six parts
// each WEAR.dealt reliable and new, the middling flight (sim/flight.ts SERVICE), her captain the one whose bot
// `temper(seed)` sails today (sim/temper.ts captainOf). The player's ship is 0, on side 0 with a bot crewmate (ship 1);
// she has no captain. Each side's colours are two of the palette's CREW swatches: side 0 vermilion, the player's, and no
// other side has it.

import { SWATCHES, type Colours, type Fitted, type RaceCard, type RaceShip, type Rules } from '../race.ts';
import { SPEC } from '../sim/fit.ts';
import { SERVICE } from '../sim/flight.ts';
import { WEAR } from '../sim/handling.ts';
import { PLAYER, SHIPS } from '../sim/match.ts';
import { captainOf } from '../sim/temper.ts';
import { PART_TYPES } from '../sim/wear.ts';
import { hash } from '../world/random.ts';

/** A dealt race's rules: today's storm, no gun banned, no parts in the spec, no inspection; a point a sinking. */
export const RULES: Rules = {
  spec: [], storm: { pace: 1 }, banned: [], pointsPerSinking: 1, seaHeldPoint: false, prizeSpread: 0, inspection: 0,
};

/** A dealt ship's parts: all six, each WEAR.dealt reliable, new. */
export const PARTS: readonly Fitted[] = PART_TYPES.map((type) => ({ type, reliability: WEAR.dealt, condition: 1 }));

/** Side k's colours: side 0 vermilion on vermilion; every other side two of the other swatches, no two sides alike. */
export function coloursOf(k: number): Colours {
  if (k === 0) return { first: 0, second: 0 };
  const n = SWATCHES - 1, i = k - 1;
  return { first: 1 + (i % n), second: 1 + ((i * 7 + Math.floor(i / n) * 3) % n) };
}

/** The card for a race of `count` ships (even; SHIPS by default) dealt from `seed`. */
export function deal(seed: number, count: number = SHIPS): RaceCard {
  const ships = Array.from({ length: count }, (_, id): RaceShip => ({
    id, side: id >> 1, colours: coloursOf(id >> 1), handling: SPEC, parts: PARTS,
    captain: id === PLAYER ? null : captainOf(hash(seed, id)), service: SERVICE, stance: 'hunt', forfeit: false,
  }));
  return { seed, league: 0, round: 0, rules: RULES, ships };
}
