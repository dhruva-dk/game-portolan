// The kit's two instruments: the dial (a half disc, its needle on a share of
// it, a word at each end: the chairman's happiness, a driver's morale) and the
// bar chart with markers (a bar a thing, the best in the championship a line
// across it, the grid's average a mark at its side).

import { OFFICE, alpha, toneOf } from '../ink.ts';
import { clamp } from '../../world/scalar.ts';
import { drawn, el, share, styled } from './part.ts';

/** The dial's drawing: its box, its centre at the foot, the disc's radius. */
const DIAL = { w: 150, h: 84, cx: 75, cy: 78, r: 68 } as const;

/** The point `r` from the dial's centre at `share` of the way round, left to right. */
const round = (of: number, r: number) => {
  const a = Math.PI * (1 - of);
  return `${(DIAL.cx + r * Math.cos(a)).toFixed(1)} ${(DIAL.cy - r * Math.sin(a)).toFixed(1)}`;
};

/** An arc of the dial's rim from `from` to `to` (shares), `r` out. */
const rim = (from: number, to: number, r: number) =>
  `M${round(from, r)}A${r} ${r} 0 0 1 ${round(to, r)}`;

/**
 * The dial, `width` px across, its needle at `of` (0…1) of the way from `low`
 * to `high`, the words at its two ends.
 */
export function dial(of: number, low: string, high: string, width = 150) {
  const at = clamp(of),
    { cx, cy, r } = DIAL;
  let ticks = '';
  for (let i = 0; i <= 10; i++)
    ticks += `M${round(i / 10, r - 15)}L${round(i / 10, r - (i % 5 ? 21 : 25))}`;
  const zone = (from: number, to: number, colour: string) =>
    `<path d="${rim(from, to, r - 6)}" fill="none" stroke="${colour}" stroke-width="7"/>`;
  // the needle: a taper from its hub to its point
  const a = Math.PI * (1 - at),
    nx = Math.cos(a),
    ny = -Math.sin(a);
  const needle =
    `M${(cx - ny * 4).toFixed(1)} ${(cy + nx * 4).toFixed(1)}L${round(at, r - 16)}` +
    `L${(cx + ny * 4).toFixed(1)} ${(cy - nx * 4).toFixed(1)}Z`;
  const svg = drawn(
    DIAL.w,
    DIAL.h,
    `<path d="${rim(0, 1, r)}Z" fill="${OFFICE.dark}" stroke="${OFFICE.ink}" stroke-width="1.5" stroke-linejoin="round"/>` +
      zone(0, 0.34, OFFICE.bad) +
      zone(0.34, 0.67, OFFICE.warn) +
      zone(0.67, 1, OFFICE.good) +
      `<path d="${ticks}" fill="none" stroke="${alpha(OFFICE.ink, 0.6)}" stroke-width="1.5"/>` +
      `<path d="${needle}" fill="${OFFICE.ink}"/><circle cx="${cx}" cy="${cy}" r="7" fill="${OFFICE.ink}"/>` +
      `<circle cx="${cx}" cy="${cy}" r="2.5" fill="${OFFICE.panel}"/>`
  );
  svg.setAttribute('width', String(width));
  svg.setAttribute('height', String((width * DIAL.h) / DIAL.w));
  return el(
    'div',
    'k-dial',
    svg,
    el('div', 'k-ends', el('span', '', low), el('span', '', high))
  );
}

/** A bar of the chart: its name, and three shares of the chart's height (0…1): hers, the best, the average. */
interface Bar {
  name: string;
  value: number;
  best: number;
  average: number;
}

/**
 * The bar chart: `bars` side by side, each on the tone of its value, the best
 * a line across it and the average a mark at its side; `best` and `average`
 * name those two in the key over it.
 */
export function bars(all: readonly Bar[], best: string, average: string) {
  return el(
    'div',
    'k-bars',
    el(
      'div',
      'k-key',
      el('span', '', el('i', 'k-best'), best),
      el('span', '', average, el('i', 'k-avg'))
    ),
    el(
      'div',
      'k-plot',
      ...all.map((b) =>
        el(
          'div',
          'k-col',
          styled(el('i', `t-${toneOf(b.value)}`), {
            '--share': share(b.value),
          }),
          styled(el('b', 'k-best'), { '--at': share(b.best) }),
          styled(el('b', 'k-avg'), { '--at': share(b.average) })
        )
      )
    ),
    el('div', 'k-names', ...all.map((b) => el('div', '', b.name)))
  );
}
