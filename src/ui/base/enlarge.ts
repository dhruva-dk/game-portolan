import { LARGE } from './card.ts';
import { MOTION } from './house.ts';

const r2 = (n: number) => Math.round(n * 100) / 100;

export type Enlarging = {
  large: HTMLElement;
  under: () => readonly HTMLElement[];
};

const squeezed = (cardW: number) => `scale(${r2(cardW / LARGE.w + 0.12)}, .94)`;

export function growFrom(
  on: Enlarging,
  origin: { x: number; y: number },
  cardW: number
) {
  const { large } = on,
    { ms, ease } = MOTION.card;
  large.style.transformOrigin = `${r2(origin.x)}px ${r2(origin.y)}px`;
  large.style.transition = 'none';
  large.style.transform = squeezed(cardW);
  large.style.opacity = '0';
  large.hidden = false;
  void large.offsetWidth;
  large.style.transition = `transform ${ms}ms ${ease}, opacity ${ms * 0.6}ms ease`;
  large.style.transform = '';
  large.style.opacity = '1';
  for (const c of on.under()) {
    c.style.transition = `opacity ${ms}ms ease`;
    c.style.opacity = '0';
    c.style.pointerEvents = 'none';
  }
}

export function shrinkBack(
  on: Enlarging,
  cardW: number,
  instant: boolean,
  still: () => boolean
) {
  const { large } = on,
    { ms, ease } = MOTION.card;
  for (const c of on.under()) {
    c.style.transition = instant ? 'none' : `opacity ${ms}ms ease`;
    c.style.opacity = '1';
    c.style.pointerEvents = '';
  }
  if (instant) {
    large.hidden = true;
    return;
  }
  large.style.transition = `transform ${ms * 0.8}ms ${ease}, opacity ${ms * 0.6}ms ease`;
  large.style.transform = squeezed(cardW);
  large.style.opacity = '0';
  window.setTimeout(() => {
    if (!still()) large.hidden = true;
  }, ms);
}
