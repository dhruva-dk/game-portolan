// Table: ruled rows under a small-caps header, scrolling inside its panel and drawing only the rows in view (a pool of
// row elements, reused as it scrolls). Numbers right-aligned in tabular figures; the player's row bold; one row
// picked on a pale wash.

import { make, tappable, type Part } from './part';

export interface Column<R> {
  label: string;
  /** A CSS grid track: '48px', '1fr'. */
  width: string;
  align?: 'left' | 'right' | 'center';
  /** Fills a cell for a row (text, or any element). */
  cell(r: R, el: HTMLElement): void;
}
export interface Rows<R> { rows: readonly R[]; picked?: number | null; mine?: (r: R) => boolean }
export interface TableOptions<R> { row?: number; pick?: (r: R, i: number) => void }

/** Rows past the view drawn ahead, either side. */
const AHEAD = 3;

/** A table of `columns`, each row `o.row` px tall (44 if it takes taps), calling `o.pick` with a row tapped. */
export function table<R>(columns: readonly Column<R>[], o: TableOptions<R> = {}): Part<Rows<R>> {
  const h = o.row ?? (o.pick ? 44 : 32), tracks = columns.map((c) => c.width).join(' ');
  const el = make('div', 'k-table');
  const head = make('div', 'k-tr k-th', el);
  head.style.gridTemplateColumns = tracks;
  for (const c of columns) make('div', c.align === 'right' ? 'num' : '', head, c.label).style.textAlign = c.align ?? 'left';
  const view = make('div', 'k-rows', el), spacer = make('div', '', view);
  const pool: HTMLElement[] = [];
  let state: Rows<R> = { rows: [] };

  const rowEl = () => {
    const r = make('div', 'k-tr', view);
    r.style.gridTemplateColumns = tracks;
    r.style.height = `${h}px`;
    for (const c of columns) make('div', c.align === 'right' ? 'num' : '', r).style.textAlign = c.align ?? 'left';
    if (o.pick) {
      const pick = o.pick;
      tappable(r, () => {
        const i = Number(r.dataset.i);
        if (state.rows[i] !== undefined) pick(state.rows[i], i);
      });
    }
    pool.push(r);
    return r;
  };

  const draw = () => {
    const { rows } = state, seen = view.clientHeight || 12 * h;
    const first = Math.max(0, Math.floor(view.scrollTop / h) - AHEAD), last = Math.min(rows.length, Math.ceil((view.scrollTop + seen) / h) + AHEAD);
    spacer.style.height = `${rows.length * h}px`;
    while (pool.length < last - first) rowEl();
    pool.forEach((r, k) => {
      const i = first + k;
      if (i >= last) {
        r.style.display = 'none';
        return;
      }
      r.style.display = '';
      if (r.dataset.i === String(i) && r.dataset.v === String(version)) return;
      r.dataset.i = String(i);
      r.dataset.v = String(version);
      r.style.top = `${i * h}px`;
      r.classList.toggle('sel', state.picked === i);
      r.classList.toggle('mine', !!state.mine?.(rows[i]));
      columns.forEach((c, j) => {
        const cell = r.children[j] as HTMLElement;
        cell.textContent = '';
        c.cell(rows[i], cell);
      });
    });
  };
  let version = 0;
  view.addEventListener('scroll', draw, { passive: true });
  return {
    el,
    set(s) {
      state = s;
      version++;
      draw();
      // (set before it is laid out, it drew a guess at its height: drawn again once it is)
      if (!view.clientHeight) requestAnimationFrame(draw);
    },
  };
}
