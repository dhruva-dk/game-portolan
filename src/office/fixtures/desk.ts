// The fixture desk: a career's views as plain values, for the debug page's
// office (?screen=) and the tests, until a career hands out its own. What is
// asked of it changes nothing.

import { TEAM, TEAMS as GRID } from '../../race.ts';
import type { Desk, Views } from '../office.ts';
import type { ShellView } from '../shell.ts';
import { HOME } from './home.ts';
import { HERS } from './teams.ts';

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

const VIEWS: Views = {
  menu: {
    career: { championships: 3, teams: 3 * GRID },
    kept: { team: HERS, date: SHELL.date },
    single: { seed: 'Brindle', ships: GRID * TEAM },
  },
  home: HOME,
};

export const FIXTURE: Desk = {
  shell: () => SHELL,
  view: (screen) => VIEWS[screen],
  ask() {},
};
