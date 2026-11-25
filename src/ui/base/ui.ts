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
.ui .two .sure, .ui .two .unsure { transform-box: fill-box; transform-origin: center;
  transition: opacity ${MOTION.fade.ms}ms ${MOTION.fade.ease}, transform ${MOTION.arm.ms}ms ${MOTION.arm.ease}; }
.ui .two .sure { opacity: 0; transform: scale(${MOTION.arm.from}); }
.ui .two.armed .sure { opacity: 1; transform: none; }
.ui .two.armed .unsure { opacity: 0; transform: scale(${2 - MOTION.arm.from}); }
.ui .arrive { transform-box: fill-box; transform-origin: center top;
  animation: arrive ${MOTION.deal.ms}ms ${MOTION.deal.ease} both; }
@keyframes arrive { from { transform: translateY(-10px); opacity: 0 } }
.ui .fan { transform-box: fill-box; transform-origin: center;
  animation: fan ${MOTION.fan.ms}ms ${MOTION.fan.ease} both; }
@keyframes fan { from { transform: rotate(var(--r)) translateX(var(--x)); } }
.ui .glide { animation: glide ${MOTION.glide.ms}ms ${MOTION.glide.ease} both; }
@keyframes glide { from { transform: translateX(var(--x)); } }
.ui .stamp { transform-box: fill-box; transform-origin: center;
  animation: stamp ${MOTION.stamp.ms}ms ${MOTION.stamp.ease} both; }
@keyframes stamp { from { transform: scale(${MOTION.stamp.from}) rotate(-12deg); opacity: 0 } }
.ui .denied { animation: refuse ${MOTION.refuse.ms}ms ease-in-out ${MOTION.stamp.ms}ms both; }
.ui .refuse { animation: refuse ${MOTION.refuse.ms}ms ease-in-out both; }
@keyframes refuse { 20% { transform: translateX(-${MOTION.refuse.shift}px) } 45% { transform: translateX(${MOTION.refuse.shift}px) }
  70% { transform: translateX(-${MOTION.refuse.shift / 2}px) } }
.ui .dealt { transform-origin: 0 0; animation: dealt ${MOTION.deal.ms}ms ${MOTION.deal.ease} both; }
@keyframes dealt { from { transform: translate(var(--x), var(--y)) rotate(${MOTION.dealt.turn}deg) scale(${MOTION.dealt.from}); opacity: 0 } }
.ui .picked { pointer-events: none; transition: transform ${MOTION.glide.ms}ms ${MOTION.glide.ease}; }
.ui .bar { transform-box: fill-box; transform-origin: left center; transition: transform ${MOTION.bar.ms}ms ${MOTION.bar.ease}; }
.ui .ticked { animation: ticked ${MOTION.tick.ms}ms ${MOTION.tick.ease}; }
@keyframes ticked { from { transform: translateY(-${MOTION.tick.rise}px); opacity: .55 } }
.ui .ping { transform-box: fill-box; transform-origin: center; animation: ping ${MOTION.dot.ms}ms ${MOTION.dot.ease}; }
@keyframes ping { 40% { transform: scale(1.5, 1.25) } }
.ui .sealed { transform-box: view-box; transform: rotate(${MOTION.seal.rest}deg);
  animation: sealed ${MOTION.seal.ms}ms ${MOTION.seal.ease} ${MOTION.seal.after}ms both; }
@keyframes sealed { from { transform: scale(${MOTION.seal.from}) rotate(${MOTION.seal.turn}deg); opacity: 0 } }
.ui .flourish { transform-box: view-box; opacity: 0;
  animation: flourish ${MOTION.flourish.ms}ms ${MOTION.flourish.ease} ${MOTION.flourish.after}ms both; }
@keyframes flourish { from { transform: scale(${MOTION.flourish.from}); opacity: 1 } 40% { opacity: .9 } to { transform: scale(${MOTION.flourish.reach}); opacity: 0 } }
.ui .flourish.rays { animation-name: rays; }
@keyframes rays { from { transform: scale(${MOTION.flourish.from}); opacity: 0 } 25% { opacity: 1 } to { transform: scale(${MOTION.flourish.reach} ); opacity: 0 } }
.ui .struck { animation: struck ${MOTION.blow.ms}ms ${MOTION.blow.ease} ${MOTION.blow.after}ms; }
@keyframes struck { 30% { transform: translateY(${MOTION.blow.drop}px) scale(${MOTION.blow.give}) rotate(-.7deg) } 70% { transform: scale(1.012) } }
.ui .field .lit { opacity: 0; transition: opacity ${MOTION.fade.ms}ms ease; }
.ui .field.typing .lit { opacity: 1; }
.ui .dyed * { transition: fill ${MOTION.glide.ms}ms ${MOTION.glide.ease}; }
.ui .answer { transform-box: fill-box; transform-origin: center; animation: answer ${MOTION.answer.ms}ms ${MOTION.answer.ease}; }
@keyframes answer { 35% { transform: scale(${MOTION.answer.swell}) } }
.ui .rolling { transform-box: fill-box; transform-origin: center; animation: rolling ${MOTION.roll.ms}ms ${MOTION.roll.ease}; }
@keyframes rolling { 45% { transform: translateY(-${MOTION.roll.hop}px) rotate(${MOTION.roll.turn * 0.7}deg) scale(1.1) } to { transform: rotate(${MOTION.roll.turn}deg) } }
.ui .waking { transform-box: fill-box; transform-origin: center; animation: waking ${MOTION.wake.ms}ms ${MOTION.wake.ease}; }
@keyframes waking { 40% { transform: scale(${MOTION.wake.swell}) rotate(-1.5deg) } }
.ui .lively { transition: opacity ${MOTION.wake.ms}ms ease; }
.ui .inked-rose { transform-box: fill-box; transform-origin: center;
  animation: inked-rose ${MOTION.title.rose}ms ${MOTION.title.pop} ${MOTION.title.after}ms both; }
@keyframes inked-rose { from { transform: rotate(${MOTION.title.turn}deg) scale(.4); opacity: 0 } }
.ui .inked-rhumbs { transform-box: view-box; animation: inked-rhumbs ${MOTION.title.rhumbs}ms ${MOTION.title.ease} ${MOTION.title.after}ms both; }
@keyframes inked-rhumbs { from { transform: scale(.15); opacity: 0 } }
.ui .inked-word { transform-box: fill-box; transform-origin: center;
  animation: inked-word ${MOTION.title.word}ms ${MOTION.title.ease} ${MOTION.title.after * 2}ms both; }
@keyframes inked-word { from { transform: translateY(6px) scaleX(1.18); opacity: 0; filter: blur(1.5px) } }
.ui .inked-rule { transform-box: fill-box; transform-origin: center;
  animation: inked-rule ${MOTION.title.rule}ms ${MOTION.title.ease} ${MOTION.title.after * 4}ms both; }
@keyframes inked-rule { from { transform: scaleX(0); opacity: 0 } }
.ui .seated { animation: seated ${MOTION.seated.ms}ms ${MOTION.seated.ease} both; }
@keyframes seated { from { transform: translateY(-${MOTION.seated.drop}px) scale(1.04) rotate(-2deg); opacity: 0 } }
.ui .waiting { transform-box: fill-box; transform-origin: center; animation: waiting ${MOTION.suspense.ms}ms ease-in-out infinite; }
@keyframes waiting { 50% { transform: rotate(180deg) } 100% { transform: rotate(180deg) } }
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
    const typing = document.activeElement instanceof HTMLInputElement;
    if (typing && innerWidth === view.w && innerHeight < view.h) return;
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

export function placed(
  parent: HTMLElement,
  x: number,
  y: number,
  w: number,
  h: number
) {
  const el = document.createElement('div');
  el.style.cssText = `position:absolute;left:${x}px;top:${y}px;width:${w}px;height:${h}px`;
  parent.append(el);
  return el;
}
