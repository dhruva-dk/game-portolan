// What passes between the player and the game, as plain data: the seam between play/ (the game) and ui/ (what she
// sees and touches), as snapshot.ts is the seam between the game and the frame. Her hands' orders go in each frame
// (Hands: read by ui/input.ts, given to play/game.ts step); what the match reports comes out (Status, read by
// ui/hud.ts), with what she carries (Kit) and her career, which nothing in the game keeps yet (play/placeholder.ts).

import type { Vec3 } from './world/sphere';

/** Her hands, as read for a frame. */
export interface Hands {
  /** The stick, while held: how far it is pushed right and up the screen (within the unit disc), and its centre (CSS
   *  px; none for the keys). */
  stick: { x: number; y: number; centre: [number, number] | null } | null;
  /** The look: pixels dragged right and down since the last read, and whether a finger is on it. */
  look: { x: number; y: number; held: boolean };
  /** Whether her gun has been ordered fired since the last read. */
  fire: boolean;
}

/** No hand on anything. */
export const IDLE: Hands = { stick: null, look: { x: 0, y: 0, held: false }, fire: false };

/** The match as the HUD reads it: a plain snapshot, made fresh each time it is asked for. */
export interface Status {
  /** Where the ship the camera follows is (unit sphere) and the way she heads (unit tangent): hers, or once she has
   *  sunk the one she watches. */
  at: Vec3; heading: Vec3;
  /** Her hit points, and their most. */
  hull: number; hullMax: number; shield: number; shieldMax: number;
  /** Her gun: its rarity (0–4, sim/handling.ts GUN.rarities), how far loaded (0…1, 1 ready), and whether its assist
   * has a ship to lay on where she is aimed (sim/gun.ts); null with none. */
  gun: { rarity: number; ready: number; locked: boolean } | null;
  /** Ships still afloat (in the drop or on the sea), hers among them; whether hers is sunk. */
  afloat: number; sunk: boolean;
  /** Seconds till the storm next holds or closes (0 once it has closed for good), and its calm (radius in metres). */
  storm: number; eye: { centre: Vec3; radius: number };
}

/** An item a slot of the hotbar holds. */
export type Item = 'item.smallShield' | 'item.bigShield' | 'item.repairKit';

/** A slot of the hotbar holding an item, and how many of it if more than one may be held. */
export interface Slot { item: Item; count?: number }

/** What she carries besides her gun: the hotbar's three item slots (null: empty), the slot in hand (0 the gun's, then
 *  the items'), and Gust's charges ready. */
export interface Kit { items: readonly [Slot | null, Slot | null, Slot | null]; chosen: number; gust: number }

/** Her career, as the lobby and the result show it: her level, how far toward the next (0…1), and her rank's tier. */
export interface Career { level: number; progress: number; tier: number }
