// What a match is as play/ runs it (state.ts): what it is dealt with, the water it is sailed on, a ship put to sea
// about her for debugging, and what the match's flow reads of its ships and sinkings. Plain types and the few
// functions on them.

import type { Captain, RaceCard, RaceShip } from '../race.ts';
import { closedBy } from '../sim/storm.ts';
import { SPEC, type Handling } from '../sim/fit.ts';
import type { Shot, Strike } from '../sim/battle.ts';
import type { Arms } from '../sim/loot.ts';
import { SHIPS, type Cause } from '../sim/match.ts';
import type { Regained } from '../sim/holding.ts';
import type { Chart } from '../sim/route.ts';
import type { Helm } from '../sim/ship.ts';
import type { Berthing, Spawn } from '../sim/spawn.ts';
import type { Storm } from '../sim/storm.ts';
import type { Outcome } from '../sim/territory.ts';
import type { Look } from '../snapshot.ts';
import { hash } from '../world/random.ts';
import { add, frameAt, scale, type Vec3 } from '../world/sphere.ts';

/** A bearing (radians clockwise from north at a point) as a direction there. */
export const bearing = (at: Vec3, b: number): Vec3 => {
  const f = frameAt(at);
  return add(scale(f.north, Math.cos(b)), f.east, Math.sin(b));
};

/** A ship put to sea about her in a match at sea: where she lies and heads, her colours, and her helm lashed (she holds
 * it from the start, making the way its throttle asks, and nobody steers her), or null for a bot at it. */
export interface Berth { at: Vec3; heading: Vec3; look: Look; lashed: Helm | null }

/** The match: its seed (each bot's mind comes from it and her slot), its storm by the match's clock (s), and the
 * gun every ship is armed with, or null for none (as every ship puts to sea in a match: 0117's). */
export interface Match {
  seed: number; storm: (seconds: number) => Storm; gun: Arms | null;
  /** The race it sails (race.ts; play/deal.ts until the career deals them): its ships, their sides, handling,
   *  captains and colours. Without one (the tests', the debug switches'), SHIPS ships, each a side of her own, on the
   *  tables' handling, her bot seeded by the match and her slot. */
  card?: RaceCard;
  /** Its ships' berths (sim/spawn.ts berths, one a ship), when worked out ahead of its start (play/setup.ts). */
  berths?: readonly Spawn[];
}

/** How many ships a match puts to sea. */
export const fleetOf = (m: Match): number => m.card?.ships.length ?? SHIPS;

/** Ship `id` of the match's card, if it has one. */
const shipIn = (m: Match, id: number): RaceShip | undefined => m.card?.ships.find((s) => s.id === id);
/** Her handling (sim/fit.ts): the card's, else the tables'. */
export const fitIn = (m: Match, id: number): Handling => shipIn(m, id)?.handling ?? SPEC;
/** Her side: the card's, else her own. */
export const sideIn = (m: Match, id: number): number => shipIn(m, id)?.side ?? id;
/** Her bot's seed: her captain's, else the match's and her slot's. */
export const seedIn = (m: Match, id: number): number => shipIn(m, id)?.captain?.seed ?? hash(m.seed, id);
/** Her captain (race.ts Captain): the card's, else none (her bot sails by temper(seed)). */
export const captainIn = (m: Match, id: number): Captain | null => shipIn(m, id)?.captain ?? null;
/** The race's expected length, s (sim/storm.ts closedBy): the card's; 0 for a card-less match, whose captains don't tire. */
export const lengthIn = (m: Match): number => (m.card ? closedBy(m.card.rules.storm) : 0);

/** A ship sunk: who she was, who sank her (the ship whose ball or ram dealt the last blow; null for the storm), how,
 * when, on the match's clock (s), and where she went down and the way she headed. */
export interface Sinking { id: number; by: number | null; cause: Cause; time: number; at: Vec3; heading: Vec3 }

/** A ship as the match's flow reads her: who she is (0 the player's), where she is and heads, her hit points, whether
 * she carries a gun, and whether she is still afloat. */
export interface Afloat { id: number; at: Vec3; heading: Vec3; hull: number; shield: number; armed: boolean; afloat: boolean }

/** What a step did: to who holds the sea, its loops closed and trails cut (sim/territory.ts; null outside a match), and
 *  the shield each ship's own water gave back (sim/holding.ts); and the guns fired and the blows struck home
 *  (sim/battle.ts), for the race's tally of hits. */
export interface Stepped { held: Outcome | null; regained: readonly Regained[]; shots: readonly Shot[]; strikes: readonly Strike[] }

/** A step's parts, in the order they run: the orders (the bots' thinking), the fleet sailed, the fighting, who holds
 *  the sea, the ships riding the swell, the sunk taken off, and what it all did kept (advance's `lap`). */
export const PARTS = ['command', 'sail', 'fight', 'hold', 'ride', 'founder', 'keep'] as const;
export type Part = (typeof PARTS)[number];

/** The planet's water as the match reads it, sounded once (play/sounding.ts): the bots' chart of open water for their
 *  routes (sim/route.ts), and the open water ships are berthed in at a match's start (sim/spawn.ts). */
export interface Waters { chart: Chart; water: Berthing }
