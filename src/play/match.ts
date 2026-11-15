// What a match is as play/ runs it (state.ts): what it is dealt with, the water it is sailed on, a ship put to sea
// about her for debugging, and what the match's flow reads of its ships and sinkings. Plain types and the few
// functions on them.

import type { Arms } from '../sim/loot.ts';
import { SHIPS, type Cause } from '../sim/match.ts';
import type { Regained } from '../sim/holding.ts';
import type { Chart } from '../sim/route.ts';
import type { Helm } from '../sim/ship.ts';
import type { Berthing, Spawn } from '../sim/spawn.ts';
import type { Storm } from '../sim/storm.ts';
import type { Outcome } from '../sim/territory.ts';
import type { Look } from '../snapshot.ts';
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
  /** How many ships it puts to sea (sim/match.ts SHIPS if not given). */
  ships?: number;
  /** Its ships' berths (sim/spawn.ts berths, one a ship), when worked out ahead of its start (play/setup.ts). */
  berths?: readonly Spawn[];
}

/** How many ships a match puts to sea. */
export const fleetOf = (m: Match): number => m.ships ?? SHIPS;

/** A ship sunk: who she was, who sank her (the ship whose ball or ram dealt the last blow; null for the storm), how,
 * when, on the match's clock (s), and where she went down and the way she headed. */
export interface Sinking { id: number; by: number | null; cause: Cause; time: number; at: Vec3; heading: Vec3 }

/** A ship as the match's flow reads her: who she is (0 the player's), where she is and heads, her hit points, whether
 * she carries a gun, and whether she is still afloat. */
export interface Afloat { id: number; at: Vec3; heading: Vec3; hull: number; shield: number; armed: boolean; afloat: boolean }

/** What a step did to who holds the sea: its loops closed and trails cut (sim/territory.ts; null outside a match), and
 *  the shield each ship's own water gave back (sim/holding.ts). */
export interface Stepped { held: Outcome | null; regained: readonly Regained[] }

/** A step's parts, in the order they run: the orders (the bots' thinking), the fleet sailed, the fighting, who holds
 *  the sea, the ships riding the swell, the sunk taken off, and what it all did kept (advance's `lap`). */
export const PARTS = ['command', 'sail', 'fight', 'hold', 'ride', 'founder', 'keep'] as const;
export type Part = (typeof PARTS)[number];

/** The planet's water as the match reads it, sounded once (play/sounding.ts): the bots' chart of open water for their
 *  routes (sim/route.ts), and the open water ships are berthed in at a match's start (sim/spawn.ts). */
export interface Waters { chart: Chart; water: Berthing }
