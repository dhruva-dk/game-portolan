// The match's course for the player (sim/match.ts) kept by what the game reports each frame, and what it means for
// the camera: hers while she fights, the hands on it; at her end, sunk or won, held on her ship in its shot
// (finale.ts), the hands off; once she has sunk and chooses to watch, the ship she watches, flown to, and another
// when she turns to it. What the screens show of her end is reported plainly (player.ts End).

import { PLAYER, startMatch, stepMatch, switched, type MatchState } from '../sim/match';
import type { End } from '../player';
import { FINALE } from './finale';
import type { Game } from './game';

export function createReferee(game: Game) {
  let m: MatchState | null = null, of = 0, watching = false;
  const aim = (s: MatchState) => game.view({
    watch: watching ? s.watch : PLAYER, hands: s.phase === 'fighting',
    end: s.phase === 'won' ? 'won' : s.phase === 'spectating' && !watching ? 'sunk' : null,
  });
  return {
    /** A match begun. */
    begin() {
      m = startMatch();
      of = game.alive().length;
      watching = false;
      aim(m);
    },
    /** No match: the lobby's quiet sea. */
    end() {
      m = null;
    },
    /** Sunk, she watches the ship she would (the one that sank her, or on), flown to. */
    watch() {
      if (!m || m.phase !== 'spectating') return;
      watching = true;
      aim(m);
    },
    /** Sunk, she skips to the race's result: she watches (as watch()) while it runs on to its end, fast. */
    skip() {
      if (!m || m.phase !== 'spectating') return;
      watching = true;
      aim(m);
      game.skip();
    },
    /** Watching, she turns to the next ship afloat (+1) or the one before (−1). */
    switch(by: number) {
      if (!m || !watching) return;
      m = switched(m, game.alive(), by);
      aim(m);
    },
    /** The match after a frame of dt seconds: her end as the screens show it, or null while she fights or with no
     *  match. */
    update(dt: number): End | null {
      if (!m) return null;
      const was = m;
      m = stepMatch(m, { sinkings: game.sinkings(), alive: game.alive(), share: game.share(), sideOf: game.sideOf }, dt);
      if (m.watch !== was.watch || m.phase !== was.phase) aim(m);
      if (m.phase === 'fighting' || m.place === null) return null;
      const how = m.phase === 'won' ? 'won' : m.sunk?.cause ?? 'shot';
      // once the race is over, her place is its finishing order's (play/result.ts)
      const order = game.result()?.order, place = m.over && order ? order.indexOf(PLAYER) + 1 : m.place;
      return {
        how, place, of, share: m.share, afloat: game.alive().length,
        settled: m.since >= FINALE[m.phase === 'won' ? 'won' : 'sunk'].beat, over: m.over,
      };
    },
  };
}

export type Referee = ReturnType<typeof createReferee>;
