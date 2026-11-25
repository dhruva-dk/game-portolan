import {
  PLAYER,
  startMatch,
  stepMatch,
  switched,
  type MatchState,
  type Report,
} from '../sim/match.ts';
import type { End } from './player.ts';
import { FINALE } from './finale.ts';
import type { Game } from './game.ts';

export function createReferee(game: Game) {
  let m: MatchState | null = null,
    of = 0,
    watching = false,
    pick: (() => number | null) | null = null,
    followed: number | null = null;
  const report: Report = {
    sinkings: [],
    alive: [],
    share: 0,
    race: { teams: [], over: false, place: 0 },
  };
  const aim = (s: MatchState) =>
    game.view({
      watch: watching ? (followed ?? s.watch) : PLAYER,
      hands: s.phase === 'fighting',
      look: s.phase === 'fighting' || watching,
      end:
        s.phase === 'won'
          ? 'won'
          : s.phase === 'spectating' && !watching
            ? 'sunk'
            : null,
    });
  return {
    begin() {
      m = startMatch();
      of = game.alive().length;
      watching = false;
      pick = null;
      followed = null;
      aim(m);
    },
    end() {
      m = null;
    },
    watch(chosen?: () => number | null) {
      if (!m || m.phase !== 'spectating') return;
      watching = true;
      pick = chosen ?? null;
      followed = pick?.() ?? null;
      aim(m);
    },
    switch(by: number) {
      if (!m || !watching) return;
      m = switched(m, game.alive(), by);
      aim(m);
    },
    update(dt: number): End | null {
      const race = game.race();
      if (!m || !race) return null;
      const was = m;
      report.sinkings = game.sinkings();
      report.alive = game.alive();
      report.share = game.share();
      report.race = race;
      m = stepMatch(m, report, dt);
      const lost =
        pick !== null && followed !== null && !report.alive.includes(followed);
      if (lost) followed = pick?.() ?? null;
      if (lost || m.watch !== was.watch || m.phase !== was.phase) aim(m);
      if (m.phase === 'fighting' || m.place === null) return null;
      const how = m.phase === 'won' ? 'won' : (m.sunk?.cause ?? 'shot');
      return {
        how,
        gun: m.phase === 'won' ? null : (m.sunk?.gun ?? null),
        place: m.place,
        of,
        share: m.share,
        afloat: report.alive.length,
        settled: m.since >= FINALE[m.phase === 'won' ? 'won' : 'sunk'].beat,
        over: m.over,
      };
    },
  };
}

export type Referee = ReturnType<typeof createReferee>;
