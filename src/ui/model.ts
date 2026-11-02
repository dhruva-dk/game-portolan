// View models: every screen renders from one of these plus its callbacks. They are plain data shaped like the
// career's own record (src/career/record.ts, contract.ts) so integration maps one onto the other in a few lines;
// nothing here reads the simulation's state or the career's internals. The abilities and the regions are read
// straight from src/sim, which is allowed: they are fixed tables.
import type { AbilityId, ActiveId, PassiveId } from '../sim/abilities.ts';
import type { WEATHER_NAMES } from '../sim/tables.ts';
import type { PerkId } from '../sim/world/index.ts';
import type { Rarity } from './parts/tokens.ts';

// ---------------------------------------------------------------- shared

export type CosmeticKind = 'sailColour' | 'sailPattern' | 'hullPaint' | 'figurehead' | 'emblem' | 'wake';
/** One cosmetic id per kind: what a ship wears. */
export type Look = Record<CosmeticKind, string>;
export type Unlock = { by: 'level'; level: number } | { by: 'rank'; tier: number };

export const KINDS: readonly { kind: CosmeticKind; name: string; one: string }[] = [
  { kind: 'sailColour', name: 'Sail colours', one: 'Sail colour' },
  { kind: 'sailPattern', name: 'Sail patterns', one: 'Sail pattern' },
  { kind: 'hullPaint', name: 'Hull paints', one: 'Hull paint' },
  { kind: 'figurehead', name: 'Figureheads', one: 'Figurehead' },
  { kind: 'emblem', name: 'Emblems', one: 'Emblem' },
  { kind: 'wake', name: 'Wake trails', one: 'Wake trail' },
];

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
  name: string;
  /** 0–1 toward the next step. */
  progress: number;
  /** True when the tier floor is holding the rank up. */
  floored: boolean;
}

export const TIER_NAMES = ['Iron', 'Bronze', 'Silver', 'Gold', 'Platinum', 'Diamond', 'Admiral', 'Legend'] as const;

/** Every rank, Iron I to Legend, as the ladder shows them. */
export const RANK_LADDER: readonly { index: number; tier: number; step: number; name: string }[] = [
  ...TIER_NAMES.slice(0, 6).flatMap((t, tier) => ['I', 'II', 'III'].map((n, s) => ({ tier, step: s + 1, name: `${t} ${n}` }))),
  { tier: 6, step: 0, name: 'Admiral' },
  { tier: 7, step: 0, name: 'Legend' },
].map((r, index) => ({ ...r, index }));

/** A rank from its name ("Gold II"), for captains whose standing comes as text. Unknown names read as Iron I. */
export const rankByName = (name: string): { index: number; tier: number; step: number; name: string } =>
  RANK_LADDER.find((r) => r.name === name) ?? RANK_LADDER[0];

export const unlockText = (u: Unlock): string => (u.by === 'level' ? `Level ${u.level}` : `Reach ${TIER_NAMES[u.tier]}`);

/** A cosmetic's rarity, from how hard it is to earn: the rank rewards are the rarest. */
export function rarityOf(u: Unlock): Rarity {
  if (u.by === 'rank') return u.tier >= 5 ? 4 : u.tier >= 3 ? 3 : 2;
  return u.level >= 36 ? 3 : u.level >= 20 ? 2 : u.level >= 9 ? 1 : 0;
}

/** A captain's or the player's mark: an emblem id and two colours (sail and hull). */
export interface Mark {
  emblem: string;
  colours: [string, string];
}

export interface PlayerView extends Mark {
  name: string;
  level: LevelView;
  rank: RankView;
  /** The best tier reached: the floor. */
  bestTier: number;
}

// ---------------------------------------------------------------- title and lobby

export interface TitleModel {
  /** Loading, 0–1. */
  progress: number;
  status: string;
  version: string;
}

export type MenuId = 'abilities' | 'locker' | 'rivals' | 'career' | 'rank' | 'settings';

export interface LobbyModel {
  player: PlayerView;
  active: ActiveId;
  passive: PassiveId;
  look: Look;
  /** Counts of new things waiting on each menu, for the badges. */
  news: Partial<Record<MenuId, number>>;
  /** One line about the league, such as a rival's grudge. */
  ticker: string[];
  stats: { matches: number; wins: number; top5: number };
}

// ---------------------------------------------------------------- abilities and locker

export interface AbilityView {
  id: AbilityId;
  kind: 'active' | 'passive';
  name: string;
  text: string;
  /** Seconds, for actives. */
  cooldown: number;
  /** The level it unlocks at. */
  level: number;
  unlocked: boolean;
  isNew: boolean;
}

export interface AbilitiesModel {
  level: number;
  abilities: AbilityView[];
  active: ActiveId;
  passive: PassiveId;
}

export interface CosmeticView {
  id: string;
  kind: CosmeticKind;
  name: string;
  hint: string;
  /** The main colour, for colours, paints and wakes. */
  colour?: string;
  rarity: Rarity;
  unlock: Unlock;
  unlocked: boolean;
  isNew: boolean;
}

export interface LockerModel {
  level: number;
  bestTier: number;
  cosmetics: CosmeticView[];
  look: Look;
}

// ---------------------------------------------------------------- rivals, career, rank

export interface RivalView extends Mark {
  id: string;
  name: string;
  /** What the name means. */
  meaning: string;
  /** The sigil, in words. */
  sigil: string;
  temperament: { id: string; name: string; text: string };
  /** League standing, such as "Gold II". */
  rank: string;
  active: ActiveId;
  passive: PassiveId;
  met: number;
  /** Matches you finished ahead of it, and behind it. */
  ahead: number;
  behind: number;
  sankYou: number;
  sunkByYou: number;
  /** 0–3. */
  grudge: number;
  /** 0–1. */
  rivalry: number;
  isRival: boolean;
  /** Plain lines for its card: grudge, what it has learned, the record. */
  lines: string[];
}

export interface RivalsModel {
  rivals: RivalView[];
}

export interface CareerStatsView {
  matches: number;
  wins: number;
  top5: number;
  kills: number;
  damage: number;
  /** Seconds afloat over every match. */
  survived: number;
  /** 0 before the first match. */
  bestPlace: number;
}

export interface ChartRegionView {
  /** Index into REGIONS. */
  index: number;
  name: string;
  /** Matches you sailed it in; 0 is still blank on the chart. */
  sailed: number;
}

export interface CareerModel {
  player: PlayerView;
  stats: CareerStatsView;
  chart: ChartRegionView[];
  /** What you tend to do, as the captains see it. */
  habits: string[];
}

export interface RankModel {
  rank: RankView;
  bestTier: number;
  /** The cosmetics earned by reaching each tier, shown on the ladder. */
  rewards: CosmeticView[];
}

// ---------------------------------------------------------------- settings

export type Quality = 'low' | 'medium' | 'high';

export interface Settings {
  /** Volumes, 0–1: everything, the guns and the world's sounds, the sea and the weather, and the interface. */
  master: number;
  effects: number;
  ambience: number;
  interface: number;
  haptics: boolean;
  /** Screen shake, 0–1. */
  shake: number;
  quality: Quality;
  /** Aim speed, 0.5–2. */
  sensitivity: number;
  invertY: boolean;
  /** The stick on the right and the aim on the left. */
  leftHanded: boolean;
  /** Fire on its own when the crosshair is on a ship. */
  autoFire: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  master: 0.9, effects: 0.9, ambience: 0.7, interface: 0.8, haptics: true, shake: 1, quality: 'medium',
  sensitivity: 1, invertY: false, leftHanded: false, autoFire: false,
};

// ---------------------------------------------------------------- the match

export type WeaponId = 'cannon' | 'harpoon' | 'mortar' | 'repeater' | 'scatter' | 'broadside';
export type ConsumableId = 'smallShield' | 'bigShield' | 'repairKit' | 'fullRepair';

export const WEAPON_NAME: Record<WeaponId, string> = {
  cannon: 'Cannon', harpoon: 'Harpoon', mortar: 'Mortar', repeater: 'Repeater', scatter: 'Scatter Gun', broadside: 'Broadside',
};

export const CONSUMABLE: Record<ConsumableId, { name: string; stack: number; seconds: number; text: string }> = {
  smallShield: { name: 'Small Shield', stack: 6, seconds: 1.0, text: '+25 shield, up to 50' },
  bigShield: { name: 'Big Shield', stack: 3, seconds: 2.6, text: '+50 shield, up to 100' },
  repairKit: { name: 'Repair Kit', stack: 8, seconds: 1.8, text: '+15 hull, up to 75' },
  fullRepair: { name: 'Full Repair', stack: 2, seconds: 5.0, text: 'Full hull' },
};

export interface GaleRegion {
  index: number;
  /** False for regions too far off the Gale's road to glide to. */
  open: boolean;
  /** Captains heading there now. */
  heading: number;
}

export interface GaleModel {
  /** Seconds left to choose, and the whole window. */
  seconds: number;
  total: number;
  /** The point under the sun, in degrees: day is the half facing it. */
  sun: { lat: number; lon: number };
  /** Where you ride, in degrees, and the Gale's road ahead from there to where it lets go. */
  at: { lat: number; lon: number };
  path: { lat: number; lon: number }[];
  regions: GaleRegion[];
  /** The region you have marked to come down in, or -1. */
  pick: number;
  /** The region under you now. */
  below: number;
  ships: number;
}

export type Slot =
  | { kind: 'empty' }
  | { kind: 'weapon'; weapon: WeaponId; rarity: Rarity; ammo: number; mag: number; /** 0–1 while reloading, else 0. */ reload: number }
  | { kind: 'consumable'; item: ConsumableId; count: number };

/** The minimap, in metres on the sea round you: x east, y north, you at the centre. */
/** What a region's event is to you: something to keep clear of, something to go for, or a change in the sea. */
export type EventTone = 'danger' | 'prize' | 'sea';

export interface EventView {
  /** The region's id, for its glyph. */
  region: string;
  name: string;
  tip: string;
  tone: EventTone;
  /** Warned and not started yet; then seconds until it starts, or else until it ends. */
  warning: boolean;
  seconds: number;
}

export type WeatherName = (typeof WEATHER_NAMES)[number];

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
  /** Ships the map shows (seen, or spotted). */
  ships: { x: number; y: number; spotted?: boolean }[];
  /** Things worth sailing to: loot, a gull drop, the region's beacon. */
  marks: { x: number; y: number; kind: 'loot' | 'gull' | 'beacon' }[];
  /** Region events warned or running in range: where each stands, how far it reaches, and what it is to you. */
  events: { x: number; y: number; r: number; tone: EventTone; warning: boolean }[];
}

export interface HudModel {
  shield: number;
  shieldMax: number;
  hull: number;
  hullMax: number;
  slots: Slot[];
  selected: number;
  ability: { id: ActiveId; /** 0–1, 1 ready. */ ready: number; /** Seconds left, while cooling down. */ seconds: number };
  passive: PassiveId;
  gust: { charges: number; max: number; /** 0–1 toward the next charge. */ recharge: number };
  storm: { phase: number; phases: number; seconds: number; shrinking: boolean; outside: boolean };
  ships: number;
  kills: number;
  coins: number;
  /** The cheapest gull delivery's price, and whether you can call one here; and each parcel's. */
  gull: { price: number; ready: boolean; parcels: { name: string; price: number; ready: boolean }[] };
  /** How much sail is set: 1 full, 0.5 half, 0 furled. */
  throttle: number;
  /** A consumable in use, with its progress. */
  using: { item: ConsumableId; progress: number } | null;
  region: string;
  /** The region's perk, when you are in your drop region's water. */
  perk: string | null;
  /** Every perk you hold, in the regions' order. */
  perks: PerkId[];
  /** The weather you are well inside, if any. */
  weather: WeatherName | null;
  /** The sea level in metres, from −1 at low water to +1 at high, and whether it is rising. */
  tide: { level: number; rising: boolean };
  night: boolean;
  /** What a pickup button would take, if anything is in reach. */
  pickup: string | null;
  /** A region's event, warned or running, in the water you are in or within 240 m of it. */
  event: EventView | null;
  /** A second such event while the first shows, in a smaller banner under it. */
  also?: EventView | null;
  map: MapView;
}

/** What the HUD's controls say this frame: integration maps it onto the simulation's input. */
export interface HudInput {
  /** The stick: x right, y forward, each -1 to 1. */
  steer: { x: number; y: number };
  /** Aim turned since the last read, in radians (yaw right, pitch down), sensitivity applied. */
  look: { x: number; y: number };
  fire: boolean;
  /** Edges: true for the one read after the tap. */
  gust: boolean;
  ability: boolean;
  /** A slot tapped, or -1. */
  select: number;
  reload: boolean;
  drop: boolean;
  pickup: boolean;
  gull: boolean;
  map: boolean;
  pause: boolean;
}

export type Killer = Mark & { name: string; rank: string; temperament: string; weapon: WeaponId | null; grudge: number };

export interface DeathModel {
  place: number;
  ships: number;
  /** Who sank you, or null when the Storm or the sea did. */
  killer: Killer | null;
  cause: 'ship' | 'storm' | 'sea';
  /** How: the weapon class, or ram, burn, ink, mine, wave, storm, lightning, ash, whale or sea. */
  how: string;
  kills: number;
  damage: number;
  survived: number;
}

export interface SpectateModel {
  target: Mark & { name: string; rank: string; kills: number; shield: number; hull: number };
  ships: number;
}

export interface VictoryModel {
  kills: number;
  damage: number;
  survived: number;
  ships: number;
}

export interface ResultsModel {
  place: number;
  ships: number;
  kills: number;
  damage: number;
  survived: number;
  xp: { parts: { label: string; amount: number }[]; total: number };
  level: { before: LevelView; after: LevelView };
  rank: { before: RankView; after: RankView; change: 'up' | 'down' | 'same'; newTier: boolean };
  unlocked: { abilities: AbilityView[]; cosmetics: CosmeticView[] };
  /** Regions charted for the first time. */
  newRegions: { index: number; name: string }[];
  rivals: (Mark & { id: string; name: string; what: 'sankYou' | 'sunkByYou' | 'grudge' | 'firstMeeting' })[];
}
