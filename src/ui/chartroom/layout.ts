// A screen's page, laid out in one of a few shapes the office keeps to: the
// ledger (a narrow column, the broad middle, a narrow column), the side (a
// narrow column beside the broad), the aside (the broad, a narrow column at its
// right), and cards (an even grid of them). A column
// stacks its sheets; a sheet told to grow takes the room left in it.

import { el, type Kid } from '../kit/part.ts';
import { u } from './tokens.ts';

export const LAYOUT_CSS = `
.cr-page { display: grid; gap: var(--s4); padding: var(--s4) var(--s6); min-height: 0; }
.cr-page.ledger { grid-template-columns: ${u(168)} minmax(0, 1fr) ${u(176)}; }
.cr-page.side { grid-template-columns: ${u(168)} minmax(0, 1fr); }
.cr-page.aside { grid-template-columns: minmax(0, 1fr) ${u(176)}; }
.cr-page.cards { grid-template-columns: repeat(var(--cols), minmax(0, 1fr)); grid-template-rows: repeat(var(--rows), minmax(0, 1fr)); }
.cr-col { display: flex; flex-direction: column; gap: var(--s4); min-width: 0; min-height: 0; }
.cr-grow { flex: 1; min-height: 0; }
`;

/** A page's shape: the ledger's three columns, the side's two (the narrow at the left), the aside's (the narrow at
 *  the right), or `cols` × `rows` cards. */
type Shape = 'ledger' | 'side' | 'aside' | { cols: number; rows: number };

/** A screen's page in the shape `shape`; `cls` names the screen (its own looks, `s-<name>`). */
export function page(shape: Shape, cls: string, ...kids: Kid[]) {
  const made = el(
    'div',
    `cr cr-page ${typeof shape === 'string' ? shape : 'cards'} ${cls}`,
    ...kids
  );
  if (typeof shape !== 'string') {
    made.style.setProperty('--cols', String(shape.cols));
    made.style.setProperty('--rows', String(shape.rows));
  }
  return made;
}

/** A column of the page: its sheets stacked. */
export const column = (...kids: Kid[]) => el('div', 'cr-col', ...kids);
