// Home's view: exactly what its panels show. Her team (its emblem, its
// championship, its four drivers and where each stands), the chairman (how
// happy, how secure her job, the season's objective), the team's five stats
// against the championship's best and the grid's average, the news, the work
// under way, the next race, and the standings. Plain data.

import type { Tab, Team, Verdict, Viewed } from './office.ts';

/** A driver of her team as the team panel names them: where they stand in the drivers' table. */
interface HomeDriver {
  name: string;
  place: number;
}

/** One of the team's stats, each a share (0…1) of the chart's height: hers, the championship's best, the grid's average. */
interface TeamStat {
  name: string;
  value: number;
  best: number;
  average: number;
}

/** What a piece of news pictures. */
export type NewsKind = 'building' | 'part' | 'driver' | 'sponsor' | 'vote';

/** The news: its headline, what it is about, where that stands, and the screen its button opens. */
interface News {
  kind: NewsKind;
  headline: string;
  subject: string;
  status: string;
  screen: Tab | Viewed;
}

/**
 * A job under way: who or what it is on (a driver scouted is shown by their
 * team's emblem), how far it has got (0…1), the days left, and what its
 * details button says.
 */
interface Job {
  id: string;
  name: string;
  team: Team | null;
  done: number;
  days: number;
  details: string;
}

/** The jobs of one kind (scouting, part design, a building), as the panel's chip names the kind. */
interface Work {
  kind: string;
  jobs: readonly Job[];
}

/** A line of a table: a team's, or a driver's with their team; `ruled`, a line under it (the places that go up). */
export interface StandingLine {
  place: number;
  name: string;
  team: Team;
  points: number;
  own: boolean;
  ruled: boolean;
}

export interface HomeView {
  team: Team;
  championship: string;
  drivers: readonly HomeDriver[];
  chairman: {
    /** 0 disappointed … 1 happy. */
    happiness: number;
    security: Verdict;
    /** The place the season's objective asks for, or better, and how she stands to it. */
    target: number;
    standing: Verdict;
  };
  stats: readonly TeamStat[];
  news: News | null;
  work: readonly Work[];
  /** The race to come: the `round`th of the season's `rounds`, and its sea's name. */
  next: { round: number; rounds: number; name: string };
  standings: {
    teams: readonly StandingLine[];
    drivers: readonly StandingLine[];
  };
}
