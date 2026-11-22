// The fixture desk: a career's views as plain values, for the debug page's
// office (?screen=) and the tests, until a career hands out its own. What is
// asked of it changes nothing.

import { TEAM, TEAMS as GRID } from '../../race.ts';
import type { Desk, Views } from '../office.ts';
import type { ShellView } from '../shell.ts';
import { HOME } from './home.ts';
import { HERS, TEAMS } from './teams.ts';

/** A race's points by place, as the fixture's result shows them. */
const POINTS = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1];

const SHELL: ShellView = {
  team: HERS,
  balance: 211000,
  championship: 'Third Championship',
  next: { name: 'Brindle', days: 16 },
  notices: 6,
  date: '10 May 1716',
  marks: { ship: { busy: true }, hq: { busy: true }, scouting: { count: 6 } },
  on: 'Continue',
};

/** The screens the fixture has a view for (the rest are drawn from a career: ?manager). */
const VIEWS: Pick<
  Views,
  'menu' | 'home' | 'found' | 'plan' | 'result' | 'standings'
> &
  Partial<Views> = {
  menu: {
    career: { championships: 3, teams: 3 * GRID },
    kept: { team: HERS, date: SHELL.date },
    single: { seed: 'Brindle', ships: GRID * TEAM },
  },
  home: HOME,
  found: {
    team: HERS.name,
    given: 'Ada',
    family: 'Holt',
    dyes: TEAMS.map((t) => t.colours),
    patterns: ['Plain', 'Band', 'Stripes'],
    emblems: 12,
    championship: SHELL.championship,
    replacing: 'Razorbill',
    refused: null,
  },
  plan: {
    team: HERS,
    round: HOME.next.round,
    rounds: HOME.next.rounds,
    name: HOME.next.name,
    championship: SHELL.championship,
    ships: [
      { name: 'Ada Holt', stars: null, you: true },
      ...HOME.drivers
        .slice(1)
        .map((d, i) => ({ name: d.name, stars: 3.5 - i, you: false })),
    ],
    call: 'free',
    blocked: null,
    waiting: false,
  },
  result: {
    title: `1716 ${HOME.next.name} - ${SHELL.championship}`,
    lines: HOME.standings.drivers.map((d, i) => ({
      place: i + 1,
      driver: d.name,
      team: d.team,
      own: d.own,
      afloat: i < TEAM,
      sinkings: (i * 7) % 4,
      second: i < TEAM ? null : 372 - i * 4,
      stops: i % 3,
      points: POINTS[i] ?? 0,
    })),
    points: 31,
    target: HOME.chairman.target,
    standing: { label: 'On Target', mood: 'good' },
    place: 4,
  },
  standings: {
    championship: SHELL.championship,
    round: HOME.next.round - 1,
    rounds: HOME.next.rounds,
    teams: HOME.standings.teams.map((t, i) => ({
      ...t,
      wins: i === 0 ? 2 : 0,
      sinkings: Math.round(t.points / 3),
    })),
    drivers: HOME.standings.drivers,
  },
};

export const FIXTURE: Desk = {
  shell: () => SHELL,
  view<K extends keyof Views>(screen: K): Views[K] {
    const v: Partial<Views>[K] = VIEWS[screen];
    if (v === undefined) throw new Error(`the fixture has no ${screen}`);
    return v;
  },
  ask() {},
};
