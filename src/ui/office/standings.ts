// The championship's standings. At the left the championship itself (its
// name, the races sailed of its season, who leads it, the way to its calendar)
// over the teams' standings; at the right the drivers' standings, the whole
// height. A table each: place, name, wins, points, and how far behind the
// leader; the places that go up and down ruled off, her own lines lit.

import type { StandingLine } from '../../office/home.ts';
import type { StandingsView } from '../../office/loop.ts';
import { button } from '../kit/button.ts';
import { icon } from '../kit/icons.ts';
import { band, panel } from '../kit/panel.ts';
import { el } from '../kit/part.ts';
import { stylesheet } from '../kit/style.ts';
import { table } from '../kit/table.ts';
import type { Office } from './office.ts';
import type { Screen } from './screens.ts';

const CSS = `
.s-standings { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; padding: 12px 18px; }
.s-standings > div { display: flex; flex-direction: column; gap: 10px; min-height: 0; min-width: 0; }
.s-standings .grow { flex: 1; }
.t-series { flex: none; }
.t-series > .k-body { display: grid; grid-template-columns: 1fr 220px; gap: 12px; padding-top: 12px; }
.t-name { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px; padding: 8px; background: var(--dark); }
.t-name > b { font: 700 24px/1.1 var(--serif); letter-spacing: .04em; text-align: center; }
.t-name > span { font-style: italic; color: var(--faint); }
.t-rounds { align-self: stretch; display: flex; gap: 3px; height: 5px; margin-top: 4px; }
.t-rounds > i { flex: 1; background: var(--track); }
.t-rounds > i.done { background: var(--gold); }
.t-facts { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.t-facts > b { padding: 3px 0 5px; text-align: center; font: 700 21px/1.1 var(--narrow); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
`;

type TeamLine = StandingsView['teams'][number];

/** `made`, of the classes `cls` too (a panel's place in its column). */
const as = <T extends Element>(made: T, cls: string) => {
  made.classList.add(...cls.split(' '));
  return made;
};

/** How far behind the leader a line stands (the leader's own: a dash). */
const behind = (r: StandingLine, all: readonly StandingLine[]) => {
  const gap = r.points - (all[0]?.points ?? r.points);
  return gap === 0 ? '-' : String(gap);
};

/** The standings. */
export function createStandings(office: Office): Screen<StandingsView> {
  stylesheet(CSS);
  const root = el('div', 's-standings');
  return {
    el: root,
    show(v) {
      const round = `Round ${v.round} of ${v.rounds}`;
      root.replaceChildren(
        el(
          'div',
          '',
          as(
            panel(null, [
              el(
                'div',
                't-name',
                icon('cup', 44),
                el('b', '', v.championship),
                el('span', '', round),
                el(
                  'div',
                  't-rounds',
                  ...Array.from({ length: v.rounds }, (_, i) =>
                    el('i', i < v.round ? 'done' : '')
                  )
                )
              ),
              el(
                'div',
                't-facts',
                band('Leading Team'),
                el('b', '', v.teams[0]?.name ?? '-'),
                band('Leading Driver'),
                el('b', '', v.drivers[0]?.name ?? '-'),
                button(
                  'View Season Calendar',
                  () => office.ask({ kind: 'open', screen: 'calendar' }),
                  { wide: true }
                )
              ),
            ]),
            't-series'
          ),
          as(
            panel(
              'Team Standings',
              [
                table<TeamLine>(
                  [
                    { label: 'Position', width: '56px', cell: (r) => r.place },
                    { label: 'Team', width: '1fr', cell: (r) => r.name },
                    {
                      label: 'Wins',
                      width: '44px',
                      num: true,
                      cell: (r) => r.wins,
                    },
                    {
                      label: 'Sinkings',
                      width: '62px',
                      num: true,
                      cell: (r) => r.sinkings,
                    },
                    {
                      label: 'PTS',
                      width: '44px',
                      num: true,
                      cell: (r) => r.points,
                    },
                    {
                      label: 'Diff',
                      width: '44px',
                      num: true,
                      cell: (r) => behind(r, v.teams),
                    },
                  ],
                  v.teams,
                  {
                    height: 30,
                    own: (r) => r.own,
                    colour: (r) => r.team.colours[0],
                    cut: (r) => r.ruled,
                    keep: 'teams',
                  }
                ),
              ],
              round
            ),
            'grow'
          )
        ),
        el(
          'div',
          '',
          as(
            panel(
              'Driver Standings',
              [
                table<StandingLine>(
                  [
                    { label: 'Position', width: '56px', cell: (r) => r.place },
                    { label: 'Driver', width: '1fr', cell: (r) => r.name },
                    { label: 'Team', width: '1.4fr', cell: (r) => r.team.name },
                    {
                      label: 'PTS',
                      width: '44px',
                      num: true,
                      cell: (r) => r.points,
                    },
                    {
                      label: 'Diff',
                      width: '44px',
                      num: true,
                      cell: (r) => behind(r, v.drivers),
                    },
                  ],
                  v.drivers,
                  {
                    height: 30,
                    own: (r) => r.own,
                    colour: (r) => r.team.colours[0],
                    keep: 'drivers',
                  }
                ),
              ],
              round
            ),
            'grow'
          )
        )
      );
    },
  };
}
