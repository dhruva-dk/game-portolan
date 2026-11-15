// What passes between the player and the game, as plain data: the seam between play/ (the game) and ui/ (what she
// sees and touches), as snapshot.ts is the seam between the game and the frame. Her hands' orders go in each frame
// (Hands: read by ui/input.ts, given to play/game.ts step); what the match reports comes out (Status, read by
// ui/hud.ts), with what she carries (Kit), and how her match ended (End).

import type { GunKind, LootKind } from './kinds';
import type { Vec3 } from './world/sphere';

/** Her hands, as read for a frame. */
export interface Hands {
  /** The stick, while held: how far it is pushed right and up the screen (within the unit disc), and its centre (CSS
   *  px; none for the keys). */
  stick: { x: number; y: number; centre: [number, number] | null } | null;
  /** The look: pixels dragged right and down since the last read, and whether a finger is on it. */
  look: { x: number; y: number; held: boolean };
  /** Whether her gun's trigger is held, or was pressed since the last read: held, it fires at its kind's interval. */
  fire: boolean;
  /** The hotbar's slot last tapped since the last read (HOTBAR: 0–1 the guns', 2–4 the items'), or null. */
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
  /** The way the camera looks along the sea there (unit tangent): what the stick's up means. */
  facing: Vec3;
  /** How much of the eye's arrival from space is still to come (1 as a match begins, 0 once it is down with her). */
  arriving: number;
  /** Her hit points, and their most. */
  hull: number; hullMax: number; shield: number; shieldMax: number;
  /** The gun in her hand, for Fire and the reticle: its kind and rarity (0–4, sim/handling.ts GUN.rarities), the rounds
   *  left in its magazine, how far reloaded (0…1, 1 when it isn't reloading), how far wound up (0…1; null when it isn't
   *  winding), how much of taking it up is still to come (0…1, 0 ready), and whether its assist has a ship to lay on
   *  where she is aimed (sim/gun.ts); null with none in hand. */
  gun: { kind: GunKind; rarity: number; rounds: number; ready: number; charge: number | null; swapping: number; locked: boolean } | null;
  /** Ships still afloat, hers among them; whether hers is sunk. */
  afloat: number; sunk: boolean;
  /** Seconds till the storm next holds or closes (0 once it has closed for good), whether it is closing now, its calm
   *  (radius in metres) and the calm it next closes to (null once it has closed for good); how far outside the calm
   *  she is, metres (0 inside). */
  storm: number; closing: boolean; eye: { centre: Vec3; radius: number }; next: { centre: Vec3; radius: number } | null; outside: number;
  /** Her gun's aim, while her hands are on her ship and she has a gun in hand (else null). The reticle stands in the
   *  middle of the screen, where the gun is aimed (play/chase.ts); `fall` is where the ball will come down, or pass
   *  through the ship it is laid on (CSS px from the top left; null off the screen or hidden by the sea's curve),
   *  `reach` whether it reaches what the reticle is on (false: past range, nearer than a lob's least, or the sky),
   *  `spread` the radius its balls go off within there (CSS px), and `lob` whether it is lobbed (the fall is the mark). */
  reticle: { fall: { x: number; y: number } | null; reach: boolean; spread: number; lob: boolean } | null;
  /** What happened in about the last second, oldest first (Moment): what the HUD answers her with, and what sound
   *  will play. A reader keeps the last seq it took and takes those past it. */
  moments: readonly Moment[];
}

/** Her ship's id in what the match reports (Deed: sim/match.ts PLAYER). */
export const HER = 0;

/** The kinds of gun, and of a piece taken up or mended with (a gun of a kind, or stores): kinds.ts. */
export { isGun, type GunKind, type LootKind } from './kinds.ts';

/** The hotbar's slots: the guns' first, then the items'. */
export const HOTBAR = { guns: 2, items: 3 } as const;

/**
 * What happened on the sea, as the match reports it (play/moments.ts), numbered in order (seq, from 1 within a game)
 * at a moment on the world's clock (time, s), where it happened (at, a unit vector), and the ship it befell (ship; 0
 * hers, sim/match.ts PLAYER):
 *   fired     a gun of a kind went off: ship's
 *   winding   a heavy gun began winding up to fire (a harpoon's or a mortar's): ship's
 *   reloading her gun of a kind began reloading (only hers)
 *   reloaded  her gun of a kind was reloaded (only hers)
 *   swapped   she took her gun of a kind in hand (only hers)
 *   fell      a ball came down in the sea, or on the land: a miss (ship: who fired it)
 *   struck    a ball or a ram home in ship, dealt by `by`: the hit points it took off her shield and off her hull,
 *             whether it took the last of her shield, and whether it was a ram
 *   sank      ship went down, sunk by `by` (null: the storm)
 *   took      ship took up a piece of loot (only hers is reported): what, its rarity (0–4) and the hotbar's slot it
 *             went to (HOTBAR)
 *   mended    ship finished mending with what she used (only hers)
 *   gust      ship spent a gust (only hers)
 */
export type Deed = { seq: number; time: number; at: Vec3; ship: number } & (
  | { kind: 'fired' | 'winding' | 'reloading' | 'reloaded' | 'swapped'; gun: GunKind }
  | { kind: 'fell'; land: boolean }
  | { kind: 'struck'; by: number; shield: number; hull: number; broke: boolean; ram: boolean }
  | { kind: 'sank'; by: number | null }
  | { kind: 'took'; piece: LootKind; rarity: number; slot: number }
  | { kind: 'mended'; piece: LootKind }
  | { kind: 'gust' }
);

/** Metres over the sea a deed is placed, by its kind: a blow on a hull at her side, a gun at her muzzle, the rest at
 *  the water. Where it is seen (play/moments.ts) and heard from (audio/audio.ts). */
export const LIFT: Record<Deed['kind'], number> = { fired: 3, winding: 3, reloading: 3, reloaded: 3, swapped: 3, fell: 0, struck: 2, sank: 2, took: 0.5, mended: 2, gust: 2 };

/** The screens (ui/ways.ts, the ways between them): named here for the sound too, which hears which is shown. */
export const SCREENS = ['title', 'lobby', 'settings', 'match', 'sinking', 'sunk', 'spectate', 'won', 'result'] as const;
export type Screen = (typeof SCREENS)[number];

/** What a blow (a Deed 'struck') did, as the screen, the camera, the hit-stop and the sound each answer it: broke a
 *  shield, struck the hull, or struck a shield only. */
export type Blow = 'broke' | 'hull' | 'shield';
export const blowOf = (d: { broke: boolean; hull: number }): Blow => (d.broke ? 'broke' : d.hull > 0 ? 'hull' : 'shield');
/** How strongly a blow of `points` hit points is felt (0117's app/juice.ts): one she dealt, and one she took. */
export const felt = {
  dealt: (points: number) => Math.min(1.3, 0.6 + points / 40),
  taken: (points: number) => Math.min(1.3, 0.4 + points / 40),
};

/** A Deed as she sees it: where it falls on her screen (CSS px from the top left; null off it, or behind her), its
 *  bearing from the way the camera looks (radians clockwise: 0 ahead, π/2 to the right, ±π behind), and how far it is
 *  from the eye, metres. */
export type Moment = Deed & { seen: { x: number; y: number } | null; bearing: number; metres: number };

/** An item a slot of the hotbar holds. */
export type Item = 'item.smallShield' | 'item.bigShield' | 'item.repairKit' | 'item.fullRepair';

/** A slot of the hotbar holding an item, and how many of it if more than one may be held. */
export interface Slot { item: Item; count?: number }

/** A gun slot of the hotbar holding a gun: its kind, rarity (0–4), the rounds left of its magazine and how many that
 *  holds, and how far through reloading it is (0…1; null when it isn't). */
export interface GunSlot { kind: GunKind; rarity: number; rounds: number; mag: number; reload: number | null }

/** What she carries: the hotbar's two gun slots and three item slots (null: empty), the slot in hand (HOTBAR: the gun
 *  in hand's, or the item chosen), how far through using it she is (0…1; null when she isn't), the slot a tap would
 *  swap for what lies within reach (null: none offered); and Gust: its charges ready with the next one's share come
 *  back (1.4: one ready, the next 40% back), the most she carries, and whether one blows now. */
export interface Kit {
  guns: readonly [GunSlot | null, GunSlot | null];
  items: readonly [Slot | null, Slot | null, Slot | null]; chosen: number; using: number | null; offer: number | null;
  gust: number; gusts: number; blowing: boolean;
}

/** Her match's end, as the screens show it: how it came (she won, or what sank her: a ball, a ram, the Storm; or she
 *  forfeit the race), her place of how many began (the race's order once it is over), the share of the planet's water
 *  she held (0…1), the ships still afloat; whether the camera has had its beat on her end (play/finale.ts), so her
 *  result may be laid over the world; whether the race is over (every ship afloat of one side, or none). */
export interface End {
  how: 'won' | 'shot' | 'ram' | 'storm' | 'forfeit';
  place: number; of: number; share: number; afloat: number;
  settled: boolean; over: boolean;
}
