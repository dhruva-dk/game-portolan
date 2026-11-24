import type { GunKind } from './kinds.ts';

export const TEAM = 4;
export const TEAMS = 20;

export const STATS = [
  'gunnery',
  'helm',
  'seamanship',
  'nerve',
  'consistency',
  'stormcraft',
  'stamina',
  'feedback',
  'lookout',
] as const;
export type Stat = (typeof STATS)[number];
export type DriverStats = Readonly<Record<Stat, number>>;

export type Persona =
  | 'hunter'
  | 'homesteader'
  | 'raider'
  | 'turtle'
  | 'scavenger'
  | 'brawler';

export interface Driver {
  seed: number;
  persona: Persona;
  stats: DriverStats;
}

export const PARTS = [
  'sails',
  'rigging',
  'rudder',
  'hull',
  'keel',
  'mounts',
] as const;
export type PartType = (typeof PARTS)[number];

export interface Fitted {
  performance: number;
}

export interface Colors {
  dye: number;
  pattern: number;
}

export interface RaceShip {
  id: number;
  team: number;
  colors: Colors;
  parts: Readonly<Record<PartType, Fitted>>;
  driver: Driver | null;
  forfeit: boolean;
}

export interface Rules {
  storm: number;
  banned: readonly GunKind[];
  spec: readonly PartType[];
  pointsPerSinking: number;
  seaHeldPoint: boolean;
  prizeSpread: number;
  inspection: number;
}

export interface RaceCard {
  seed: number;
  tier: number;
  round: number;
  rules: Rules;
  ships: readonly RaceShip[];
}

export type Cause = 'shot' | 'ram' | 'storm' | 'forfeit';

export interface RaceResult {
  seed: number;
  tier: number;
  round: number;
  order: readonly number[];
  sinkings: readonly {
    id: number;
    by: number | null;
    cause: Cause;
    gun: GunKind | null;
    second: number;
  }[];
  seaHeld: readonly { id: number; share: number }[];
  hits: readonly {
    id: number;
    fired: number;
    landed: number;
    taken: number;
    dealt: number;
  }[];
  seconds: number;
  hash: string;
}
