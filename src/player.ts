import type { GunKind, LootKind, Use } from './kinds.ts';
import type { Vec3 } from './world/sphere.ts';

export interface Hands {
  stick: { x: number; y: number; centre: [number, number] | null } | null;
  look: { x: number; y: number; held: boolean };
  fire: boolean;
  tap: number | null;
  gust: boolean;
}

export const IDLE: Hands = {
  stick: null,
  look: { x: 0, y: 0, held: false },
  fire: false,
  tap: null,
  gust: false,
};

export interface Status {
  at: Vec3;
  heading: Vec3;
  facing: Vec3;
  arriving: number;
  hull: number;
  hullMax: number;
  shield: number;
  shieldMax: number;
  gun: {
    kind: GunKind;
    rarity: number;
    rounds: number;
    ready: number;
    charge: number | null;
    swapping: number;
    locked: boolean;
  } | null;
  afloat: number;
  sunk: boolean;
  storm: number;
  closing: boolean;
  eye: { centre: Vec3; radius: number };
  next: { centre: Vec3; radius: number } | null;
  outside: number;
  reticle: {
    fall: { x: number; y: number } | null;
    reach: boolean;
    spread: number;
    lob: boolean;
  } | null;
  moments: readonly Moment[];
  race: Race | null;
}

export interface Race {
  team: number;
  place: number;
  of: number;
  mates: readonly Mate[];
  tower: readonly Placed[];
}

export interface Mate {
  id: number;
  hull: number;
  hullMax: number;
  shield: number;
  shieldMax: number;
  doing: Doing;
  place: number;
}

export type Doing = 'sailing' | 'fighting' | 'fleeing' | 'storm' | 'sunk';

export interface Placed {
  id: number;
  team: number;
  place: number;
  afloat: boolean;
  sinkings: number;
}

export const PLAYER_SHIP = 0;

export { isGun } from './kinds.ts';
export type { GunKind, LootKind } from './kinds.ts';
export const HOTBAR = { guns: 2, items: 3 } as const;

export type Deed = { seq: number; time: number; at: Vec3; ship: number } & (
  | {
      kind: 'fired' | 'winding' | 'reloading' | 'reloaded' | 'swapped';
      gun: GunKind;
    }
  | { kind: 'fell'; land: boolean }
  | {
      kind: 'struck';
      by: number;
      shield: number;
      hull: number;
      broke: boolean;
      ram: boolean;
    }
  | { kind: 'sank'; by: number | null }
  | { kind: 'took'; piece: LootKind; rarity: number; slot: number }
  | { kind: 'mended'; piece: LootKind }
  | { kind: 'gust' }
);

export const LIFT: Record<Deed['kind'], number> = {
  fired: 3,
  winding: 3,
  reloading: 3,
  reloaded: 3,
  swapped: 3,
  fell: 0,
  struck: 2,
  sank: 2,
  took: 0.5,
  mended: 2,
  gust: 2,
};

export const SCREENS = [
  'title',
  'lobby',
  'settings',
  'seed',
  'livery',
  'match',
  'sinking',
  'sunk',
  'spectate',
  'won',
  'result',
] as const;
export type Screen = (typeof SCREENS)[number];

export const PATTERNS = ['plain', 'band', 'stripes'] as const;

export interface Livery {
  dye: number;
  pattern: number;
}
export const LIVERY: Livery = { dye: 0, pattern: 0 };

export interface Wardrobe {
  dyes: readonly { name: string; dye: string; mark: string }[];
  worn(): Livery;
  wear(l: Livery): Livery;
  broadside(on: boolean): void;
}

export interface Spread {
  mean: number;
  spread: number;
}

export interface Standout {
  id: number;
  persona: number;
  by: number;
}

export interface Fleet {
  type: number;
  name: string;
  counts: readonly number[];
  common: number;
  skill: Spread;
  aggression: Spread;
  notice: Spread;
  margin: Spread;
  flee: Spread;
  sharpest: Standout;
  reckless: Standout;
}

export interface Chart {
  name: string;
  points: Float32Array;
  runs: Uint32Array;
  land: Float32Array;
  start: Vec3;
  ms: number;
}

export interface Seeds {
  name: string;
  fleet(name: string): Fleet;
  chart(name: string): Promise<Chart | null>;
  roll(): string;
  sail(name: string): void;
}

export type Blow = 'broke' | 'hull' | 'shield';
export const blowOf = (d: { broke: boolean; hull: number }): Blow =>
  d.broke ? 'broke' : d.hull > 0 ? 'hull' : 'shield';
export const felt = {
  dealt: (points: number) => Math.min(1.3, 0.6 + points / 40),
  taken: (points: number) => Math.min(1.3, 0.4 + points / 40),
};

export type Moment = Deed & {
  seen: { x: number; y: number } | null;
  bearing: number;
  metres: number;
  whence: number | null;
};

export type Item = `item.${Use}`;

export interface Slot {
  item: Item;
  count?: number;
}

export interface GunSlot {
  kind: GunKind;
  rarity: number;
  rounds: number;
  mag: number;
  reload: number | null;
}

export interface Kit {
  guns: readonly [GunSlot | null, GunSlot | null];
  items: readonly [Slot | null, Slot | null, Slot | null];
  chosen: number;
  using: number | null;
  offer: number | null;
  gust: number;
  gusts: number;
  blowing: boolean;
}

export interface End {
  how: 'won' | 'shot' | 'ram' | 'storm';
  gun: GunKind | null;
  place: number;
  of: number;
  share: number;
  afloat: number;
  settled: boolean;
  over: boolean;
}
