// What every part of the office's kit is made of (Phase C section 3): an element and a way to update it, `set`. A part
// keeps no career state; it draws what it is given and calls back what is tapped. Its look is in kit/style.ts.

import { onTap } from '../ui';

/** A part of the kit: its element, and `set` to draw it anew from its value. */
export interface Part<V> { el: HTMLElement; set(v: V): void }

/** An element of `tag` with the classes `cls`, appended to `parent` if given, holding `text` if given. */
export function make<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', parent?: HTMLElement | null, text?: string): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (text !== undefined) el.textContent = text;
  parent?.appendChild(el);
  return el;
}

/** The office's sounds besides a tap (every `.press` ticks on its own: main.ts): a stamp pressed, Coin spent. */
export type OfficeSound = 'stamp' | 'coin';
/** The event a part raises to be heard (main.ts listens for it and plays it). */
export const SOUND_EVENT = 'office-sound';
/** Raises `sound` from `el`, to be heard. */
export function sound(el: HTMLElement, s: OfficeSound) {
  el.dispatchEvent(new CustomEvent<OfficeSound>(SOUND_EVENT, { detail: s, bubbles: true }));
}

/** Makes `el` take taps, calling `act` on each (unless it is disabled: `aria-disabled`); a button to assistive tech. */
export function tappable(el: HTMLElement, act: () => void) {
  el.classList.add('press');
  if (!el.getAttribute('role')) el.setAttribute('role', 'button');
  onTap(el, () => {
    if (el.getAttribute('aria-disabled') !== 'true') act();
  });
}

/** Sets `el` disabled or not: greyed and deaf to taps. */
export function disable(el: HTMLElement, off: boolean) {
  el.setAttribute('aria-disabled', String(off));
  el.classList.toggle('off', off);
}

/** A number as the office sets it: grouped by thousands with thin spaces, signed if asked. */
export function grouped(n: number, signed = false): string {
  const s = Math.abs(Math.round(n)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${n < 0 ? '−' : signed && n > 0 ? '+' : ''}${s}`;
}
