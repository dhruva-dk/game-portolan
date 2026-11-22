// How the kit shows a value: a stat's tile (its figure on its tone, three to a
// row), stars by halves (the possible past the known shown hollow), a meter, a
// word on a tone (filled, a boxed stamp, or bare), and a job's row, striped as
// far as the job has got.

import { OFFICE, alpha, toneOf, uid, type Tone } from '../ink.ts';
import { drawn, el, share, styled, type Kid } from './part.ts';

/**
 * A stat's tile: `name` over its figure, of a best of `best`, on the tone of
 * its share of that. A pair is a stat not yet scouted: the two it lies
 * between, on plain paper.
 */
export function tile(
  name: string,
  value: number | readonly [number, number],
  best = 20
) {
  const known = typeof value === 'number';
  const fig = el(
    'div',
    `k-fig${known ? ` t-${toneOf(value / best)}` : ''}`,
    el('span', '', known ? value : `${value[0]}-${value[1]}`)
  );
  if (known) styled(fig, { '--share': share(value / best) });
  return el(
    'div',
    `k-tile${known ? '' : ' unknown'}`,
    el('div', 'k-name', name),
    fig
  );
}

/** Tiles three to a row: a driver's nine stats, a designer's six. */
export const tiles = (all: readonly HTMLElement[]) =>
  el('div', 'k-tiles', ...all);

/** A star on a 20 grid. */
const STAR =
  'M10 1.6l2.6 5.5 6 .8-4.4 4.2 1.1 6L10 15.2l-5.3 2.9 1.1-6L1.4 7.9l6-.8z';

/**
 * Five stars `size` px tall: `known` of them gold, by halves; from there to
 * `possible` hollow (a driver not yet scouted, the most they may be); the rest
 * empty.
 */
export function stars(known: number, possible = known, size = 18) {
  const half = uid('half'),
    empty = alpha(OFFICE.ink, 0.2);
  let body =
    `<defs><linearGradient id="${half}"><stop offset=".5" stop-color="${OFFICE.gold}"/>` +
    `<stop offset=".5" stop-color="${empty}"/></linearGradient></defs>`;
  for (let i = 0; i < 5; i++) {
    const full = known - i,
      may = possible - i;
    const fill =
      full >= 1 ? OFFICE.gold : full >= 0.5 ? `url(#${half})` : empty;
    const hollow = full < 0.5 && may >= 0.5;
    body +=
      `<path transform="translate(${i * 20} 0)" d="${STAR}" fill="${hollow ? 'none' : fill}"` +
      (hollow
        ? ` stroke="${OFFICE.gold}" stroke-width="1.6" stroke-linejoin="round"/>`
        : '/>');
  }
  const svg = drawn(100, 20, body, 'k-stars');
  svg.setAttribute('width', String(size * 5));
  svg.setAttribute('height', String(size));
  return svg;
}

/** A meter: a track, `of` (0…1) of it filled in `tone`. */
export const meter = (of: number, tone: Tone = 'go') =>
  styled(el('div', `k-meter t-${tone}`, el('i')), { '--share': share(of) });

/** A word on a tone: filled, a boxed stamp, or the word alone in the tone. */
export const tag = (
  word: string,
  tone: Tone,
  look: 'filled' | 'boxed' | 'bare' = 'filled'
) => el('span', `k-tag t-${tone}${look === 'filled' ? '' : ` ${look}`}`, word);

/**
 * A job under way: the row striped as far as it has got (`done`, 0…1), who or
 * what it is on a plate (a mark, a name), how long is left, and what may be
 * done about it (buttons).
 */
export function job(
  who: { mark: Kid; name: string },
  done: number,
  left: string,
  actions: readonly Kid[]
) {
  return styled(
    el(
      'div',
      'k-job',
      el('i'),
      el('div', 'k-who', who.mark, el('span', '', who.name)),
      el('div', 'k-days', left),
      ...actions
    ),
    { '--share': share(done) }
  );
}
