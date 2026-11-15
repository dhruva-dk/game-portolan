// What the HUD reads of her race's own (player.ts Race): her crewmate's hull and where she lies, the call in force,
// her flight and her faults; and, for the `?bots` overlay (debug.ts), each bot labelled (player.ts BotTag).
//
// Pure: no three, no page.

import type { Captain } from '../race.ts';
import type { Eye } from '../snapshot.ts';
import type { BotTag, Race } from '../player.ts';
import { PLAYER } from '../sim/match.ts';
import type { State } from './state.ts';
import { onScreen } from './lens.ts';
import { hash } from '../world/random.ts';

/** Her race's own, as it stands; null outside a race. */
export function raceOf(state: State): Race | null {
  const hers = state.upkept(PLAYER);
  if (!hers) return null;
  const id = PLAYER + 1, mate = state.crew(id), there = state.upkept(id), card = state.card(), ship = card?.ships[id];
  return {
    mate: mate && state.sideOf(id) === state.sideOf(PLAYER)
      ? {
        hull: Math.max(0, mate.health.hull), hullMax: state.hullOf(id), where: mate.health.hull <= 0 ? 'sunk' : there?.home ? 'home' : 'sailing',
        // (her face from the card's seed and her ship's id: the same gull for the same race, wherever it is replayed)
        face: card && ship ? { seed: hash(card.seed, id), colours: ship.colours } : null,
      }
      : null,
    call: state.called(),
    flight: { can: hers.can, coming: hers.stop?.coming ?? null, job: hers.stop?.job ?? null, botched: hers.stop?.botched ?? false },
    faults: hers.failed,
  };
}

/** A captain's stats in brief: Gunnery, Helm, Lookout, Nerve, Seamanship. */
const brief = (c: Captain | null) => {
  if (!c) return '';
  const s = (k: keyof Captain['stats']) => Math.round(c.stats[k]);
  return `G${s('gunnery')} H${s('helm')} L${s('lookout')} N${s('nerve')} S${s('seamanship')}`;
};

/** A captain's style (race.ts Style), or null. */
const sortOf = (c: Captain | null) => {
  if (!c) return null;
  const { style } = c;
  return style;
};

/** Every bot afloat labelled for the overlay, through `eye` on a view `width` × `height` CSS px. */
export function botTags(state: State, eye: Eye, width: number, height: number): BotTag[] {
  const at = new Map(state.vessels().map((v) => [v.id, v.ship.at]));
  return state.bots().map((b): BotTag => {
    const here = at.get(b.id)!, p = width > 0 ? onScreen(eye, here, width, height, 12) : null;
    return {
      id: b.id, sort: sortOf(b.captain), mode: b.mode, target: b.foe, stats: brief(b.captain),
      // (on the screen, room left for her label's width)
      seen: p && p.x > 60 && p.x < width - 60 && p.y > 30 && p.y < height ? p : null, at: here, to: at.get(b.foe) ?? null,
    };
  });
}
