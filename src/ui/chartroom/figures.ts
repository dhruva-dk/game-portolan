// The chartroom's words and marks: a label in the second ink, a figure in the
// chartmaker's italic (old-style in a line of text, lining from fig-l up), a
// woodcut drawn at the unit's size, and the marks a person is told by: their
// stars, their traits' rosettes, a place won, their portrait, a count unread.

import { bust, type Jacket } from '../gull.ts';
import { alpha, figure, roughCircle, svgNode } from '../ink.ts';
import { el, type Kid } from '../kit/part.ts';
import { badge } from '../marks.ts';
import { TONE, u } from './tokens.ts';

export const FIGURES_CSS = `
.cr-label { font: italic 500 var(--t-label)/1.25 var(--face); color: var(--ink-2); }
.cr-name { font: 600 var(--t-name)/1.15 var(--face); }
.cr-fig { font-family: var(--face); font-style: italic; font-weight: 400; line-height: 1;
  font-variant-numeric: oldstyle-nums proportional-nums; }
.cr-fig.s { font-size: var(--fig-s); }
.cr-fig.m { font-size: var(--fig-m); }
.cr-fig.l { font-size: var(--fig-l); font-variant-numeric: lining-nums proportional-nums; }
.cr-mark { flex: none; display: block; }
.cr-stars { display: inline-block; vertical-align: middle; }
.cr-arrow { font-size: var(--t-label); line-height: 1; }
.cr-arrow.up { color: var(--good); }
.cr-arrow.down { color: var(--harm); }
.cr-place { display: flex; flex-direction: column; align-items: center; }
.cr-face { flex: none; position: relative; border-radius: 50%; overflow: hidden; background: var(--sea);
  box-shadow: 0 0 0 var(--w-bold) var(--ink), inset 0 0 0 var(--s1) var(--paper), inset 0 0 0 ${u(2.5)} var(--line); }
.cr-face > svg { position: absolute; inset: 0; width: 100%; height: 100%; }
`;

/** A woodcut `w` × `h` in its own units, shown at as many drawn units. */
export function mark(w: number, h: number, body: string, cls = '') {
  const s = svgNode(w, h, body);
  s.style.width = u(w);
  s.style.height = u(h);
  s.setAttribute('class', `cr-mark ${cls}`.trim());
  return s;
}

/** A label: italic, in the second ink. */
export const label = (text: Kid) => el('span', 'cr-label', text);

/** A name: roman, a little heavier than the text round it. */
export const name = (text: Kid) => el('span', 'cr-name', text);

/** A figure standing alone, in the chartmaker's italic, at a figure's size. */
export const fig = (text: Kid, size: 's' | 'm' | 'l' = 'm') =>
  el('span', `cr-fig ${size}`, text);

/** Which way a thing is heading: up good, down harm, level nothing. */
export const arrow = (way: number) =>
  way === 0
    ? null
    : el('span', `cr-arrow ${way > 0 ? 'up' : 'down'}`, way > 0 ? '▲' : '▼');

/** A star's outline, 20 units across. */
const STAR =
  'M10 1.4l2.7 5.6 6.1.9-4.4 4.3 1 6.1L10 15.4l-5.4 2.9 1-6.1L1.2 7.9l6.1-.9z';
let clips = 0;

/**
 * Five woodcut stars by halves, `size` units high: as many as are known gold
 * and hatched, then hollow to the most they may come to, then empty.
 */
export function stars(known: number, possible = known, size = 11) {
  const half = `cr-half-${++clips}`;
  const gold = `<path d="${STAR}" fill="${TONE.wonWash}"/><path d="${STAR}" fill="url(#h-gold)" stroke="${TONE.ink}" stroke-width="1.1" stroke-linejoin="round"/>`;
  const empty = `<path d="${STAR}" fill="${alpha(TONE.ink, 0.08)}" stroke="${alpha(TONE.ink, 0.35)}" stroke-width=".9" stroke-linejoin="round"/>`;
  const hollow = `<path d="${STAR}" fill="none" stroke="${TONE.won}" stroke-width="1.4" stroke-dasharray="2.2 1.4" stroke-linejoin="round"/>`;
  let body = `<defs><clipPath id="${half}"><rect width="10" height="20"/></clipPath></defs>`;
  for (let i = 0; i < 5; i++) {
    const full = known - i,
      may = possible - i;
    const star =
      full >= 1
        ? gold
        : full >= 0.5
          ? `${empty}<g clip-path="url(#${half})">${gold}</g>${may >= 1 ? hollow : ''}`
          : may >= 0.5
            ? hollow
            : empty;
    body += `<g transform="translate(${i * 21} 0)">${star}</g>`;
  }
  const s = mark(104, 20, body, 'cr-stars');
  s.style.width = u((size * 104) / 20);
  s.style.height = u(size);
  return s;
}

/** A trait's rosette (marks.ts badge): a plus on it if the trait helps, a minus if it hinders. */
export const traitBadge = (good: boolean) =>
  mark(
    28,
    34,
    badge(
      14,
      13,
      figure(14, 13.5, good ? '+' : '−', 14, {
        fill: good ? TONE.good : TONE.harm,
        weight: 700,
      })
    )
  );

/** A place in a race, of how many: on the podium, its figure on a gilt disc (the laurel is an honour's). */
export function place(n: number, of: number) {
  const podium = n <= 3;
  const disc = podium
    ? `<circle cx="36" cy="36" r="27" fill="${TONE.gilt}" stroke="${TONE.won}" stroke-width="3"/>` +
      `<circle cx="36" cy="36" r="22.5" fill="none" stroke="${TONE.ink}" stroke-width=".8" opacity=".55"/>`
    : '';
  return el(
    'div',
    'cr-place',
    mark(
      72,
      72,
      disc +
        figure(36, 36, n, n >= 10 ? 26 : 30, { weight: podium ? 600 : 400 })
    ),
    label(`of ${of}`)
  );
}

/** A person's portrait, `size` units across: the gull in his jacket (gull.ts), in a paper disc ruled inside its ring. */
export function portrait(jacket: Jacket, size: number) {
  const disc = el('div', 'cr-face', bust(jacket, size));
  disc.style.width = disc.style.height = u(size);
  return disc;
}

/** A count not yet read: a rubric paper disc with its figure. */
export const unread = (n: number) =>
  mark(
    22,
    22,
    `<path d="${roughCircle(11, 11, 9.5, n * 5 + 3, 0.9)}" fill="${TONE.harm}" stroke="${TONE.ink}" stroke-width="1.2"/>` +
      `<circle cx="11" cy="11" r="7" fill="none" stroke="${TONE.onInk}" stroke-width=".5" opacity=".6"/>` +
      figure(11, 11.5, n, 11, { fill: TONE.onInk, weight: 700 })
  );
