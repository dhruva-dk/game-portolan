// What every part of the office's kit is made with: an element built in one
// call (el), a drawing set into it (drawn), and a control that takes a tap
// (pressed). A part is a function of plain values that returns its element; it
// keeps no state of the career's, and calls back what is tapped. The kit's look
// is one stylesheet (style.ts).

import { clamp } from '../../world/scalar.ts';
import { svgNode } from '../ink.ts';
import { onTap } from '../touch.ts';

/** What an element may hold: a node, text, a number set as text; nothing. */
export type Kid = Node | string | number | null | undefined | false;

/** An element of `tag` with the classes `cls`, holding `kids` in order. */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  cls = '',
  ...kids: Kid[]
): HTMLElementTagNameMap[K] {
  const made = document.createElement(tag);
  if (cls) made.className = cls;
  for (const k of kids)
    if (k !== null && k !== undefined && k !== false)
      made.append(typeof k === 'number' ? String(k) : k);
  return made;
}

/**
 * A drawing `w` × `h` in its own units, as an <svg> of the classes `cls`: its
 * marks take the element's own colour (currentColor) where they name none.
 */
export function drawn(w: number, h: number, body: string, cls = '') {
  const svg = svgNode(w, h, body);
  svg.setAttribute('overflow', 'hidden');
  if (cls) svg.setAttribute('class', cls);
  return svg;
}

/** A picture taken of the world (an image's address), as an <img>; nothing until there is one. */
export function pictured(address: string | null) {
  if (!address) return null;
  const made = el('img');
  made.src = address;
  made.alt = '';
  return made;
}

/**
 * Makes `made` a control: a tap on it calls `act`, unless it is `off` (shown
 * unavailable, and deaf).
 */
export function pressed<T extends HTMLElement>(
  made: T,
  act: () => void,
  off = false
): T {
  made.classList.add('press');
  made.setAttribute('role', 'button');
  if (off) {
    made.classList.add('off');
    made.setAttribute('aria-disabled', 'true');
  } else onTap(made, act);
  return made;
}

/** `made` with CSS custom properties set on it (a team's colours, a share). */
export function styled<T extends HTMLElement>(
  made: T,
  vars: Readonly<Record<string, string | number>>
): T {
  for (const [name, value] of Object.entries(vars))
    made.style.setProperty(name, String(value));
  return made;
}

/** A share (0…1) as a CSS length of what it is a share of. */
export const share = (of: number) => `${(clamp(of) * 100).toFixed(1)}%`;

/** A number as the office sets it: grouped by thousands, its minus a true one. */
export const grouped = (n: number) =>
  `${n < 0 ? '−' : ''}${Math.abs(Math.round(n))
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;

/** A place as the office sets it: 1st, 2nd, 3rd, 4th, 11th, 22nd. */
export function ordinal(n: number) {
  const tens = n % 100,
    ones = n % 10;
  const tail =
    tens >= 11 && tens <= 13
      ? 'th'
      : ones === 1
        ? 'st'
        : ones === 2
          ? 'nd'
          : ones === 3
            ? 'rd'
            : 'th';
  return `${n}${tail}`;
}
