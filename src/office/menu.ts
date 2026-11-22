// The main menu's view: what its four ways show. A new career (how many
// championships and teams it has), the career kept on this device to continue
// (none: that way is unavailable), and the single race (its seed's name, its
// ships). Plain data.

import type { Team } from './office.ts';

export interface MenuView {
  career: { championships: number; teams: number };
  /** The career kept: her team and the date it stands at. */
  kept: { team: Team; date: string } | null;
  single: { seed: string; ships: number };
}
