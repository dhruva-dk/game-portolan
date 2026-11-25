import { closeButton } from './button.ts';
import { MOTION, SIZE } from './house.ts';
import { INK, roughRect } from './ink.ts';

const r2 = (n: number) => Math.round(n * 100) / 100;

export const RISE = 28;

export function sheet(
  x: number,
  y: number,
  w: number,
  h: number,
  o: { close?: string; seed?: number } = {}
) {
  const rule = SIZE.rule + 2;
  return (
    `<path d="${roughRect(x, y, w, h, o.seed ?? 17)}" fill="url(#pg)" stroke="${INK.iron}" stroke-width="1.3" filter="url(#sh)"/>` +
    `<rect x="${r2(x + rule)}" y="${r2(y + rule)}" width="${r2(w - 2 * rule)}" height="${r2(h - 2 * rule)}" fill="none" stroke="${INK.iron}" stroke-width=".6" opacity=".55"/>` +
    (o.close ? `<g id="${o.close}">${closeButton(x + w - 6, y + 6)}</g>` : '')
  );
}

const leaving = new WeakMap<HTMLElement, number>();

export function rise(el: HTMLElement, on: boolean, instant = false) {
  clearTimeout(leaving.get(el));
  const { ms, ease, leave, leaveEase } = MOTION.sheet;
  const lift = `translateY(calc(${RISE}px * var(--k)))`;
  if (instant) {
    el.style.transition = 'none';
    el.style.transform = '';
    el.style.opacity = on ? '1' : '0';
    el.hidden = !on;
    return;
  }
  if (on) {
    if (el.hidden) {
      el.style.transition = 'none';
      el.style.transform = lift;
      el.style.opacity = '0';
      el.hidden = false;
      void el.offsetWidth;
    }
    el.style.transition = `transform ${ms}ms ${ease}, opacity ${ms * 0.7}ms ease`;
    el.style.transform = '';
    el.style.opacity = '1';
    el.classList.remove('gone');
  } else if (!el.hidden) {
    el.classList.add('gone');
    el.style.transition = `transform ${leave}ms ${leaveEase}, opacity ${leave}ms ease`;
    el.style.transform = lift;
    el.style.opacity = '0';
    leaving.set(
      el,
      window.setTimeout(() => {
        el.hidden = true;
        el.classList.remove('gone');
      }, leave)
    );
  }
}
