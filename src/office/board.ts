// The seam's board and season review: the chairman's temper, his confidence
// over the season, the team's money and target, and what may be asked of him;
// and a season's review as the career's archive keeps it. Types only, built by
// career/views-board.ts and drawn by ui/office/board.ts.

import type { BoardAsk } from './command.ts';
import type { Face } from './career.ts';
import type { Act } from './people.ts';

/** A stat of the chairman's temper: its value (0…20) and what it means for you. */
export interface Temper {
  name: string;
  value: number;
  says: string;
}

/** A race of the season as the chairman saw it: confidence after it, and the team's place. */
interface Mark {
  round: number;
  planet: string;
  confidence: number;
  place: number;
}

/** A request of the board: what it gives, the confidence it wants, and whether it was put this season. */
export interface Request {
  ask: BoardAsk;
  name: string;
  gives: string;
  bar: number;
  /** This season's answer: granted, refused, or not yet asked (null). */
  asked: boolean | null;
  act: Act;
}

/** `board`. */
export interface BoardView {
  teamId: number;
  team: string;
  chairman: { person: number; name: string; face: Face };
  temper: readonly Temper[];
  confidence: number;
  /** Below `verdict` at the season's end, with the target missed by more than `missedBy` places, you are let go. */
  verdict: number;
  missedBy: number;
  rounds: number;
  marks: readonly Mark[];
  target: string;
  standing: string;
  budget: string;
  balance: string;
  floor: string;
  requests: readonly Request[];
  /** What a request costs in confidence, granted or refused. */
  costs: { granted: number; refused: number };
}

/** A team's move at a season's end: up or down a championship. */
interface Move {
  team: number;
  name: string;
  from: string;
  up: boolean;
}

/** `season`: a season's review, from the archive. */
export interface SeasonView {
  year: string;
  /** The seasons kept, newest first: each a year and its index (for the screen's choice). */
  seasons: readonly { season: number; year: string }[];
  season: number;
  teamId: number;
  team: string;
  tier: string;
  sacked: boolean;
  place: number;
  of: number;
  target: string;
  /** Places ahead of the target (negative: behind). */
  met: number;
  points: number;
  wins: number;
  podiums: number;
  sinkings: number;
  prize: string;
  confidence: number;
  honours: readonly string[];
  champions: readonly { tier: string; team: number; name: string }[];
  moves: readonly Move[];
  retired: readonly { person: number; name: string; role: string }[];
  arrivals: readonly {
    person: number;
    name: string;
    role: string;
    age: number;
  }[];
  rules: readonly { name: string; was: string; now: string }[];
}
