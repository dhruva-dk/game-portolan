// A team's page (Rival): any team of the career as her team sees it, her own
// too. Who runs it (the manager, how they spend and what they see to first,
// how secure their post; the chairman and the place they want), how its season
// stands, the team against its championship, and everyone on its books, each
// with what opens their page. Plain data.

import type { HomeView } from './home.ts';
import type { Move } from './loop.ts';
import type { Team, Verdict } from './office.ts';
import type { Range } from './people.ts';

/** Someone on the team's books: their post (Ship 1, Reserve, Designer) and their stars as her team knows them. */
export interface Hand {
  person: number;
  name: string;
  post: string;
  stars: Range;
}

export interface RivalView {
  team: Team;
  /** Her own team's page. */
  own: boolean;
  championship: string;
  /** The championship's tier (0 the First), for the way to its standings. */
  tier: number;
  /** The colony it sails from. */
  port: string;
  /** 0…100. */
  reputation: number;
  /** Its manager (null: the post is open). `personality`: what they are (null: hers, the player's); `spends`, the share
   *  of what the books allow they commit; `first`, what they see to first, in their order. */
  manager: {
    person: number;
    name: string;
    you: boolean;
    personality: string | null;
    spends: number | null;
    first: readonly string[];
    security: Verdict;
  } | null;
  /** Its chairman: the place they ask for, or better, and how the team stands to it. */
  chairman: { person: number; name: string; target: number; standing: Verdict };
  /** Its season: its place of `of`, its tally, the leader's points and hers (null on her own page), the prize at its
   *  place, and where the season's end would move it. */
  season: {
    round: number;
    rounds: number;
    place: number;
    of: number;
    points: number;
    wins: number;
    podiums: number;
    sinkings: number;
    leader: number;
    hers: number | null;
    prize: number;
    move: Move;
  };
  /** The team against its championship, as Home's are. */
  stats: HomeView['stats'];
  /** Its drivers: each ship's and the reserve, where each stands in the drivers' table (null: not yet sailed). */
  drivers: readonly (Hand & { place: number | null; points: number })[];
  /** Its staff: the mechanics, the designer, the scouts, the pit crew. */
  staff: readonly Hand[];
}
