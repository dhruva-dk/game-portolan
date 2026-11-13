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
  /** The loot on the water near her, for the disc: where each piece lies (a unit vector), whether it is a gun (else
   *  stores to mend with), and the rarity it reads as (0–4: rarity.ts). */
  loot: readonly { at: Vec3; gun: boolean; rarity: number }[];
  /** Her gun's aim, while her hands are on her ship and she has a gun (else null). The reticle stands in the middle of
   *  the screen, where the gun is aimed (play/chase.ts); `fall` is where the ball will come down, or pass through the
   *  ship it is laid on (CSS px from the top left; null off the screen or hidden by the sea's curve), and `reach`
   *  whether it reaches what the reticle is on (false: past range, or the sky). */
  reticle: { fall: { x: number; y: number } | null; reach: boolean } | null;
  /** What happened in about the last second, oldest first (Moment): what the HUD answers her with, and what sound
   *  will play. A reader keeps the last seq it took and takes those past it. */
  moments: readonly Moment[];
}

/** What a piece taken up or mended with is. */
export type Piece = 'gun' | 'smallShield' | 'bigShield' | 'repairKit' | 'fullRepair';

/**
 * What happened on the sea, as the match reports it (play/moments.ts), numbered in order (seq, from 1 within a game)
 * at a moment on the world's clock (time, s), where it happened (at, a unit vector), and the ship it befell (ship; 0
 * hers, sim/match.ts PLAYER):
 *   fired    a gun went off: ship's
 *   fell     a ball came down in the sea, or on the land: a miss (ship: who fired it)
 *   struck   a ball or a ram home in ship, dealt by `by`: the hit points it took off her shield and off her hull,
 *            whether it took the last of her shield, and whether it was a ram
 *   sank     ship went down, sunk by `by` (null: the storm)
 *   took     ship took up a piece of loot (only hers is reported): what, its rarity (0–4) and the slot it went to (0
 *            the gun's, 1–3 the items')
 *   mended   ship finished mending with what she used (only hers)
 *   gust     ship spent a gust (only hers)
 */
export type Deed = { seq: number; time: number; at: Vec3; ship: number } & (
  | { kind: 'fired' }
  | { kind: 'fell'; land: boolean }
  | { kind: 'struck'; by: number; shield: number; hull: number; broke: boolean; ram: boolean }
  | { kind: 'sank'; by: number | null }
  | { kind: 'took'; piece: Piece; rarity: number; slot: number }
  | { kind: 'mended'; piece: Piece }
  | { kind: 'gust' }
);

/** A Deed as she sees it: where it falls on her screen (CSS px from the top left; null off it, or behind her), its
 *  bearing from the way the camera looks (radians clockwise: 0 ahead, π/2 to the right, ±π behind), and how far it is
 *  from the eye, metres. */
export type Moment = Deed & { seen: { x: number; y: number } | null; bearing: number; metres: number };

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

/** Her match's end, as the screens show it: how it came (she won, or what sank her: a ball, a ram, the Storm), her
 *  place of how many began, the share of the planet's water she held (0…1), the ships still afloat; whether the
 *  camera has had its beat on her end (play/finale.ts), so her result may be laid over the world; whether the match
 *  is over (she won, or one ship or none is afloat). */
export interface End {
  how: 'won' | 'shot' | 'ram' | 'storm';
  place: number; of: number; share: number; afloat: number;
  settled: boolean; over: boolean;
}

/** Her career, as the lobby and the result show it: her level, how far toward the next (0…1), and her rank's tier. */
export interface Career { level: number; progress: number; tier: number }
