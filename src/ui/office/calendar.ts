// The calendar on the chartroom kit, after MM's: at the left the round
// chosen (the next, unless another is asked for): its planet in the brass port
// (charted once she sails for it), its date and how far off, the storm's pace
// there under this season's rules, the Federation's vote closed on it. In the
// middle the season's rounds, a row each (a tap chooses it), the next marked.
// At the right the season's other days, as the career has them scheduled: the
// Federation's proposals and votes, the contracts' closing days, the season's
// end, the next season's first race; and how far the season has got.

import type { CalendarPaper } from '../../office/papers.ts';
import { button, link } from '../chartroom/controls.ts';
import { table, terms } from '../chartroom/data.ts';
import { fig, label } from '../chartroom/figures.ts';
import { kitLooks } from '../chartroom/kit.ts';
import { column, page } from '../chartroom/layout.ts';
import { sheet } from '../chartroom/paper.ts';
import { brassPort } from '../chartroom/port.ts';
import { u } from '../chartroom/tokens.ts';
import { el } from '../kit/part.ts';
import { stylesheet } from '../kit/style.ts';
import type { Office } from './office.ts';
import type { Screen } from './screens.ts';

const CSS = `
.cl-round { display: flex; flex-direction: column; align-items: center; gap: var(--s2); padding-bottom: var(--s2); text-align: center; }
.cl-round > b { font: 700 var(--t-name)/1.15 var(--face); letter-spacing: .08em; text-transform: uppercase; }
.cl-rounds { flex: none; display: flex; gap: ${u(1.5)}; height: ${u(3)}; }
.cl-rounds > i { flex: 1; background: var(--paper-sunk); box-shadow: inset 0 0 0 var(--w-hair) var(--line); }
.cl-rounds > i.done { background: var(--gilt); box-shadow: inset 0 0 0 var(--w-hair) var(--ink); }
.cl-done { display: flex; flex-direction: column; align-items: center; gap: var(--s1); }
/* the season's other days: what, the date under it, ruled */
.cl-dates { flex: 1; min-height: 0; overflow-y: auto; display: flex; flex-direction: column; }
.cl-dates > div { display: flex; flex-direction: column; gap: ${u(0.5)}; padding: var(--s2) 0; border-bottom: var(--w-fine) solid var(--rule); }
.cl-dates > div > span { font: 500 var(--t-body)/1.2 var(--face); }
`;

type Race = CalendarPaper['races'][number];

/** How a race's storm comes on, against the rules' own pace. */
const storm = (pace: number) =>
  `${pace < 0.95 ? 'Slow' : pace > 1.05 ? 'Quick' : 'Steady'} (× ${pace.toFixed(2)})`;

/** How far off a day is, said. */
const off = (days: number) =>
  days === 0
    ? 'Today'
    : days < 0
      ? `${-days} ${days === -1 ? 'day' : 'days'} ago`
      : `In ${days} ${days === 1 ? 'day' : 'days'}`;

/** The calendar. */
export function createCalendar(office: Office): Screen<CalendarPaper> {
  kitLooks();
  stylesheet(CSS);
  const root = page('ledger', 's-calendar'),
    port = brassPort(null);
  let shown = '';

  /** A round chosen: the calendar opened at it. */
  const choose = (r: Race) => () =>
    office.ask({ kind: 'round', round: r.round - 1 });

  /** The round chosen: its planet, when, the storm there, the vote closed on it. */
  const chosen = (v: CalendarPaper, r: Race) => {
    const chart = office.chart();
    if (chart && chart.name === r.name && chart.name !== shown) {
      shown = chart.name;
      port.show(chart);
    }
    return sheet(
      null,
      [
        el(
          'div',
          'cl-round',
          label(`Round ${r.round} of ${v.races.length}`),
          el('b', '', r.name),
          port.el,
          chart?.name === r.name ? null : label('Charted once you sail for it.')
        ),
        terms([
          ['Date', r.date],
          ['When', r.when === 'sailed' ? 'Sailed' : off(r.days)],
          ['The storm', storm(r.storm)],
          ...(r.vote ? ([['Federation', 'Its vote closes']] as const) : []),
        ]),
        label(
          'The storm closes in on the sea at its pace, times the pace the Federation’s rules set: above 1 it comes on quicker, below 1 slower.'
        ),
      ],
      { cls: 'cr-grow' }
    );
  };

  /** The season's rounds, a row each. */
  const rounds = (v: CalendarPaper) =>
    sheet(
      v.championship,
      [
        table<Race>(
          [
            { head: 'Rd', track: u(12), num: true, cell: (r) => r.round },
            {
              head: 'Planet',
              track: 'minmax(0, 1fr)',
              cell: (r) => link(r.name),
            },
            { head: 'Date', track: u(76), cell: (r) => r.date },
            {
              head: 'When',
              track: u(54),
              cell: (r) =>
                r.when === 'sailed'
                  ? label('Sailed')
                  : r.when === 'today'
                    ? 'Race day'
                    : off(r.days),
            },
            {
              head: 'Storm',
              track: u(32),
              num: true,
              cell: (r) => `× ${r.storm.toFixed(2)}`,
            },
          ],
          v.races,
          { own: (r) => r.round - 1 === v.chosen, tap: choose }
        ),
      ],
      { cls: 'cr-grow', aside: `Season ${v.season}` }
    );

  /** The season's other days, and how far it has got. */
  const season = (v: CalendarPaper) => {
    const sailed = v.races.filter((r) => r.when === 'sailed').length;
    return sheet(
      'The Season',
      [
        el(
          'div',
          'cl-done',
          fig(`${sailed} of ${v.races.length}`, 'l'),
          label('Rounds sailed')
        ),
        el(
          'div',
          'cl-rounds',
          ...v.races.map((r) => el('i', r.when === 'sailed' ? 'done' : ''))
        ),
        el(
          'div',
          'cl-dates',
          ...v.dates.map((d) =>
            el('div', '', el('span', '', d.what), label(d.date))
          )
        ),
        button('Standings', () =>
          office.ask({ kind: 'open', screen: 'standings' })
        ),
      ],
      { cls: 'cr-grow' }
    );
  };

  return {
    el: root,
    show(v) {
      const r = v.races[v.chosen];
      root.replaceChildren(
        column(r ? chosen(v, r) : sheet(null, [label('No season is set.')])),
        column(rounds(v)),
        column(season(v))
      );
    },
  };
}
