// The office's papers. Mail: the letters at the left, newest first (the unread
// in bold, a question waiting marked), the open one at the right with its
// answers. Calendar: the season's races in order, each sailed, today's, or to
// come. Finances: the balance and what a race brings and costs, beside the
// ledger. Sponsors: the three slots, and the offers standing, each signed into
// a slot.

import type {
  Backer,
  CalendarPaper,
  FinancesPaper,
  Letter,
  MailPaper,
  SponsorsPaper,
} from '../../office/papers.ts';
import { button } from '../kit/button.ts';
import { panel } from '../kit/panel.ts';
import { el } from '../kit/part.ts';
import { tag } from '../kit/stat.ts';
import { stylesheet } from '../kit/style.ts';
import { table } from '../kit/table.ts';
import { bitsStyle, lines, money } from './bits.ts';
import type { Office } from './office.ts';
import type { Screen } from './screens.ts';

const CSS = `
.s-mail { grid-template-columns: 520px 1fr; }
.s-mail .unread { font-weight: 700; }
.l-head { flex: none; padding: 4px 4px 8px; border-bottom: 1px solid var(--rule); display: flex; flex-direction: column; gap: 4px; }
.l-head > b { font: 600 21px/1.2 var(--serif); }
.l-answers { flex: none; display: flex; gap: 8px; padding-top: 8px; }
.l-answers > .k-btn { flex: 1; }
.s-mail .b-text { flex: 1; }
.s-calendar { grid-template-columns: 1fr; justify-items: center; }
.s-calendar > .k-panel { width: 760px; }
.s-finances { grid-template-columns: 380px 1fr; }
.s-finances .k-body, .s-sponsors .k-body { gap: 8px; }
.f-bad { color: var(--bad); }
.s-sponsors { grid-template-columns: 1fr; grid-template-rows: auto 1fr; }
.sp-slots { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
.sp-name { font: 600 21px/1.2 var(--serif); text-align: center; padding: 8px 0 2px; }
.sp-sign { display: flex; gap: 4px; }
.sp-sign > .k-btn { height: 34px; padding: 0 10px; }
`;

/** The mail. */
export function createMail(office: Office): Screen<MailPaper> {
  stylesheet(CSS);
  bitsStyle();
  const root = el('div', 'b-pad s-mail');
  return {
    el: root,
    show(v) {
      const o = v.open;
      const marked = (l: Letter, text: string) =>
        el('span', l.unread ? 'unread' : '', text);
      root.replaceChildren(
        panel('Mail', [
          table<Letter>(
            [
              { label: 'Date', width: '120px', cell: (l) => marked(l, l.date) },
              { label: 'From', width: '1fr', cell: (l) => marked(l, l.from) },
              {
                label: 'Subject',
                width: '1.5fr',
                cell: (l) => marked(l, l.subject),
              },
              { label: '', width: '20px', cell: (l) => (l.sealed ? '!' : '') },
            ],
            v.letters,
            {
              height: 44,
              keep: 'mail',
              own: (l) => l.id === o?.id,
              pick: (l) => office.ask({ kind: 'letter', id: l.id }),
            }
          ),
        ]),
        panel(
          o?.about ?? '',
          o
            ? [
                el(
                  'div',
                  'l-head',
                  el('b', '', o.subject),
                  el('span', 'b-faint', `${o.from} · ${o.date}`)
                ),
                el('div', 'b-text', o.body),
                o.options.length > 0 &&
                  el(
                    'div',
                    'l-answers',
                    ...o.options.map((label, option) =>
                      button(
                        label,
                        () =>
                          office.ask({
                            kind: 'send',
                            command: {
                              kind: 'AnswerDilemma',
                              mail: o.id,
                              option,
                            },
                          }),
                        {
                          kind: o.answer === option ? 'on' : 'go',
                          off: o.answer !== null,
                        }
                      )
                    )
                  ),
              ]
            : []
        )
      );
      // (the list from its newest, not from the open letter)
      root.querySelector('.k-rows')?.removeAttribute('data-top');
    },
  };
}

type Race = CalendarPaper['races'][number];

/** The calendar. */
export function createCalendar(): Screen<CalendarPaper> {
  stylesheet(CSS);
  bitsStyle();
  const root = el('div', 'b-pad s-calendar');
  return {
    el: root,
    show(v) {
      root.replaceChildren(
        panel(v.championship, [
          table<Race>(
            [
              { label: 'Race', width: '60px', cell: (r) => r.round },
              { label: 'Location', width: '1fr', cell: (r) => r.name },
              { label: 'Date', width: '160px', cell: (r) => r.date },
              {
                label: '',
                width: '120px',
                cell: (r) =>
                  r.when === 'today'
                    ? tag('Race Day', 'go')
                    : r.when === 'sailed'
                      ? tag('Complete', 'good', 'bare')
                      : '',
              },
            ],
            v.races,
            { height: 44, own: (r) => r.when === 'today', keep: 'races' }
          ),
        ])
      );
    },
  };
}

type Entry = FinancesPaper['ledger'][number];

/** A sum, the money out in red. */
const sum = (n: number) => el('span', n < 0 ? 'f-bad' : '', money(n));

/** The finances. */
export function createFinances(): Screen<FinancesPaper> {
  stylesheet(CSS);
  bitsStyle();
  const root = el('div', 'b-pad s-finances');
  return {
    el: root,
    show(v) {
      root.replaceChildren(
        el(
          'div',
          'b-col',
          panel('Balance', [el('div', 'b-big', money(v.balance))]),
          panel('Per Race', [
            lines([
              ...v.race.map((r) => [r.label, sum(r.amount)] as const),
              ['Net', sum(v.net)],
            ]),
          ])
        ),
        panel('Transactions', [
          table<Entry>(
            [
              { label: 'Date', width: '130px', cell: (r) => r.date },
              { label: 'Transaction', width: '1fr', cell: (r) => r.what },
              {
                label: 'Amount',
                width: '110px',
                num: true,
                cell: (r) => sum(r.amount),
              },
              {
                label: 'Balance',
                width: '110px',
                num: true,
                cell: (r) => sum(r.balance),
              },
            ],
            v.ledger,
            { keep: 'ledger' }
          ),
        ])
      );
    },
  };
}

type Standing = SponsorsPaper['offers'][number];

/** A sponsor's terms. */
const terms = (b: Backer) =>
  lines([
    ['Pays', money(b.amount)],
    ['For', b.pays],
    ['Races', b.races],
  ]);

/** The sponsors. */
export function createSponsors(office: Office): Screen<SponsorsPaper> {
  stylesheet(CSS);
  bitsStyle();
  const root = el('div', 'b-pad s-sponsors');
  return {
    el: root,
    show(v) {
      root.replaceChildren(
        el(
          'div',
          'sp-slots',
          ...v.slots.map((b, i) =>
            panel(`Sponsor ${i + 1}`, [
              el('div', 'sp-name', b?.name ?? 'Vacant'),
              b && terms(b),
            ])
          )
        ),
        panel('Sponsor Offers', [
          table<Standing>(
            [
              { label: 'Sponsor', width: '1fr', cell: (r) => r.name },
              {
                label: 'Pays',
                width: '90px',
                num: true,
                cell: (r) => money(r.amount),
              },
              { label: 'For', width: '1.3fr', cell: (r) => r.pays },
              {
                label: 'Races',
                width: '60px',
                num: true,
                cell: (r) => r.races,
              },
              {
                label: 'Stands',
                width: '80px',
                num: true,
                cell: (r) => `${r.days} Days`,
              },
              {
                label: 'Sign as Sponsor',
                width: '170px',
                cell: (r) =>
                  el(
                    'div',
                    'sp-sign',
                    ...v.slots.map((_, slot) =>
                      button(
                        String(slot + 1),
                        () =>
                          office.ask({
                            kind: 'send',
                            command: { kind: 'SignSponsor', offer: r.id, slot },
                          }),
                        { kind: 'on', off: !r.sign.ok }
                      )
                    )
                  ),
              },
            ],
            v.offers,
            { height: 48, keep: 'offers' }
          ),
        ])
      );
    },
  };
}
