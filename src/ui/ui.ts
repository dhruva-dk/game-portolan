// The UI's layer over the world's canvas: one fixed element the size of the screen holding every screen and piece,
// the ink's shared defs set into the page once, and the rules that place pieces inside the safe area.
//
// Hit regions are explicit: the layer and every piece let touches through (pointer-events: none) to the canvas, where
// input.ts reads the stick and the look; only an element marked `.press` takes a touch, and a touch it takes
// never reaches the canvas, so it can neither move the stick nor drag the look. A finger already on the stick or the
// look keeps it (the canvas captures its pointer) even when it slides over a control.

import { DEFS } from './ink';
import { FADE } from './ways';

const STYLE = `
.ui { position: fixed; inset: 0; pointer-events: none; user-select: none; -webkit-user-select: none;
  -webkit-touch-callout: none; -webkit-tap-highlight-color: transparent; font-family: "Iowan Old Style", Georgia, serif; }
.ui * { pointer-events: none; }
.ui .press, .ui .press * { pointer-events: auto; cursor: pointer; }
.ui .piece { position: absolute; }
.ui svg { display: block; }
/* the safe area's edges, plus a margin (--safe-* stand in for the phone's insets off the phone: debug.ts ?safe) */
.ui .top { top: calc(var(--safe-top, env(safe-area-inset-top)) + 4px); }
.ui .bottom { bottom: calc(var(--safe-bottom, env(safe-area-inset-bottom)) + 4px); }
.ui .left { left: calc(var(--safe-left, env(safe-area-inset-left)) + 4px); }
.ui .right { right: calc(var(--safe-right, env(safe-area-inset-right)) + 4px); }
.ui .centre { left: 50%; transform: translateX(-50%); }
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
  return layer;
}

/** A piece of the UI placed by its classes (e.g. 'top left'), holding `html`; `press` makes it take touches. */
export function piece(parent: HTMLElement, place: string, press = false): HTMLDivElement {
  const el = document.createElement('div');
  el.className = `piece ${place}${press ? ' press' : ''}`;
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
