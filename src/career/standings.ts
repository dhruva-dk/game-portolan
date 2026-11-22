// The championship's tables: a team's place in its tier, read from its standings.

import type { CareerState, Standing } from './state.ts';

/** Each tier's places by team, for each standings list already read (immutable, so its order never changes). */
const placed = new WeakMap<readonly Standing[], ReadonlyMap<number, number>>();

/** A team's place in its tier (1 best): by points, then wins, then the lower id. */
export function standingOf(s: CareerState, team: number): number {
  const standings = s.championships[s.teams[team].tier].standings;
  let places = placed.get(standings);
  if (!places) {
    const sorted = [...standings].sort(
      (a, b) => b.points - a.points || b.wins - a.wins || a.team - b.team
    );
    places = new Map(sorted.map((x, i) => [x.team, i + 1]));
    placed.set(standings, places);
  }
  return places.get(team) ?? 0;
}
