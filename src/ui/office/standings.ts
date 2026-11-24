// The standings on the chartroom kit, after MM's (016). At the left your
// season, whichever championship is shown: your place and points, what the
// chairman asks and how you stand to it, the team just ahead and the team just
// behind and the points between, what your place pays against one place up,
// your drivers and where each stands, the way to the calendar. At the right a
// championship's tables, the three to choose among (yours first shown): its
// teams (wins, podiums, sinkings, points, how far behind the leader, the prize
// each place would take, an arrow where the season's end would move a team, the
// places that move ruled off) or its drivers (their teams, wins, podiums,
// points and gap). Your lines gilt and scrolled into view; every name opens its
// page.

import type { StandingLine } from '../../office/home.ts';
import type { StandingsTable, StandingsView } from '../../office/loop.ts';
import { button, link, segmented } from '../chartroom/controls.ts';
import { table, terms } from '../chartroom/data.ts';
import { arrow, dyed, label, place, verdict } from '../chartroom/figures.ts';
import { kitLooks } from '../chartroom/kit.ts';
import { column, page } from '../chartroom/layout.ts';
import { sheet } from '../chartroom/paper.ts';
import { u } from '../chartroom/tokens.ts';
import { el, grouped, ordinal } from '../kit/part.ts';
import { stylesheet } from '../kit/style.ts';
import { toPerson, toTeam } from './links.ts';
import type { Office } from './office.ts';
import type { Screen } from './screens.ts';

const CSS = `
.s-standings .st-calendar { margin-top: auto; }
.st-stand { display: flex; align-items: center; gap: var(--s4); }
.st-stand > .cr-terms { flex: 1; min-width: 0; }
.st-switch { display: flex; gap: var(--s4); }
.st-switch > :first-child { flex: 3; }
.st-switch > :last-child { flex: 2; }
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

/** A count of points signed: ahead (+) or behind (−), level a dash. */
const signed = (n: number) =>
  n === 0 ? '—' : n > 0 ? `+${grouped(n)}` : grouped(n);

/** The standings: your season at the left, a championship's tables at the right. */
export function createStandings(office: Office): Screen<StandingsView> {
  kitLooks();
  stylesheet(CSS);
  const root = page('side', 's-standings'),
    profile = toPerson(office),
    teamPage = toTeam(office);
  let chosen: number | null = null,
    lines: 'teams' | 'drivers' = 'teams';

  /** Your season: place, objective, the teams either side, the prize, your drivers. */
  function yours(v: StandingsView) {
    const c = v.championships[v.mine];
    const at = c?.teams.findIndex((t) => t.own) ?? -1;
    const mine = c?.teams[at];
    if (!c || !mine)
      return sheet('Your Season', [label('Your team sails in none.')], {
        cls: 'cr-grow',
      });
    const up = c.teams[at - 1];
    const near = [up, mine, c.teams[at + 1]].filter(
      (t): t is TeamLine => t !== undefined
    );
    return sheet(
      'Your Season',
      [
        el(
          'div',
          'st-stand',
          place(mine.place, c.teams.length, 30),
          terms([
            ['Points', String(mine.points)],
            ['Objective', `${ordinal(v.chairman.target)} or better`],
            ['Standing', verdict(v.chairman.standing)],
          ])
        ),
        table<TeamLine>(
          [
            { head: 'Pos', track: u(14), num: true, cell: (r) => r.place },
            {
              head: 'Around you',
              track: 'minmax(0, 1fr)',
              cell: (r) =>
                dyed(r.team.colours[0], r.own ? 'Your team' : link(r.name)),
            },
            {
              head: 'Pts',
              track: u(20),
              num: true,
              cell: (r) => (r.own ? r.points : signed(r.points - mine.points)),
            },
          ],
          near,
          {
            own: (r) => r.own,
            tap: (r) => (r.own ? null : teamPage(r.team.id)),
          }
        ),
        terms([
          ['Your place pays', grouped(mine.prize)],
          ...(up
            ? ([
                [
                  `${ordinal(up.place)} pays`,
                  `${grouped(up.prize)} (+${grouped(up.prize - mine.prize)})`,
                ],
              ] as const)
            : []),
        ]),
        table<DriverLine>(
          [
            {
              head: 'Your drivers',
              track: 'minmax(0, 1fr)',
              cell: (r) => link(r.name),
            },
            { head: 'Pos', track: u(14), num: true, cell: (r) => r.place },
            { head: 'Pts', track: u(20), num: true, cell: (r) => r.points },
          ],
          c.drivers.filter((d) => d.own),
          { tap: (r) => profile(r.person), none: 'No one sails yet.' }
        ),
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
  }

  return {
    el: root,
    show(v) {
      const at = chosen ?? v.mine;
      const c = v.championships[at] ?? v.championships[v.mine];
      if (!c) return;

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
              cell: (r) => dyed(r.team.colours[0], link(r.name)),
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
            tap: (r) => teamPage(r.team.id),
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
              cell: (r) => link(r.team.name, teamPage(r.team.id)),
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
          el(
            'div',
            'st-switch',
            segmented(
              v.championships.map((_, i) => TIERS[i] ?? String(i + 1)),
              at,
              (i) => {
                chosen = i;
                office.draw();
              }
            ),
            segmented(['Teams', 'Drivers'], lines === 'teams' ? 0 : 1, (i) => {
              lines = i === 0 ? 'teams' : 'drivers';
              office.draw();
            })
          ),
          lines === 'teams' ? teams() : drivers(),
        ],
        {
          aside: `Round ${v.round} of ${v.rounds} · Prize fund ${grouped(c.pool)}`,
          cls: 'cr-grow',
        }
      );

      root.replaceChildren(column(yours(v)), column(tables));
    },
  };
}
