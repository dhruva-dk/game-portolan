// The chartroom's data: ruled, never cut. Terms are names and values a ruled
// line each; a stat stands on its quality ladder (UI-TOKENS.md: silver,
// verdigris, azurite, purpure, gold) as a tile and a track with its ceiling
// ticked; a meter is a share in a wash; shares are set against the best and
// the average on ruled tracks; a track reached by steps has a node at each;
// work under way is striped as far as it has got; a table is a ledger's page,
// figures right-set and tabular, the player's own row gilt.

import { el, pressed, share, styled, type Kid } from '../kit/part.ts';
import { arrow, fig, label } from './figures.ts';
import { UNIT, step, u } from './tokens.ts';

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

.cr-compared { display: flex; flex-direction: column; gap: var(--s4); }
.cr-bars { display: grid; grid-template-columns: auto 1fr; align-items: center; gap: var(--s3) var(--s4); }
.cr-bar { position: relative; height: ${u(9)}; background: var(--paper); box-shadow: inset 0 0 0 var(--w-fine) var(--ink); }
.cr-bar > .fill { position: absolute; left: ${u(1.5)}; top: ${u(1.5)}; bottom: ${u(1.5)}; width: calc(var(--share) - ${u(3)});
  min-width: 0; background: var(--hatch), var(--wash); }
.cr-bar > .avg { position: absolute; left: var(--share); top: ${u(-2.5)}; bottom: ${u(-2.5)}; border-left: var(--w-rule) dashed var(--ink); }
.cr-bar > .best { position: absolute; left: var(--share); top: ${u(-2)}; bottom: ${u(-2)}; width: var(--w-bold);
  margin-left: calc(var(--w-bold) / -2); background: var(--ink); }
.cr-bar > .best::before { content: ''; position: absolute; left: 50%; top: 0; translate: -50% -60%; width: ${u(5)}; height: ${u(5)};
  background: var(--ink); clip-path: polygon(0 0, 100% 0, 50% 100%); }
.cr-key { display: flex; justify-content: center; gap: var(--s5); font: italic 500 var(--t-label) var(--face); color: var(--ink-2); }
.cr-key > span { display: inline-flex; align-items: center; gap: var(--s2); }
.cr-key i.best { width: var(--w-bold); height: ${u(9)}; background: var(--ink); }

/* a gauge: what it measures and where it stands, over its track */
.cr-gauge { display: flex; flex-direction: column; gap: var(--s1); min-width: 0; }
.cr-gauge-head { display: flex; justify-content: space-between; align-items: baseline; gap: var(--s2); min-width: 0; }
.cr-gauge-head > .cr-label { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cr-gauge-head > b { font-weight: 600; font-variant-numeric: lining-nums; white-space: nowrap; }
.cr-gauge-head > b.harm, .cr-harm { color: var(--harm); }
/* a track reached by steps: filled as far as it has come, a node at each step, those reached inked */
.cr-steps { position: relative; height: ${u(7)}; margin: 0 ${u(3.5)}; background: var(--paper);
  box-shadow: inset 0 0 0 var(--w-fine) var(--ink); }
.cr-steps > .fill { position: absolute; left: ${u(1.5)}; top: ${u(1.5)}; bottom: ${u(1.5)}; width: calc(var(--share) - ${u(3)});
  min-width: 0; background: var(--hatch), var(--wash); }
.cr-steps > .node { position: absolute; left: var(--share); top: 50%; width: ${u(7)}; height: ${u(7)}; translate: -50% -50%;
  rotate: 45deg; background: var(--paper-raised); box-shadow: inset 0 0 0 var(--w-rule) var(--ink); }
.cr-steps > .node.reached { background: var(--ink); }
.cr-key i.avg { height: ${u(9)}; border-left: var(--w-rule) dashed var(--ink); }

.cr-table { display: flex; flex-direction: column; min-height: 0; font-variant-numeric: tabular-nums lining-nums; }
.cr-table.scrolls { flex: 1; }
/* a list scrolls in its own box, clipped: room inside it for its papers' cut edges and shadows, the box let out as far */
.cr-rows { flex: 1; min-height: 0; overflow-y: auto; padding: var(--s2); margin: calc(-1 * var(--s2)); }
.cr-tr { display: grid; grid-template-columns: var(--tracks); align-items: center; column-gap: var(--s4); min-height: var(--row);
  padding: 0 var(--s2); border-bottom: var(--w-fine) solid var(--rule); }
.cr-tr.head { min-height: 0; padding-bottom: var(--s1); border-bottom: var(--w-rule) solid var(--ink);
  font: italic 500 var(--t-label) var(--face); color: var(--ink-2); }
.cr-tr.cut { border-bottom: var(--w-rule) solid var(--ink); }
.cr-tr.own { background: var(--gilt); font-weight: 700; box-shadow: inset 0 0 0 var(--w-rule) var(--ink); }
.cr-tr > div { min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.cr-tr > .num { text-align: right; }
.cr-tr.empty { grid-template-columns: 1fr; color: var(--ink-2); font-style: italic; }
.cr-tr.press { transition: translate var(--press); }
.cr-tr.press:active { translate: 0 var(--u); background: var(--paper-sunk); }
.cr-tr.group { grid-template-columns: 1fr; min-height: 0; padding-top: var(--s3); padding-bottom: var(--s1);
  border-bottom: var(--w-hair) solid var(--line); font: 700 var(--t-label)/1.2 var(--face); letter-spacing: .14em;
  text-transform: uppercase; color: var(--ink-2); }
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
function ladder(value: number, ceiling: number | null) {
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

/** A gauge: what it measures (`title`), where it stands (`value`, in the harm ink if `harm`), over its `track`. */
export const gauge = (title: Kid, value: Kid, track: Kid, harm = false) =>
  el(
    'div',
    'cr-gauge',
    el(
      'div',
      'cr-gauge-head',
      label(title),
      el('b', harm ? 'harm' : '', value)
    ),
    track
  );

/** Work under way: a ruled bar striped as far as it has got (0…1). */
export const busy = (of: number) =>
  el('div', 'cr-meter cr-busy', styled(el('i'), { '--share': share(of) }));

/**
 * A track reached by steps (a bond's levels): filled as far as it has come
 * (0…1) in a wash, a node at each step's mark (0…1), the first `reached` of
 * them inked.
 */
export const stepped = (
  of: number,
  marks: readonly number[],
  reached: number,
  wash = 'q1'
) =>
  el(
    'div',
    'cr-steps',
    styled(el('i', 'fill'), {
      '--share': share(of),
      '--wash': `var(--${wash})`,
    }),
    ...marks.map((m, i) =>
      styled(el('i', `node${i < reached ? ' reached' : ''}`), {
        '--share': share(m),
      })
    )
  );

/** A share of something (0…1) against the best of its kind and the average. */
interface Compared {
  name: string;
  value: number;
  best: number;
  average: number;
}

/**
 * Shares against the best and the average, a ruled track each: filled as far
 * as it comes, in its ladder step's wash; the best an ink rule under its
 * pennant (G1: gold is for places, stars and honours), the average dashed;
 * their key under them.
 */
export function compared(
  rows: readonly Compared[],
  key: { best: string; average: string }
) {
  const at = (v: number, cls: string) =>
    styled(el('i', cls), { '--share': share(v) });
  return el(
    'div',
    'cr-compared',
    el(
      'div',
      'cr-bars',
      ...rows.flatMap((r) => [
        label(r.name),
        el(
          'div',
          'cr-bar',
          styled(at(r.value, 'fill'), washed(r.value * TOP)),
          at(r.average, 'avg'),
          at(r.best, 'best')
        ),
      ])
    ),
    el(
      'div',
      'cr-key',
      el('span', '', el('i', 'best'), key.best),
      el('span', '', el('i', 'avg'), key.average)
    )
  );
}

/** A row's height, drawn units (--row); how many rows a scrolled table first shows above the player's own. */
const ROW = 20,
  SHY = 3;

/** A column of a table: its head, its track (a grid track: a token, u(), fr or auto), whether it holds figures, its cell. */
interface Column<R> {
  head: string;
  track: string;
  num?: boolean;
  cell(row: R): Kid;
}

/**
 * A table, a ledger's page: its heads over a rule, a ruled row each, figures
 * right-set; a row `own` says is the player's is gilt, one `cut` says ends a
 * group (the places that go up) is ruled off in ink. With no rows, `none` says
 * so in a row of its own. One that `scrolls` fills what room it is given and
 * scrolls its rows under its heads, which stay; the office keeps how far it is
 * scrolled by its `keep` name, and first scrolls it to have the player's own
 * row a few down from the top. A row `tap` gives a way to opens it on a tap;
 * `group` names the group each row is of, a band over each group's first.
 */
export function table<R>(
  cols: readonly Column<R>[],
  rows: readonly R[],
  how: {
    own?: (row: R) => boolean;
    cut?: (row: R) => boolean;
    tap?: (row: R) => (() => void) | null;
    group?: (row: R) => string;
    none?: string;
    scrolls?: { keep: string };
  } = {}
) {
  const line = (cls: string, cells: readonly Kid[]) =>
    el('div', `cr-tr ${cls}`, ...cells);
  const cells = (pick: (c: Column<R>) => Kid) =>
    cols.map((c) => el('div', c.num ? 'num' : '', pick(c)));
  const row = (r: R) => {
    const made = line(
      `${how.own?.(r) ? 'own' : ''} ${how.cut?.(r) ? 'cut' : ''}`.trim(),
      cells((c) => c.cell(r))
    );
    const go = how.tap?.(r);
    return go ? pressed(made, go) : made;
  };
  let last: string | undefined;
  const lines = [
    ...rows.flatMap((r) => {
      const g = how.group?.(r),
        fresh = g !== undefined && g !== last;
      last = g;
      return fresh ? [line('group', [g]), row(r)] : [row(r)];
    }),
    rows.length === 0 && how.none ? line('empty', [how.none]) : null,
  ];
  const head = line(
    'head',
    cells((c) => c.head)
  );
  let body: Kid[] = lines;
  if (how.scrolls) {
    const mine = how.own ? rows.findIndex(how.own) : -1;
    const list = el('div', 'cr-rows', ...lines);
    list.dataset.keep = how.scrolls.keep;
    list.dataset.top = String(Math.max(0, mine - SHY) * ROW * UNIT);
    body = [list];
  }
  return styled(
    el('div', `cr-table${how.scrolls ? ' scrolls' : ''}`, head, ...body),
    { '--tracks': cols.map((c) => c.track).join(' ') }
  );
}
