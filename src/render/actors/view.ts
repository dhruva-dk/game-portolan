// What the actors need from the match, as plain data. The integration step adapts the simulation's state and events
// into these each frame; nothing in src/render/actors imports the simulation.
//
// Positions are world metres from the planet's centre (the planet is a sphere of radius R about the origin). For
// things that sit on the water (ships, loot, splashes, the whale) only the direction is used: they are placed on the
// sea surface there. Headings are unit vectors tangent to the sphere.

export interface Vec3 { x: number; y: number; z: number }

export const WEAPONS = ['cannon', 'scatter', 'harpoon', 'mortar', 'repeater', 'broadside', 'chain', 'heated'] as const;
export type Weapon = (typeof WEAPONS)[number];

/** 0 common (grey), 1 uncommon (green), 2 rare (blue), 3 epic (purple), 4 legendary (gold). */
export type Rarity = 0 | 1 | 2 | 3 | 4;

/**
 * A ship's cosmetics, by id. Unknown ids fall back to a placeholder picked from the id's hash, so the catalogue can
 * grow without touching the renderer. See cosmetics.ts for the ids the placeholders know.
 */
export interface CosmeticIds {
  sail?: string; // sail colour
  pattern?: string; // sail pattern
  hull?: string; // hull paint
  figurehead?: string;
  emblem?: string; // one of the league's emblems (src/career/emblems.ts)
  wake?: string; // wake trail
}

export interface ShipView {
  id: number;
  pos: Vec3;
  head: Vec3;
  /** Metres per second through the water. */
  speed: number;
  /** Rate of turn, radians per second, positive to port (left). Ships heel out of the turn. */
  turn: number;
  /** Height above the sea, for the Gale and the glide; the gust's hop is animated here from the gust event. */
  alt?: number;
  /** Extra roll in radians, positive to starboard: a ship tossed by the whale's breach rolling over and back. */
  flip?: number;
  /** Head to wind and stopped in irons: her canvas shakes and slats. */
  irons?: boolean;
  /** 1 as a thrown gybe slams her yards across, falling to 0: the yards swing fast and the hull jolts. */
  lurch?: number;
  /** Her roll in a seaway, radians, positive with her starboard side down: the deck the gunners feel, over the waves'. */
  roll?: number;
  /** 0..1 */
  hull: number;
  /** Shield points and their cap (the shield aura brightens as it fills). */
  shield: number;
  shieldMax: number;
  weapon: Weapon;
  /** World direction the turret aims; omitted, it trains forward. */
  aim?: Vec3;
  /** The wind she feels, a tangent vector in m/s; omitted, the view's wind. */
  wind?: Vec3;
  cosmetics: CosmeticIds;
  /** False once sunk: the sinking animation plays out (from the sink event) and the model goes. */
  alive: boolean;
  /** Her parts; omitted, all whole. */
  parts?: PartsView;
}

/** What has been shot away: her canvas (0 whole, 1 in rags), the mainmast, and the water in her. */
export interface PartsView {
  torn: number;
  /** 'up', 'down' (over the side; the fall plays from the mastFall event) or 'jury' (a short spar rigged in its place). */
  mast: 'up' | 'down' | 'jury';
  /** 0 dry .. 1 full; she settles and lists to `listTo` (+1 starboard). */
  flood: number;
  listTo: number;
  /** Seconds left burning; 0 not. */
  burn: number;
}

export interface ProjectileView {
  id: number;
  weapon: Weapon;
  rarity: Rarity;
  pos: Vec3;
  vel: Vec3;
  /** The ship that fired it, for the harpoon's line. */
  ship?: number;
}

export type LootKind = Weapon | 'smallShield' | 'bigShield' | 'repairKit' | 'fullRepair' | 'coin';

export interface LootView {
  id: number;
  pos: Vec3;
  kind: LootKind;
  rarity: Rarity;
  /** Seconds since it appeared, for the pop-in. */
  age: number;
}

/** The whale on its route: deep (unseen), rising, at the surface (blowing now and then) or diving, k 0..1 through each. */
export interface WhaleView {
  id: number;
  pos: Vec3;
  head: Vec3;
  state: 'deep' | 'rising' | 'surface' | 'diving';
  k: number;
}

export interface ActorsView {
  /** Seconds, for waves and flutter. */
  time: number;
  /** Unit vector toward the sun, world frame. Half the planet is dark; lanterns and wakes glow there. */
  sun: Vec3;
  /** Sea level relative to the mean radius, metres (the tide, about -1..1). */
  seaLevel: number;
  /** The wind where no ship carries its own, a tangent vector in m/s at the focus. */
  wind: Vec3;
  /** The player's ship id: its hits raise hit markers and its events raise camera juice. -1 for none. */
  player: number;
  ships: readonly ShipView[];
  projectiles: readonly ProjectileView[];
  loot: readonly LootView[];
  whales: readonly WhaleView[];
  /** Cinder Peak while it erupts, or is about to; none when it is quiet. */
  eruption?: EruptionView | null;
}

/** Cinder Peak erupting: its crater, how hard it erupts (0…1, a thread of smoke while it is warned), and the bombs it
 *  has thrown, each with where it comes down and how far through its flight it is (0…1). */
export interface EruptionView {
  crater: Vec3;
  strength: number;
  bombs: readonly { to: Vec3; k: number }[];
}

/** One-shot moments. `at` is a world point; for hits it is where the shot struck. */
export type ActorEvent =
  | { t: 'fire'; ship: number; weapon: Weapon; rarity?: Rarity }
  | { t: 'hit'; ship: number; by: number; weapon: Weapon; at: Vec3; shield: number; hull: number; crit?: boolean }
  | { t: 'impact'; weapon: Weapon; at: Vec3; on: 'water' | 'land' }
  | { t: 'shieldBreak'; ship: number; at?: Vec3 }
  | { t: 'shieldRefill'; ship: number }
  | { t: 'sink'; ship: number }
  | { t: 'gust'; ship: number }
  | { t: 'pickup'; ship: number; rarity: Rarity }
  | { t: 'delivery'; ship: number; rarity?: Rarity }
  | { t: 'ram'; at: Vec3 }
  | { t: 'scrape'; at: Vec3 }
  | { t: 'breach'; at: Vec3; head?: Vec3 }
  | { t: 'lavaBomb'; at: Vec3; on: 'water' | 'land' }
  /** A region's event brings rock down into the water (the Spires' spire, the Narrows' rockfall): `at` is its spot. */
  | { t: 'rockfall'; region: number; at: Vec3 }
  /** Lightning over a spot: its warning (the leader coming down), then its strike. */
  | { t: 'lightning'; at: Vec3; warning: boolean }
  /** A ship's mainmast going over the side, toward `side` (+1 starboard); her jury mast swayed up in its place. */
  | { t: 'mastFall'; ship: number; side: number }
  | { t: 'juryRig'; ship: number }
  /** Fire put out by the weather, or a heated shot doused as it struck; `at` where. */
  | { t: 'quench'; ship: number; at: Vec3 };

/** What a moment should do to the camera, the screen and the hand, for the integration step to route. */
export interface Juice {
  shake: number; // 0..1 trauma
  kick?: number; // field-of-view punch, degrees
  flash?: number; // 0..1 screen flash
  flashColor?: number;
  hitStop?: number; // seconds of frozen time
  haptic?: 'light' | 'medium' | 'heavy';
}

/** A hit marker for the HUD: where on screen (normalised device coordinates, -1..1, y up) and what it did. */
export interface HitMarker {
  ndc: { x: number; y: number };
  onScreen: boolean;
  ship: number;
  shield: number;
  hull: number;
  crit: boolean;
  broke: boolean;
}
