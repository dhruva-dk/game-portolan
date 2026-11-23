// The finances on the chartroom kit, after MM's (013). At the left the purse
// (the balance, the chairman's floor under it, the room between) and what a
// race brings and costs, netted. In the middle the balance's course this
// season, dotted on to where it will end, the floor ruled under it; the
// transactions under that, newest first. At the right where the season will
// end on what is committed, and this season's money by what it was for, what
// came in first, netted.

import type { FinancesPaper } from '../../office/papers.ts';
import { course, table, terms } from '../chartroom/data.ts';
import { fig, label } from '../chartroom/figures.ts';
import { kitLooks } from '../chartroom/kit.ts';
import { column, page } from '../chartroom/layout.ts';
import { sheet } from '../chartroom/paper.ts';
import { u } from '../chartroom/tokens.ts';
import { el, grouped, ordinal } from '../kit/part.ts';
import { stylesheet } from '../kit/style.ts';
import type { Screen } from './screens.ts';

const CSS = `
.fn-purse { display: flex; flex-direction: column; align-items: center; gap: var(--s1); padding: var(--s2) 0 var(--s1); }
.fn-total { display: flex; justify-content: space-between; align-items: baseline; gap: var(--s4); margin-top: auto;
  padding-top: var(--s2); border-top: var(--w-rule) solid var(--ink); }
.fn-total > .cr-fig { font-variant-numeric: lining-nums; }
.fn-list { display: flex; flex-direction: column; flex: 1; min-height: 0; }
.fn-list > .cr-terms { overflow-y: auto; min-height: 0; }
.s-finances .cr-harm.cr-fig { color: var(--harm); }
.s-finances .fn-chart { flex: none; }
.s-finances .fn-chart .cr-body { padding: 0 var(--s4) 0 var(--s2); }
`;

type Entry = FinancesPaper['ledger'][number];

/** A sum, the money out in the harm ink. */
const sum = (n: number) => el('span', n < 0 ? 'cr-harm' : '', grouped(n));

/** A list of sums, a ruled line each, netted under a rule at its foot. */
const netted = (
  rows: readonly { label: string; amount: number }[],
  total: string
) => {
  const net = rows.reduce((t, r) => t + r.amount, 0);
  return el(
    'div',
    'fn-list',
    terms(rows.map((r) => [r.label, sum(r.amount)])),
    el(
      'div',
      'fn-total',
      label(total),
      el('span', `cr-fig m${net < 0 ? ' cr-harm' : ''}`, grouped(net))
    )
  );
};

/** The finances: the purse and a race, the balance's course and the ledger, the season and its end. */
export function createFinances(): Screen<FinancesPaper> {
  kitLooks();
  stylesheet(CSS);
  const root = page('ledger', 's-finances');
  return {
    el: root,
    show(v) {
      const p = v.projection;
      const purse = sheet('The Purse', [
        el('div', 'fn-purse', fig(grouped(v.balance), 'l'), label('In hand')),
        terms([
          ["Chairman's floor", sum(v.floor)],
          ['Room to spend', sum(v.balance - v.floor)],
        ]),
      ]);
      const race = sheet('A Race', [netted(v.race, 'Net a race')], {
        cls: 'cr-grow',
      });
      const chart = sheet('The Balance', [course(v.chart, p.end, v.floor)], {
        aside: 'This season',
        cls: 'fn-chart',
      });
      const ledger = sheet(
        'Transactions',
        [
          table<Entry>(
            [
              { head: 'Date', track: u(58), cell: (r) => r.date },
              { head: 'Transaction', track: '1fr', cell: (r) => r.what },
              {
                head: 'Amount',
                track: u(46),
                num: true,
                cell: (r) => sum(r.amount),
              },
              {
                head: 'Balance',
                track: u(46),
                num: true,
                cell: (r) => sum(r.balance),
              },
            ],
            v.ledger,
            {
              none: 'Nothing has been paid or taken yet.',
              scrolls: { keep: 'ledger' },
            }
          ),
        ],
        { aside: `${v.ledger.length} entries`, cls: 'cr-grow' }
      );
      const season = sheet('This Season', [netted(v.season, 'Net so far')], {
        cls: 'cr-grow',
      });
      const end = sheet("Season's End", [
        terms([
          ['Races left', String(p.races)],
          ['Place now', ordinal(p.place)],
          ['Prize at that place', sum(p.prize)],
          ['Balance at the end', sum(p.end)],
        ]),
        p.end < v.floor &&
          label(
            'Under the floor: the chairman will refuse to spend.',
            'cr-harm'
          ),
      ]);
      root.replaceChildren(
        column(purse, race),
        column(chart, ledger),
        column(end, season)
      );
    },
  };
}
