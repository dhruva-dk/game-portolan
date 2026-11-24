// The board on the chartroom kit, after MM's: at the left the chairman (a link
// to them) and their temper, each stat said as what it means for you; in the
// middle their confidence in you, now and race by race this season against the
// line under which you are let go, and the team's place, target and money; at
// the right what you may ask of them, each with what it gives, the confidence
// it wants, and this season's answer.

import type { BoardView, Request } from '../../office/board.ts';
import type { Dyed } from '../../office/papers.ts';
import { button, link } from '../chartroom/controls.ts';
import { gauge, meter, terms, washOf } from '../chartroom/data.ts';
import { label } from '../chartroom/figures.ts';
import { kitLooks } from '../chartroom/kit.ts';
import { column, page } from '../chartroom/layout.ts';
import { sheet } from '../chartroom/paper.ts';
import { who } from '../chartroom/person.ts';
import { trail } from '../chartroom/trail.ts';
import { el } from '../kit/part.ts';
import { stylesheet } from '../kit/style.ts';
import { jacketOf } from './faces.ts';
import { toPerson, toTeam } from './links.ts';
import type { Office } from './office.ts';
import type { Screen } from './screens.ts';

const CSS = `
.bd-temper { display: flex; flex-direction: column; }
.bd-temper > div { display: flex; flex-direction: column; gap: var(--s1); padding: var(--s2) 0; border-bottom: var(--w-fine) solid var(--rule); }
.bd-temper > div > div { display: flex; justify-content: space-between; align-items: baseline; gap: var(--s2); }
.bd-temper b { font: 600 var(--t-body)/1.2 var(--face); }
.bd-asks { display: flex; flex-direction: column; gap: var(--s4); }
.bd-ask { display: flex; flex-direction: column; gap: var(--s2); padding-bottom: var(--s4); border-bottom: var(--w-fine) solid var(--rule); }
.bd-ask > b { font: 700 var(--t-name)/1.15 var(--face); }
.bd-ask .cr-harm { font-weight: 600; }
.bd-line { display: flex; align-items: baseline; gap: var(--s2); }
.bd-line > span:not(.cr-label) { font: 600 var(--t-body)/1.2 var(--face); }
.bd-line > .cr-label:last-child:not(:first-child) { margin-left: auto; }
`;

/** This season's answer to a request, said. */
const answered = (r: Request) =>
  r.asked === null ? 'Not asked' : r.asked ? 'Granted' : 'Refused';

/** The board. */
export function createBoard(office: Office): Screen<Dyed<BoardView>> {
  kitLooks();
  stylesheet(CSS);
  const root = page('ledger', 's-board');

  /** The chairman and their temper. */
  const chairman = ({ view: v, dyes }: Dyed<BoardView>) =>
    sheet(
      'The Chairman',
      [
        who(
          {
            jacket: jacketOf(v.chairman.face, dyes),
            name: link(v.chairman.name, toPerson(office)(v.chairman.person)),
            said: el(
              'span',
              '',
              'Chairman of ',
              link(v.team, toTeam(office)(v.teamId))
            ),
          },
          48
        ),
        el(
          'div',
          'bd-temper',
          ...v.temper.map((t) =>
            el(
              'div',
              '',
              el('div', '', el('b', '', t.name), el('b', '', `${t.value}`)),
              label(t.says)
            )
          )
        ),
      ],
      { cls: 'cr-grow' }
    );

  /** Their confidence in you, now and race by race; the team's place and money. */
  const confidence = (v: BoardView) => {
    const wash = washOf(v.confidence / 100);
    return sheet(
      'Confidence',
      [
        gauge(
          'The chairman’s confidence in you',
          `${v.confidence} of 100`,
          meter(v.confidence / 100, wash),
          v.confidence < v.verdict
        ),
        trail(
          v.rounds,
          v.marks.map((m) => ({ round: m.round, value: m.confidence })),
          { at: v.verdict, warn: `let go under ${v.verdict}` }
        ),
        label(
          `At the season’s end, under ${v.verdict} with the target missed by more than ${v.missedBy} places, you are let go.`
        ),
        terms([
          ['Stands', v.standing],
          ['Target', v.target],
          ['Budget a season', v.budget],
          ['Balance', v.balance],
          ['Debt floor', v.floor],
        ]),
      ],
      { cls: 'cr-grow' }
    );
  };

  /** What you may ask, each once a season. */
  const requests = (v: BoardView) =>
    sheet(
      'Requests',
      [
        el(
          'div',
          'bd-asks',
          ...v.requests.map((r) =>
            el(
              'div',
              'bd-ask',
              el('b', '', r.name),
              label(r.gives),
              el(
                'div',
                'bd-line',
                label('Wants confidence'),
                el('span', r.bar > v.confidence ? 'cr-harm' : '', `${r.bar}`),
                r.asked !== null && label(answered(r))
              ),
              button(
                'Ask',
                () =>
                  office.ask({
                    kind: 'send',
                    command: { kind: 'AskBoard', ask: r.ask },
                  }),
                { off: r.act.ok ? null : r.act.why }
              )
            )
          )
        ),
        label(
          `Each once a season. Granted, an ask costs ${v.costs.granted} confidence; refused, ${v.costs.refused}.`
        ),
      ],
      { cls: 'cr-grow' }
    );

  return {
    el: root,
    show(d) {
      root.replaceChildren(
        column(chairman(d)),
        column(confidence(d.view)),
        column(requests(d.view))
      );
    },
  };
}
