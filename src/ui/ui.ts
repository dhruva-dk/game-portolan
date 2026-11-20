// The UI's layer over the world's canvas: one fixed element the size of the screen holding every screen and piece,
// the ink's shared defs set into the page once, the rules that place pieces inside the safe area, and the one rule
// that sizes all of it (size).
//
// Hit regions are explicit: the layer and every piece let touches through (pointer-events: none) to the canvas, where
// input.ts reads the stick and the look; only an element marked `.press` takes a touch, and a touch it takes
// never reaches the canvas, so it can neither move the stick nor drag the look (touch.ts). A finger already on the
// stick or the look keeps it (the canvas captures its pointer) even when it slides over a control.
//
// Shown and hidden one way: `show` at once (the `hidden` attribute), `fade` over a time and then hidden.

import { DEFS, cssInks, svgNode } from './ink.ts';
import { FADE } from './ways.ts';

/** The page every piece and screen was drawn on, CSS px: a phone's landscape screen, and its safe insets. */
const DRAWN = { w: 956, h: 440, insets: { top: 0, right: 62, bottom: 20, left: 62 } } as const;
/** The least width the drawn pieces need side by side at their own size (the HUD's top row: the vitals, a gap, then
 *  half the readings, to the middle, is 340). */
const LEAST = 680;
/** Every piece stands at least GUTTER px (at the drawn size) from the screen's edge, and INSET px in from the safe
 *  area's. */
const GUTTER = 16, INSET = 2;

/**
 * The UI's size on a screen `width` × `height` CSS px, the one rule every piece and screen is scaled by: a factor on
 * the drawn size, so a piece is the same share of the screen's short edge on any screen (1 on the page it was drawn
 * on, 1.74 on the iPad Air's 1180 × 820), unless the screen is too narrow for the drawn pieces side by side at that size.
 */
const size = (width: number, height: number) => Math.min(height / DRAWN.h, width / LEAST);

/** The screen now, CSS px, and the UI's size on it: kept by the one resize listener. */
export const view = { w: 0, h: 0, k: 1 };

/** The safe area's insets, CSS px. */
export interface Insets { top: number; right: number; bottom: number; left: number }

/** The page on a screen, in the drawn page's units: its size, and the safe area's edges with a margin inside them. */
export interface Page { w: number; h: number; left: number; top: number; right: number; bottom: number }

/** The page on a screen `width` × `height` CSS px with the given safe insets: scaled by the UI's size, grown to the
 *  screen's shape. */
function pageFor(width: number, height: number, safe: Insets): Page {
  const k = size(width, height), w = width / k, h = height / k;
  const edge = (px: number) => Math.max(px / k + INSET, GUTTER);
  return { w, h, left: edge(safe.left), top: edge(safe.top), right: w - edge(safe.right), bottom: h - edge(safe.bottom) };
}

/** The page as drawn, on the phone with its insets. */
const PAGE = pageFor(DRAWN.w, DRAWN.h, DRAWN.insets);

/** `body`, drawn on the drawn page, kept to this page's edges: `x` to its left or right, or centred between them, and
 *  `y` to its top or bottom, or centred between them. */
export function at(p: Page, x: 'left' | 'centre' | 'right', y: 'top' | 'middle' | 'bottom', body: string) {
  const dx = x === 'left' ? p.left - PAGE.left : x === 'right' ? p.right - PAGE.right : (p.left + p.right - PAGE.left - PAGE.right) / 2;
  const dy = y === 'top' ? p.top - PAGE.top : y === 'bottom' ? p.bottom - PAGE.bottom : (p.top + p.bottom - PAGE.top - PAGE.bottom) / 2;
  return dx === 0 && dy === 0 ? body : `<g transform="translate(${dx.toFixed(1)} ${dy.toFixed(1)})">${body}</g>`;
}

const edge = (side: string) => `max(calc(var(--safe-${side}, env(safe-area-inset-${side})) + ${INSET}px * var(--k)), calc(${GUTTER}px * var(--k)))`;
const STYLE = `
.ui { position: fixed; inset: 0; pointer-events: none; user-select: none; -webkit-user-select: none;
  -webkit-touch-callout: none; -webkit-tap-highlight-color: transparent; font-family: "Iowan Old Style", Georgia, serif; }
.ui * { pointer-events: none; }
.ui [hidden] { display: none !important; }
.ui .press, .ui .press * { pointer-events: auto; cursor: pointer; }
.ui .piece { position: absolute; }
.ui svg { display: block; }
/* the safe area's edges, plus a margin, and never nearer the screen's edge than the gutter (--safe-* stand in for the
   device's insets off it: debug.ts ?safe); --k is the UI's size (size()) */
.ui .top { top: ${edge('top')}; }
.ui .bottom { bottom: ${edge('bottom')}; }
.ui .left { left: ${edge('left')}; }
.ui .right { right: ${edge('right')}; }
.ui .centre { left: 50%; translate: -50% 0; }
/* a piece drawn at the drawn size, grown by the UI's size about its own corner of the screen */
.ui .sized { scale: var(--k); }
/* a mark drawn at the drawn size, centred on its place (left, top) and grown by the UI's size about it */
.ui .mark { position: absolute; transform: translate(-50%, -50%) scale(var(--k)); }
.ui .screen { position: absolute; inset: 0; }
.ui .screen.press { pointer-events: auto; }
.ui .gone, .ui .gone * { pointer-events: none !important; }
@keyframes needle { from { transform: rotate(-38deg) } to { transform: rotate(52deg) } }
`;

/** Shows `el` or hides it, at once. */
export function show(el: HTMLElement, on: boolean) {
  if (el.hidden === on) el.hidden = !on;
}

/** Each element fading, and the timer that hides it once faded out. */
const fading = new WeakMap<HTMLElement, number>();

/** Fades `el` in or out over `ms`: shown, it takes touches at once; going, none, and once faded it is hidden.
 *  Already as asked, nothing changes. */
export function fade(el: HTMLElement, on: boolean, ms = FADE) {
  if (on === (!el.hidden && !el.classList.contains('gone'))) return;
  clearTimeout(fading.get(el));
  el.style.transition = `opacity ${ms}ms ease`;
  if (on) {
    el.classList.remove('gone');
    if (el.hidden) {
      el.style.opacity = '0';
      el.hidden = false;
      // (a reflow, so it is laid out at nothing and fades from there: the usual way to start a transition)
      void el.offsetWidth;
    }
    el.style.opacity = '1';
  } else {
    el.classList.add('gone');
    el.style.opacity = '0';
    fading.set(el, window.setTimeout(() => {
      el.hidden = true;
    }, ms));
  }
}

/** What is told when the screen changes size, after `view` is. */
const resizes = new Set<() => void>();

/** Calls `fn` whenever the screen changes size (the one listener for it); returns what stops it. */
export function onResize(fn: () => void): () => void {
  resizes.add(fn);
  return () => resizes.delete(fn);
}

/** The layer, made the first time it is asked for. */
let layer: HTMLElement | null = null;
export function uiLayer(): HTMLElement {
  if (layer) return layer;
  const style = document.createElement('style');
  style.textContent = STYLE;
  document.head.appendChild(style);
  // the inks the page's own CSS reads (index.html)
  for (const [name, value] of cssInks) document.documentElement.style.setProperty(name, value);
  const defs = svgNode(0, 0, DEFS);
  defs.style.position = 'absolute';
  const el = document.createElement('div');
  el.className = 'ui';
  el.append(defs);
  document.body.appendChild(el);
  layer = el;
  const resized = () => {
    [view.w, view.h, view.k] = [innerWidth, innerHeight, size(innerWidth, innerHeight)];
    el.style.setProperty('--k', view.k.toFixed(4));
    for (const fn of resizes) fn();
  };
  resized();
  addEventListener('resize', resized);
  return el;
}

/** The safe area's insets now, CSS px, read off an unseen element's padding (--safe-* stand in for them off the
 *  device: debug.ts ?safe). Not each frame: it asks the page for its style. */
let probe: HTMLElement | null = null;
export function insets(): Insets {
  if (!probe) {
    probe = document.createElement('div');
    probe.style.cssText = 'position:absolute;visibility:hidden;padding:var(--safe-top, env(safe-area-inset-top)) '
      + 'var(--safe-right, env(safe-area-inset-right)) var(--safe-bottom, env(safe-area-inset-bottom)) var(--safe-left, env(safe-area-inset-left))';
    uiLayer().appendChild(probe);
  }
  const s = getComputedStyle(probe), px = (v: string) => parseFloat(v) || 0;
  return { top: px(s.paddingTop), right: px(s.paddingRight), bottom: px(s.paddingBottom), left: px(s.paddingLeft) };
}

/** The page on this screen now. */
export const page = () => pageFor(view.w, view.h, insets());

/** A full-screen element of the layer, hidden until shown; `press` makes all of it take touches. */
export function screen(press = false): HTMLDivElement {
  const el = document.createElement('div');
  el.className = press ? 'screen press' : 'screen';
  el.hidden = true;
  uiLayer().appendChild(el);
  return el;
}

/** A piece of the UI placed by its classes (e.g. 'top left'); `press` makes it take touches; `sized` grows it by the
 *  UI's size about the corner (or edge) it is placed at. */
export function piece(parent: HTMLElement, place: string, press = false, sized = false): HTMLDivElement {
  const el = document.createElement('div');
  el.className = `piece ${place}${press ? ' press' : ''}${sized ? ' sized' : ''}`;
  const has = (c: string) => place.split(' ').includes(c);
  if (sized) el.style.transformOrigin = `${has('left') ? '0' : has('right') ? '100%' : '50%'} ${has('top') ? '0' : has('bottom') ? '100%' : '50%'}`;
  parent.appendChild(el);
  return el;
}
