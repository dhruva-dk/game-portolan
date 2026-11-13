// The screens' order, as ways.ts tables it: the title, the lobby with its folios, the match, and her end over the live
// world (the camera's beat on it, then her result with its ways on: watch the match on, or home). Every way is her tap
// on something drawn for it, or the match's own course as the game reports it (player.ts End); nothing moves on by a
// clock of its own. Every screen fades in and out; where the world itself changes at once (PLAY, home to the lobby)
// it cross-fades (veil.ts). The HUD shows in the match (fading in at the end of the arrival: hud.ts), fades out as
// her end begins, and comes back, only its clock, count and disc, while she watches another ship.

import type { createGlobe } from './globe';
import type { HudState, createHud } from './hud';
import type { Career, End } from '../player';
import type { Sea } from '../snapshot';
import { createResult, createWatching } from './ends';
import { createLobby, createRank, createSettings, createTitle, type Settings } from './screens';
import { fade } from './ui';
import { createVeil } from './veil';
import { IN_MATCH, course, events, way, type Screen, type Tap } from './ways';

export { isScreen, type Screen } from './ways';

const KEY = 'portolan.settings';
/** Milliseconds the HUD takes to fade out as her end begins (0117 AT.dry: 0.3 s, a little slower over a sinking). */
const DRY = 600;

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

/** What the screens ask of the game: a new match (PLAY), home to the lobby's quiet sea, and, sunk, to watch the match
 *  on and to turn to another ship. */
export interface FlowActions { play(): void; home(): void; watch(): void; switch(by: number): void }

/** Her career now, and what a match ended in `place` of `of`, holding `share` of the sea, adds to it. */
export interface Careers { now(): Career; credit(place: number, of: number, share: number): { from: Career; to: Career } }

export function createFlow(
  hud: ReturnType<typeof createHud>, globe: ReturnType<typeof createGlobe>, career: Careers,
  start: Screen, act: FlowActions,
) {
  let screen: Screen = start, settings = loadSettings();
  /** Her end as last reported (null while she fights), and what this match added to her career, once shown. */
  let end: End | null = null, gain: { from: Career; to: Career } | null = null;

  const veil = createVeil();
  const title = createTitle(() => tap('begin'));
  const lobby = createLobby({ play: () => tap('play'), rank: () => tap('rank'), settings: () => tap('settings') });
  const rank = createRank(() => tap('close'));
  const settingsFolio = createSettings(() => settings, (s) => {
    settings = s;
    saveSettings(s);
  }, () => tap('close'));
  const result = createResult({ watch: () => tap('watch'), leave: () => tap('leave') });
  const watching = createWatching({ leave: () => tap('leave'), switch: (by) => tap('switch', by) });
  hud.root.style.display = 'none';

  /** Her tap on something drawn for a way on: taken if the screen has that way. Where the world changes at once, the
   *  change waits on the next frame drawn, held over it and cross-fading (veil.ts). */
  function tap(t: Tap, by = 0) {
    const next = way(screen, t);
    if (!next || veil.waiting) return;
    if (t === 'play') {
      veil.cover(() => {
        act.play();
        end = gain = null;
        go(next);
      });
    } else if (t === 'leave') {
      veil.cover(() => {
        act.home();
        end = gain = null;
        go(next);
      });
    } else {
      if (t === 'watch') act.watch();
      if (t === 'switch') act.switch(by);
      go(next);
    }
  }

  /** Shows `next`: each screen and piece faded in or out as it now stands. */
  function go(next: Screen) {
    screen = next;
    title.show(next === 'title');
    lobby.show(next === 'lobby' || next === 'rank' || next === 'settings', career.now());
    rank.show(next === 'rank', career.now());
    settingsFolio.show(next === 'settings');
    // the HUD: the match's, or only its clock, count and disc while she watches; gone as her end begins
    const shown = next === 'match' || next === 'spectate';
    if (shown) hud.watch(next === 'spectate');
    fade(hud.root, shown, shown ? undefined : DRY);
    if (next !== 'match') globe.close();
    watching.show(next === 'spectate');
    const over = next === 'sunk' || next === 'result';
    if (over && end) {
      gain ??= career.credit(end.place, end.of, end.share);
      result.show(true, end, gain);
    } else result.show(false);
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
    /** Her end as the game reports it each frame (null while she fights or with no match): the screens follow it. */
    end(now: End | null) {
      end = now;
      if (!IN_MATCH.includes(screen)) return;
      const next = course(screen, events(now));
      if (next !== screen) go(next);
    },
    /** Opens the UI at `next` (the debug switches' way in: src/debug.ts). */
    go,
    /** A frame of dt seconds: what the HUD reads, and who holds the sea (her id in it) as the frame draws it. */
    update(dt: number, s: HudState, sea?: Sea, own?: number | null) {
      if (IN_MATCH.includes(screen)) {
        // the full map's window would show the HUD under it
        hud.root.style.visibility = globe.open ? 'hidden' : '';
        hud.update(s, sea, own);
        globe.update(s);
      }
      result.update(dt);
    },
    /** The frame just drawn (the world's canvas), for what holds it: the full map just opened, a cross-fade waiting. */
    drawn(canvas: HTMLCanvasElement) {
      if (globe.waiting) globe.hold(canvas);
      if (veil.waiting) veil.hold(canvas);
    },
  };
}

export type Flow = ReturnType<typeof createFlow>;
