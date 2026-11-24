// The career's archive: a compact summary of each season the player managed,
// kept at its end (Player.seasons) for its review. Where the team finished
// against its target, what it won, who moved up and down, the champions, who
// retired and who came, and the rules turned for next season.

import { newsworthy } from './ageing.ts';
import { prizeAt } from './money.ts';
import { potential } from './stars.ts';
import type { CareerState, SeasonLine } from './state.ts';
import { standingOf } from './standings.ts';

/** How many of the season's newcomers are kept: the most promising. */
const ARRIVALS = 5;

/** A state with the season just ended kept in the player's archive. `s` the state as it ended (standings whole), `out`
 *  after its retirements and newcomers; `order` each tier's final order, `moves` each team's move (−1 up, +1 down). */
export function archived(
  s: CareerState,
  out: CareerState,
  order: readonly (readonly number[])[],
  moves: ReadonlyMap<number, number>
): CareerState {
  const p = out.player;
  if (!p) return out;
  const c = s.teams[p.team],
    l = s.championships[c.tier],
    place = standingOf(s, c.id),
    st = l.standings.find((x) => x.team === c.id);
  const line: SeasonLine = {
    season: s.season,
    team: c.id,
    tier: c.tier,
    sacked: p.sacked,
    place,
    of: l.teams.length,
    target: c.target,
    points: st?.points ?? 0,
    wins: st?.wins ?? 0,
    podiums: st?.podiums ?? 0,
    sinkings: st?.sinkings ?? 0,
    prize: p.sacked ? 0 : prizeAt(s, c.tier, place),
    confidence: c.confidence,
    champions: order.map((teams) => teams[0] ?? -1),
    moves: [...moves].map(([team, move]) => ({
      team,
      tier: s.teams[team].tier,
      move,
    })),
    retired: out.people
      .filter(
        (g) =>
          g.retired !== null &&
          s.people[g.id]?.retired === null &&
          newsworthy(s, g)
      )
      .map((g) => g.id),
    arrivals: out.people
      .slice(s.people.length)
      .sort((a, b) => potential(b) - potential(a) || a.id - b.id)
      .slice(0, ARRIVALS)
      .map((g) => g.id),
    rules: l.rules,
    next: l.next,
  };
  return { ...out, player: { ...p, seasons: [...p.seasons, line] } };
}
