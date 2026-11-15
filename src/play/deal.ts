// The race the lobby's PLAY deals until the career deals them (Phase C): a seeded card (race.ts RaceCard) of `count`
// ships, two a side (2k and 2k + 1 are side k), every ship on the tables' handling (sim/fit.ts SPEC) with no parts,
// her captain the one whose bot `temper(seed)` sails today (sim/temper.ts captainOf), so a dealt race's bots are a
// card-less match's. The player's ship is 0, on side 0 with a bot crewmate (ship 1); she has no captain. Each side's
// colours are two of the palette's CREW swatches: side 0 vermilion, the player's, and no other side has it.

import { CREW } from '../palette.ts';
import type { Colours, RaceCard, RaceShip, Rules, Service } from '../race.ts';
import { SPEC } from '../sim/fit.ts';
import { PLAYER, SHIPS } from '../sim/match.ts';
import { captainOf } from '../sim/temper.ts';
import { hash } from '../world/random.ts';

/** A dealt race's rules: today's storm, no gun banned, no parts in the spec, no inspection; a point a sinking. */
export const RULES: Rules = {
  spec: [], storm: { pace: 1 }, banned: [], pointsPerSinking: 1, seaHeldPoint: false, prizeSpread: 0, inspection: 0,
};

/** A dealt ship's flight: middling at every job (starting values; the flight's own table is #58 step 8's). */
export const SERVICE: Service = {
  arrive: 5, order: ['mend', 'gust', 'stores', 'part'],
  rate: { mend: 1, gust: 1, stores: 1, part: 1 }, botch: { mend: 0.1, gust: 0.1, stores: 0.1, part: 0.1 },
  underFire: 2, freeRepair: false, gustRecharge: 1,
};

/** Side k's colours: side 0 vermilion on vermilion; every other side two of the other swatches, no two sides alike. */
export function coloursOf(k: number): Colours {
  if (k === 0) return { first: 0, second: 0 };
  const n = CREW.length - 1, i = k - 1;
  return { first: 1 + (i % n), second: 1 + ((i * 7 + Math.floor(i / n) * 3) % n) };
}

/** The card for a race of `count` ships (even; SHIPS by default) dealt from `seed`. */
export function deal(seed: number, count: number = SHIPS): RaceCard {
  const ships = Array.from({ length: count }, (_, id): RaceShip => ({
    id, side: id >> 1, colours: coloursOf(id >> 1), handling: SPEC, parts: [],
    captain: id === PLAYER ? null : captainOf(hash(seed, id)), service: SERVICE, stance: 'hunt', forfeit: false,
  }));
  return { seed, league: 0, round: 0, rules: RULES, ships };
}
