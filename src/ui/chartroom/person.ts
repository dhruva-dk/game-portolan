// A person as the office shows one: their portrait (their role's woodcut worn
// on it, if they have one), their name, a line under it, their stars and the
// most they may come to. Over: the portrait above, centred, as a card's head.
// Beside: the portrait at the left, as a compact card's or a row's. A person's
// card is a sheet headed by their post, them at its top, what is said of them,
// and their ways at its foot.

import type { Jacket } from '../gull.ts';
import type { Glyph } from '../glyphs.ts';
import { el, type Kid } from '../kit/part.ts';
import { cut, label, name, portrait, stars } from './figures.ts';
import { sheet } from './paper.ts';
import { u } from './tokens.ts';

export const PERSON_CSS = `
.cr-who { display: flex; min-width: 0; }
.cr-who.over { flex-direction: column; align-items: center; gap: var(--s1); text-align: center; }
.cr-who.beside { align-items: center; gap: var(--s3); }
.cr-who > .cr-said { display: flex; flex-direction: column; gap: ${u(1)}; min-width: 0; }
.cr-who.over > .cr-said { align-items: center; }
.cr-who .cr-name { line-height: 1.1; }
.cr-who.beside .cr-name { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.cr-face-at { position: relative; flex: none; }
.cr-badge { position: absolute; right: ${u(-3)}; bottom: ${u(-2)}; width: ${u(15)}; height: ${u(15)}; display: grid; place-items: center;
  border-radius: 50%; background: var(--paper-raised); box-shadow: 0 0 0 var(--w-fine) var(--ink); }
.cr-badge > svg { width: ${u(11)}; height: ${u(11)}; }
.cr-rating { display: grid; grid-template-columns: auto auto; align-items: center; justify-content: center; gap: ${u(1)} var(--s2); }
.cr-card-foot { margin-top: auto; display: flex; flex-direction: column; gap: var(--s2); }
.cr-card-foot.pair { display: grid; grid-template-columns: 1fr 1fr; align-items: start; }
.cr-card-foot .cr-btn { padding: 0 var(--s2); }
/* a shut way's reason under both of a pair, on one line */
.cr-card-foot.pair > .cr-act { display: contents; }
.cr-card-foot.pair > .cr-act > .cr-label { grid-column: 1 / -1; text-align: center; white-space: nowrap; }
.cr-card-foot > .cr-act > .cr-label, .cr-card-foot > .cr-label { text-align: center; }
`;

/** Stars as known (lo) up to the most they may be (hi). */
interface Span {
  lo: number;
  hi: number;
  known: boolean;
}

/** Who a person is, as the office shows them. */
export interface Who {
  jacket: Jacket;
  name: Kid;
  /** The line under the name (their age, their post). */
  said?: Kid;
  stars?: Span | null;
  potential?: Span | null;
  /** Their role's woodcut, worn on the portrait. */
  badge?: Glyph | null;
}

/** A portrait, its role's woodcut on it if it has one. */
const face = (jacket: Jacket, size: number, badge?: Glyph | null) =>
  el(
    'div',
    'cr-face-at',
    portrait(jacket, size),
    badge ? el('i', 'cr-badge', cut(badge)) : null
  );

/** Their stars, labelled, and the most they may come to under them. */
const rating = (s: Span | null, p: Span | null = null) =>
  s &&
  el(
    'div',
    'cr-rating',
    stars(s.lo, s.hi, 10),
    label(s.known ? 'Stars' : 'Stars, a range'),
    p && stars(p.lo, p.hi, 8),
    p && label('Potential')
  );

/**
 * A person: over (the portrait `size` above, centred; their stars labelled
 * under) or beside (the portrait at the left; their stars small under the name).
 */
export function who(w: Who, size: number, way: 'over' | 'beside' = 'over') {
  const said = w.said === undefined ? null : label(w.said);
  if (way === 'over')
    return el(
      'div',
      'cr-who over',
      face(w.jacket, size, w.badge),
      el('div', 'cr-said', name(w.name), said),
      rating(w.stars ?? null, w.potential ?? null)
    );
  return el(
    'div',
    'cr-who beside',
    face(w.jacket, size, w.badge),
    el(
      'div',
      'cr-said',
      name(w.name),
      said,
      w.stars ? stars(w.stars.lo, w.stars.hi, 9) : null
    )
  );
}

/** How a person's card is made. */
interface Card {
  /** Over (a tall card) or beside (a compact one). */
  way?: 'over' | 'beside';
  /** The portrait's size. */
  size?: number;
  /** Its ways side by side (two), or stacked. */
  pair?: boolean;
  aside?: Kid;
  cls?: string;
}

/** A person's card: a sheet headed `post`, them at its top, `body`, and `ways` at its foot. */
export function personCard(
  post: string,
  w: Who,
  body: readonly Kid[],
  ways: readonly Kid[],
  how: Card = {}
) {
  const way = how.way ?? 'over';
  return sheet(
    post,
    [
      who(w, how.size ?? (way === 'over' ? 44 : 34), way),
      ...body,
      el('div', `cr-card-foot${how.pair ? ' pair' : ''}`, ...ways),
    ],
    { aside: how.aside, cls: how.cls }
  );
}
