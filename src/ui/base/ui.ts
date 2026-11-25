import { DEFS, cssInks, svgNode } from './ink.ts';
import { MOTION } from './house.ts';
import { FADE } from './ways.ts';

const DRAWN = {
  w: 956,
  h: 440,
  insets: { top: 0, right: 62, bottom: 20, left: 62 },
} as const;
const LEAST = 680;
const GUTTER = 16,
  INSET = 2;

export const size = (width: number, height: number) =>
  Math.min(height / DRAWN.h, width / LEAST);

export const view = { w: 0, h: 0, k: 1, dpr: 1 };

export interface Insets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface Page {
  w: number;
  h: number;
  left: number;
  top: number;
  right: number;
  bottom: number;
}

function pageFor(width: number, height: number, safe: Insets): Page {
  const k = size(width, height),
    w = width / k,
    h = height / k;
  const edge = (px: number) => Math.max(px / k + INSET, GUTTER);
  return {
    w,
    h,
    left: edge(safe.left),
    top: edge(safe.top),
    right: w - edge(safe.right),
    bottom: h - edge(safe.bottom),
  };
}

const PAGE = pageFor(DRAWN.w, DRAWN.h, DRAWN.insets);

export function at(
  p: Page,
  x: 'left' | 'center' | 'right',
  y: 'top' | 'middle' | 'bottom',
  body: string
) {
  const dx =
    x === 'left'
      ? p.left - PAGE.left
      : x === 'right'
        ? p.right - PAGE.right
        : (p.left + p.right - PAGE.left - PAGE.right) / 2;
  const dy =
    y === 'top'
      ? p.top - PAGE.top
      : y === 'bottom'
        ? p.bottom - PAGE.bottom
        : (p.top + p.bottom - PAGE.top - PAGE.bottom) / 2;
  return dx === 0 && dy === 0
    ? body
    : `<g transform="translate(${dx.toFixed(1)} ${dy.toFixed(1)})">${body}</g>`;
}

const edge = (side: string) =>
  `max(calc(var(--safe-${side}, env(safe-area-inset-${side})) + ${INSET}px * var(--k)), calc(${GUTTER}px * var(--k)))`;
const STYLE = `
.ui { position: fixed; inset: 0; pointer-events: none; user-select: none; -webkit-user-select: none;
  -webkit-touch-callout: none; -webkit-tap-highlight-color: transparent; font-family: "Iowan Old Style", Georgia, serif; }
.ui * { pointer-events: none; }
.ui [hidden] { display: none !important; }
.ui .press, .ui .press * { pointer-events: auto; cursor: pointer; touch-action: manipulation; }
.ui .piece { position: absolute; }
.ui svg { display: block; }
.ui .top { top: ${edge('top')}; }
.ui .bottom { bottom: ${edge('bottom')}; }
.ui .left { left: ${edge('left')}; }
.ui .right { right: ${edge('right')}; }
.ui .center { left: 50%; translate: -50% 0; }
.ui .sized { scale: var(--k); }
.ui .mark { position: absolute; transform: translate(-50%, -50%) scale(var(--k)); }
.ui .screen { position: absolute; inset: 0; }
.ui .screen.press { pointer-events: auto; }
.ui .gone, .ui .gone * { pointer-events: none !important; }
.ui .tap { transform-box: fill-box; transform-origin: center;
  transition: transform ${MOTION.press.release}ms ${MOTION.press.ease}, filter ${MOTION.press.release}ms ease; }
.ui .tap.down { transform: scale(${MOTION.press.scale}); filter: brightness(.93);
  transition-duration: ${MOTION.press.ms}ms; }
.ui .pop { transform-box: fill-box; transform-origin: center;
  animation: pop ${MOTION.dot.ms}ms ${MOTION.dot.ease} both; }
@keyframes pop { from { transform: scale(0); opacity: 0 } }
.ui .two .sure, .ui .two.armed .unsure { display: none; }
.ui .two.armed .sure { display: inline; }
@keyframes needle { from { transform: rotate(-38deg) } to { transform: rotate(52deg) } }
`;

export function show(el: HTMLElement, on: boolean) {
  if (el.hidden === on) el.hidden = !on;
}

const fading = new WeakMap<HTMLElement, number>();

export function fade(el: HTMLElement, on: boolean, ms = FADE) {
  if (on === (!el.hidden && !el.classList.contains('gone'))) return;
  clearTimeout(fading.get(el));
  el.style.transition = `opacity ${ms}ms ease`;
  if (on) {
    el.classList.remove('gone');
    if (el.hidden) {
      el.style.opacity = '0';
      el.hidden = false;
      reflow(el);
    }
    el.style.opacity = '1';
  } else {
    el.classList.add('gone');
    el.style.opacity = '0';
    fading.set(
      el,
      window.setTimeout(() => {
        el.hidden = true;
      }, ms)
    );
  }
}

export function reflow(el: HTMLElement) {
  void el.offsetWidth;
}

export const boxOf = (el: Element): DOMRect => el.getBoundingClientRect();

const resizes = new Set<() => void>();

export function onResize(fn: () => void): () => void {
  resizes.add(fn);
  return () => resizes.delete(fn);
}

let layer: HTMLElement | null = null;
export function uiLayer(): HTMLElement {
  if (layer) return layer;
  const style = document.createElement('style');
  style.textContent = STYLE;
  document.head.appendChild(style);
  for (const [name, value] of cssInks)
    document.documentElement.style.setProperty(name, value);
  const defs = svgNode(0, 0, DEFS);
  defs.style.position = 'absolute';
  const el = document.createElement('div');
  el.className = 'ui';
  el.append(defs);
  document.body.appendChild(el);
  layer = el;
  const resized = () => {
    [view.w, view.h, view.k, view.dpr] = [
      innerWidth,
      innerHeight,
      size(innerWidth, innerHeight),
      devicePixelRatio,
    ];
    el.style.setProperty('--k', view.k.toFixed(4));
    for (const fn of resizes) fn();
  };
  resized();
  addEventListener('resize', resized);
  return el;
}

let probe: HTMLElement | null = null;
export function insets(): Insets {
  if (!probe) {
    probe = document.createElement('div');
    probe.style.cssText =
      'position:absolute;visibility:hidden;padding:var(--safe-top, env(safe-area-inset-top)) ' +
      'var(--safe-right, env(safe-area-inset-right)) var(--safe-bottom, env(safe-area-inset-bottom)) var(--safe-left, env(safe-area-inset-left))';
    uiLayer().appendChild(probe);
  }
  const s = getComputedStyle(probe),
    px = (v: string) => parseFloat(v) || 0;
  return {
    top: px(s.paddingTop),
    right: px(s.paddingRight),
    bottom: px(s.paddingBottom),
    left: px(s.paddingLeft),
  };
}

export const page = () => pageFor(view.w, view.h, insets());

export function screen(press = false): HTMLDivElement {
  const el = document.createElement('div');
  el.className = press ? 'screen press' : 'screen';
  el.hidden = true;
  uiLayer().appendChild(el);
  return el;
}

export function piece(
  parent: HTMLElement,
  place: string,
  press = false,
  sized = false
): HTMLDivElement {
  const el = document.createElement('div');
  el.className = `piece ${place}${press ? ' press' : ''}${sized ? ' sized' : ''}`;
  const has = (c: string) => place.split(' ').includes(c);
  if (sized)
    el.style.transformOrigin = `${has('left') ? '0' : has('right') ? '100%' : '50%'} ${has('top') ? '0' : has('bottom') ? '100%' : '50%'}`;
  parent.appendChild(el);
  return el;
}
