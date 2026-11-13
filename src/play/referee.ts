// The match's course for the player (sim/match.ts) kept by what the game reports each frame, and what it means for
// the camera: hers while she fights, the hands on it; once she has sunk, the ship she watches, cut to and
// then flown between, the hands off; on a win, drawn back circling her, the hands off.

import { startMatch, stepMatch, tapped, type MatchState } from '../sim/match';
import type { Game } from './game';

export function createReferee(game: Game) {
  let m: MatchState | null = null;
  const aim = (s: MatchState) => game.view({
    watch: s.watch, move: s.move, hands: s.phase === 'fighting', circle: s.phase === 'won',
  });
  return {
    /** A match begun. */
    begin() {
      m = startMatch();
      aim(m);
    },
    /** No match: the lobby's quiet sea. */
    end() {
      m = null;
    },
    /** A tap while the end is shown. */
    tap() {
      if (m) m = tapped(m);
    },
    /** The match after a frame of dt seconds, or null with none. */
    update(dt: number): MatchState | null {
      if (!m) return null;
      const was = m;
      m = stepMatch(m, { sinkings: game.sinkings(), alive: game.alive() }, dt);
      if (m.watch !== was.watch || m.phase !== was.phase) aim(m);
      return m;
    },
  };
}

export type Referee = ReturnType<typeof createReferee>;
