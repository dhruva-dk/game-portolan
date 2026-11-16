// The seam between the career and the UI: the view models each management screen draws, built by the career, and the
// Command union every screen sends back. Types only. Neither ui/ nor career/ imports the other; main.ts wires them.
//
// The vocabulary both sides name (roles, buildings, wants, an offer, a race plan) is here, so a screen can build a
// command without reaching into career/. The career's own state (career/state.ts) is built from these words.

import type { GunKind } from './kinds';
import type { Call, Colours, Job, PartType, RaceResult, Stance } from './race';
import type { PeopleDesk } from './office-people';

/** The roles every gull has one of (D37). A reserve captain is a captain whose contract's status is 'reserve'. */
export type Role = 'manager' | 'captain' | 'bosun' | 'shipwright' | 'scout' | 'flight' | 'elder';
/** The rookery's nine buildings (D29, Phase B section 9). */
export type Building = 'factory' | 'drawingLoft' | 'testTank' | 'foundry' | 'sailingSchool' | 'flightLoft' | 'crowsNest' | 'fishMarket' | 'landingPad';
/** What a gull wants of a crew, three of them ranked (Phase B section 5). */
export type Want = 'money' | 'status' | 'league' | 'ambition' | 'security' | 'facilities' | 'home';
/** A rival manager's personality (Phase B section 6). */
export type Personality = 'spender' | 'youthBuilder' | 'poacher' | 'engineer' | 'gambler' | 'steady';
/** A captain's place on her crew: sailing ship two, or the reserve. Every other role's status is 'staff'. */
export type Status = 'ship' | 'reserve' | 'staff';
/** The three trades a crew picks a supplier from each off-season (Phase B section 8.7). */
export type Trade = 'timber' | 'canvas' | 'cordage';
/** A ship of a crew: 0 is ship one (the player's on the player's crew), 1 ship two. */
export type Ship = 0 | 1;
/** The mail's categories (Phase B section 12). */
export type MailCategory = 'crew' | 'market' | 'ship' | 'rookery' | 'league' | 'finance' | 'elder';
/** What an Admiralty proposal changes (Phase B section 11). */
export type Measure = 'spec' | 'storm' | 'ban' | 'pointsPerSinking' | 'seaHeldPoint' | 'prizeSpread' | 'inspection';

/** An offer to a gull (Phase B section 5): wage and bonuses in Coin a race, length in seasons. */
export interface Offer {
  role: Role;
  status: Status;
  wage: number;
  fee: number;
  seasons: 1 | 2 | 3;
  podium: number;
  sinking: number;
  breakClause: number | null;
  replaces: number | null;                           // the gull of the crew whose post they take (released on signing), or null for an open post
}

/** The race plan of the player's crew (Phase B section 13). */
export interface Plan {
  captain: number;                                   // the gull who sails ship two
  parts: readonly { part: number; ship: Ship }[];    // which part on which ship
  stance: Stance;                                    // ship two's
  order: readonly Job[];                             // the flight's job order
  jobs: Readonly<Record<Job, number>>;               // which flight gull works which job
  objectives: readonly (number | null)[];            // by patron slot: the objective chosen, by index into that patron's list
  call: Call;                                        // the wheel's call at the start
}

/** One part's share of the yard's points (Phase B section 8.4), the two shares 0..1 summing to at most 1. */
export interface YardShare { part: number; perf: number; reliability: number }

/** A refusal: a code for tests and a sentence for the player. `apply` never throws on a bad command. */
export interface Refusal { code: string; sentence: string }

/** What a screen asks of the career (Phase B section 14). Debug commands are accepted only when debug.ts enables them. */
export type Command =
  | { kind: 'Found'; seed: number; crew: string; colours: Colours; emblem: number; given: string; family: string; headshot: number }
  | { kind: 'Advance' }
  | { kind: 'Snapshot' }
  | { kind: 'StartScout'; scout: number; gull: number }
  | { kind: 'CancelScout'; scout: number }
  | { kind: 'OfferContract'; gull: number; offer: Offer }
  | { kind: 'AcceptCounter'; gull: number }
  | { kind: 'WithdrawOffer'; gull: number }
  | { kind: 'Dismiss'; gull: number }
  | { kind: 'MoveFlightJob'; gull: number; job: Job }
  | { kind: 'SetYard'; shares: readonly YardShare[] }
  | { kind: 'FitPart'; part: number; ship: Ship | null }
  | { kind: 'StartDesign'; type: PartType; components: readonly string[]; forNext: boolean }
  | { kind: 'DealComponents'; type: PartType; slot: number }
  | { kind: 'Build'; building: Building }
  | { kind: 'SignPatron'; offer: number; slot: number }               // offer: the patron's id
  | { kind: 'ChooseSupplier'; trade: Trade; supplier: string }
  | { kind: 'Vote'; proposal: number; side: 'for' | 'against' | 'abstain' }
  | { kind: 'Lobby'; proposal: number; side: 'for' | 'against'; coin: number }
  | { kind: 'AnswerDilemma'; mail: number; option: number }
  | { kind: 'MarkRead'; mail: number }
  | { kind: 'SetPlan'; plan: Plan }
  | { kind: 'RaceStarted'; round: number }
  | { kind: 'RecordRace'; result: RaceResult }
  | { kind: 'Forfeit'; round: number }
  | { kind: 'TakeJob'; crew: number }
  | { kind: 'DeclineJob'; crew: number }
  | { kind: 'DebugCoin'; coin: number }
  | { kind: 'DebugReveal' }
  | { kind: 'DebugToRaceDay' }
  | { kind: 'DebugToSeasonEnd' };

/** A command's kind, and the command of a kind. */
export type CommandKind = Command['kind'];
export type CommandOf<K extends CommandKind> = Extract<Command, { kind: K }>;

// ---- the screens' view models (Phase C): plain data, every figure with its comparison and its explanation, built by
// career/views.ts. A screen draws one and sends Commands; it keeps no career state and works out no rule.

/** A line of a figure's breakdown, as its explanation slip lists it: "800 stars". */
export interface Line { label: string; amount: string }
/** What a figure is made of: its lines, summing to it. */
export interface Explanation { title: string; lines: readonly Line[] }
/** What a figure is set against: its rank ("4th of 40"), its change this season, or a rival's figure beside it. */
export type Comparison =
  | { kind: 'rank'; place: number; of: number }
  | { kind: 'change'; by: number; text: string }
  | { kind: 'rival'; label: string; text: string };
/** A number as a screen shows it: its value, its text, what it is set against, and what it is made of. */
export interface Figure { value: number; text: string; against: Comparison | null; explain: Explanation | null }

/** What a gull's headshot is drawn from (ui/gull.ts): their seed, role, age in years, and their crew's colours and
 *  emblem (null: a free agent, on paper). */
export interface Face { seed: number; role: Role; age: number; colours: Colours | null; emblem: number | null }

/** What stops Continue, and the screen that answers it. */
export interface Blocker { screen: string; sentence: string }

/** The top bar (Phase C section 5): the player, their crew, the date, the Coin, and Continue. */
export interface TopBar {
  name: string; face: Face; crew: string; emblem: number; colours: Colours;
  date: string; coin: Figure;
  unread: number; dilemma: boolean;
  /** Continue's label ("Continue", "Race plan"), and what stops it (null: nothing). */
  go: { label: string; raceDay: boolean; blocker: Blocker | null };
}

/** A part as its mark shows it on a ship: its type, and whether its condition is below half. */
export interface PartMark { type: PartType; low: boolean; fitted: boolean }
/** A gull as a line names them: id, face, full name. */
export interface Named { id: number; face: Face; name: string }
/** Half of home's Ships panel. */
export interface ShipHalf {
  ship: Ship; you: boolean;
  captain: (Named & { stars: number; potential: number; morale: Figure; tags: readonly string[] }) | null;
  bosun: Named | null; bond: Figure; parts: readonly PartMark[];
}
/** A line of a league table: place, crew, points and the gap to the line above. */
export interface StandingLine { place: number; crew: number; name: string; emblem: number; colours: Colours; points: number; gap: string; mine: boolean }
/** A letter as a list shows it. */
export interface LetterLine { id: number; day: number; subject: string; from: string; face: Face | null; category: MailCategory; unread: boolean; sealed: boolean }

/** `home`, the dashboard. */
export interface HomeView {
  top: TopBar;
  race: {
    heading: string; round: string; planet: { seed: number; name: string }; days: Figure;
    target: Figure; confidence: Figure; patron: string | null;
  } | null;
  ships: readonly [ShipHalf, ShipHalf];
  yard: { design: { type: PartType; days: Figure } | null; points: Figure; works: readonly { building: Building; level: number; days: number }[] };
  table: { league: string; lines: readonly StandingLine[] };
  mail: { letters: readonly LetterLine[]; unread: number };
}

/** `found`: what the founding form offers and the line on the crew it replaces. */
export interface FoundView {
  seed: number; crew: string; given: string; family: string; headshot: number; age: number;
  colours: Colours; emblem: number;
  swatches: number; emblems: number;
  limits: { crew: number; gull: number };
  replacing: string;
}
/** What the founding form gets wrong, by field (a field missing is right). */
export interface FoundErrors { crew?: string; colours?: string; emblem?: string; gull?: string }

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
export interface RecoverView { found: string; lost: string; ways: readonly { way: 'retry' | 'carry' | 'restore'; label: string }[] }

/** `settings`: the day of the last backup, if any. */
export interface SettingsView { backup: string }

/** A proposal's change, as Phase B section 11 lists them. */
export type Change =
  | { measure: 'spec'; type: PartType; spec: boolean }
  | { measure: 'storm'; pace: number }
  | { measure: 'ban'; kind: GunKind }
  | { measure: 'pointsPerSinking'; points: number }
  | { measure: 'seaHeldPoint'; on: boolean }
  | { measure: 'prizeSpread'; spread: number }
  | { measure: 'inspection'; share: number };
