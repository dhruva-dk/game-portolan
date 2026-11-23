// The standings on the chartroom kit, after MM's (016). At the left the
// championship: the three to choose among (hers first shown), its name on its
// plate, the season's rounds sailed, its prize fund, who leads it, where she
// stands and what that pays, which places go up and down, the way to the
// calendar. At the right its teams or its drivers, a whole table broad enough
// for a career's names: the teams' wins, podiums, sinkings, points, how far
// behind the leader, the prize each place would take, an arrow where the
// season's end would move a team, the places that move ruled off; the drivers'
// teams, wins, podiums, points and gap. Her lines gilt and scrolled into view.

import type { StandingLine } from '../../office/home.ts';
import type { StandingsTable, StandingsView } from '../../office/loop.ts';
import { button, link, segmented } from '../chartroom/controls.ts';
import { gauge, stepped, table, terms } from '../chartroom/data.ts';
import { arrow, dyed } from '../chartroom/figures.ts';
import { kitLooks } from '../chartroom/kit.ts';
import { column, page } from '../chartroom/layout.ts';
import { plate, sheet } from '../chartroom/paper.ts';
import { u } from '../chartroom/tokens.ts';
import { el, grouped, ordinal } from '../kit/part.ts';
import { stylesheet } from '../kit/style.ts';
import { toPerson } from './links.ts';
import type { Office } from './office.ts';
import type { Screen } from './screens.ts';

const CSS = `
.s-standings .cr-plate { text-align: center; }
.s-standings .st-calendar { margin-top: auto; }
`;

type TeamLine = StandingsTable['teams'][number];
type DriverLine = StandingsTable['drivers'][number];

/** The tiers' short names, for the switch among them. */
const TIERS = ['First', 'Second', 'Third'];

/** How far behind the leader a line stands; the leader's own a dash. */
const behind = (r: StandingLine, all: readonly StandingLine[]) => {
  const gap = r.points - (all[0]?.points ?? r.points);
  return gap === 0 ? '—' : grouped(gap);
};

/** Who a move takes, in words: the places that go `way`, and where to. */
function moving(c: StandingsTable, way: 'up' | 'down', to: string | null) {
  const places = c.teams.filter((t) => t.move === way).map((t) => t.place);
  if (!places.length || to === null) return 'None';
  const which =
    places.length === 1
      ? way === 'up'
        ? 'The first'
        : 'The last'
      : `${way === 'up' ? 'The first' : 'The last'} ${places.length}`;
  return `${which}, to the ${to}`;
}

/** The standings: a championship's at a time, hers first. */
export function createStandings(office: Office): Screen<StandingsView> {
  kitLooks();
  stylesheet(CSS);
  const root = page('side', 's-standings'),
    profile = toPerson(office);
  let chosen: number | null = null,
    lines: 'teams' | 'drivers' = 'teams';
  return {
    el: root,
    show(v) {
      const at = chosen ?? v.mine;
      const c = v.championships[at] ?? v.championships[v.mine];
      if (!c) return;
      const name = (i: number) => TIERS[i] ?? String(i + 1);
      const mine = c.teams.find((t) => t.own);
      const round = `Round ${v.round} of ${v.rounds}`;

      const championship = sheet(
        null,
        [
          segmented(
            v.championships.map((_, i) => name(i)),
            at,
            (i) => {
              chosen = i;
              office.draw();
            }
          ),
          plate(c.championship),
          gauge(
            'The season',
            round,
            stepped(
              v.round / v.rounds,
              Array.from({ length: v.rounds }, (_, i) => (i + 1) / v.rounds),
              v.round
            )
          ),
          terms([
            ['Prize fund', grouped(c.pool)],
            ['Leading team', c.teams[0]?.name ?? '—'],
            ['Leading driver', c.drivers[0]?.name ?? '—'],
            ...(mine
              ? ([
                  ['Her place', ordinal(mine.place)],
                  ['Its prize', grouped(mine.prize)],
                  [
                    'Her drivers',
                    c.drivers
                      .filter((d) => d.own)
                      .map((d) => ordinal(d.place))
                      .join(', ') || '—',
                  ],
                ] as const)
              : []),
            ['Go up', moving(c, 'up', at > 0 ? name(at - 1) : null)],
            [
              'Go down',
              moving(
                c,
                'down',
                at < v.championships.length - 1 ? name(at + 1) : null
              ),
            ],
          ]),
          el(
            'div',
            'st-calendar',
            button(
              'Season Calendar',
              () => office.ask({ kind: 'open', screen: 'calendar' }),
              { kind: 'plain' }
            )
          ),
        ],
        { cls: 'cr-grow' }
      );

      const teams = () =>
        table<TeamLine>(
          [
            { head: 'Pos', track: u(14), num: true, cell: (r) => r.place },
            {
              head: '',
              track: u(8),
              cell: (r) =>
                arrow(r.move === 'up' ? 1 : r.move === 'down' ? -1 : 0),
            },
            {
              head: 'Team',
              track: 'minmax(0, 1fr)',
              cell: (r) => dyed(r.team.colours[0], r.name),
            },
            { head: 'Wins', track: u(17), num: true, cell: (r) => r.wins },
            { head: 'Pod', track: u(15), num: true, cell: (r) => r.podiums },
            { head: 'Sunk', track: u(18), num: true, cell: (r) => r.sinkings },
            { head: 'Pts', track: u(20), num: true, cell: (r) => r.points },
            {
              head: 'Gap',
              track: u(24),
              num: true,
              cell: (r) => behind(r, c.teams),
            },
            {
              head: 'Prize',
              track: u(36),
              num: true,
              cell: (r) => grouped(r.prize),
            },
          ],
          c.teams,
          {
            own: (r) => r.own,
            cut: (r) => r.ruled,
            scrolls: { keep: `standings-teams-${at}` },
          }
        );

      const drivers = () =>
        table<DriverLine>(
          [
            { head: 'Pos', track: u(14), num: true, cell: (r) => r.place },
            {
              head: 'Driver',
              track: 'minmax(0, 1fr)',
              cell: (r) => dyed(r.team.colours[0], link(r.name)),
            },
            {
              head: 'Team',
              track: 'minmax(0, 1.2fr)',
              cell: (r) => r.team.name,
            },
            { head: 'Wins', track: u(17), num: true, cell: (r) => r.wins },
            { head: 'Pod', track: u(15), num: true, cell: (r) => r.podiums },
            { head: 'Pts', track: u(20), num: true, cell: (r) => r.points },
            {
              head: 'Gap',
              track: u(24),
              num: true,
              cell: (r) => behind(r, c.drivers),
            },
          ],
          c.drivers,
          {
            own: (r) => r.own,
            tap: (r) => profile(r.person),
            none: 'No one sails in it yet.',
            scrolls: { keep: `standings-drivers-${at}` },
          }
        );

      const tables = sheet(
        c.championship,
        [
          segmented(['Teams', 'Drivers'], lines === 'teams' ? 0 : 1, (i) => {
            lines = i === 0 ? 'teams' : 'drivers';
            office.draw();
          }),
          lines === 'teams' ? teams() : drivers(),
        ],
        { aside: round, cls: 'cr-grow' }
      );

      root.replaceChildren(column(championship), column(tables));
    },
  };
}
