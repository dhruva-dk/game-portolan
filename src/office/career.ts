// The career's views (the screens' view models), built by career/views*.ts: plain data, every figure with its
// comparison and its explanation. A screen draws one and sends Commands; it keeps no career state and works out no
// rule. Types only.

import type { Colours, PartType } from '../race.ts';
import type {
  Building,
  Command,
  CommandOf,
  MailCategory,
  Role,
  Ship,
} from './command.ts';
import type { PeopleDesk } from './people.ts';

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

/** What a person's portrait is drawn from: their seed, role, age in years, and their team's colours and
 *  emblem (null: a free agent, on paper). */
export interface Face {
  seed: number;
  role: Role;
  age: number;
  colours: Colours | null;
  emblem: number | null;
}

/** What stops Continue, and the screen that answers it. */
interface Blocker {
  screen: string;
  sentence: string;
}

/** The top bar (Phase C section 5): the player, their team, the date, the balance, and Continue. */
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
interface PartMark {
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
  ships: readonly ShipHalf[];
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
  dyes: number;
  patterns: number;
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
export interface CareerDesk extends PeopleDesk {
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
