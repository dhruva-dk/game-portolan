// Panel: a ruled paper laid on the desk at a place on the 12-column grid, with a small-caps heading, a note at the
// heading's right (a count, a date), and a body the screen fills. `scroll` lets the body scroll (the page never does).

import { make, type Part } from './part';

/** The body's grid (Phase C section 5): 1148 px wide in 12 columns of 16 px gutters. */
export const COL = (1148 - 11 * 16) / 12, GUTTER = 16;
/** The left edge and width of columns `from`..`to` (1-based, inclusive). */
export const cols = (from: number, to: number) => ({ left: (from - 1) * (COL + GUTTER), width: (to - from + 1) * COL + (to - from) * GUTTER });

export interface PanelPlace { from: number; to: number; top: number; height: number }
export interface PanelText { title: string; note?: string }
export interface Panel extends Part<PanelText> { body: HTMLElement; head: HTMLElement }

/** A panel over columns `at.from`..`at.to`, `at.top` px down the body, `at.height` tall. */
export function panel(at: PanelPlace | null, text: PanelText, scroll = false): Panel {
  const el = make('section', 'k-panel');
  if (at) place(el, at);
  const head = make('header', 'k-head', el), title = make('span', '', head), note = make('span', 'k-note', head);
  const body = make('div', 'k-body', el);
  if (scroll) body.style.overflowY = 'auto';
  const set = (t: PanelText) => {
    title.textContent = t.title;
    note.textContent = t.note ?? '';
  };
  set(text);
  return { el, body, head, set };
}

/** Places `el` over columns `at.from`..`at.to` of the body's grid. */
export function place(el: HTMLElement, at: PanelPlace) {
  const c = cols(at.from, at.to);
  Object.assign(el.style, { left: `${c.left}px`, width: `${c.width}px`, top: `${at.top}px`, height: `${at.height}px` });
}
