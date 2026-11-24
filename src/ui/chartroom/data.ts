// The chartroom's data: ruled, never cut. Terms are names and values a ruled
// line each; a stat stands on its quality ladder (silver,
// verdigris, azurite, purpure, gold) as a tile and a track with its ceiling
// ticked; a meter is a share in a wash; shares are set against the best and
// the average on ruled tracks; a track reached by steps has a node at each;
// work under way is striped as far as it has got; a table is a ledger's page,
// figures right-set and tabular, the player's own row gilt.

import { alpha, figure, svgNode } from '../ink.ts';
import { el, grouped, pressed, share, styled, type Kid } from '../kit/part.ts';
import { arrow, fig, label } from './figures.ts';
import { TONE, UNIT, step, u } from './tokens.ts';

export const DATA_CSS = `
.cr-terms > div { display: flex; justify-content: space-between; align-items: baseline; gap: var(--s4);
  padding: var(--s2) 0; border-bottom: var(--w-fine) solid var(--rule); }
/* a name never wraps; a long value does, under its own right edge */
.cr-terms > div > .cr-label { flex: none; white-space: nowrap; }
.cr-terms b { min-width: 0; font-weight: 600; text-align: right; font-variant-numeric: tabular-nums lining-nums; }

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

.cr-course { display: block; width: 100%; height: auto; }

.cr-table { display: flex; flex-direction: column; min-height: 0; font-variant-numeric: tabular-nums lining-nums; }
.cr-table.scrolls { flex: 1; }
/* a list scrolls in its own box, clipped: room inside it for its papers' cut edges and shadows, the box let out as
   far at its sides and foot (never up over its heads, where a row scrolled past would show through them) */
.cr-rows { flex: 1; min-height: 0; overflow-y: auto; padding: 0 var(--s2) var(--s2);
  margin: 0 calc(-1 * var(--s2)) calc(-1 * var(--s2)); }
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

/** A share's wash by thirds: good from two thirds, warn from one, harm under. */
export const washOf = (of: number) =>
  of >= 0.66 ? 'good' : of >= 0.33 ? 'warn' : 'harm';

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

/** A sum short, for an axis: thousands as k. */
const short = (n: number) =>
  Math.abs(n) >= 1000 ? `${grouped(n / 1000)}k` : grouped(n);

/** A round step about `rough`: 1, 2 or 5 times a power of ten. */
function round(rough: number) {
  const p = 10 ** Math.floor(Math.log10(Math.max(1, rough))),
    f = rough / p;
  return (f < 1.5 ? 1 : f < 3.5 ? 2 : f < 7.5 ? 5 : 10) * p;
}

/** The course's drawing, in its own units: its size, and the plot's edges inside it. */
const C = { w: 400, h: 152, l: 34, r: 394, t: 12, b: 134 } as const;

/**
 * A balance's course over a season, a chart as wide as its place: the balance
 * by days as it stepped (`points`, oldest first) over a good wash to `today`;
 * from there dotted on to where it will stand at `end` (`ahead`); the floor
 * under which nothing is spent ruled in harm; round sums ruled across; the
 * dates the season runs `from` and `to` under it.
 */
export function course(
  c: {
    from: string;
    to: string;
    start: number;
    today: number;
    end: number;
    points: readonly { day: number; balance: number }[];
  },
  ahead: number,
  floor: number
) {
  const sums = [...c.points.map((p) => p.balance), ahead, floor, 0];
  const by = round((Math.max(...sums) - Math.min(...sums)) / 4),
    lo = Math.floor(Math.min(...sums) / by) * by,
    hi = Math.ceil(Math.max(...sums) / by) * by;
  const x = (d: number) =>
      C.l + ((d - c.start) / Math.max(1, c.end - c.start)) * (C.r - C.l),
    y = (v: number) => C.b - ((v - lo) / Math.max(1, hi - lo)) * (C.b - C.t);
  const now = c.points.at(-1)?.balance ?? 0;
  const text = (
    at: number,
    v: number,
    s: string,
    o: Parameters<typeof figure>[4]
  ) => figure(at, v, s, 9, { fill: TONE.label, ...o });
  let body = '';
  for (let v = lo; v <= hi; v += by)
    body +=
      `<line x1="${C.l}" x2="${C.r}" y1="${y(v)}" y2="${y(v)}" stroke="${alpha(TONE.ink, v === 0 ? 0.45 : 0.14)}" stroke-width=".7"/>` +
      text(C.l - 4, y(v), short(v), { anchor: 'end' });
  // a day's closing balance: what was paid and taken the same day, netted
  const days = new Map(c.points.map((p) => [p.day, p.balance]));
  let line = '';
  for (const [day, balance] of days)
    line += line
      ? `H${x(day).toFixed(1)}V${y(balance).toFixed(1)}`
      : `M${x(day).toFixed(1)} ${y(balance).toFixed(1)}`;
  line += `H${x(c.today).toFixed(1)}`;
  body +=
    `<path d="${line}V${C.b}H${x(c.start)}Z" fill="${alpha(TONE.good, 0.26)}"/>` +
    `<line x1="${C.l}" x2="${C.r}" y1="${y(floor)}" y2="${y(floor)}" stroke="${TONE.harm}" stroke-width="1.1" stroke-dasharray="5 3"/>` +
    text(C.r, y(floor) - 7, `floor ${short(floor)}`, {
      anchor: 'end',
      fill: TONE.harm,
    }) +
    `<line x1="${x(c.today)}" x2="${x(c.today)}" y1="${C.t}" y2="${C.b}" stroke="${alpha(TONE.ink, 0.35)}" stroke-width=".7"/>` +
    text(x(c.today), C.t - 6, 'today', {}) +
    `<path d="${line}" fill="none" stroke="${TONE.ink}" stroke-width="1.6" stroke-linejoin="round"/>` +
    `<line x1="${x(c.today)}" y1="${y(now)}" x2="${x(c.end)}" y2="${y(ahead)}" stroke="${TONE.ink}" stroke-width="1.4" stroke-dasharray="0.1 4" stroke-linecap="round"/>` +
    `<circle cx="${x(c.today)}" cy="${y(now)}" r="3" fill="${TONE.ink}" stroke="${TONE.paper}" stroke-width="1.2"/>` +
    `<circle cx="${x(c.end)}" cy="${y(ahead)}" r="3" fill="${TONE.paper}" stroke="${TONE.ink}" stroke-width="1.2"/>` +
    text(x(c.end) - 2, y(ahead) - 9, short(ahead), {
      anchor: 'end',
      fill: ahead < floor ? TONE.harm : TONE.ink,
      weight: 600,
    }) +
    `<line x1="${C.l}" x2="${C.r}" y1="${C.b}" y2="${C.b}" stroke="${TONE.ink}" stroke-width=".9"/>` +
    text(C.l, C.b + 10, c.from, { anchor: 'start' }) +
    text(C.r, C.b + 10, c.to, { anchor: 'end' });
  const s = svgNode(C.w, C.h, body);
  s.removeAttribute('width');
  s.removeAttribute('height');
  s.setAttribute('class', 'cr-course');
  return s;
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
