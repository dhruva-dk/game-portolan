// The office's screens, by name: how each is made, what it is titled, which
// tab of the nav is lit while it is open, and whether it takes the whole page
// (bare: no strip, no nav). A screen is one file of this folder exporting
// `create<Name>(office)`, which returns its element and `show(view)`: it draws
// the view it is given (src/office/) and keeps none of the career's state; what
// it asks goes to the office. A tab with no screen here is shown unavailable.

import {
  TABS,
  type Desk,
  type Tab,
  type Viewed,
  type Views,
} from '../../office/office.ts';
import { createJobs, createPlayer } from './career.ts';
import { createChartroom } from './chartroom.ts';
import { createFound } from './found.ts';
import { createHome } from './home.ts';
import { createKit } from './kit.ts';
import { createMenu } from './menu.ts';
import { createOffer } from './negotiation.ts';
import type { Office } from './office.ts';
import { createFinances } from './finances.ts';
import { createMail } from './papers.ts';
import { createDrivers, createStaff, createTeam } from './roster.ts';
import { createScouting } from './scouting.ts';
import { createProfile } from './profile.ts';
import { createPlan } from './raceday.ts';
import { createResult } from './result.ts';
import { createCalendar, createSponsors } from './season.ts';
import { createStandings } from './standings.ts';
import { createHq, createShip } from './yard.ts';

/** A screen's name: a tab's, a viewed screen's, or a kit's sheet (the old kit's, the chartroom's). */
export type Name = Tab | Viewed | 'kit' | 'chartroom';
/** Every name a screen may have (the debug page opens the office at one: ?screen=). */
export const NAMES: readonly Name[] = [
  ...TABS,
  'menu',
  'found',
  'plan',
  'result',
  'profile',
  'offer',
  'jobs',
  'kit',
  'chartroom',
];

/** A screen: its element, laid over the page's body, and `show`, which draws a view. */
export interface Screen<V> {
  el: HTMLElement;
  show(view: V): void;
}

/** A screen as the office holds it: made once, drawn from the desk whenever something changes. */
export interface Opened {
  el: HTMLElement;
  draw(desk: Desk): void;
}

interface Entry {
  title: string;
  tab: Tab | null;
  bare: boolean;
  make(office: Office): Opened;
}

/** A screen that draws the desk's view of its own name. */
const viewed = <K extends Viewed>(
  name: K,
  create: (office: Office) => Screen<Views[K]>,
  place: { title: string; tab: Tab | null; bare?: boolean }
): Entry => ({
  title: place.title,
  tab: place.tab,
  bare: place.bare === true,
  make(office) {
    const s = create(office);
    return { el: s.el, draw: (desk) => s.show(desk.view(name)) };
  },
});

/** A sheet of a kit's pieces, drawn from no view. */
const sheetOf = (title: string, create: () => Screen<null>): Entry => ({
  title,
  tab: null,
  bare: false,
  make() {
    const s = create();
    return { el: s.el, draw: () => s.show(null) };
  },
});

export const SCREENS: Readonly<Partial<Record<Name, Entry>>> = {
  kit: sheetOf('Kit', createKit),
  chartroom: sheetOf('Chartroom', createChartroom),
  home: viewed('home', createHome, { title: 'Home', tab: 'home' }),
  found: viewed('found', createFound, {
    title: 'Create a New Team',
    tab: null,
    bare: true,
  }),
  plan: viewed('plan', createPlan, { title: 'Race Day', tab: null }),
  result: viewed('result', createResult, { title: 'Race Results', tab: null }),
  standings: viewed('standings', createStandings, {
    title: 'Standings',
    tab: 'standings',
  }),
  player: viewed('player', createPlayer, { title: 'Player', tab: 'player' }),
  mail: viewed('mail', createMail, { title: 'Mail', tab: 'mail' }),
  ship: viewed('ship', createShip, { title: 'Ship', tab: 'ship' }),
  hq: viewed('hq', createHq, { title: 'Headquarters', tab: 'hq' }),
  team: viewed('team', createTeam, { title: 'Team', tab: 'team' }),
  drivers: viewed('drivers', createDrivers, {
    title: 'Drivers',
    tab: 'drivers',
  }),
  staff: viewed('staff', createStaff, { title: 'Staff', tab: 'staff' }),
  scouting: viewed('scouting', createScouting, {
    title: 'Scouting',
    tab: 'scouting',
  }),
  finances: viewed('finances', createFinances, {
    title: 'Finances',
    tab: 'finances',
  }),
  sponsors: viewed('sponsors', createSponsors, {
    title: 'Sponsors',
    tab: 'sponsors',
  }),
  calendar: viewed('calendar', createCalendar, {
    title: 'Calendar',
    tab: 'calendar',
  }),
  profile: viewed('profile', createProfile, { title: 'Profile', tab: null }),
  offer: viewed('offer', createOffer, {
    title: 'Negotiation',
    tab: 'scouting',
  }),
  jobs: viewed('jobs', createJobs, { title: 'Job Offers', tab: 'player' }),
  menu: viewed('menu', createMenu, {
    title: 'Main Menu',
    tab: null,
    bare: true,
  }),
};
