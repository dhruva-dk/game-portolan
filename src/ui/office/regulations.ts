// The Federation on the chartroom kit, after MM's rule votes: at the left the
// proposal standing (else the last counted): the rule it changes, from what
// next season's rules read to what, when its vote closes or how it was
// counted, each side's sway; your vote and what you lobby. In the middle each
// team of the championship on it: its manager, its side (cast, or how it
// leans), its sway; a tap opens its page. At the right the rules this season,
// with next season's where a vote has changed them, and the season's
// proposals counted.

import type {
  RegulationsView,
  Leaning,
  ProposalLine,
  Side,
} from '../../office/regulations.ts';
import type { Command } from '../../office/command.ts';
import { button, link, segmented } from '../chartroom/controls.ts';
import { gauge, meter, table, terms } from '../chartroom/data.ts';
import { dyed, label } from '../chartroom/figures.ts';
import { kitLooks } from '../chartroom/kit.ts';
import { column, page } from '../chartroom/layout.ts';
import { sheet } from '../chartroom/paper.ts';
import { u } from '../chartroom/tokens.ts';
import { el, grouped } from '../kit/part.ts';
import { stylesheet } from '../kit/style.ts';
import { toPerson, toTeam } from './links.ts';
import type { Office } from './office.ts';
import type { Screen } from './screens.ts';

const CSS = `
.ad-rule { display: flex; flex-direction: column; gap: var(--s1); }
.ad-rule > b { font: 700 var(--t-name)/1.15 var(--face); letter-spacing: .08em; text-transform: uppercase; }
.ad-yours { display: flex; flex-direction: column; gap: var(--s2); }
.ad-yours > .cr-terms { margin-bottom: var(--s1); }
.ad-lean { font-style: italic; color: var(--ink-2); }
/* the rules: each one's name and what it reads, next season's under it where changed, ruled */
.ad-rules { flex: 1; min-height: 0; overflow-y: auto; display: flex; flex-direction: column; }
.ad-rules > div { display: flex; flex-direction: column; gap: ${u(0.5)}; padding: var(--s2) 0; border-bottom: var(--w-fine) solid var(--rule); }
.ad-rules > div > div { display: flex; justify-content: space-between; gap: var(--s2); }
.ad-rules > div > div > span { font: 500 var(--t-body)/1.2 var(--face); }
.ad-rules > div > div > b { font: 600 var(--t-body)/1.2 var(--face); text-align: right; }
.ad-rules .ad-next { color: var(--act); }
`;

const SIDES: readonly Side[] = ['for', 'against', 'abstain'];
const SAID: Readonly<Record<Side, string>> = {
  for: 'For',
  against: 'Against',
  abstain: 'Abstains',
};

/** How far off a day is, said. */
const off = (days: number) =>
  days === 0 ? 'Today' : `In ${days} ${days === 1 ? 'day' : 'days'}`;

/** How a proposal was counted. */
const counted = (p: ProposalLine) =>
  `${p.carried ? 'Carried' : 'Lost'}, ${p.count.for} to ${p.count.against}`;

/** The Federation. */
export function createRegulations(office: Office): Screen<RegulationsView> {
  kitLooks();
  stylesheet(CSS);
  const root = page('ledger', 's-regulations'),
    profile = toPerson(office),
    teamPage = toTeam(office);
  let sum = 0;

  const send = (command: Command) => () =>
    office.ask({ kind: 'send', command });

  /** The proposal: what it changes, when it is counted, the sway, your vote and lobbying. */
  function proposal(v: RegulationsView) {
    const p = v.proposal;
    if (!p)
      return sheet(
        'The Proposal',
        [
          label(
            v.next
              ? `None stands. The Federation puts its next on ${v.next}.`
              : 'None stands, and none is to come this season.'
          ),
        ],
        { cls: 'cr-grow' }
      );
    const open = p.carried === null,
      all = p.sway.for + p.sway.against,
      chosen = p.sums[Math.min(sum, p.sums.length - 1)];
    const lobby = (side: 'for' | 'against') =>
      send({
        kind: 'Lobby',
        proposal: p.id,
        side,
        balance: chosen?.balance ?? 0,
      });
    const shut = chosen && !chosen.act.ok ? chosen.act.why : null;
    return sheet(
      'The Proposal',
      [
        el('div', 'ad-rule', label('A change to'), el('b', '', p.rule)),
        terms([
          ['As it stands', p.from],
          ['Proposed', p.to],
          open
            ? ['Vote closes', `${p.closes} · ${off(p.days)}`]
            : ['Counted', counted(p)],
        ]),
        gauge(
          'Sway',
          `${grouped(p.sway.for)} for · ${grouped(p.sway.against)} against`,
          meter(all > 0 ? p.sway.for / all : 0.5)
        ),
        label(
          'A side’s sway: its backers’ managers’ standing, and what is lobbied for it. A team abstaining goes over to the side with more, as likely as its lead.'
        ),
        el(
          'div',
          'ad-yours',
          terms([
            ['Your vote', p.yours ? SAID[p.yours] : 'Not cast'],
            [
              'You lobbied',
              `${grouped(p.lobbied.for)} for · ${grouped(p.lobbied.against)} against`,
            ],
          ]),
          ...(p.vote.ok
            ? [
                segmented(
                  ['For', 'Against', 'Abstain'],
                  p.yours ? SIDES.indexOf(p.yours) : -1,
                  (i) =>
                    send({
                      kind: 'Vote',
                      proposal: p.id,
                      side: SIDES[i] ?? 'abstain',
                    })()
                ),
                segmented(
                  p.sums.map((x) => grouped(x.balance)),
                  Math.min(sum, p.sums.length - 1),
                  (i) => {
                    sum = i;
                    draw(v);
                  }
                ),
                el(
                  'div',
                  'cr-card-foot pair',
                  button('Lobby for', lobby('for'), { off: shut }),
                  button('Lobby against', lobby('against'), {
                    off: shut === null ? null : true,
                  })
                ),
              ]
            : [label(p.vote.why)])
        ),
      ],
      { cls: 'cr-grow' }
    );
  }

  /** Each team on the proposal. */
  const teams = (v: RegulationsView) =>
    sheet(
      'The Championship',
      [
        table<Leaning>(
          [
            {
              head: 'Team',
              track: 'minmax(0, 1fr)',
              cell: (r) =>
                dyed(
                  r.team.colours[0],
                  r.you ? 'Your team' : link(r.team.name)
                ),
            },
            {
              head: 'Manager',
              track: u(84),
              cell: (r) =>
                r.manager
                  ? link(r.manager.name, profile(r.manager.person))
                  : label('None'),
            },
            {
              head: 'Side',
              track: u(52),
              cell: (r) =>
                r.cast
                  ? SAID[r.side]
                  : el(
                      'span',
                      'ad-lean',
                      r.you
                        ? 'Not cast'
                        : r.side === 'abstain'
                          ? 'Undecided'
                          : `Leans ${r.side}`
                    ),
            },
            {
              head: 'Sway',
              track: u(28),
              num: true,
              cell: (r) => grouped(r.sway),
            },
          ],
          v.proposal?.teams ?? [],
          {
            own: (r) => r.you,
            tap: (r) => (r.you ? null : teamPage(r.team.id)),
            none: 'No proposal this season yet.',
            scrolls: { keep: 'regulations' },
          }
        ),
      ],
      { cls: 'cr-grow' }
    );

  /** The rules now and next, and the season's proposals counted. */
  const rules = (v: RegulationsView) =>
    sheet(
      'The Rules',
      [
        el(
          'div',
          'ad-rules',
          ...v.rules.map((r) =>
            el(
              'div',
              '',
              el('div', '', el('span', '', r.name), el('b', '', r.now)),
              r.next === r.now
                ? null
                : el(
                    'div',
                    'ad-next',
                    label('Next season'),
                    el('b', '', r.next)
                  ),
              label(r.about)
            )
          ),
          ...v.counted.map((p) =>
            el(
              'div',
              '',
              label(`Voted ${p.closes}`),
              el('div', '', el('span', '', p.rule), el('b', '', p.to)),
              label(counted(p))
            )
          )
        ),
      ],
      { cls: 'cr-grow', aside: String(v.season) }
    );

  function draw(v: RegulationsView) {
    root.replaceChildren(
      column(proposal(v)),
      column(teams(v)),
      column(rules(v))
    );
  }

  return { el: root, show: draw };
}
