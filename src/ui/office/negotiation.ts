// The negotiation of a contract, on the chartroom kit, after MM's (011). At the
// left the person (their portrait, stars as known, the team they would join,
// their patience as pips) and the talks so far (where they stand, the last
// answer and those before it, who else is talking to them). In the middle the
// terms of agreement: a row a term, what sets it beside what they ask (or, once
// countered, their counter); the bonus terms under their band, the break clause
// among them. At the right what they expect of a team, each met so far, and
// what the offer costs, over the ways on: accept the counter, send, withdraw.

import type { Offer } from '../../office/command.ts';
import type { Dyed } from '../../office/papers.ts';
import type { OfferView } from '../../office/people.ts';
import {
  button,
  dropdown,
  link,
  segmented,
  stepper,
} from '../chartroom/controls.ts';
import { gauge, meter, terms, washOf } from '../chartroom/data.ts';
import { label, pips } from '../chartroom/figures.ts';
import { kitLooks } from '../chartroom/kit.ts';
import { column, page } from '../chartroom/layout.ts';
import { who } from '../chartroom/person.ts';
import { sheet } from '../chartroom/paper.ts';
import { u } from '../chartroom/tokens.ts';
import { el, grouped, type Kid } from '../kit/part.ts';
import { stylesheet } from '../kit/style.ts';
import { whoOf } from './faces.ts';
import { toPerson } from './links.ts';
import type { Office } from './office.ts';
import type { Screen } from './screens.ts';

const CSS = `
.ng-terms { display: grid; grid-template-columns: minmax(0, 1fr) ${u(118)} ${u(60)}; column-gap: var(--s5); }
/* a row a term, ruled across the whole of it */
.ng-row { grid-column: 1 / -1; display: grid; grid-template-columns: subgrid; align-items: center; padding: var(--s2) 0;
  border-bottom: var(--w-hair) solid var(--rule); }
.ng-row > * { min-width: 0; }
.ng-row.ng-h { padding: 0 0 var(--s1); border-bottom: var(--w-rule) solid var(--ink); }
.ng-row.ng-h > :last-child { text-align: right; }
.ng-term { display: flex; flex-direction: column; gap: ${u(1)}; }
.ng-term > b { font-weight: 600; }
.ng-theirs { text-align: right; font-variant-numeric: lining-nums; white-space: nowrap; }
.ng-theirs.apart { font-weight: 600; }
.ng-band { grid-column: 1 / -1; padding: var(--s4) 0 var(--s1); font: 700 var(--t-label)/1.2 var(--face); letter-spacing: .14em;
  text-transform: uppercase; color: var(--ink-2); border-bottom: var(--w-rule) solid var(--ink); }
.ng-patience { display: flex; justify-content: space-between; align-items: center; }
.ng-said { text-align: center; }
.ng-last { font: italic 500 var(--t-name)/1.3 var(--face); text-align: center; padding: var(--s1) 0; }
.ng-answers { display: flex; flex-direction: column; gap: var(--s2); overflow-y: auto; min-height: 0; }
.ng-answers > div { display: flex; flex-direction: column; gap: ${u(1)}; padding-top: var(--s2); border-top: var(--w-hair) solid var(--rule); }
.ng-ways { margin-top: auto; display: flex; flex-direction: column; gap: var(--s2); }
.ng-ways > .cr-act > .cr-label { text-align: center; }
`;

const SEASONS = [1, 2, 3] as const;
const seasonsText = (n: number) => (n === 1 ? '1 season' : `${n} seasons`);

/** The negotiation: the person and the talks, the terms, what they expect and what it costs. */
export function createOffer(office: Office): Screen<Dyed<OfferView>> {
  kitLooks();
  stylesheet(CSS);
  const root = page('ledger', 's-offer');

  return {
    el: root,
    show({ view: v, dyes }) {
      const d = v.draft,
        theirs = v.counter,
        drawn = (to: Partial<Offer>) =>
          office.ask({ kind: 'draft', offer: { ...d, ...to } });

      /** A sum stepped by a twentieth of the most it may be, between nothing and that. */
      const sum = (
        key: 'wage' | 'fee' | 'podium' | 'sinking',
        most: number
      ) => {
        const by = Math.max(1, Math.round(most / 20));
        return stepper(
          grouped(d[key]),
          d[key] > 0 ? () => drawn({ [key]: Math.max(0, d[key] - by) }) : null,
          d[key] < most
            ? () => drawn({ [key]: Math.min(most, d[key] + by) })
            : null
        );
      };
      /** The break clause: none, or a sum stepped as the others; down from its least is none. */
      const breaking = () => {
        const most = v.most.breakClause,
          by = Math.max(1, Math.round(most / 20)),
          at = d.breakClause;
        return stepper(
          at === null ? 'None' : grouped(at),
          at === null
            ? null
            : () => drawn({ breakClause: at - by <= 0 ? null : at - by }),
          at === null || at < most
            ? () => drawn({ breakClause: Math.min(most, (at ?? 0) + by) })
            : null
        );
      };

      /** Their side of a term: as countered, else as asked; set apart where it is not what is offered. */
      const side = (text: string, apart: boolean) =>
        el('div', `ng-theirs${apart ? ' apart' : ''}`, text);
      const term = (name: string, by: string, control: Kid, them: Kid) => [
        el(
          'div',
          'ng-row',
          el('div', 'ng-term', el('b', '', name), label(by)),
          el('div', '', control),
          them
        ),
      ];
      const money = (n: number | undefined, mine: number) =>
        n === undefined ? side('', false) : side(grouped(n), n !== mine);

      const agreement = sheet(
        'Terms of Agreement',
        [
          el(
            'div',
            'ng-terms',
            el(
              'div',
              'ng-row ng-h',
              label('Term'),
              label('Your offer'),
              label(theirs ? 'Their counter' : 'They ask')
            ),
            ...term(
              'Wage',
              'A race',
              sum('wage', v.most.wage),
              money(theirs?.wage ?? v.ask.wage, d.wage)
            ),
            ...term(
              'Length',
              'Seasons',
              segmented(SEASONS.map(String), SEASONS.indexOf(d.seasons), (i) =>
                drawn({ seasons: SEASONS[i] ?? 1 })
              ),
              side(
                seasonsText(theirs?.seasons ?? v.ask.seasons),
                (theirs?.seasons ?? v.ask.seasons) !== d.seasons
              )
            ),
            ...(v.statuses.length > 1
              ? term(
                  'Post',
                  'Where they sail',
                  segmented(
                    v.statuses.map((s) => s.label),
                    v.statuses.findIndex((s) => s.id === d.status),
                    (i) => {
                      const status = v.statuses[i]?.id;
                      if (status) drawn({ status });
                    }
                  ),
                  side('', false)
                )
              : []),
            ...(v.replaces.length > 1
              ? term(
                  'Replaces',
                  'Released on signing',
                  dropdown(
                    v.replaces.map((r) => r.label),
                    Math.max(
                      0,
                      v.replaces.findIndex((r) => r.id === d.replaces)
                    ),
                    (i) => drawn({ replaces: v.replaces[i]?.id ?? null })
                  ),
                  side('', false)
                )
              : []),
            el('div', 'ng-band', 'Bonus Terms'),
            ...term(
              'Signing-on fee',
              'Paid on signing',
              sum('fee', v.most.fee),
              money(theirs?.fee ?? v.ask.fee, d.fee)
            ),
            ...term(
              'Podium bonus',
              'A race on the podium',
              sum('podium', v.most.bonus),
              money(theirs?.podium, d.podium)
            ),
            ...term(
              'Sinking bonus',
              'A ship sunk',
              sum('sinking', v.most.bonus),
              money(theirs?.sinking, d.sinking)
            ),
            ...term(
              'Break clause',
              'Paid to let them go early',
              breaking(),
              theirs
                ? side(
                    theirs.breakClause === null
                      ? 'None'
                      : grouped(theirs.breakClause),
                    theirs.breakClause !== d.breakClause
                  )
                : side('', false)
            )
          ),
        ],
        { aside: v.stateText }
      );

      const person = sheet(v.roleName, [
        who(
          {
            ...whoOf({ ...v, title: v.name }, dyes, `To join ${v.team}`),
            name: link(v.name, toPerson(office)(v.id)),
          },
          44
        ),
        el(
          'div',
          'ng-patience',
          label('Patience'),
          pips(v.patience.of, v.patience.of - v.patience.left)
        ),
      ]);

      const talks = sheet(
        'The Talks',
        [
          v.last
            ? el('div', 'ng-last', `“${v.last}”`)
            : label('Nothing said yet: send an offer.', 'ng-said'),
          el(
            'div',
            'ng-answers',
            ...v.earlier
              .slice(1)
              .map((a) => el('div', '', label(a.day), a.answer))
          ),
          v.rivals.length > 0 &&
            label(`Also talking to ${v.rivals.join(', ')}.`, 'ng-said'),
        ],
        { aside: v.earlier[0]?.day, cls: 'cr-grow' }
      );

      const expects = sheet('Expectations', [
        ...(v.wants.length === 0
          ? [label('Not yet scouted: what they want of a team is not known.')]
          : v.wants.map((w) =>
              gauge(w.label, `${w.text} met`, meter(w.value, washOf(w.value)))
            )),
      ]);

      const send =
        (kind: 'OfferContract' | 'AcceptCounter' | 'WithdrawOffer') => () =>
          office.ask({
            kind: 'send',
            command:
              kind === 'OfferContract'
                ? { kind, person: v.id, offer: d }
                : { kind, person: v.id },
          });
      const off = (a: { ok: boolean; why: string }) => (a.ok ? null : a.why);
      const cost = sheet(
        'The Cost',
        [
          terms([
            ['Cost to sign', v.cost.now.text],
            ['A race', v.cost.perRace.text],
            ['Balance left', v.cost.left.text],
          ]),
          el(
            'div',
            'ng-ways',
            theirs &&
              button('Accept Counter', send('AcceptCounter'), {
                off: off(v.accept),
              }),
            button('Send Offer', send('OfferContract'), {
              kind: theirs ? 'plain' : 'act',
              off: off(v.send),
            }),
            button('Withdraw', send('WithdrawOffer'), {
              kind: 'plain',
              off: off(v.withdraw),
            })
          ),
        ],
        { cls: 'cr-grow' }
      );

      root.replaceChildren(
        column(person, talks),
        agreement,
        column(expects, cost)
      );
    },
  };
}
