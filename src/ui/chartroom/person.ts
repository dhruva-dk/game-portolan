// A person as the office shows one: their portrait (their role's woodcut worn
// on it, if they have one), their name, a line under it, their stars and the
// most they may come to. Over: the portrait above, centred, as a card's head.
// Beside: the portrait at the left, as a compact card's or a row's. A person's
// card is a sheet headed by their post, them at its top, what is said of them,
// and their ways at its foot.

import type { Jacket } from '../gull.ts';
import type { Glyph } from '../glyphs.ts';
import { figure, roughRect, svgNode } from '../ink.ts';
import { el, type Kid } from '../kit/part.ts';
import { cut, label, name, portrait, stars } from './figures.ts';
import { sheet } from './paper.ts';
import { TONE, u } from './tokens.ts';

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
.cr-card-foot.pair { display: grid; grid-template-columns: 1fr 1fr; grid-auto-flow: row dense; align-items: start; }
.cr-card-foot .cr-btn { padding: 0 var(--s2); }
/* a shut way's reason under both of a pair, on one line */
.cr-card-foot.pair > .cr-act { display: contents; }
.cr-card-foot.pair > .cr-act > .cr-label { grid-column: 1 / -1; text-align: center; white-space: nowrap; }
.cr-card-foot > .cr-act > .cr-label, .cr-card-foot > .cr-label { text-align: center; }
/* the podium: three steps abutting, their feet on one line */
.cr-podium { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); align-items: end; width: 100%; max-width: ${u(270)};
  margin: 0 auto; }
.cr-stood { display: flex; flex-direction: column; align-items: center; gap: ${u(1)}; min-width: 0; }
.cr-stood > .cr-who { max-width: 100%; padding: 0 var(--s1); }
.cr-stood .cr-name { max-width: 100%; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.cr-stood > svg { display: block; width: 100%; height: auto; margin-top: var(--s1); }
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

/** How high each plinth stands, first to third, in its units (100 across). */
const RISE = [44, 31, 22] as const;

/** A plinth's woodcut, as wide as its place: a block cut by hand under its cap, its right hatched in shade, its
 *  place cut in its face; the first's gilt. */
function plinth(n: number) {
  const h = RISE[n - 1] ?? RISE[2],
    cap = 7,
    face = `${roughRect(4, cap, 92, h - cap, n * 7)}`;
  const s = svgNode(
    100,
    h + 1,
    `<path d="${face}" fill="${n === 1 ? TONE.gilt : TONE.raised}"/>` +
      `<rect x="72" y="${cap}" width="24" height="${h - cap}" fill="url(#h-iron)"/>` +
      `<path d="${face}" fill="none" stroke="${TONE.ink}" stroke-width="1.4"/>` +
      `<path d="${roughRect(0, 0, 100, cap, n * 7 + 1)}" fill="${TONE.raised}" stroke="${TONE.ink}" stroke-width="1.4"/>` +
      figure(40, cap + (h - cap) / 2 + 1, n, Math.min(30, (h - cap) * 0.7), {
        weight: 600,
      })
  );
  s.removeAttribute('width');
  s.removeAttribute('height');
  return s;
}

/** A step of the podium: who stood on it (the line under their name their team's), and what they scored there. */
interface Step {
  who: Who;
  scored: Kid;
}

/** The podium: the first three over their plinths, second, first and third from the left; the first larger. */
export function podium(steps: readonly Step[]) {
  const at = (i: number) => {
    const s = steps[i];
    return (
      s &&
      el(
        'div',
        'cr-stood',
        who(s.who, i === 0 ? 40 : 32),
        el('div', 'cr-scored', s.scored),
        plinth(i + 1)
      )
    );
  };
  return el('div', 'cr-podium', at(1), at(0), at(2));
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
