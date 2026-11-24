// The screens' order, as ways.ts tables it: the title, the lobby with its
// folios (the settings, the seed panel, her livery), the match, and her end over the live world (the camera's beat on it,
// then her result with its ways on: watch the match on, or home). Every way is
// her tap on something drawn for it, or the match's own course as the game
// reports it (player.ts End), but the title's, taken as the world is ready;
// nothing moves on by a clock of its own. Every screen fades in and out; where
// the world itself changes at once it cross-fades (PLAY: veil.ts), or (home,
// on a new seed or this one again) the match fades under the title, the one
// loading screen, held while the page loads again under it (passage.ts). The HUD shows in the match (fading in
// at the end of the arrival: hud.ts), fades out as her end begins, and comes
// back, only its clock, count and disc, while she watches another ship.

import type { Globe } from './globe.ts';
import type { Hud, HudState } from './hud.ts';
import type { End, Seeds, Wardrobe } from '../player.ts';
import { createLivery } from './livery.ts';
import { createSeedPanel } from './panel.ts';
import type { Sea } from '../snapshot.ts';
import { createResult, createWatching } from './ends.ts';
import {
  keepLivery,
  keepSettings,
  keptLivery,
  keptSettings,
  type Store,
} from './kept.ts';
import { createLobby, createSettings, type Title } from './screens.ts';
import { fade } from './ui.ts';
import { INK, dyeOn } from './ink.ts';
import { createPassage } from './passage.ts';
import { createVeil } from './veil.ts';
import {
  HOME,
  IN_MATCH,
  course,
  events,
  way,
  type Screen,
  type Tap,
} from './ways.ts';

/**
 * Milliseconds the HUD takes to fade out as her end begins: slow enough to read
 * as the match drying away, not cut.
 */
const DRY = 600;

/** The device's store (kept.ts), or none: a private window may throw as it is reached. */
function device(): Store | null {
  try {
    return localStorage;
  } catch {
    return null;
  }
}

/**
 * What the screens ask of the game: the race (PLAY), home on a new seed or on
 * this one again (each a new page, made under the title), and, sunk, to watch
 * the match on and to turn to another ship.
 */
interface FlowActions {
  play(): void;
  home(): void;
  again(): void;
  watch(): void;
  switch(by: number): void;
  /** The seed panel's: the page's seed, previews of others, and a seed sailed (a new page). */
  seeds: Seeds;
  /** Her livery's folio's: the set's dyes, hers worn, the camera turned to her broadside. */
  wardrobe: Wardrobe;
}

/**
 * The flow, from `start`; `title` the title as the page painted it first,
 * before the world was built (main.ts).
 */
export function createFlow(
  hud: Hud,
  globe: Globe,
  start: Screen,
  act: FlowActions,
  title: Title
) {
  const store = device(),
    names = act.wardrobe.dyes.map((d) => d.name);
  let screen: Screen = start,
    settings = keptSettings(store);
  // her livery as the device keeps it, worn before anything is drawn
  act.wardrobe.wear(keptLivery(store, names));
  /** Her end as last reported (null while she fights). */
  let end: End | null = null;

  const veil = createVeil();
  const livery = createLivery(
    act.wardrobe,
    (l) => keepLivery(store, l, names),
    () => tap('close')
  );
  /** Her dye as she wears it now (the lobby's dye pot). */
  const worn = () =>
    act.wardrobe.dyes[act.wardrobe.worn().dye]?.dye ?? INK.white;
  /** Her ship's dye on the sea as she last sailed it (her end's sea held), as the minimap reads it. */
  let sailed: string | null = null,
    seen: Sea['colours'] | null = null;
  const lobby = createLobby(act.seeds.name, worn, {
    play: () => tap('play'),
    settings: () => tap('settings'),
    seed: () => tap('seed'),
    livery: () => tap('livery'),
  });
  /** The seed the panel sails, once she taps SAIL. */
  let sailing = act.seeds.name;
  const panel = createSeedPanel(act.seeds, {
    close: () => tap('close'),
    sail(name) {
      sailing = name;
      tap('sail');
    },
  });
  const settingsFolio = createSettings(
    () => settings,
    (s) => {
      settings = s;
      keepSettings(store, s);
    },
    () => tap('close')
  );
  const result = createResult(() => sailed ?? worn(), {
    watch: () => tap('watch'),
    leave: () => tap('leave'),
    again: () => tap('again'),
  });
  const watching = createWatching({
    leave: () => tap('leave'),
    switch: (by) => tap('switch', by),
  });
  const passage = createPassage(title);

  /**
   * Her tap on something drawn for a way on: taken if the screen has that way.
   * Where the world changes at once, the change waits: PLAY's on the next frame
   * drawn, held over it and cross-fading (veil.ts); home's under the parchment,
   * the match's pieces fading with the match as it comes over (passage.ts).
   */
  function tap(t: Tap, by = 0) {
    const next = way(screen, t);
    if (!next || veil.waiting || passage.going) return;
    if (t === 'play') {
      veil.cover(() => {
        act.play();
        end = null;
        go(next);
      });
    } else if (t === 'sail') {
      // a seed sailed from the panel: a new page on it, under the title, as home is
      passage.cover(() => act.seeds.sail(sailing));
    } else if (t === 'leave' || t === 'again') {
      result.hide(HOME.cover);
      watching.show(false, HOME.cover);
      fade(hud.root, false, HOME.cover);
      // (the page goes under the title: no screen after it on this one)
      passage.cover(t === 'leave' ? act.home : act.again);
    } else {
      if (t === 'watch') act.watch();
      if (t === 'switch') act.switch(by);
      go(next);
    }
  }

  /** Shows `next`: each screen and piece faded in or out as it now stands. */
  function go(next: Screen) {
    const was = screen;
    screen = next;
    // (on the way home the title is the passage's)
    if (!passage.going) title.show(next === 'title');
    // (her livery's folio takes the lobby's place: her ship above it, nothing over her)
    lobby.show(next === 'lobby' || next === 'settings' || next === 'seed');
    settingsFolio.show(next === 'settings');
    if (next === 'livery' || was === 'livery') livery.show(next === 'livery');
    // (opened afresh on the page's seed, so only as it comes or goes)
    if (next === 'seed' || was === 'seed') panel.show(next === 'seed');
    // the HUD: the match's, or only its clock, count and disc while she
    // watches; gone as her end begins
    const shown = next === 'match' || next === 'spectate';
    if (shown) hud.watch(next === 'spectate');
    fade(hud.root, shown, shown ? undefined : DRY);
    if (next !== 'match') globe.close();
    watching.show(next === 'spectate');
    const over = next === 'sunk' || next === 'result';
    if (over && end) result.show(true, end);
    else result.show(false);
  }
  go(start);

  return {
    get screen() {
      return screen;
    },
    get settings() {
      return settings;
    },
    /**
     * The world is ready to be shown: the title gives way to the lobby by
     * itself (if the UI still stands there).
     */
    ready() {
      title.ready();
      tap('begin');
    },
    /**
     * Her end as the game reports it each frame (null while she fights or with
     * no match): the screens follow it.
     */
    end(now: End | null) {
      end = now;
      // (on the way home, the match's course shows nothing more)
      if (!IN_MATCH.includes(screen) || passage.going) return;
      const next = course(screen, events(now));
      if (next === screen) return;
      go(next);
    },
    /**
     * How much of the world the screens cover, 0…1: the way home's parchment
     * (its sound fades with it).
     */
    get covered() {
      return passage.covered;
    },
    /** Opens the UI at `next` (the debug switches' way in: src/debug.ts). */
    go,
    /**
     * Her tap on a way on, as if on what is drawn for it (the debug switches':
     * src/debug.ts).
     */
    tap,
    /**
     * A frame: what the HUD reads, and who holds the sea (her id in it) as the
     * frame draws it.
     */
    update(s: HudState, sea?: Sea, own?: number | null) {
      // (her own ship's while she sails, not another's once she watches; once a match: its colours are the match's)
      if (screen === 'match' && sea && own != null && sea.colours !== seen) {
        seen = sea.colours;
        sailed = dyeOn(sea, own);
      }
      if (IN_MATCH.includes(screen)) {
        // (the full map's window would show the HUD under it)
        hud.update(s, sea, own, globe.open);
        globe.update(s);
      }
    },
    /**
     * The frame just drawn (the world's canvas), for what holds it: the full
     * map just opened, a cross-fade waiting; and the way home, which waits on
     * the lobby's frames drawn.
     */
    drawn(canvas: HTMLCanvasElement) {
      if (globe.waiting) globe.hold(canvas);
      if (veil.waiting) veil.hold(canvas);
      passage.drawn();
    },
  };
}

export type Flow = ReturnType<typeof createFlow>;
