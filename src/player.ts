// What passes between the player and the game, as plain data: the seam between play/ (the game) and ui/ (what she
// sees and touches), as snapshot.ts is the seam between the game and the frame. Her hands' orders go in each frame
// (Hands: read by ui/input.ts, given to play/game.ts step); what the match reports comes out (Status, read by
// ui/hud.ts), with what she carries (Kit), and her career, which nothing in the game keeps yet (play/placeholder.ts).

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
  /** The hotbar's slot last tapped since the last read (0 the gun's, 1–3 the items'), or null. */
  tap: number | null;
  /** Whether Gust has been pressed since the last read. */
  gust: boolean;
}

/** No hand on anything. */
export const IDLE: Hands = { stick: null, look: { x: 0, y: 0, held: false }, fire: false, tap: null, gust: false };

/** The match as the HUD reads it: a plain snapshot, made fresh each time it is asked for. */
export interface Status {
  /** Where the ship the camera follows is (unit sphere) and the way she heads (unit tangent): hers, or once she has
   *  sunk the one she watches. */
  at: Vec3; heading: Vec3;
  /** The way the camera looks along the sea there (unit tangent): what the stick's up means, and the minimap's up. */
  facing: Vec3;
  /** How much of the eye's arrival from space is still to come (1 as a match begins, 0 once it is down with her). */
  arriving: number;
  /** The other ships afloat she can see (unit vectors): as far as a bot looks, with no land high enough between to
   *  hide them (sim/captain.ts BOT.sightMax, sightLine). */
  ships: readonly Vec3[];
  /** Her hit points, and their most. */
  hull: number; hullMax: number; shield: number; shieldMax: number;
  /** Her gun: its rarity (0–4, sim/handling.ts GUN.rarities), how far loaded (0…1, 1 ready), and whether its assist
   * has a ship to lay on where she is aimed (sim/gun.ts); null with none. */
  gun: { rarity: number; ready: number; locked: boolean } | null;
  /** Ships still afloat, hers among them; whether hers is sunk. */
  afloat: number; sunk: boolean;
  /** Seconds till the storm next holds or closes (0 once it has closed for good), whether it is closing now, its calm
   *  (radius in metres) and the calm it next closes to (null once it has closed for good); how far outside the calm
   *  she is, metres (0 inside). */
  storm: number; closing: boolean; eye: { centre: Vec3; radius: number }; next: { centre: Vec3; radius: number } | null; outside: number;
  /** The loot on the water near her (unit vectors), for the disc. */
  loot: readonly Vec3[];
  /** Her gun's aim, while her hands are on her ship and she has a gun (else null). The reticle stands in the middle of
   *  the screen, where the gun is aimed (play/chase.ts); `fall` is where the ball will come down, or pass through the
   *  ship it is laid on (CSS px from the top left; null off the screen or hidden by the sea's curve), and `reach`
   *  whether it reaches what the reticle is on (false: past range, or the sky). */
  reticle: { fall: { x: number; y: number } | null; reach: boolean } | null;
}

/** An item a slot of the hotbar holds. */
export type Item = 'item.smallShield' | 'item.bigShield' | 'item.repairKit' | 'item.fullRepair';

/** A slot of the hotbar holding an item, and how many of it if more than one may be held. */
export interface Slot { item: Item; count?: number }

/** What she carries besides her gun: the hotbar's three item slots (null: empty), the slot in hand (0 the gun's, then
 *  the items'), how far through using it she is (0…1; null when she isn't), the slot a tap would swap for what lies
 *  within reach (null: none offered); and Gust: its charges ready with the next one's share come back (1.4: one ready,
 *  the next 40% back), the most she carries, and whether one blows now. */
export interface Kit {
  items: readonly [Slot | null, Slot | null, Slot | null]; chosen: number; using: number | null; offer: number | null;
  gust: number; gusts: number; blowing: boolean;
}

/** Her career, as the lobby and the result show it: her level, how far toward the next (0…1), and her rank's tier. */
export interface Career { level: number; progress: number; tier: number }
