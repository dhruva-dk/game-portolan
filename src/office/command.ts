// The seam's words and its commands: the vocabulary the career and the office both name (roles, buildings, wants, an
// offer, a race plan) and the Command union every screen sends back. Types and constants only. Neither ui/ nor
// career/ imports the other; main.ts wires them.

import type { GunKind } from '../kinds.ts';
import type { Call, Colours, PartType, RaceResult } from '../race.ts';

/** The roles every person has one of. A reserve driver is a driver whose contract's status is 'reserve'. */
export type Role =
  | 'manager'
  | 'driver'
  | 'mechanic'
  | 'designer'
  | 'scout'
  | 'pit'
  | 'chairman';
/** The headquarters's nine buildings. */
export type Building =
  | 'factory'
  | 'designCentre'
  | 'towingTank'
  | 'compositesPlant'
  | 'simulator'
  | 'pitCentre'
  | 'scoutingCentre'
  | 'commercialCentre'
  | 'hospitality';
/** What a person wants of a team, three of them ranked. */
export type Want =
  | 'money'
  | 'status'
  | 'tier'
  | 'ambition'
  | 'security'
  | 'facilities'
  | 'home';
/** A rival manager's personality. */
export type Personality =
  | 'spender'
  | 'youthBuilder'
  | 'poacher'
  | 'engineer'
  | 'gambler'
  | 'steady';
/** A driver's place on her team: sailing a ship, or the reserve. Every other role's status is 'staff'. */
export type Status = 'ship' | 'reserve' | 'staff';
/** The three trades a team picks a supplier from each off-season. */
export type Trade = 'composites' | 'sailmaker' | 'hydraulics';
/** A ship of a team (race.ts TEAM of them): 0 is the player's on the player's team. */
export type Ship = 0 | 1 | 2 | 3;
/** A team's ships, in order. */
export const SHIPS: readonly Ship[] = [0, 1, 2, 3];
/** The mail's categories. */
export type MailCategory =
  | 'team'
  | 'market'
  | 'ship'
  | 'hq'
  | 'tier'
  | 'finance'
  | 'chairman';
/** What an Federation proposal changes. */
export type Measure =
  | 'spec'
  | 'storm'
  | 'ban'
  | 'pointsPerSinking'
  | 'seaHeldPoint'
  | 'prizeSpread'
  | 'inspection';

/** What the player may ask of their chairman: money, a lower debt floor, an easier target. */
export type BoardAsk = 'money' | 'floor' | 'target';

/** An offer to a person: wage and bonuses in money a race, length in seasons. */
export interface Offer {
  role: Role;
  status: Status;
  wage: number;
  fee: number;
  seasons: 1 | 2 | 3;
  podium: number;
  sinking: number;
  breakClause: number | null;
  replaces: number | null; // the person of the team whose post they take (released on signing), or null for an open post
}

/** The race plan of the player's team. */
export interface Plan {
  drivers: readonly number[]; // who sails each ship after the player's, in the ships' order
  parts: readonly { part: number; ship: Ship }[]; // which part on which ship
  objectives: readonly (number | null)[]; // by sponsor slot: the objective chosen, by index into that sponsor's list
  call: Call; // the team's call at the start
}

/** One part's share of the improvement's points, the two shares 0..1 summing to at most 1. */
export interface ImprovementShare {
  part: number;
  perf: number;
  reliability: number;
}

/** A refusal: a code for tests and a sentence for the player. `apply` never throws on a bad command. */
export interface Refusal {
  code: string;
  sentence: string;
}

/** What a screen asks of the career. Debug commands are accepted only when debug.ts enables them. */
export type Command =
  | {
      kind: 'Found';
      seed: number;
      team: string;
      colours: Colours;
      emblem: number;
      given: string;
      family: string;
      headshot: number;
    }
  | { kind: 'Advance' }
  | { kind: 'Snapshot' }
  | { kind: 'StartScout'; scout: number; person: number }
  | { kind: 'CancelScout'; scout: number }
  | { kind: 'OfferContract'; person: number; offer: Offer }
  | { kind: 'AcceptCounter'; person: number }
  | { kind: 'WithdrawOffer'; person: number }
  | { kind: 'Dismiss'; person: number }
  | { kind: 'SetImprovement'; shares: readonly ImprovementShare[] }
  | { kind: 'FitPart'; part: number; ship: Ship | null }
  | {
      kind: 'StartDesign';
      type: PartType;
      components: readonly string[];
      forNext: boolean;
    }
  | { kind: 'DealComponents'; type: PartType; slot: number }
  | { kind: 'Build'; building: Building }
  | { kind: 'SignSponsor'; offer: number; slot: number } // offer: the sponsor's id
  | { kind: 'ChooseSupplier'; trade: Trade; supplier: string }
  | { kind: 'Vote'; proposal: number; side: 'for' | 'against' | 'abstain' }
  | {
      kind: 'Lobby';
      proposal: number;
      side: 'for' | 'against';
      balance: number;
    }
  | { kind: 'AnswerDilemma'; mail: number; option: number }
  | { kind: 'MarkRead'; mail: number }
  | { kind: 'SetPlan'; plan: Plan }
  | { kind: 'RaceStarted'; round: number }
  | { kind: 'RecordRace'; result: RaceResult }
  | { kind: 'Forfeit'; round: number }
  | { kind: 'TakeJob'; team: number }
  | { kind: 'DeclineJob'; team: number }
  | { kind: 'AskBoard'; ask: BoardAsk }
  | { kind: 'DebugBalance'; balance: number }
  | { kind: 'DebugReveal' }
  | { kind: 'DebugToRaceDay' }
  | { kind: 'DebugToSeasonEnd' };

/** A command's kind, and the command of a kind. */
export type CommandKind = Command['kind'];
export type CommandOf<K extends CommandKind> = Extract<Command, { kind: K }>;

/** A proposal's change, as Phase B section 11 lists them. */
export type Change =
  | { measure: 'spec'; type: PartType; spec: boolean }
  | { measure: 'storm'; pace: number }
  | { measure: 'ban'; kind: GunKind }
  | { measure: 'pointsPerSinking'; points: number }
  | { measure: 'seaHeldPoint'; on: boolean }
  | { measure: 'prizeSpread'; spread: number }
  | { measure: 'inspection'; share: number };
