// The seam between the career and a race: a RaceCard
// goes in, a RaceResult comes out, with the plain words both sides share.
// Types and constants only. The career (career/) writes the card and reads the
// result; the race (sim/, play/) reads the card and writes the result; neither
// sees the other. A match with no card is today's Single Race, to the bit.

import type { GunKind } from './kinds.ts';

/** Ships a team sails, and teams a race: ships 4k … 4k+3 are team k. */
export const TEAM = 4;
export const TEAMS = 20;

/** A driver's nine stats, each 0…20 (form and morale already applied). */
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

/** The six personas a bot may be, in sim/persona.ts PERSONAS' order. */
export type Persona =
  | 'hunter'
  | 'homesteader'
  | 'raider'
  | 'turtle'
  | 'scavenger'
  | 'brawler';

/**
 * Who sails a ship by bot: her seed (her chance's start), her persona and her
 * stats. A driver of 10 in every stat sails as today's bot of that seed and
 * persona does.
 */
export interface Driver {
  seed: number;
  persona: Persona;
  stats: DriverStats;
}

/** A ship's six parts. */
export const PARTS = [
  'sails',
  'rigging',
  'rudder',
  'hull',
  'keel',
  'mounts',
] as const;
export type PartType = (typeof PARTS)[number];

/**
 * A part as fitted for a race: its performance, as so many times the spec
 * part's (1 is spec): the sim makes her handling of it.
 */
export interface Fitted {
  performance: number;
}

/** A ship's livery: her dye and pattern, as play/colours.ts deals them. */
export interface Colours {
  dye: number;
  pattern: number;
}

/**
 * A ship of a race. `driver` null: her hands are the player's (only ship 0 of
 * the race the player sails). `forfeit`: she does not put to sea, and is placed
 * last.
 */
export interface RaceShip {
  id: number;
  team: number;
  colours: Colours;
  parts: Readonly<Record<PartType, Fitted>>;
  driver: Driver | null;
  forfeit: boolean;
}

/**
 * A championship's rules, as its teams have voted them: what the sim reads
 * (the storm's pace, 1 today's; the guns banned) and what the career reads
 * (the parts that are spec, the points, the prize money's spread, the share of
 * teams inspected).
 */
export interface Rules {
  storm: number;
  banned: readonly GunKind[];
  spec: readonly PartType[];
  pointsPerSinking: number;
  seaHeldPoint: boolean;
  prizeSpread: number;
  inspection: number;
}

/** A race to be sailed: its planet's seed, whose it is, and its 80 ships. */
export interface RaceCard {
  seed: number;
  tier: number;
  round: number;
  rules: Rules;
  ships: readonly RaceShip[];
}

/** How a ship's race ended, if she sank. */
export type Cause = 'shot' | 'ram' | 'storm' | 'forfeit';

/**
 * A race as it was sailed. `order`: ids, first place first (the ships afloat at
 * the end by sinkings credited, then her share of the sea, then the lower id;
 * then the sunk, the last sunk first). `hash`: the race's final state, hashed
 * (FNV-1a, 8 hex digits): the same card on the same planet gives the same hash
 * on every machine.
 */
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
