// A team's page on the chartroom kit, after MM's team pages: one game, not a
// stack of tables. At the left the team: its emblem and name on its plate, its
// championship (the way to those standings), its port and reputation; who runs
// it, the manager (what they are, how freely they spend, what they see to
// first, how secure their post) and the chairman (the place they ask for, how
// the team stands to it). In the middle everyone on its books, their stars as
// her scouts know them: every name opens its page. At the right its season:
// its place and tally, how far behind the leader and against her team, its
// prize, where the season's end would take it; and the team against its
// championship.

import type { Hand, RivalView } from '../../office/rival.ts';
import { link } from '../chartroom/controls.ts';
import { compared, table, terms } from '../chartroom/data.ts';
import { arrow, label, place, stars, verdict } from '../chartroom/figures.ts';
import { kitLooks } from '../chartroom/kit.ts';
import { column, page } from '../chartroom/layout.ts';
import { plate, sheet } from '../chartroom/paper.ts';
import { who } from '../chartroom/person.ts';
import { u } from '../chartroom/tokens.ts';
import { emblem } from '../emblem.ts';
import { el, grouped, ordinal } from '../kit/part.ts';
import { stylesheet } from '../kit/style.ts';
import { toPerson } from './links.ts';
import type { Office } from './office.ts';
import type { Screen } from './screens.ts';

const CSS = `
/* the emblem over the name, so a long word of it has the plate's width */
.rv-crest { display: flex; flex-direction: column; align-items: center; gap: var(--s2); padding: var(--s3) var(--s4);
  text-align: center; }
.rv-crest > svg { flex: none; width: ${u(22)}; height: ${u(22)}; }
.rv-crest > div { display: flex; flex-direction: column; gap: ${u(1)}; min-width: 0; max-width: 100%; }
.rv-crest b { font: 700 var(--t-name)/1.15 var(--face); letter-spacing: .08em; text-transform: uppercase; overflow-wrap: break-word; }
.rv-faint { font: italic 500 var(--t-label) var(--face); color: var(--plate-faint); }
.rv-stand { display: flex; align-items: center; gap: var(--s5); }
.rv-stand > .cr-terms { flex: 1; min-width: 0; }
.rv-first { text-align: right; }
`;

/** A signed count of points: ahead (+) or behind (−), level a dash. */
const signed = (n: number) =>
  n === 0 ? 'Level' : n > 0 ? `+${grouped(n)}` : grouped(n);

/** Their stars as her scouts read them: known, or the range it lies in. */
const rated = (h: Hand) => stars(h.stars.lo, h.stars.hi, 9);

/** A team's page. */
export function createRival(office: Office): Screen<RivalView> {
  kitLooks();
  stylesheet(CSS);
  const root = page('ledger', 's-rival'),
    profile = toPerson(office);

  /** The team: its plate, its championship, port and standing in the world. */
  const team = (v: RivalView) =>
    sheet(null, [
      plate(
        el(
          'div',
          'rv-crest',
          emblem(v.team.emblem, v.team.colours, 22),
          el(
            'div',
            '',
            el('b', '', v.team.name),
            el('span', 'rv-faint', v.own ? 'Your team' : 'A rival')
          )
        )
      ),
      terms([
        [
          'Championship',
          link(v.championship, () =>
            office.ask({ kind: 'open', screen: 'standings' })
          ),
        ],
        ['Sails from', v.port || '—'],
        ['Reputation', `${v.reputation} of 100`],
      ]),
    ]);

  /** Who runs it: the manager, and the chairman over them. */
  const runs = (v: RivalView) => {
    const m = v.manager;
    const manager = m
      ? [
          who(
            {
              jacket: v.team.colours,
              name: link(m.name, profile(m.person)),
              said: m.you ? 'Manager (you)' : 'Manager',
            },
            18,
            'beside'
          ),
          terms([
            ...(m.personality
              ? ([
                  ['Character', m.personality],
                  [
                    'Spends',
                    `${Math.round((m.spends ?? 1) * 100)}% of what it may`,
                  ],
                  [
                    'Sees first to',
                    el('span', 'rv-first', m.first.join(', ') || '—'),
                  ],
                ] as const)
              : []),
            ['Job security', verdict(m.security)],
          ]),
        ]
      : [label('The post is open: the chairman is hiring.')];
    return sheet(
      'Who Runs It',
      [
        ...manager,
        who(
          {
            jacket: v.team.colours,
            name: link(v.chairman.name, profile(v.chairman.person)),
            said: 'Chairman',
          },
          18,
          'beside'
        ),
        terms([
          ['Objective', `${ordinal(v.chairman.target)} or better`],
          ['Standing', verdict(v.chairman.standing)],
        ]),
      ],
      { cls: 'cr-grow' }
    );
  };

  /** Its season: where it stands and what it has done, against the leader and her team. */
  const season = (v: RivalView) => {
    const t = v.season;
    const move =
      t.move === 'up'
        ? el('span', '', arrow(1), ' Goes up')
        : t.move === 'down'
          ? el('span', '', arrow(-1), ' Goes down')
          : 'Stays';
    return sheet('This Season', [
      el(
        'div',
        'rv-stand',
        place(t.place, t.of, 34),
        terms([
          ['Points', String(t.points)],
          ['Wins', String(t.wins)],
          ['Podiums', String(t.podiums)],
          ['Sinkings', String(t.sinkings)],
        ])
      ),
      terms([
        ['Rounds sailed', `${t.round} of ${t.rounds}`],
        [
          'Behind the leader',
          t.leader === t.points ? '—' : grouped(t.points - t.leader),
        ],
        ...(t.hers === null
          ? []
          : ([['Against your team', signed(t.points - t.hers)]] as const)),
        ['Prize at its place', grouped(t.prize)],
        ['At the season’s end', move],
      ]),
    ]);
  };

  /** Its drivers: post, name, stars, where each stands. */
  const drivers = (v: RivalView) =>
    sheet('Drivers', [
      table<RivalView['drivers'][number]>(
        [
          { head: 'Post', track: u(30), cell: (r) => label(r.post) },
          {
            head: 'Driver',
            track: 'minmax(0, 1fr)',
            cell: (r) => link(r.name),
          },
          { head: 'Stars', track: u(48), cell: rated },
          {
            head: 'Pos',
            track: u(14),
            num: true,
            cell: (r) => (r.place === null ? '—' : r.place),
          },
          { head: 'Pts', track: u(16), num: true, cell: (r) => r.points },
        ],
        v.drivers,
        { tap: (r) => profile(r.person), none: 'No one sails for it.' }
      ),
    ]);

  /** Its staff: post, name, stars. */
  const staff = (v: RivalView) =>
    sheet(
      'Staff',
      [
        table<Hand>(
          [
            { head: 'Post', track: u(54), cell: (r) => label(r.post) },
            {
              head: 'Name',
              track: 'minmax(0, 1fr)',
              cell: (r) => link(r.name),
            },
            { head: 'Stars', track: u(48), cell: rated },
          ],
          v.staff,
          {
            tap: (r) => profile(r.person),
            none: 'No staff.',
            scrolls: { keep: `rival-staff-${v.team.id}` },
          }
        ),
      ],
      { cls: 'cr-grow' }
    );

  return {
    el: root,
    show(v) {
      root.replaceChildren(
        column(team(v), runs(v)),
        column(drivers(v), staff(v)),
        column(
          season(v),
          sheet(
            'Against the Grid',
            [compared(v.stats, { best: 'Its best', average: 'Average' })],
            { cls: 'cr-grow' }
          )
        )
      );
    },
  };
}
