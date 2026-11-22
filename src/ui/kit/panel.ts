// The papers the office is laid out in: a panel (parchment, inked, its title
// in a bar across its head), the band that labels a region of one, the card (a
// picture under a headline's plate, a foot with its way on), and the dialog
// laid over the page.

import type { Jacket } from '../gull.ts';
import { icon } from './icons.ts';
import { el, styled, type Kid } from './part.ts';

/**
 * A panel titled `title` (none: no head), `aside` at its head's right (a
 * round's count, an info mark), holding `body`.
 */
export function panel(
  title: string | null,
  body: readonly Kid[],
  aside: Kid = null
) {
  return el(
    'section',
    'k-panel',
    title !== null &&
      el('header', 'k-head', title, aside && el('div', 'k-aside', aside)),
    el('div', 'k-body', ...body)
  );
}

/** The small mark at a panel's head that says there is more to read of it. */
export const infoMark = () => el('div', 'k-mark', icon('info', 18));

/** A band across a panel naming the region under it. */
export const band = (label: string) => el('div', 'k-band', label);

/** What a card shows: its headline, what it is about, where it stands, its picture and its way on. */
interface CardFace {
  headline: string;
  subject: string;
  status: string;
  picture: Kid;
  action: Kid;
}

/** A card in a team's colours: its picture under two slashes of them, the headline's plate on it. */
export function card(face: CardFace, colours: Jacket) {
  const slash = (
    left: string,
    width: string,
    colour: string,
    opacity: number
  ) => styled(el('div', 'k-slash'), { left, width, '--team': colour, opacity });
  return el(
    'div',
    'k-card',
    el(
      'div',
      'k-art',
      slash('-12%', '30%', colours[0], 0.9),
      slash('62%', '9%', colours[1], 0.5),
      slash('88%', '30%', colours[0], 0.9),
      el('div', 'k-pic', face.picture),
      el('div', 'k-plate', face.headline),
      el('div', 'k-what', face.subject)
    ),
    el('div', 'k-foot', el('span', '', face.status), face.action)
  );
}

/**
 * A dialog over the page: a panel titled `title` holding `body`, its ways on
 * (`actions`, buttons) at its foot. Returned as its veil, to be laid in the
 * page and taken out again by whoever opened it.
 */
export function dialog(
  title: string,
  body: readonly Kid[],
  actions: readonly Kid[]
) {
  const sheet = panel(title, body);
  sheet.classList.add('k-dialog');
  sheet.append(el('footer', 'k-foot', ...actions));
  return el('div', 'k-veil', sheet);
}
