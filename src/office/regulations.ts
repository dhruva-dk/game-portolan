// The Federation as your team sees it: your championship's rules this season
// and next (as voted so far), each said as it plays; the proposal standing, or
// the last, with what it changes, when its vote closes, how each team leans or
// voted and the sway each side has; your vote and what you may lobby; and the
// season's proposals already counted. Plain data.

import type { Act } from './people.ts';
import type { Team } from './office.ts';

/** A team's side on a proposal. */
export type Side = 'for' | 'against' | 'abstain';

/** A rule: its name, what it is this season and next, and what it does. */
export interface RuleLine {
  name: string;
  now: string;
  next: string;
  about: string;
}

/** A team of the championship on a proposal: its manager (null: none), its side (`cast`: voted; else how it leans), and
 *  its sway. */
export interface Leaning {
  team: Team;
  manager: { person: number; name: string } | null;
  you: boolean;
  side: Side;
  cast: boolean;
  sway: number;
}

/** A proposal: the rule it changes, from what next season's rules read to what; when its vote closes; whether it was
 *  carried (null: the vote is to come) and by how many. */
export interface ProposalLine {
  id: number;
  rule: string;
  from: string;
  to: string;
  closes: string;
  days: number;
  carried: boolean | null;
  count: { for: number; against: number; abstain: number };
}

/** A sum you may lobby, and whether you may now. */
interface Lobbying {
  balance: number;
  act: Act;
}

export interface RegulationsView {
  championship: string;
  season: number;
  rules: readonly RuleLine[];
  /** The proposal standing, else the last counted (null: none this season): its teams, each side's sway (lobbied
   *  money's in it) and the money lobbied each way, your side (null: not cast), your vote's state and the sums you may
   *  lobby. */
  proposal:
    | (ProposalLine & {
        teams: readonly Leaning[];
        sway: { for: number; against: number };
        lobbied: { for: number; against: number };
        yours: Side | null;
        vote: Act;
        sums: readonly Lobbying[];
      })
    | null;
  /** The season's proposals counted, the newest first. */
  counted: readonly ProposalLine[];
  /** When the Federation puts its next proposal (null: none this season). */
  next: string | null;
}
