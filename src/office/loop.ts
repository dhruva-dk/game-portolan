// The views of the screens a season turns on: the team made (found), the race
// prepared (plan), its result, and the championship's standings. Plain data.

import type { Call } from '../race.ts';
import type { Replacing } from './career.ts';
import type { StandingLine } from './home.ts';
import type { Team, Verdict } from './office.ts';

/** What the team's making offers: names to start from, the liveries and emblems to choose among. */
export interface FoundView {
  team: string;
  given: string;
  family: string;
  /** The dyes a team may wear, each as the page shows it and its mark. */
  dyes: readonly (readonly [string, string])[];
  patterns: readonly string[];
  emblems: number;
  /** The championship the new team joins, and the team whose place it takes (its chairman and staff with it). */
  championship: string;
  replacing: Replacing;
  /** Why the last making asked was refused (null: none was). */
  refused: string | null;
}

/** The team as she makes it. */
export interface Founding {
  team: string;
  given: string;
  family: string;
  dye: number;
  pattern: number;
  emblem: number;
}

/** A ship of her team on race day: who sails her (stars 0…5 by halves; herself, none shown). */
interface PlanShip {
  name: string;
  stars: number | null;
  you: boolean;
}

/** Race day before the race: the race, her four ships, and the call her team sails under at the start. */
export interface PlanView {
  team: Team;
  round: number;
  rounds: number;
  name: string;
  championship: string;
  ships: readonly PlanShip[];
  call: Call;
  /** Why the race cannot be sailed yet (null: it can). */
  blocked: string | null;
  /** The other championships' races still being sailed elsewhere, once hers is done. */
  waiting: boolean;
}

/** A ship's line of the result: where she came, who sailed her, what she sank and scored. */
export interface ResultLine {
  place: number;
  /** Who sailed it (null: no one, an empty berth). */
  person: number | null;
  driver: string;
  team: Team;
  own: boolean;
  /** Whether she was afloat at the end. */
  afloat: boolean;
  sinkings: number;
  /** The second she sank at (null: afloat). */
  second: number | null;
  stops: number;
  points: number;
}

/** A race's result: its lines in order, her team's points of it, and how the chairman's target stands after it. */
export interface ResultView {
  title: string;
  lines: readonly ResultLine[];
  points: number;
  target: number;
  standing: Verdict;
  /** Her team's place in the championship after it. */
  place: number;
}

/** Where a team would go were the season ended now: up a championship, down one, or staying. */
export type Move = 'up' | 'down' | null;

/** A championship's tables, whole: its prize money, its teams (each one's prize and move as it stands) and drivers. */
export interface StandingsTable {
  championship: string;
  /** The prize money shared among its teams at the season's end. */
  pool: number;
  teams: readonly (StandingLine & {
    wins: number;
    podiums: number;
    sinkings: number;
    prize: number;
    move: Move;
  })[];
  drivers: readonly (StandingLine & { wins: number; podiums: number })[];
}

/** Every championship's tables, the round they stand after, and which is hers (`mine`, an index). */
export interface StandingsView {
  round: number;
  rounds: number;
  mine: number;
  championships: readonly StandingsTable[];
}
