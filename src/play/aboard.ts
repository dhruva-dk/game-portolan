// What play/ keeps of each ship on the sea beside the sim's Vessel (state.ts), and how the ships are drawn from it at a
// moment between two steps: those afloat blended between their last two poses, the sunk going down (sinking.ts) until
// they are gone, and the sea's colour of each ship's water. Plain data and the functions on it.

import { inHand, type Crew } from '../sim/battle.ts';
import type { Memory } from '../sim/bot.ts';
import type { Vessel } from '../sim/contact.ts';
import { blendPose } from '../sim/fixed.ts';
import type { Helm } from '../sim/ship.ts';
import type { Ride } from '../sim/ride.ts';
import type { RaceCard } from '../race.ts';
import type { Look, ShipDraw } from '../snapshot.ts';
import type { ShipPose } from '../world/pose.ts';
import { add, scale, type Vec3 } from '../world/sphere.ts';
import { seaColourOf } from './colours.ts';
import { sinking } from './sinking.ts';
import type { Bot } from './orders.ts';

/** What is kept of a ship afloat beside her Vessel: her colours, her bot (null: the player's, or a lashed ship's) and
 *  what she sails by (orders.ts Bot), the helm a lashed ship holds, how she rides the sea, and her last two poses. */
export interface Aboard { look: Look; mind: Memory | null; bot: Bot | null; steady: Helm; ride: Ride; before: ShipPose; after: ShipPose }
/** A ship going down: her pose when she sank and the step she sank at (`at`, s on the world's clock), listing to `side`. */
export interface Wreck { id: number; look: Look; pose: ShipPose; at: number; side: number }

/** A wreck as drawn at the world's clock `now`, or null once she is gone. */
export const wreckAt = (w: Wreck, now: number) => sinking(w.pose, now - w.at, w.side);

/** Each ship's colour on the sea, by id, for `count` ships of a match dealt `card` (made once for each). */
const colourTables = new Map<number, Vec3[]>(), cardTables = new WeakMap<RaceCard, Vec3[]>();
export const seaColours = (count: number, card?: RaceCard): Vec3[] => {
  const t = (card ? cardTables.get(card) : colourTables.get(count)) ?? Array.from({ length: count }, (_, id) => seaColourOf(id, card));
  if (card) cardTables.set(card, t);
  else colourTables.set(count, t);
  return t;
};

/** What the ships are drawn from at a moment: the fleet afloat, what is kept aboard each, their crews by id, the line
 *  each gun was last laid along, and the wrecks. */
export interface Drawing { fleet: readonly Vessel[]; aboard: ReadonlyMap<number, Aboard>; crews: ReadonlyMap<number, Crew>; aims: ReadonlyMap<number, Vec3 | null>; wrecks: readonly Wreck[] }

/** Every ship drawn `between` of the way through the last step, the world's clock then `now`: afloat, or going down. */
export function drawnShips(d: Drawing, between: number, now: number): ShipDraw[] {
  const still: Vec3 = [0, 0, 0];
  const ships: ShipDraw[] = d.fleet.map(({ id, ship, shove }) => {
    const a = d.aboard.get(id)!, c = d.crews.get(id), g = c && inHand(c);
    const gun = g ? { kind: g.kind, aim: d.aims.get(id) ?? ship.heading } : null;
    return { id, pose: blendPose(a.before, a.after, between), look: a.look, velocity: add(scale(ship.heading, ship.speed), shove), afloat: true, gun };
  });
  for (const w of d.wrecks) {
    const p = wreckAt(w, now);
    if (p) ships.push({ id: w.id, pose: p, look: w.look, velocity: still, afloat: false, gun: null });
  }
  return ships;
}

/** Where ship `id` is drawn `between` of the way through the last step (the world's clock then `now`), or null. */
export function drawnPose(d: Pick<Drawing, 'aboard' | 'wrecks'>, id: number, between: number, now: number): ShipPose | null {
  const a = d.aboard.get(id);
  if (a) return blendPose(a.before, a.after, between);
  const w = d.wrecks.find((k) => k.id === id);
  return w ? wreckAt(w, now) : null;
}
