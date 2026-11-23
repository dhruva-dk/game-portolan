// The office: one page of 1180 × 820, scaled to the screen and centred on it,
// floating over the live world, which it dims and blurs. On it the shell (the
// strip across the top, the nav along the bottom: shell.ts) and, between them,
// the open screen (screens.ts), drawn from the desk's views whenever something
// is asked. A screen marked bare takes the whole page (the menu). The page
// never scrolls: lists scroll inside their panels, and keep how far when they
// are drawn again. Hidden, it is not laid out at all: it costs a race nothing.

import type { Ask, Desk } from '../../office/office.ts';
import type { Chart } from '../../player.ts';
import { SHADOW, alpha } from '../ink.ts';
import { PAGE, createPage } from '../kit/page.ts';
import { el } from '../kit/part.ts';
import { kitStyle, stylesheet } from '../kit/style.ts';
import { boxOf, fade, onResize, screen, view } from '../ui.ts';
import { SCREENS, type Name, type Opened } from './screens.ts';
import { STRIP, NAV, createShell } from './shell.ts';

/** How far past the page the dimming runs, px, so a screen of another shape is dimmed to its edges. */
const PAST = 4000;

const CSS = `
.ui .o-root, .ui .o-root * { pointer-events: auto; }
.o-root { overflow: hidden; z-index: 2; }
.o-dim { position: absolute; inset: ${-PAST}px; background: ${alpha(SHADOW, 0.34)};
  -webkit-backdrop-filter: blur(9px); backdrop-filter: blur(9px); }
.o-body { position: absolute; left: 0; right: 0; top: ${STRIP}px; bottom: ${NAV}px; }
.o-body.bare { top: 0; bottom: 0; }
.o-body > * { position: absolute; inset: 0; }
`;

/**
 * What a screen is handed: what it asks goes to `ask`; `draw` draws the office
 * again (a choice of its own changed); `still` is the picture taken of the
 * planet she lies off, from space (an image's address), once there is one;
 * `chart`, that planet's chart (its coasts, for a globe), once surveyed. A
 * career's page always lies off its next race's planet (manager.ts arrive).
 */
export interface Office {
  ask(a: Ask): void;
  draw(): void;
  still(): string | null;
  chart(): Chart | null;
}

/**
 * The world behind the office, as the office stages it: the camera on her ship
 * or over the harbour, what it looks at drawn at `centre` (right and down of
 * the screen's middle, in half-widths and half-heights) and `size` of the
 * screen high; null, as the lobby has it. A screen says which by its window:
 * the element it marks o-window (data-scene="harbour" for the harbour), and
 * within it, if not all of it, the one it marks o-subject.
 */
interface Backdrop {
  stage(
    to: {
      scene: 'ship' | 'harbour';
      framing: { centre: [number, number]; size: number };
    } | null
  ): void;
}

/** The office over `desk`, hidden until shown; the world behind it staged through `backdrop`. */
export function createOffice(desk: Desk, backdrop?: Backdrop) {
  kitStyle();
  stylesheet(CSS);
  const root = screen();
  root.classList.add('o-root');
  const dim = el('div', 'o-dim'),
    body = el('div', 'o-body'),
    page = createPage(dim);
  root.append(page);

  /** The screens made so far, the one open, and the ways back and forward from it. */
  const made = new Map<Name, Opened>();
  let open: Name | null = null;
  const past: Name[] = [],
    ahead: Name[] = [];
  /** How far each list was scrolled when last drawn, by the screen and the list's name. */
  const scrolled = new Map<string, number>();
  /** The planet's picture, once taken; its chart, once surveyed. */
  let picture: string | null = null,
    charted: Chart | null = null;
  /**
   * The open screen's window as last laid: where it stands on the screen (px),
   * the page's scale, and what in it is pinned to the harbour's plots (each
   * marked data-plot).
   */
  let laid: {
    left: number;
    top: number;
    k: number;
    pins: HTMLElement[];
  } | null = null;

  const office: Office = {
    ask(a) {
      if (a.kind === 'open') go(a.screen);
      else {
        desk.ask(a);
        draw();
      }
    },
    draw: () => draw(),
    still: () => picture,
    chart: () => charted,
  };
  const shell = createShell(office, {
    back: () => step(past, ahead),
    forward: () => step(ahead, past),
  });
  page.append(shell.strip, body, shell.nav);
  // (a window stands elsewhere on a screen of another size)
  onResize(() => draw());

  /** Each list scrolled as it was, or, not yet scrolled, to where it asks (her own row in view). */
  function settle(at: Name, keep: boolean) {
    const within = made.get(at)?.el ?? body;
    within
      .querySelectorAll<HTMLElement>('.k-rows, .cr-rows')
      .forEach((list) => {
        const key = `${at} ${list.dataset.keep ?? ''}`;
        if (keep) scrolled.set(key, list.scrollTop);
        else
          list.scrollTop = scrolled.get(key) ?? Number(list.dataset.top ?? 0);
      });
  }

  /** The world shown clear through the open screen's window (an element it marks o-window), dimmed round it. */
  function clear() {
    const hole =
      (open && made.get(open)?.el.querySelector<HTMLElement>('.o-window')) ||
      null;
    if (!hole) {
      dim.style.clipPath = '';
      laid = null;
      backdrop?.stage(null);
      return;
    }
    const p = boxOf(page),
      h = boxOf(hole),
      k = p.width / PAGE.w;
    const x = (v: number) => `${((v - p.left) / k + PAST).toFixed(1)}px`,
      y = (v: number) => `${((v - p.top) / k + PAST).toFixed(1)}px`;
    const [l, t, r, b] = [x(h.left), y(h.top), x(h.right), y(h.bottom)];
    dim.style.clipPath = `polygon(evenodd, 0 0, 100% 0, 100% 100%, 0 100%, 0 0, ${l} ${t}, ${l} ${b}, ${r} ${b}, ${r} ${t}, ${l} ${t})`;
    // the camera's subject drawn in the middle of the window, or of what the screen marks within it
    const s = boxOf(hole.querySelector('.o-subject') ?? hole);
    backdrop?.stage({
      scene: hole.dataset.scene === 'harbour' ? 'harbour' : 'ship',
      framing: {
        centre: [
          (s.left + s.width / 2) / (view.w / 2) - 1,
          (s.top + s.height / 2) / (view.h / 2) - 1,
        ],
        size: s.height / view.h,
      },
    });
    laid = {
      left: h.left,
      top: h.top,
      k,
      pins: Array.from(hole.querySelectorAll<HTMLElement>('[data-plot]')),
    };
  }

  /** Draws the shell and the open screen from the desk (`fresh`: just opened, its lists where they ask to be). */
  function draw(fresh = false) {
    if (!open || root.hidden) return;
    const entry = SCREENS[open],
      now = made.get(open);
    if (!entry || !now) return;
    shell.show(entry.bare ? null : desk.shell(), open, {
      back: past.length > 0,
      forward: ahead.length > 0,
    });
    body.classList.toggle('bare', entry.bare);
    if (fresh) {
      for (const key of [...scrolled.keys()])
        if (key.startsWith(`${open} `)) scrolled.delete(key);
    } else settle(open, true);
    now.draw(desk);
    settle(open, false);
    clear();
  }

  /** Opens `name`, if it is built: made the first time, the others put away. */
  function show(name: Name) {
    const entry = SCREENS[name];
    if (!entry) return false;
    let now = made.get(name);
    if (!now) {
      now = entry.make(office);
      made.set(name, now);
      body.append(now.el);
    }
    for (const [other, o] of made) o.el.hidden = other !== name;
    const fresh = open !== name;
    open = name;
    draw(fresh);
    return true;
  }

  /**
   * Opens `name` as a way on from the open screen: the way back remembers
   * where from (before it is drawn, so the shell's back is ready).
   */
  function go(name: Name) {
    const from = open;
    if (name === from || !SCREENS[name]) return;
    if (from) past.push(from);
    ahead.length = 0;
    show(name);
  }

  /** A step back or forward: the last of `from` opened, the screen left kept on `to` (before it is drawn). */
  function step(from: Name[], to: Name[]) {
    const name = from.pop(),
      left = open;
    if (!name || !SCREENS[name]) return;
    if (left) to.push(left);
    show(name);
  }

  return {
    root,
    /** The screen open (null: none yet). */
    get open() {
      return open;
    },
    /** Draws the office again, if it is shown (something changed that it did not ask). */
    draw: () => draw(),
    /** Shows the office, drawn afresh, or fades it away. */
    show(on: boolean) {
      fade(root, on);
      if (on) draw(true);
      else {
        laid = null;
        backdrop?.stage(null);
      }
    },
    /** The planet's picture, taken: the open screen drawn again with it. */
    picture(address: string) {
      picture = address;
      draw();
    },
    /** The planet's chart, surveyed: the open screen drawn again with it. */
    charted(chart: Chart) {
      charted = chart;
      draw();
    },
    /**
     * Where the camera now draws the head of what stands on each of the
     * harbour's plots (px on the screen, by plot; null: it is not over the
     * harbour): what the open screen pins to them is moved there.
     */
    plots(at: Readonly<Record<string, readonly [number, number]>> | null) {
      if (!at || !laid || root.hidden) return;
      const { left, top, k } = laid;
      for (const pin of laid.pins) {
        const p = at[pin.dataset.plot ?? ''];
        if (!p) continue;
        pin.style.transform = `translate(${((p[0] - left) / k).toFixed(1)}px, ${((p[1] - top) / k).toFixed(1)}px)`;
        // (hidden until it is first placed)
        pin.style.visibility = 'visible';
      }
    },
    /** Opens the screen `name`; false if it is not built. */
    go(name: Name) {
      const built = SCREENS[name] !== undefined;
      go(name);
      return built;
    },
  };
}
