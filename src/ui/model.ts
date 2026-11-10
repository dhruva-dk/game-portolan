// View models: every screen renders from one of these plus its callbacks. They are plain data shaped like the
// career's own record (src/career/record.ts, contract.ts) so integration maps one onto the other in a few lines;
// nothing here reads the simulation's state or the career's internals. The abilities and the regions are read
// straight from src/sim, which is allowed: they are fixed tables.
import type { V3 } from '../sim/math.ts';
import type { AbilityId, ActiveId, PassiveId } from '../sim/abilities.ts';
import type { RegionId } from '../sim/world/index.ts';

// ---------------------------------------------------------------- shared

/** 0 common to 4 legendary. */
export type Rarity = 0 | 1 | 2 | 3 | 4;

export type CosmeticKind = 'sailColour' | 'sailPattern' | 'hullPaint' | 'figurehead' | 'emblem' | 'wake';
/** One cosmetic id per kind: what a ship wears. */
export type Look = Record<CosmeticKind, string>;
export type Unlock = { by: 'level'; level: number } | { by: 'rank'; tier: number };

export interface LevelView {
  level: number;
  /** XP earned inside this level, and what the level takes in all. */
  into: number;
  need: number;
}

export interface RankView {
  /** 0 (Iron I) to 19 (Legend). */
  index: number;
  /** 0 Iron … 5 Diamond, 6 Admiral, 7 Legend. */
  tier: number;
  /** 1–3 inside the stepped tiers, 0 for Admiral and Legend. */
  step: number;
}

const TIER_NAMES = ['Iron', 'Bronze', 'Silver', 'Gold', 'Platinum', 'Diamond', 'Admiral', 'Legend'] as const;

/** Every rank, Iron I to Legend, as the ladder shows them. */
export const RANK_LADDER: readonly { index: number; tier: number; step: number; name: string }[] = [
  ...TIER_NAMES.slice(0, 6).flatMap((t, tier) => ['I', 'II', 'III'].map((n, s) => ({ tier, step: s + 1, name: `${t} ${n}` }))),
  { tier: 6, step: 0, name: 'Admiral' },
  { tier: 7, step: 0, name: 'Legend' },
].map((r, index) => ({ ...r, index }));

/** A rank from its name ("Gold II"), for captains whose standing comes as text. Unknown names read as Iron I. */
export const rankByName = (name: string): { index: number; tier: number; step: number; name: string } =>
  RANK_LADDER.find((r) => r.name === name) ?? RANK_LADDER[0];

/** A cosmetic's rarity, from how hard it is to earn: the rank rewards are the rarest. */
export function rarityOf(u: Unlock): Rarity {
  if (u.by === 'rank') return u.tier >= 5 ? 4 : u.tier >= 3 ? 3 : 2;
  return u.level >= 36 ? 3 : u.level >= 20 ? 2 : u.level >= 9 ? 1 : 0;
}

/** A captain's or the player's mark: an emblem id and two colours, the disc's and the charge's (a captain's own colour
 *  and ink; the player's sail colour and hull paint). */
export interface Mark {
  emblem: string;
  colours: [string, string];
}

// ---------------------------------------------------------------- abilities and locker

export interface AbilityView {
  id: AbilityId;
  kind: 'active' | 'passive';
  /** The level it unlocks at. */
  level: number;
  unlocked: boolean;
}

export interface AbilitiesModel {
  abilities: AbilityView[];
  active: ActiveId;
  passive: PassiveId;
}

export interface CosmeticView {
  id: string;
  kind: CosmeticKind;
  /** The main colour, for colours, paints and wakes. */
  colour?: string;
  rarity: Rarity;
  unlock: Unlock;
  unlocked: boolean;
}

export interface LockerModel {
  cosmetics: CosmeticView[];
  look: Look;
}

// ---------------------------------------------------------------- rivals, career, rank

export interface RivalView extends Mark {
  id: string;
  /** League standing, such as "Gold II". */
  rank: string;
  active: ActiveId;
  passive: PassiveId;
  sankYou: number;
  sunkByYou: number;
}

export interface RivalsModel {
  rivals: RivalView[];
}

export interface RankModel {
  rank: RankView;
  bestTier: number;
  /** The cosmetics earned by reaching each tier, shown on the ladder. */
  rewards: CosmeticView[];
}

// ---------------------------------------------------------------- settings

export interface Settings {
  /** Volumes, 0–1: everything, the guns and the world's sounds, the sea and the weather, and the interface. */
  master: number;
  effects: number;
  ambience: number;
  interface: number;
  haptics: boolean;
  /** Screen shake, 0–1. */
  shake: number;
  /** Aim speed, 0.5–2. */
  sensitivity: number;
  invertY: boolean;
  /** The stick on the right and the aim on the left. */
  leftHanded: boolean;
  /** Fire on its own when the crosshair is on a ship. */
  autoFire: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  master: 0.9, effects: 0.9, ambience: 0.7, interface: 0.8, haptics: true, shake: 1,
  sensitivity: 1, invertY: false, leftHanded: false, autoFire: false,
};

// ---------------------------------------------------------------- the match

export type WeaponId = 'cannon' | 'harpoon' | 'mortar' | 'repeater' | 'scatter' | 'broadside' | 'chain' | 'heated';
export type ConsumableId = 'smallShield' | 'bigShield' | 'repairKit' | 'fullRepair';

export type Slot =
  | { kind: 'empty' }
  | { kind: 'weapon'; weapon: WeaponId; rarity: Rarity; ammo: number; /** 0–1 while reloading, else 0. */ reload: number }
  | { kind: 'consumable'; item: ConsumableId; count: number };

/** The minimap, in metres on the sea round you: x east, y north, you at the centre. */
export interface MapView {
  /** Where you are, in degrees, to centre the chart. */
  lat: number;
  lon: number;
  /** Your heading, radians clockwise from north. */
  heading: number;
  /** How many metres the map's radius shows. */
  range: number;
  /** The Storm's safe circle now and the next one, centred relative to you; null before the Storm. */
  storm: { x: number; y: number; r: number } | null;
  next: { x: number; y: number; r: number } | null;
  /** Ships the map shows (seen, or spotted), each by its captain's charge and colour. */
  ships: { x: number; y: number; emblem: string; colour: string; spotted?: boolean }[];
  /** Loot worth sailing to. */
  marks: { x: number; y: number }[];
  /** The player's own marker, set on the full map, or null. */
  marker: { x: number; y: number } | null;
  /** While the Gale blows: its course in dotted runs of metres (x, y, x, y…), the Storm's first circle in metres, and
   *  the fleet, too close together for emblems at this range, shown as marks. */
  course?: readonly (readonly number[])[];
  first?: readonly (readonly number[])[];
  fleet?: boolean;
  /** The water held round the ship: `ids` a square of n × n owners (0 for nobody, else captain + 1) across the map's
   *  width, north at the top; `inks` each captain's colour; `me` the ship the map is for, + 1. */
  water?: { n: number; ids: Uint8Array; inks: readonly string[]; me: number };
  /** The loop being sailed, as it is laid: metres (x, y, x, y…), oldest first, in `loopInk`. */
  loop?: readonly number[];
  loopInk?: string;
  /** Where a point of the sea lies on this map, metres. */
  place?: (q: V3) => { x: number; y: number };
}

/** A ship's parts as the HUD shows them: how hurt each is, 0 whole to 1 shot away. */
export interface PartsModel {
  sail: number;
  /** The mainmast: weakened 0–1 while it stands; `down` seconds until a jury mast is up once it falls. */
  mast: number;
  down: number;
  jury: boolean;
  rudder: number;
  /** Water in her: past `sinks` it drags her under. */
  flood: number;
  sinks: number;
  burning: boolean;
  /** Ice built on her by falling snow, 0–1: she turns slower the more she carries. */
  ice: number;
}

export interface HudModel {
  shield: number;
  shieldMax: number;
  hull: number;
  hullMax: number;
  parts: PartsModel;
  slots: Slot[];
  selected: number;
  ability: { id: ActiveId; /** 0–1, 1 ready. */ ready: number; /** Seconds left, while cooling down. */ seconds: number };
  gust: { charges: number; max: number; /** 0–1 toward the next charge. */ recharge: number };
  storm: {
    seconds: number; shrinking: boolean;
    /** The second before the first phase: no clock is shown for it. */
    grace: boolean;
    /** How far through the wait or the closing, 0–1. */
    progress: number;
    /** Outside the safe circle, and how deep into the Storm, 0 at its edge to 1 far out. */
    outside: boolean; depth: number;
  };
  ships: number;
  /** How much sail is set: 1 full, 0.5 half, 0 furled. */
  throttle: number;
  /** In a seaway, how steady your deck is for a shot (1 at the top of a roll, 0 swinging through upright); null when
   *  the sea is too slight to roll her. */
  steady: number | null;
  /** A heavy gun winding up on you (the nearest to firing): where it is (radians round from where you aim, positive
   *  to the right), and how far through its wind-up it is, 0..1. */
  aimed: { bearing: number; wound: number } | null;
  /** How far through using a consumable, 0–1, while one is in use. */
  using: { progress: number } | null;
  /** The region's id, for its sign; null on the open sea. */
  regionId: RegionId | null;
  /** The watched ship's own colour: her hull bar's wash. */
  colour: string;
  /** The sea level in metres, from −1 at low water to +1 at high. */
  tide: number;
  /** The gull: the coins to hail it with, the best parcel they buy now (-1 none, else 0–2), and whether it is home. */
  gull: { coins: number; best: number; home: boolean };
  /** What a swap would take, if anything is in reach. */
  pickup: string | null;
  map: MapView;
}

export interface ResultsModel {
  place: number;
  kills: number;
  damage: number;
  survived: number;
  level: { before: LevelView; after: LevelView };
  rank: { before: RankView; after: RankView };
  /** The water she held at the end, in her colour; null if none. */
  held: HeldChart | null;
}

/** Water held, for a small chart: each cell's middle (x, y, x, y… in −1..1 across the chart) and its half width. */
export interface HeldChart {
  pts: Float32Array;
  half: number;
  ink: string;
}
