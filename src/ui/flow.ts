// The screens' order, as a small state machine:
//   title → (tap, once the world is ready) → lobby → (PLAY) → drop → (its countdown) → match → (the match ends) →
//   result → (tap) → lobby
// with the rank folio and settings opened over the lobby, and the full map over the drop or the match. The HUD shows
// in the drop and the match only. Nothing happens by script: every step is a tap, or the match's own clock or end.

import type { createGlobe } from './globe';
import { clock, type HudState, type createHud } from './hud';
import { createDrop, createLobby, createRank, createResult, createSettings, createTitle, type Career, type Settings } from './screens';

export const SCREENS = ['title', 'lobby', 'drop', 'match', 'result'] as const;
export type Screen = (typeof SCREENS)[number];
export const isScreen = (s: string): s is Screen => (SCREENS as readonly string[]).includes(s);

/** The gale's countdown, seconds. */
const DROP = 10;
const KEY = 'portolan.settings';

/** Settings kept on the device; never required (a private window may refuse them). */
function loadSettings(): Settings {
  try {
    return { sound: 0.8, look: 0.5, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') };
  } catch {
    return { sound: 0.8, look: 0.5 };
  }
}
function saveSettings(s: Settings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // kept for this session only
  }
}

export function createFlow(hud: ReturnType<typeof createHud>, globe: ReturnType<typeof createGlobe>, career: () => Career, start: Screen) {
  let screen: Screen = start, drop = DROP, settings = loadSettings(), afloat = 0;
  let rank: ReturnType<typeof createRank> | null = null;

  const title = createTitle(() => go('lobby'));
  const openRank = () => {
    rank = createRank(career(), () => {
      rank?.root.remove();
      rank = null;
    });
    rank.show(true);
  };
  const lobby = createLobby({ play: () => go('drop'), rank: openRank, settings: () => settingsFolio.show(true) });
  const settingsFolio = createSettings(() => settings, (s) => {
    settings = s;
    saveSettings(s);
  }, () => settingsFolio.show(false));
  const countdown = createDrop();
  const result = createResult(() => go('lobby'));

  function go(next: Screen, place = 1) {
    screen = next;
    title.show(next === 'title');
    lobby.show(next === 'lobby', career());
    if (next !== 'lobby') settingsFolio.show(false);
    hud.root.style.display = next === 'drop' || next === 'match' ? 'block' : 'none';
    if (next !== 'drop' && next !== 'match') globe.close();
    if (next === 'drop') drop = DROP;
    countdown.show(next === 'drop' ? drop : null);
    result.show(next === 'result', { place, afloat: clock(afloat), career: career() });
    if (next === 'match') afloat = 0;
  }
  go(start);

  return {
    get screen() {
      return screen;
    },
    get settings() {
      return settings;
    },
    /** The world is ready to be shown. */
    ready: () => title.ready(),
    /** The match has ended for her, in `place`. */
    end: (place: number) => go('result', place),
    go,
    /** Opens a folio over the lobby. */
    open(folio: 'rank' | 'settings') {
      if (folio === 'rank') openRank();
      else settingsFolio.show(true);
    },
    update(dt: number, s: HudState) {
      if (screen === 'drop') {
        drop -= dt;
        countdown.show(drop);
        if (drop <= 0) go('match');
      }
      if (screen === 'drop' || screen === 'match') {
        afloat += dt;
        hud.update(s);
        globe.update(s);
      }
    },
  };
}
