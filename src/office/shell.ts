// What the office's shell shows round every screen: the strip across the top
// (her team, her balance, the championship, the next race, what waits to be
// read) and the nav along the bottom (what each tab carries, the date, the way
// on). Plain data.

import type { Tab, Team } from './office.ts';

/** What a tab of the nav carries besides its name: a count to be seen to, work under way there. */
interface TabMark {
  count?: number;
  busy?: boolean;
}

export interface ShellView {
  team: Team;
  balance: number;
  /** The championship her team sails in, as the standings chip names it. */
  championship: string;
  /** The next race: its planet's name, and the days until it (0: today). */
  next: { name: string; days: number };
  /** What waits to be read, as the bell counts it. */
  notices: number;
  date: string;
  marks: Readonly<Partial<Record<Tab, TabMark>>>;
  /** The way on, as its button says it ("Continue"). */
  on: string;
}
