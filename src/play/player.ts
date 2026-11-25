import type { GunKind, Rarity } from '../sim/kinds.ts';
import { GUST_METER, HEAL } from '../sim/tuning.ts';
import type { Livery } from '../world/livery.ts';
import type { Vec3 } from '../world/sphere.ts';

export interface Thumbs {
  stick: { x: number; y: number; center: [number, number] | null } | null;
  look: { x: number; y: number; held: boolean };
  fire: boolean;
  heal: number | null;
  gust: boolean;
}

export const IDLE: Thumbs = {
  stick: null,
  look: { x: 0, y: 0, held: false },
  fire: false,
  heal: null,
  gust: false,
};

export interface Status {
  at: Vec3;
  heading: Vec3;
  facing: Vec3;
  arriving: number;
  top: number;
  hull: number;
  hullMax: number;
  shield: number;
  shieldMax: number;
  gun: {
    kind: GunKind;
    rounds: number;
    ready: number;
    charge: number | null;
    locked: boolean;
  } | null;
  afloat: number;
  sunk: boolean;
  storm: number;
  closing: boolean;
  eye: { center: Vec3; radius: number };
  next: { center: Vec3; radius: number } | null;
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
}

export interface Mate {
  id: number;
  hull: number;
  hullMax: number;
  shield: number;
  shieldMax: number;
  place: number;
}

export const PLAYER_SHIP = 0;

export type { GunKind } from '../sim/kinds.ts';
export const HEAL_SLOTS = HEAL.slots;
export const GUST_NOTCH = GUST_METER.least;

export type Deed = { seq: number; time: number; at: Vec3; ship: number } & (
  | { kind: 'fired' | 'winding' | 'reloading' | 'reloaded'; gun: GunKind }
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
  | { kind: 'took'; heal: Rarity; slot: number }
  | { kind: 'mended'; heal: Rarity }
  | { kind: 'gust' }
);

export const LIFT: Record<Deed['kind'], number> = {
  fired: 3,
  winding: 3,
  reloading: 3,
  reloaded: 3,
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

export interface Wardrobe {
  dyes: readonly { name: string; dye: string; mark: string }[];
  worn(): Livery;
  wear(l: Livery): Livery;
  broadside(on: boolean): void;
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
  meters: number;
  whence: number | null;
};

export interface Kit {
  heals: readonly (Rarity | null)[];
  using: { slot: number; done: number } | null;
  gust: number;
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
