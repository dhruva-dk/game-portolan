// The fixture desk: a career's views as plain values, for the debug page's
// office (?screen=) and the tests, until a career hands out its own. What is
// asked of it changes nothing.

import { TEAM, TEAMS as GRID } from '../../race.ts';
import type { Desk, Views } from '../office.ts';
import type { ShellView } from '../shell.ts';
import { ADMIRALTY } from './regulations.ts';
import { BOARD, SEASON } from './board.ts';
import { CALENDAR } from './calendar.ts';
import { JOBS, PLAYER } from './career.ts';
import { FINANCES } from './finances.ts';
import { HOME } from './home.ts';
import { MAIL } from './mail.ts';
import { PLAN } from './plan.ts';
import { PROFILE } from './profile.ts';
import { OFFER } from './offer.ts';
import { RIVAL } from './rival.ts';
import { SCOUTING } from './scouting.ts';
import { SPONSORS } from './sponsors.ts';
import { STANDINGS } from './standings.ts';
import { TEAM as ROSTER } from './team.ts';
import { HERS, TEAMS } from './teams.ts';
import { HQ, SHIP } from './yard.ts';

/** A race's points by place, as the fixture's result shows them. */
const POINTS = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1];

const SHELL: ShellView = {
  team: HERS,
  balance: 211000,
  championship: 'Third Championship',
  next: { name: 'Brindle', days: 16 },
  notices: 6,
  date: '10 May 2026',
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
  profile: { view: PROFILE, dyes: TEAMS.map((t) => t.colours) },
  team: { view: ROSTER, dyes: TEAMS.map((t) => t.colours) },
  drivers: { view: ROSTER, dyes: TEAMS.map((t) => t.colours) },
  staff: { view: ROSTER, dyes: TEAMS.map((t) => t.colours) },
  scouting: { view: SCOUTING, dyes: TEAMS.map((t) => t.colours) },
  offer: { view: OFFER, dyes: TEAMS.map((t) => t.colours) },
  finances: FINANCES,
  found: {
    team: HERS.name,
    given: 'Ada',
    family: 'Holt',
    dyes: TEAMS.map((t) => t.colours),
    patterns: ['Plain', 'Band', 'Stripes'],
    emblems: 12,
    championship: SHELL.championship,
    replacing: { team: 'Razorbill', chairman: 'Maneette Greymere', staff: 1.6 },
    refused: null,
  },
  plan: PLAN,
  result: {
    title: `2026 ${HOME.next.name} - ${SHELL.championship}`,
    lines: HOME.standings.drivers.map((d, i) => ({
      place: i + 1,
      person: d.person,
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
    place: 3,
  },
  standings: STANDINGS,
  rival: RIVAL,
  sponsors: SPONSORS,
  calendar: CALENDAR,
  mail: { view: MAIL, dyes: TEAMS.map((t) => t.colours) },
  player: { view: PLAYER, dyes: TEAMS.map((t) => t.colours) },
  jobs: { view: JOBS, dyes: TEAMS.map((t) => t.colours) },
  regulations: ADMIRALTY,
  board: { view: BOARD, dyes: TEAMS.map((t) => t.colours) },
  season: SEASON,
  hq: HQ,
  ship: SHIP,
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
