// The championship's standings, whole: its teams at the left (place, team,
// wins, sinkings, points; the places that go up and down ruled off), its
// drivers at the right (place, driver, team, points), her own lines lit.

import type { StandingsView } from '../../office/loop.ts';
import { panel } from '../kit/panel.ts';
import { el } from '../kit/part.ts';
import { stylesheet } from '../kit/style.ts';
import { table } from '../kit/table.ts';
import type { Screen } from './screens.ts';

const CSS = `
.s-standings { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; padding: 12px 18px; }
`;

type TeamLine = StandingsView['teams'][number];
type DriverLine = StandingsView['drivers'][number];

/** The standings. */
export function createStandings(): Screen<StandingsView> {
  stylesheet(CSS);
  const root = el('div', 's-standings');
  return {
    el: root,
    show(v) {
      const round = `Race ${v.round} of ${v.rounds}`;
      root.replaceChildren(
        panel(
          `${v.championship} - Teams`,
          [
            table<TeamLine>(
              [
                { label: 'Pos', width: '40px', cell: (r) => r.place },
                { label: 'Team', width: '1fr', cell: (r) => r.name },
                {
                  label: 'Wins',
                  width: '50px',
                  num: true,
                  cell: (r) => r.wins,
                },
                {
                  label: 'Sinkings',
                  width: '70px',
                  num: true,
                  cell: (r) => r.sinkings,
                },
                {
                  label: 'PTS',
                  width: '50px',
                  num: true,
                  cell: (r) => r.points,
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
        panel(
          `${v.championship} - Drivers`,
          [
            table<DriverLine>(
              [
                { label: 'Pos', width: '40px', cell: (r) => r.place },
                { label: 'Driver', width: '1fr', cell: (r) => r.name },
                { label: 'Team', width: '1fr', cell: (r) => r.team.name },
                {
                  label: 'PTS',
                  width: '50px',
                  num: true,
                  cell: (r) => r.points,
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
        )
      );
    },
  };
}
