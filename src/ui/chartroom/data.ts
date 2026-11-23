// The chartroom's data: ruled, never cut. Terms are names and values a ruled
// line each; a stat stands on its quality ladder (UI-TOKENS.md: silver,
// verdigris, azurite, purpure, gold) as a tile and a track with its ceiling
// ticked; a meter is a share in a wash; work under way is striped as far as it
// has got; a table is a ledger's page, figures right-set and tabular, the
// player's own row gilt.

import { el, share, styled, type Kid } from '../kit/part.ts';
import { arrow, fig, label } from './figures.ts';
import { step, u } from './tokens.ts';

export const DATA_CSS = `
.cr-terms > div { display: flex; justify-content: space-between; align-items: baseline; gap: var(--s4);
  padding: var(--s2) 0; border-bottom: var(--w-fine) solid var(--rule); }
.cr-terms b { font-weight: 600; text-align: right; font-variant-numeric: tabular-nums lining-nums; }

.cr-ladder { position: relative; height: ${u(5)}; background: var(--paper); box-shadow: inset 0 0 0 var(--w-fine) var(--ink); }
.cr-ladder > .fill { position: absolute; left: ${u(1)}; top: ${u(1)}; bottom: ${u(1)}; width: calc(var(--share) - ${u(2)});
  min-width: 0; background: var(--hatch), var(--wash); }
.cr-ladder > .ceil { position: absolute; left: var(--share); top: ${u(-2)}; bottom: ${u(-2)}; width: var(--w-rule);
  margin-left: calc(var(--w-rule) / -2); background: var(--ink); }
.cr-ladder > .tick { position: absolute; left: var(--share); bottom: 0; height: ${u(1.6)}; width: var(--w-hair); background: var(--line); }

.cr-tile { display: flex; flex-direction: column; gap: var(--s2); min-width: 0; }
.cr-tile-name { display: flex; justify-content: space-between; align-items: baseline; gap: var(--s2); }
.cr-tile-name > .cr-label { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cr-tile > .cr-fig { text-align: center; padding: var(--s2) 0 ${u(3)}; background: var(--wash); color: var(--on);
  box-shadow: inset 0 0 0 var(--w-fine) var(--ink); }

.cr-meter { position: relative; height: ${u(9)}; background: var(--paper); box-shadow: inset 0 0 0 var(--w-fine) var(--ink); }
.cr-meter > i { position: absolute; left: ${u(1.5)}; top: ${u(1.5)}; bottom: ${u(1.5)}; width: calc(var(--share) - ${u(3)});
  min-width: 0; background: var(--hatch), var(--wash); opacity: .85; }
.cr-busy > i { background: var(--stripes); opacity: 1; }

.cr-table { display: flex; flex-direction: column; min-height: 0; font-variant-numeric: tabular-nums lining-nums; }
.cr-tr { display: grid; grid-template-columns: var(--tracks); align-items: center; column-gap: var(--s4); min-height: var(--row);
  padding: 0 var(--s2); border-bottom: var(--w-fine) solid var(--rule); }
.cr-tr.head { min-height: 0; padding-bottom: var(--s1); border-bottom: var(--w-rule) solid var(--ink);
  font: italic 500 var(--t-label) var(--face); color: var(--ink-2); }
.cr-tr.own { background: var(--gilt); font-weight: 700; box-shadow: inset 0 0 0 var(--w-rule) var(--ink); }
.cr-tr > div { min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.cr-tr > .num { text-align: right; }
.cr-tr.empty { grid-template-columns: 1fr; color: var(--ink-2); font-style: italic; }
`;

/** Names and their values, a ruled line each. */
export const terms = (rows: readonly (readonly [string, Kid])[]) =>
  el(
    'div',
    'cr-terms',
    ...rows.map(([n, v]) => el('div', '', label(n), el('b', '', v)))
  );

/** The most a stat may be. */
const TOP = 20;

/** A stat's ladder step's wash and the ink set on it, as custom properties. */
const washed = (value: number) => {
  const q = step(value);
  return { '--wash': `var(--q${q})`, '--on': `var(--q${q}-on)` };
};

/**
 * A stat 0…20 as a ruled track: its wash as far as its value, a rule at its
 * ceiling (the most it may come to), ticks at each fifth.
 */
export function ladder(value: number, ceiling: number | null) {
  const at = (v: number, cls: string) =>
    styled(el('i', cls), { '--share': share(v / TOP) });
  return el(
    'div',
    'cr-ladder',
    styled(at(value, 'fill'), washed(value)),
    ...[5, 10, 15].map((t) => at(t, 'tick')),
    ceiling === null ? null : at(ceiling, 'ceil')
  );
}

/** A stat's tile: its name and which way it heads, its figure on its ladder's wash, its track. */
export const statTile = (
  name: string,
  value: number,
  ceiling: number | null,
  way: number
) =>
  styled(
    el(
      'div',
      'cr-tile',
      el('div', 'cr-tile-name', label(name), arrow(way)),
      fig(value, 's'),
      ladder(value, ceiling)
    ),
    washed(value)
  );

/** A share (0…1) as a ruled bar filled in a wash (a token's name). */
export const meter = (of: number, wash = 'q2') =>
  el(
    'div',
    'cr-meter',
    styled(el('i'), { '--share': share(of), '--wash': `var(--${wash})` })
  );

/** Work under way: a ruled bar striped as far as it has got (0…1). */
export const busy = (of: number) =>
  el('div', 'cr-meter cr-busy', styled(el('i'), { '--share': share(of) }));

/** A column of a table: its head, its track (a grid track: a token, u(), fr or auto), whether it holds figures, its cell. */
export interface Column<R> {
  head: string;
  track: string;
  num?: boolean;
  cell(row: R): Kid;
}

/**
 * A table, a ledger's page: its heads over a rule, a ruled row each, figures
 * right-set; a row `own` says is the player's is gilt. With no rows, `none`
 * says so in a row of its own.
 */
export function table<R>(
  cols: readonly Column<R>[],
  rows: readonly R[],
  how: { own?: (row: R) => boolean; none?: string } = {}
) {
  const line = (cls: string, cells: readonly Kid[]) =>
    el('div', `cr-tr ${cls}`, ...cells);
  const cells = (pick: (c: Column<R>) => Kid) =>
    cols.map((c) => el('div', c.num ? 'num' : '', pick(c)));
  return styled(
    el(
      'div',
      'cr-table',
      line(
        'head',
        cells((c) => c.head)
      ),
      ...rows.map((r) =>
        line(
          how.own?.(r) ? 'own' : '',
          cells((c) => c.cell(r))
        )
      ),
      rows.length === 0 && how.none ? line('empty', [how.none]) : null
    ),
    { '--tracks': cols.map((c) => c.track).join(' ') }
  );
}
