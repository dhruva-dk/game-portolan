// The UI's layer over the world's canvas: one fixed element the size of the screen holding every screen and piece,
// the ink's shared defs set into the page once, and the rules that place pieces inside the safe area.
//
// Hit regions are explicit: the layer and every piece let touches through (pointer-events: none) to the canvas, where
// input.ts reads the stick and the look; only an element marked `.press` takes a touch, and a touch it takes
// never reaches the canvas, so it can neither move the stick nor drag the look. A finger already on the stick or the
// look keeps it (the canvas captures its pointer) even when it slides over a control.

import { DEFS } from './ink';
import { FADE } from './ways';

/** The phone's screen, CSS px, that the UI is drawn for (landscape, its short edge 440); and the least width it needs
 *  at its own size (the HUD's top row: the vitals, a gap, then half the readings, to the middle, is 340). */
export const DRAWN_HIGH = 440, DRAWN_LEAST = 680;
/** Every piece stands at least GUTTER px (at the drawn size) from the screen's edge, and INSET px in from the safe
 *  area's. */
export const GUTTER = 16, INSET = 2;

/**
 * The UI's size on a screen `width` × `height` CSS px: a factor on the drawn size, so a piece is the same share of the
 * screen's short edge on any screen (≈1 on the phone it was drawn for, ≈1.74 at 1180 × 820, ≈2 on the iPad Air it was tuned on, 1373 × 954), unless the screen is too
 * narrow for the drawn pieces side by side at that size.
 */
export const size = (width: number, height: number) => Math.min(height / DRAWN_HIGH, width / DRAWN_LEAST);

const STYLE = `
.ui { position: fixed; inset: 0; pointer-events: none; user-select: none; -webkit-user-select: none;
  -webkit-touch-callout: none; -webkit-tap-highlight-color: transparent; font-family: "Iowan Old Style", Georgia, serif; }
.ui * { pointer-events: none; }
.ui .press, .ui .press * { pointer-events: auto; cursor: pointer; }
.ui .piece { position: absolute; }
.ui svg { display: block; }
/* the safe area's edges, plus a margin, and never nearer the screen's edge than the gutter (--safe-* stand in for the
   phone's insets off the phone: debug.ts ?safe); --k is the UI's size (size()) */
.ui .top { top: max(calc(var(--safe-top, env(safe-area-inset-top)) + ${INSET}px * var(--k, 1)), calc(${GUTTER}px * var(--k, 1))); }
.ui .bottom { bottom: max(calc(var(--safe-bottom, env(safe-area-inset-bottom)) + ${INSET}px * var(--k, 1)), calc(${GUTTER}px * var(--k, 1))); }
.ui .left { left: max(calc(var(--safe-left, env(safe-area-inset-left)) + ${INSET}px * var(--k, 1)), calc(${GUTTER}px * var(--k, 1))); }
.ui .right { right: max(calc(var(--safe-right, env(safe-area-inset-right)) + ${INSET}px * var(--k, 1)), calc(${GUTTER}px * var(--k, 1))); }
.ui .centre { left: 50%; translate: -50% 0; }
/* a piece drawn at the phone's size, grown by the UI's size about its own corner of the screen */
.ui .piece.sized { scale: var(--k, 1); }
.ui .screen { position: absolute; inset: 0; }
.ui .screen.press { pointer-events: auto; }
.ui .gone, .ui .gone * { pointer-events: none !important; }
`;

/** Each element fading, and the timer that takes it out of the page once faded out. */
const fading = new WeakMap<HTMLElement, number>();

/** Fades `el` in or out over `ms`: shown, it takes touches at once; going, none, and once faded it is out of the page.
 *  Already as asked, nothing changes. */
export function fade(el: HTMLElement, on: boolean, ms = FADE) {
  const shown = el.style.display !== 'none' && !el.classList.contains('gone');
  if (on === shown) return;
  clearTimeout(fading.get(el));
  el.style.transition = `opacity ${ms}ms ease`;
  if (on) {
    el.classList.remove('gone');
    if (el.style.display === 'none') {
      el.style.opacity = '0';
      el.style.display = '';
      // (laid out at nothing before the fade, so it fades from there)
      void el.offsetWidth;
    }
    el.style.opacity = '1';
  } else {
    el.classList.add('gone');
    el.style.opacity = '0';
    fading.set(el, window.setTimeout(() => {
      el.style.display = 'none';
    }, ms));
  }
}

/** The layer, made the first time it is asked for. */
let layer: HTMLElement | null = null;
export function uiLayer(): HTMLElement {
  if (layer) return layer;
  const style = document.createElement('style');
  style.textContent = STYLE;
  document.head.appendChild(style);
  const defs = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  defs.setAttribute('width', '0');
  defs.setAttribute('height', '0');
  defs.style.position = 'absolute';
  defs.innerHTML = DEFS;
  layer = document.createElement('div');
  layer.className = 'ui';
  layer.append(defs);
  document.body.appendChild(layer);
  const sized = () => layer?.style.setProperty('--k', size(innerWidth, innerHeight).toFixed(4));
  sized();
  addEventListener('resize', sized);
  return layer;
}

/** The UI's size on this screen, now (size()). */
export const sizeNow = () => size(innerWidth, innerHeight);

/** A piece of the UI placed by its classes (e.g. 'top left'), holding `html`; `press` makes it take touches; `sized`
 *  grows it by the UI's size about the corner (or edge) it is placed at. */
export function piece(parent: HTMLElement, place: string, press = false, sized = false): HTMLDivElement {
  const el = document.createElement('div');
  el.className = `piece ${place}${press ? ' press' : ''}${sized ? ' sized' : ''}`;
  const has = (c: string) => place.split(' ').includes(c);
  if (sized) el.style.transformOrigin = `${has('left') ? '0' : has('right') ? '100%' : '50%'} ${has('top') ? '0' : has('bottom') ? '100%' : '50%'}`;
  parent.appendChild(el);
  return el;
}

/** Calls `act` on a tap of `el` (pointer down and up on it), and keeps the touch from the canvas. */
export function onTap(el: HTMLElement, act: (e: PointerEvent) => void) {
  let down = -1;
  el.addEventListener('pointerdown', (e) => {
    down = e.pointerId;
    e.stopPropagation();
  });
  el.addEventListener('pointerup', (e) => {
    if (e.pointerId === down) act(e);
    down = -1;
  });
}
