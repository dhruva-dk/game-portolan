// A season's review on the chartroom kit, as the career's archive keeps it: at
// the left your season (the team a link, where it finished against its
// target, its points and prize, its honours; the seasons kept, to choose
// another); in the middle the championships' champions and the teams moved up
// and down, each a link; at the right who retired and the most promising who
// came, each a link, and the rules turned for the season after.

import type { SeasonView } from '../../office/board.ts';
import { dropdown, link } from '../chartroom/controls.ts';
import { table, terms } from '../chartroom/data.ts';
import { label, place } from '../chartroom/figures.ts';
import { kitLooks } from '../chartroom/kit.ts';
import { column, page } from '../chartroom/layout.ts';
import { sheet } from '../chartroom/paper.ts';
import { u } from '../chartroom/tokens.ts';
import { el } from '../kit/part.ts';
import { stylesheet } from '../kit/style.ts';
import { toPerson, toTeam } from './links.ts';
import type { Office } from './office.ts';
import type { Screen } from './screens.ts';

const CSS = `
.sv-head { display: flex; align-items: center; gap: var(--s4); }
.sv-head > div:last-child { min-width: 0; display: flex; flex-direction: column; gap: ${u(1)}; }
.sv-head .cr-link { font: 700 var(--t-name)/1.15 var(--face); }
.sv-honours { display: flex; flex-wrap: wrap; gap: var(--s1) var(--s4); font: italic 600 var(--t-body)/1.3 var(--face); color: var(--act); }
`;

/** Places ahead of or behind the target, said. */
const against = (met: number) =>
  met === 0
    ? 'On target'
    : met > 0
      ? `${met} ahead of target`
      : `${-met} behind target`;

/** A season's review. */
export function createSeason(office: Office): Screen<SeasonView | null> {
  kitLooks();
  stylesheet(CSS);
  const root = page('ledger', 's-season'),
    teamPage = toTeam(office),
    profile = toPerson(office);
  const teamLink = (name: string, id: number) => link(name, teamPage(id));

  /** Your season: where it finished, what it won; the seasons kept. */
  const yours = (v: SeasonView) =>
    sheet(
      `Season ${v.year}`,
      [
        v.seasons.length > 1 &&
          dropdown(
            v.seasons.map((x) => `Season ${x.year}`),
            Math.max(
              0,
              v.seasons.findIndex((x) => x.season === v.season)
            ),
            (i) => {
              const x = v.seasons[i];
              if (x) office.ask({ kind: 'season', season: x.season });
            }
          ),
        el(
          'div',
          'sv-head',
          place(v.place, v.of),
          el('div', '', teamLink(v.team, v.teamId), label(v.tier))
        ),
        v.sacked && label('You were let go before the season’s end.'),
        terms([
          ['Target', `${v.target}: ${against(v.met)}`],
          ['Points', `${v.points}`],
          ['Races won', `${v.wins}`],
          ['Podiums', `${v.podiums}`],
          ['Ships sunk', `${v.sinkings}`],
          ['Prize money', v.prize],
          ['Chairman’s confidence', `${v.confidence} of 100`],
        ]),
        v.honours.length > 0
          ? el('div', 'sv-honours', ...v.honours.map((h) => el('span', '', h)))
          : label('No honours this season.'),
      ],
      { cls: 'cr-grow' }
    );

  /** The champions, and the teams moved up and down. */
  const championships = (v: SeasonView) =>
    sheet(
      'The Championships',
      [
        terms(
          v.champions.map((c): [string, ReturnType<typeof teamLink>] => [
            c.tier,
            teamLink(c.name, c.team),
          ])
        ),
        table(
          [
            {
              head: 'Moved',
              track: u(44),
              cell: (m) => (m.up ? 'Up' : 'Down'),
            },
            {
              head: 'Team',
              track: 'minmax(0, 1fr)',
              cell: (m) => link(m.name),
            },
            { head: 'From', track: u(92), cell: (m) => m.from },
          ],
          [...v.moves].sort((a, b) => Number(b.up) - Number(a.up)),
          {
            own: (m) => m.team === v.teamId,
            tap: (m) => teamPage(m.team),
            none: 'No team moved.',
          }
        ),
      ],
      { cls: 'cr-grow' }
    );

  /** Who retired, who came, and the rules turned. */
  const turned = (v: SeasonView) =>
    sheet(
      'Comings and Goings',
      [
        label('Retired'),
        table(
          [
            {
              head: 'Name',
              track: 'minmax(0, 1fr)',
              cell: (g) => link(g.name),
            },
            { head: 'Role', track: u(64), cell: (g) => g.role },
          ],
          v.retired,
          { tap: (g) => profile(g.person), none: 'No one of note retired.' }
        ),
        label('The most promising newcomers'),
        table(
          [
            {
              head: 'Name',
              track: 'minmax(0, 1fr)',
              cell: (g) => link(g.name),
            },
            {
              head: 'Role, age',
              track: u(64),
              cell: (g) => `${g.role}, ${g.age}`,
            },
          ],
          v.arrivals,
          { tap: (g) => profile(g.person), none: 'No one came.' }
        ),
        label('Next season’s rules'),
        v.rules.length > 0
          ? terms(v.rules.map((r) => [r.name, `${r.was} → ${r.now}`]))
          : label('No rule changed.'),
      ],
      { cls: 'cr-grow' }
    );

  return {
    el: root,
    show(v) {
      root.replaceChildren(
        ...(v
          ? [column(yours(v)), column(championships(v)), column(turned(v))]
          : [
              column(
                sheet('Season Review', [label('No season has ended yet.')], {
                  cls: 'cr-grow',
                })
              ),
            ])
      );
    },
  };
}
