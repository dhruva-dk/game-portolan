import type { Globe } from '../ui/base/globe.ts';
import type { Hud, HudState } from '../ui/sea/hud.ts';
import type { End, Seeds, Wardrobe } from '../play/player.ts';
import { createLivery } from '../ui/lobby/livery.ts';
import { createSeedPanel } from '../ui/lobby/panel.ts';
import type { Sea } from '../render/snapshot.ts';
import { createResult, createWatching } from '../ui/sea/ends.ts';
import {
  keepLivery,
  keepSettings,
  keptLivery,
  keptSettings,
  type Store,
} from './kept.ts';
import { createLobby, createSettings, type Title } from '../ui/base/screens.ts';
import { fade } from '../ui/base/ui.ts';
import { INK, dyeOn } from '../ui/base/ink.ts';
import { createPassage } from '../ui/base/passage.ts';
import { createVeil } from '../ui/base/veil.ts';
import {
  HOME,
  IN_MATCH,
  course,
  events,
  way,
  type Screen,
  type Tap,
} from '../ui/base/ways.ts';

const DRY = 600;

function device(): Store | null {
  try {
    return localStorage;
  } catch {
    return null;
  }
}

interface FlowActions {
  play(): void;
  home(): void;
  again(): void;
  watch(): void;
  switch(by: number): void;
  seeds: Seeds;
  wardrobe: Wardrobe;
}

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
  act.wardrobe.wear(keptLivery(store, names));
  let end: End | null = null;

  const veil = createVeil();
  const livery = createLivery(
    act.wardrobe,
    (l) => keepLivery(store, l, names),
    () => tap('close')
  );
  const worn = () =>
    act.wardrobe.dyes[act.wardrobe.worn().dye]?.dye ?? INK.white;
  let sailed: string | null = null,
    seen: Sea['colors'] | null = null;
  const lobby = createLobby(act.seeds.name, worn, {
    play: () => tap('play'),
    settings: () => tap('settings'),
    seed: () => tap('seed'),
    livery: () => tap('livery'),
  });
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
      passage.cover(() => act.seeds.sail(sailing));
    } else if (t === 'leave' || t === 'again') {
      result.hide(HOME.cover);
      watching.show(false, HOME.cover);
      fade(hud.root, false, HOME.cover);
      passage.cover(t === 'leave' ? act.home : act.again);
    } else {
      if (t === 'watch') act.watch();
      if (t === 'switch') act.switch(by);
      go(next);
    }
  }

  function go(next: Screen) {
    const was = screen;
    screen = next;
    if (!passage.going) title.show(next === 'title');
    lobby.show(next === 'lobby' || next === 'settings' || next === 'seed');
    settingsFolio.show(next === 'settings');
    if (next === 'livery' || was === 'livery') livery.show(next === 'livery');
    if (next === 'seed' || was === 'seed') panel.show(next === 'seed');
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
    ready() {
      title.ready();
      tap('begin');
    },
    end(now: End | null) {
      end = now;
      if (!IN_MATCH.includes(screen) || passage.going) return;
      const next = course(screen, events(now));
      if (next === screen) return;
      go(next);
    },
    get covered() {
      return passage.covered;
    },
    go,
    tap,
    update(s: HudState, sea?: Sea, own?: number | null) {
      if (screen === 'match' && sea && own != null && sea.colors !== seen) {
        seen = sea.colors;
        sailed = dyeOn(sea, own);
      }
      if (IN_MATCH.includes(screen)) {
        hud.update(s, sea, own, globe.open);
        globe.update(s);
      }
    },
    drawn(canvas: HTMLCanvasElement) {
      if (globe.waiting) globe.hold(canvas);
      if (veil.waiting) veil.hold(canvas);
      passage.drawn();
    },
  };
}

export type Flow = ReturnType<typeof createFlow>;
