// The office: one page of 1180 × 820, scaled to the screen and centred on it,
// floating over the live world, which it dims and blurs. On it the shell (the
// strip across the top, the nav along the bottom: shell.ts) and, between them,
// the open screen (screens.ts), drawn from the desk's views whenever something
// is asked. A screen marked bare takes the whole page (the menu). The page
// never scrolls: lists scroll inside their panels, and keep how far when they
// are drawn again. Hidden, it is not laid out at all: it costs a race nothing.

import type { Ask, Desk } from '../../office/office.ts';
import { OFFICE, alpha } from '../ink.ts';
import { PAGE, createPage } from '../kit/page.ts';
import { el } from '../kit/part.ts';
import { kitStyle, stylesheet } from '../kit/style.ts';
import { boxOf, fade, screen } from '../ui.ts';
import { SCREENS, type Name, type Opened } from './screens.ts';
import { STRIP, NAV, createShell } from './shell.ts';

/** How far past the page the dimming runs, px, so a screen of another shape is dimmed to its edges. */
const PAST = 4000;

const CSS = `
.ui .o-root, .ui .o-root * { pointer-events: auto; }
.o-root { overflow: hidden; z-index: 2; }
.o-dim { position: absolute; inset: ${-PAST}px; background: ${alpha(OFFICE.bar, 0.46)};
  -webkit-backdrop-filter: blur(9px); backdrop-filter: blur(9px); }
.o-body { position: absolute; left: 0; right: 0; top: ${STRIP}px; bottom: ${NAV}px; }
.o-body.bare { top: 0; bottom: 0; }
.o-body > * { position: absolute; inset: 0; }
`;

/** What a screen is handed: what it asks goes to `ask`; `draw` draws the office again (a choice of its own changed). */
export interface Office {
  ask(a: Ask): void;
  draw(): void;
}

/** The office over `desk`, hidden until shown. */
export function createOffice(desk: Desk) {
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

  const office: Office = {
    ask(a) {
      if (a.kind === 'open') go(a.screen);
      else {
        desk.ask(a);
        draw();
      }
    },
    draw: () => draw(),
  };
  const shell = createShell(office, {
    back: () => step(past, ahead),
    forward: () => step(ahead, past),
  });
  page.append(shell.strip, body, shell.nav);

  /** Each list scrolled as it was, or, not yet scrolled, to where it asks (her own row in view). */
  function settle(at: Name, keep: boolean) {
    body.querySelectorAll<HTMLElement>('.k-rows').forEach((list) => {
      const key = `${at} ${list.dataset.keep ?? ''}`;
      if (keep) scrolled.set(key, list.scrollTop);
      else list.scrollTop = scrolled.get(key) ?? Number(list.dataset.top ?? 0);
    });
  }

  /** The world shown clear through the open screen's window (an element it marks o-window), dimmed round it. */
  function clear() {
    const hole = body.querySelector('.o-window');
    if (!hole) {
      dim.style.clipPath = '';
      return;
    }
    const p = boxOf(page),
      h = boxOf(hole),
      k = p.width / PAGE.w;
    const x = (v: number) => `${((v - p.left) / k + PAST).toFixed(1)}px`,
      y = (v: number) => `${((v - p.top) / k + PAST).toFixed(1)}px`;
    const [l, t, r, b] = [x(h.left), y(h.top), x(h.right), y(h.bottom)];
    dim.style.clipPath = `polygon(evenodd, 0 0, 100% 0, 100% 100%, 0 100%, 0 0, ${l} ${t}, ${l} ${b}, ${r} ${b}, ${r} ${t}, ${l} ${t})`;
  }

  /** Draws the shell and the open screen from the desk. */
  function draw() {
    if (!open || root.hidden) return;
    const entry = SCREENS[open],
      now = made.get(open);
    if (!entry || !now) return;
    shell.show(entry.bare ? null : desk.shell(), open, {
      back: past.length > 0,
      forward: ahead.length > 0,
    });
    body.classList.toggle('bare', entry.bare);
    settle(open, true);
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
    open = name;
    draw();
    return true;
  }

  /** Opens `name` as a way on from the open screen: the way back remembers where from. */
  function go(name: Name) {
    const from = open;
    if (name === from || !show(name)) return;
    if (from) past.push(from);
    ahead.length = 0;
  }

  /** A step back or forward: the last of `from` opened, the screen left kept on `to`. */
  function step(from: Name[], to: Name[]) {
    const name = from.pop(),
      left = open;
    if (!name || !show(name)) return;
    if (left) to.push(left);
  }

  return {
    root,
    /** The screen open (null: none yet). */
    get open() {
      return open;
    },
    /** Draws the office again, if it is shown (something changed that it did not ask). */
    draw,
    /** Shows the office, drawn afresh, or fades it away. */
    show(on: boolean) {
      fade(root, on);
      if (on) draw();
    },
    /** Opens the screen `name`; false if it is not built. */
    go(name: Name) {
      const built = SCREENS[name] !== undefined;
      go(name);
      return built;
    },
  };
}
