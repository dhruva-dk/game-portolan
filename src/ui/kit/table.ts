// The kit's table: a small header over ruled rows, the list scrolling inside
// its panel (the page never scrolls). A row may carry its team's colour as a
// bar at its left, be her own (lit, bold) and have a line ruled under it (the
// cut between the places that go up and the rest). A column that names what it
// sorts by takes a tap on its header; the screen keeps which way it is sorted.

import { icon } from './icons.ts';
import { el, pressed, styled, type Kid } from './part.ts';

/** A column: its header, its width as a grid track ('48px', '1fr'), and what it shows of a row. */
interface Column<R> {
  label: string;
  width: string;
  /** Figures, set to the right. */
  num?: boolean;
  cell(row: R): Kid;
  /** What it sorts the rows by: with it, a tap on its header sorts by this column. */
  by?(row: R): number | string;
}

/** Which column the rows are sorted by, and whether from the most down. */
export interface Sorted {
  column: number;
  down: boolean;
}

/** How a table is drawn besides its columns. */
interface TableLook<R> {
  /** A row's height, px (34; 44 where a row takes a tap). */
  height?: number;
  /** Her own row. */
  own?(row: R): boolean;
  /** The colour of the bar at a row's left (its team's). */
  colour?(row: R): string;
  /** Whether a line is ruled under a row. */
  cut?(row: R): boolean;
  /** How the rows are sorted now, and what a tap on a sorting header asks. */
  sorted?: Sorted;
  sort?(to: Sorted): void;
  /** A tap on a row. */
  pick?(row: R): void;
  /** The list's name, by which the office keeps how far it is scrolled when it is drawn again. */
  keep?: string;
}

/** `rows` as `sorted` has them: by that column's key, from the most down or the least up. */
function ordered<R>(
  rows: readonly R[],
  columns: readonly Column<R>[],
  sorted: Sorted | undefined
) {
  const by = sorted && columns[sorted.column]?.by;
  if (!sorted || !by) return rows;
  const way = sorted.down ? -1 : 1;
  return [...rows].sort((a, b) => {
    const x = by(a),
      y = by(b);
    return (x < y ? -1 : x > y ? 1 : 0) * way;
  });
}

/** The table of `rows` in `columns`. */
export function table<R>(
  columns: readonly Column<R>[],
  rows: readonly R[],
  look: TableLook<R> = {}
) {
  const tracks = columns.map((c) => c.width).join(' '),
    height = look.height ?? (look.pick ? 44 : 34),
    { sorted, sort, pick } = look;
  const head = el(
    'div',
    `k-tr k-th${sort ? ' sorts' : ''}`,
    ...columns.map((c, i) => {
      const at = sorted?.column === i ? sorted : null;
      const cell = el(
        'div',
        `${c.num ? 'num' : ''}${at ? ' sorted' : ''}`,
        c.label,
        at && icon(at.down ? 'down' : 'up', 14)
      );
      return sort && c.by
        ? pressed(cell, () =>
            sort({ column: i, down: at ? !at.down : c.num === true })
          )
        : cell;
    })
  );
  head.style.gridTemplateColumns = tracks;
  const list = ordered(rows, columns, sorted);
  const body = el(
    'div',
    'k-rows',
    ...list.map((r) => {
      const row = el(
        'div',
        `k-tr${look.own?.(r) ? ' own' : ''}${look.cut?.(r) ? ' cut' : ''}`,
        look.colour && styled(el('i'), { '--team': look.colour(r) }),
        ...columns.map((c) => el('div', c.num ? 'num' : '', c.cell(r)))
      );
      row.style.gridTemplateColumns = tracks;
      row.style.height = `${height}px`;
      return pick ? pressed(row, () => pick(r)) : row;
    })
  );
  // her own row three down from the list's top, where the list has not been scrolled yet (the office: settle)
  const own = look.own ? list.findIndex(look.own) : -1;
  if (own > 0) body.dataset.top = String(Math.max(0, own - 3) * height);
  if (look.keep) body.dataset.keep = look.keep;
  return el('div', 'k-table', head, body);
}
