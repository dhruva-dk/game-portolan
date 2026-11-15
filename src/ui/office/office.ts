// The office (Phase C): one page of 1180 × 820, scaled to fit the screen and centred on the desk, holding the top bar,
// the body's grid where each screen is laid, the notices and the settings dialog. The flow (flow.ts) says which screen
// is open; the office makes it the first time it opens (office/screens.ts), fades between screens, and draws the open
// one, and the top bar, from the desk whenever the career changes. It never scrolls: lists scroll inside their panels.

import type { Desk } from '../../office';
import { DESK } from '../ink';
import { kitStyle } from '../kit/style';
import { make } from '../kit/part';
import { notices } from '../kit/notice';
import { fade, uiLayer } from '../ui';
import { OFFICE, type OfficeScreen, type Screen, type Tap } from '../ways';
import type { Registered, Send } from './screen';
import { BARE, SCREENS } from './screens';
import { createSettings, type Prefs } from './settings';
import { officeStyle } from './style';
import { createTop } from './top';

/** The page's size, px. */
export const PAGE = { w: 1180, h: 820 } as const;

/** Keeps `page` scaled to fit the window and centred in it. */
export function fitted(page: HTMLElement) {
  const fit = () => {
    const s = Math.min(innerWidth / PAGE.w, innerHeight / PAGE.h);
    page.style.transform = `translate(${(innerWidth - PAGE.w * s) / 2}px, ${(innerHeight - PAGE.h * s) / 2}px) scale(${s})`;
  };
  addEventListener('resize', fit);
  fit();
}

/** The office, taking `tap` for every way on (the flow's) and keeping the device's settings in `prefs`. */
export function createOffice(tap: (t: Tap) => void, prefs: Prefs) {
  kitStyle();
  officeStyle();
  const root = make('div', 'o-root screen press', uiLayer());
  root.style.display = 'none';
  root.style.background = DESK;
  const page = make('div', 'office', root), grid = make('div', 'grid', page);
  const notes = notices(page);
  let desk: Desk | null = null, asked = 0, open: OfficeScreen | null = null, over = false;
  const built = new Map<OfficeScreen, Registered>();

  const send: Send = {
    async command(c) {
      const r = await must().send(c);
      if (r) notes.say(r, 'harm');
      return r === null;
    },
    tap,
    say: (s, tone) => notes.say(s, tone),
    desk: () => must(),
    page: () => page,
  };
  const must = () => {
    if (!desk) throw new Error('The office was opened before its career was loaded.');
    return desk;
  };

  /** Continue: the blocker opened, with a notice saying why (on race day, the race plan); else a day on. */
  async function go() {
    const b = must().top().go;
    if (b.blocker) {
      if (!b.raceDay) notes.say(b.blocker.sentence, 'harm');
      tap(b.blocker.screen as Tap);
    } else await send.command({ kind: 'Advance' });
  }
  const top = createTop(tap, () => void go());
  page.appendChild(top.el);
  const settings = createSettings(send, prefs);

  fitted(page);

  /** Draws the open screen and the top bar from the desk. */
  function draw() {
    if (!desk || !open) return;
    // (no top bar before a crew is founded, over a damaged save, at the season's end, or at the jobs once sacked)
    let t = BARE.includes(open) ? null : desk.top();
    if (open === 'jobs' && t?.go.blocker?.screen === 'jobs') t = null;
    top.el.style.display = t ? '' : 'none';
    if (t) top.show(t, open);
    built.get(open)?.draw();
    if (over) settings.show(desk.settings());
  }

  return {
    /** Takes the career's desk as it loads (the latest asked for wins); resolves with it. */
    async load(p: Promise<Desk>): Promise<Desk> {
      const mine = ++asked, d = await p;
      if (mine !== asked) return d;
      desk = d;
      desk.changed = draw;
      draw();
      return d;
    },
    /** The desk, once loaded. */
    get desk() {
      return desk;
    },
    /** Shows the office at `screen` as the flow opens it (settings: a dialog over home), or hides it for any other. */
    show(screen: Screen) {
      const at = screen === 'settings' ? 'home' : (OFFICE as readonly Screen[]).includes(screen) ? (screen as OfficeScreen) : null;
      fade(root, at !== null);
      if (!at) {
        if (over) settings.show(null);
        over = false;
        return;
      }
      if (!desk) return;
      if (!built.has(at)) {
        const r = SCREENS[at](send);
        r.el.style.display = 'none';
        grid.appendChild(r.el);
        built.set(at, r);
      }
      for (const [name, r] of built) if (name !== at && name === open) fade(r.el, false);
      open = at;
      over = screen === 'settings';
      if (!over) settings.show(null);
      draw();
      fade(built.get(at)!.el, true);
    },
  };
}

export type Office = ReturnType<typeof createOffice>;
