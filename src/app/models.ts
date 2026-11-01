// The interface's view models from the career: what each screen shows, read from the saved record. The screens never
// see the career itself, and the career never sees the screens.
import {
  careerRank, careerStats, cosmetic, levelOf, rivalsOf, wornLook, type Career,
} from '../career/index.ts';
import type { ActiveId, PassiveId } from '../sim/abilities.ts';
import type { LevelView, LobbyModel, PlayerView, RankView } from '../ui/model.ts';

export function levelView(c: Career): LevelView {
  const l = levelOf(c.xp);
  return { level: l.level, into: l.into, need: l.need };
}

export function rankView(c: Career): RankView {
  const r = careerRank(c);
  return { index: r.step.index, tier: r.step.tier, step: r.step.step, name: r.step.name, progress: r.progress, floored: r.floored };
}

const colourOf = (id: string, fallback: string): string => cosmetic(id)?.colour ?? fallback;

export function playerView(c: Career): PlayerView {
  const look = wornLook(c);
  return {
    name: 'Your ship', level: levelView(c), rank: rankView(c), bestTier: c.bestTier, emblem: look.emblem,
    colours: [colourOf(look.sailColour, '#f4ead6'), colourOf(look.hullPaint, '#5a3423')],
  };
}

/** The league's news for the lobby's ticker: each rival's grudge or the habit it has learned, by rivalry. */
function ticker(c: Career): string[] {
  const out: string[] = [];
  for (const r of rivalsOf(c)) {
    if (r.met === 0) continue;
    // the last line is the plain record; the ones before it are what the captain holds against you
    for (const line of r.lines.slice(0, -1)) out.push(`${r.captain.name} ${line[0].toLowerCase()}${line.slice(1)}`);
    if (out.length >= 3) break;
  }
  return out.length ? out.slice(0, 3) : ['Nineteen captains wait on the water.'];
}

export function lobbyModel(c: Career, news: LobbyModel['news'] = {}): LobbyModel {
  const s = careerStats(c);
  return {
    player: playerView(c), active: c.active as ActiveId, passive: c.passive as PassiveId, look: wornLook(c), news, ticker: ticker(c),
    stats: { matches: s.matches, wins: s.wins, top5: s.top5 },
  };
}
