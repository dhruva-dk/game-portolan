// The screens' order, as a small state machine:
//   title → (tap, once the world is ready) → lobby → (PLAY) → drop → (she touches the water) → match → (she sinks)
//   → spectate, or (she is the last afloat) → won → (a tap, or the match's own hold) → result → (tap) → lobby
// with the rank folio and settings opened over the lobby, and the full map over the drop or the match. The drop has
// its own lean screen (gale.ts); the HUD shows in the match, and, watching another ship, in spectate (only its clock
// and disc); the win has no UI at all: the HUD dries away (0117: 0.3 s) and a tap anywhere moves on. Which screen of
// the match shows is the match's own course (sim/match.ts, run by main.ts); nothing happens by script: every step is
// a tap, or the match's own clock or end. Spectating, a slip at the foot of the screen says she has sunk and where
// she placed (sunk), however she went down.

import type { DropState, createGale } from './gale';
import type { createGlobe } from './globe';
import { clock, type HudState, type createHud } from './hud';
import type { Career } from '../player';
import { createLobby, createRank, createResult, createSettings, createSunk, createTitle, type Settings } from './screens';
import { onTap, uiLayer } from './ui';

export const SCREENS = ['title', 'lobby', 'drop', 'match', 'spectate', 'won', 'result'] as const;
export type Screen = (typeof SCREENS)[number];
export const isScreen = (s: string): s is Screen => (SCREENS as readonly string[]).includes(s);
/** The screens over a match under way. */
export const IN_MATCH: readonly Screen[] = ['drop', 'match', 'spectate', 'won'];

/** Seconds the HUD takes to dry away on a win (0117 AT.dry). */
const DRY = 0.3;
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

/** What the screens ask of the game: a new match (PLAY), home to the lobby, and the end of one moved on (a tap). */
export interface FlowActions { play(): void; home(): void; skip(): void }

export function createFlow(
  hud: ReturnType<typeof createHud>, globe: ReturnType<typeof createGlobe>, gale: ReturnType<typeof createGale>, career: () => Career,
  start: Screen, act: FlowActions,
) {
  let screen: Screen = start, settings = loadSettings(), afloat = 0;
  /** Her place once she has sunk, while spectating (null till the match reports it). */
  let struck: number | null = null;
  let rank: ReturnType<typeof createRank> | null = null;

  const title = createTitle(() => go('lobby'));
  const openRank = () => {
    rank = createRank(career(), () => {
      rank?.root.remove();
      rank = null;
    });
    rank.show(true);
  };
  const lobby = createLobby({
    play: () => {
      act.play();
      go('drop');
    },
    rank: openRank, settings: () => settingsFolio.show(true),
  });
  const settingsFolio = createSettings(() => settings, (s) => {
    settings = s;
    saveSettings(s);
  }, () => settingsFolio.show(false));
  const sunk = createSunk();
  const result = createResult(() => {
    act.home();
    go('lobby');
  });
  // spectating and the win: a tap anywhere moves on (0117: the whole screen's press)
  const skip = document.createElement('div');
  skip.className = 'screen press';
  skip.style.display = 'none';
  uiLayer().appendChild(skip);
  onTap(skip, () => act.skip());
  hud.root.style.transition = `opacity ${DRY}s`;

  function go(next: Screen, place = 1) {
    screen = next;
    title.show(next === 'title');
    lobby.show(next === 'lobby', career());
    if (next !== 'lobby') settingsFolio.show(false);
    hud.root.style.display = next === 'match' || next === 'spectate' || next === 'won' ? 'block' : 'none';
    // (on a win it dries away, and is back for the next match)
    hud.root.style.opacity = next === 'won' ? '0' : '1';
    hud.watch(next === 'spectate');
    gale.show(next === 'drop');
    if (next !== 'spectate') struck = null;
    sunk.show(next === 'spectate' && struck !== null, struck ?? undefined);
    skip.style.display = next === 'spectate' || next === 'won' ? 'block' : 'none';
    if (next !== 'drop' && next !== 'match') globe.close();
    result.show(next === 'result', { place, afloat: clock(afloat), career: career() });
    if (next === 'drop') afloat = 0;
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
    /** She has sunk, in `place`: said over the match she watches (each frame while she spectates). */
    sunk(place: number) {
      if (screen !== 'spectate' || struck === place) return;
      struck = place;
      sunk.show(true, place);
    },
    go,
    /** Opens a folio over the lobby. */
    open(folio: 'rank' | 'settings') {
      if (folio === 'rank') openRank();
      else settingsFolio.show(true);
    },
    /** A frame of dt seconds: what the HUD reads, and the drop's screen while she is in it. */
    update(dt: number, s: HudState, drop: DropState | null) {
      if (screen === 'drop' || screen === 'match') afloat += dt;
      if (screen === 'drop' && drop) gale.update(drop, dt);
      if (IN_MATCH.includes(screen)) {
        // the full map's window would show the HUD and the drop's screen under it
        hud.root.style.visibility = gale.root.style.visibility = globe.open ? 'hidden' : '';
        if (screen !== 'drop') hud.update(s);
        globe.update(s);
      }
    },
  };
}

export type Flow = ReturnType<typeof createFlow>;
