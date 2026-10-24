// Combat (PROMPT.md, A match: Combat). Part B builds it out (guns, rams, fire, rocks, hot water, repair); for now the
// hull model's one entry point, which the storm calls. A ship sets out with its full hull (state.ts fullHull).
import { sink } from './end.ts';
import type { MatchState } from './state.ts';

/** Ship i loses `amount` hull points to `by` (−1 none), of a CAUSE; with none left it sinks (end.ts sink). */
export function damage(state: MatchState, i: number, amount: number, by: number, cause: number): void {
  const ship = state.ships[i];
  ship.hull = Math.max(0, ship.hull - amount);
  if (ship.hull === 0) sink(state, i, by, cause);
}
