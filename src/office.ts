// The seam between the career and the UI: the view models each management screen draws, built by the career, and the
// Command union every screen sends back. Types only. Neither ui/ nor career/ imports the other; main.ts wires them.
//
// The vocabulary both sides name (roles, buildings, wants, an offer, a race plan) is here, so a screen can build a
// command without reaching into career/. The career's own state (career/state.ts) is built from these words.

import type { GunKind } from './kinds.ts';
import type { Call, Colours, PartType, RaceResult } from './race.ts';
import type { PeopleDesk } from './office-people.ts';

/** The roles every person has one of (D37). A reserve driver is a driver whose contract's status is 'reserve'. */
export type Role =
  | 'manager'
  | 'driver'
  | 'mechanic'
  | 'designer'
  | 'scout'
  | 'pit'
  | 'chairman';
/** The headquarters's nine buildings (D29, Phase B section 9). */
export type Building =
  | 'factory'
  | 'drawingLoft'
  | 'testTank'
  | 'foundry'
  | 'sailingSchool'
  | 'pitHouse'
  | 'crowsNest'
  | 'fishMarket'
  | 'landingPad';
/** What a person wants of a team, three of them ranked (Phase B section 5). */
export type Want =
  | 'money'
  | 'status'
  | 'tier'
  | 'ambition'
  | 'security'
  | 'facilities'
  | 'home';
/** A rival manager's personality (Phase B section 6). */
export type Personality =
  | 'spender'
  | 'youthBuilder'
  | 'poacher'
  | 'engineer'
  | 'gambler'
  | 'steady';
/** A driver's place on her team: sailing a ship, or the reserve. Every other role's status is 'staff'. */
export type Status = 'ship' | 'reserve' | 'staff';
/** The three trades a team picks a supplier from each off-season (Phase B section 8.7). */
export type Trade = 'timber' | 'canvas' | 'cordage';
/** A ship of a team (race.ts TEAM of them): 0 is the player's on the player's team. */
export type Ship = 0 | 1 | 2 | 3;
/** A team's ships, in order. */
export const SHIPS: readonly Ship[] = [0, 1, 2, 3];
/** The mail's categories (Phase B section 12). */
export type MailCategory =
  | 'team'
  | 'market'
  | 'ship'
  | 'hq'
  | 'tier'
  | 'finance'
  | 'chairman';
/** What an Admiralty proposal changes (Phase B section 11). */
export type Measure =
  | 'spec'
  | 'storm'
  | 'ban'
  | 'pointsPerSinking'
  | 'seaHeldPoint'
  | 'prizeSpread'
  | 'inspection';

/** An offer to a person (Phase B section 5): wage and bonuses in Coin a race, length in seasons. */
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

/** The race plan of the player's team (Phase B section 13). */
export interface Plan {
  drivers: readonly number[]; // who sails each ship after the player's, in the ships' order
  parts: readonly { part: number; ship: Ship }[]; // which part on which ship
  objectives: readonly (number | null)[]; // by sponsor slot: the objective chosen, by index into that sponsor's list
  call: Call; // the team's call at the start
}

/** One part's share of the improvement's points (Phase B section 8.4), the two shares 0..1 summing to at most 1. */
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

/** What a screen asks of the career (Phase B section 14). Debug commands are accepted only when debug.ts enables them. */
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
  | { kind: 'DebugBalance'; balance: number }
  | { kind: 'DebugReveal' }
  | { kind: 'DebugToRaceDay' }
  | { kind: 'DebugToSeasonEnd' };

/** A command's kind, and the command of a kind. */
export type CommandKind = Command['kind'];
export type CommandOf<K extends CommandKind> = Extract<Command, { kind: K }>;

// ---- the screens' view models (Phase C): plain data, every figure with its comparison and its explanation, built by
// career/views.ts. A screen draws one and sends Commands; it keeps no career state and works out no rule.

/** A line of a figure's breakdown, as its explanation slip lists it: "800 stars". */
export interface Line {
  label: string;
  amount: string;
}
/** What a figure is made of: its lines, summing to it. */
export interface Explanation {
  title: string;
  lines: readonly Line[];
}
/** What a figure is set against: its rank ("4th of 40"), its change this season, or a rival's figure beside it. */
export type Comparison =
  | { kind: 'rank'; place: number; of: number }
  | { kind: 'change'; by: number; text: string }
  | { kind: 'rival'; label: string; text: string };
/** A number as a screen shows it: its value, its text, what it is set against, and what it is made of. */
export interface Figure {
  value: number;
  text: string;
  against: Comparison | null;
  explain: Explanation | null;
}

/** What a person's headshot is drawn from (ui/person.ts): their seed, role, age in years, and their team's colours and
 *  emblem (null: a free agent, on paper). */
export interface Face {
  seed: number;
  role: Role;
  age: number;
  colours: Colours | null;
  emblem: number | null;
}

/** What stops Continue, and the screen that answers it. */
export interface Blocker {
  screen: string;
  sentence: string;
}

/** The top bar (Phase C section 5): the player, their team, the date, the Coin, and Continue. */
export interface TopBar {
  name: string;
  face: Face;
  team: string;
  emblem: number;
  colours: Colours;
  date: string;
  balance: Figure;
  unread: number;
  dilemma: boolean;
  /** Continue's label ("Continue", "Race plan"), and what stops it (null: nothing). */
  go: { label: string; raceDay: boolean; blocker: Blocker | null };
}

/** A part as its mark shows it on a ship: its type, and whether its condition is below half. */
export interface PartMark {
  type: PartType;
  low: boolean;
  fitted: boolean;
}
/** A person as a line names them: id, face, full name. */
export interface Named {
  id: number;
  face: Face;
  name: string;
}
/** Half of home's Ships panel. */
export interface ShipHalf {
  ship: Ship;
  you: boolean;
  driver:
    | (Named & {
        stars: number;
        potential: number;
        morale: Figure;
        tags: readonly string[];
      })
    | null;
  mechanic: Named | null;
  bond: Figure;
  parts: readonly PartMark[];
}
/** A line of a tier table: place, team, points and the gap to the line above. */
export interface StandingLine {
  place: number;
  team: number;
  name: string;
  emblem: number;
  colours: Colours;
  points: number;
  gap: string;
  mine: boolean;
}
/** A letter as a list shows it. */
export interface LetterLine {
  id: number;
  day: number;
  subject: string;
  from: string;
  face: Face | null;
  category: MailCategory;
  unread: boolean;
  sealed: boolean;
}

/** `home`, the dashboard. */
export interface HomeView {
  top: TopBar;
  race: {
    heading: string;
    round: string;
    planet: { seed: number; name: string };
    days: Figure;
    target: Figure;
    confidence: Figure;
    sponsor: string | null;
  } | null;
  ships: readonly [ShipHalf, ShipHalf];
  improvement: {
    design: { type: PartType; days: Figure } | null;
    points: Figure;
    works: readonly { building: Building; level: number; days: number }[];
  };
  table: { tier: string; lines: readonly StandingLine[] };
  mail: { letters: readonly LetterLine[]; unread: number };
}

/** `found`: what the founding form offers and the line on the team it replaces. */
export interface FoundView {
  seed: number;
  team: string;
  given: string;
  family: string;
  headshot: number;
  age: number;
  colours: Colours;
  emblem: number;
  swatches: number;
  emblems: number;
  limits: { team: number; person: number };
  replacing: string;
}
/** What the founding form gets wrong, by field (a field missing is right). */
export interface FoundErrors {
  team?: string;
  colours?: string;
  emblem?: string;
  person?: string;
}

/** What the office asks of the career: the session on its store, the views, and the commands. main.ts makes one
 *  (desk.ts); a fixture is a desk on a memory store. */
export interface Desk extends PeopleDesk {
  /** Where the load left the career: founded, unfounded, or needing recovery. */
  where(): 'home' | 'found' | 'recover';
  home(): HomeView;
  top(): TopBar;
  found(seed: number, colours: Colours): FoundView;
  /** What a founding would be refused for, field by field (empty: it would be taken). */
  foundErrors(c: CommandOf<'Found'>): FoundErrors;
  recover(): RecoverView;
  settings(): SettingsView;
  /** Applies a command and journals it; the refusal's sentence, or null. */
  send(c: Command): Promise<string | null>;
  /** The way forward from recover. */
  recoverBy(way: 'retry' | 'carry' | 'restore' | 'new'): Promise<string | null>;
  backup(): Promise<string | null>;
  /** Called after every change the desk makes. */
  changed: (() => void) | null;
}

/** `recover`: what the load found and lost, and each way forward it allows. */
export interface RecoverView {
  found: string;
  lost: string;
  ways: readonly { way: 'retry' | 'carry' | 'restore'; label: string }[];
}

/** `settings`: the day of the last backup, if any. */
export interface SettingsView {
  backup: string;
}

/** A proposal's change, as Phase B section 11 lists them. */
export type Change =
  | { measure: 'spec'; type: PartType; spec: boolean }
  | { measure: 'storm'; pace: number }
  | { measure: 'ban'; kind: GunKind }
  | { measure: 'pointsPerSinking'; points: number }
  | { measure: 'seaHeldPoint'; on: boolean }
  | { measure: 'prizeSpread'; spread: number }
  | { measure: 'inspection'; share: number };
