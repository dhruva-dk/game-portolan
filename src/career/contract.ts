// What a match needs from the career, and what it reports back. These are the career's own types: the
// integration step adapts the simulation to and from them, so the career never depends on the simulation's state.
//
// Ships are numbered the same way on both sides: ship 0 is the player; ship k (1 to 19) is plan.fleet[k - 1],
// whose captain id is report.captains[k - 1].
import type { ActiveId, AbilityId, PassiveId } from '../sim/abilities.ts';
import type { TemperamentId } from './captains.ts';
import type { Look } from './cosmetics.ts';
import type { Knowledge, PlayerHabits } from './habits.ts';
import type { Rank } from './ranks.ts';
import type { LevelProgress, XpPart } from './levels.ts';

/** One bot captain in a match. */
export interface FleetEntry {
  /** Stable captain id, as in CAPTAINS. */
  captain: string;
  name: string;
  temperament: TemperamentId;
  /** How well it sails, 0 (the gentlest) to 1 (the strongest Legend). */
  skill: number;
  /** The same skill in rating units: it should sail like a player of this rating. */
  rating: number;
  /** Its standing in the league, for the HUD and the death screen, such as "Gold II". */
  rank: string;
  active: ActiveId;
  passive: PassiveId;
  look: Look;
  /** True in the player's first match: a gentle captain plays softly and never hunts the player. */
  gentle: boolean;
  /** 0 to 3: how hard it hunts the player for having sunk it. */
  grudge: number;
  /** What it has learned of the player's habits. */
  knows: Knowledge;
}

/** The player's ship. */
export interface PlayerEntry {
  active: ActiveId;
  passive: PassiveId;
  look: Look;
  level: number;
  rank: string;
}

export interface MatchPlan {
  /** A seed for the match, drawn from the career so a replay of the career replays its matches. */
  seed: number;
  /** The player's first match: every captain is gentle. */
  first: boolean;
  player: PlayerEntry;
  /** The 19 captains, as ships 1 to 19. */
  fleet: FleetEntry[];
}

/** How one ship's match went. */
export interface ShipReport {
  /** 1 for the winner, 20 for the first ship sunk. */
  place: number;
  kills: number;
  /** Damage dealt to other ships, shield and hull together. */
  damage: number;
  /** Seconds afloat. */
  survived: number;
  /** Region indices (into REGIONS from src/sim/world/index.ts) the ship sailed through. */
  regions: number[];
  /** The ship that sank this one, or -1 for the winner and for ships the Storm or the sea took. */
  sunkBy: number;
}

export interface MatchReport {
  /** The captain ids of ships 1 to 19, in order: plan.fleet's captains. */
  captains: string[];
  /** Every ship, 0 being the player. */
  ships: ShipReport[];
  /** What the player did, for the captains to learn. Null when it was not measured. */
  habits: PlayerHabits | null;
}

/** A captain that did something worth telling the player about. */
export interface RivalNews {
  captain: string;
  what: 'sankYou' | 'sunkByYou' | 'grudge' | 'firstMeeting';
}

/** Everything the results screen and the ceremonies celebrate after a match. */
export interface MatchChanges {
  place: number;
  kills: number;
  xp: { parts: XpPart[]; total: number };
  level: { before: LevelProgress; after: LevelProgress; gained: number[] };
  rank: { before: Rank; after: Rank; change: 'up' | 'down' | 'same'; newTier: boolean };
  /** The hidden rating, for tuning and debug views; never shown as a number to the player. */
  rating: { before: number; after: number };
  unlocked: { abilities: AbilityId[]; cosmetics: string[] };
  /** Regions charted for the first time. */
  newRegions: number[];
  rivals: RivalNews[];
}
