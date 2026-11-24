// The seam between the career and the office: what
// the office's screens draw and what they ask, as plain data. A screen draws one
// view (its own file here: home.ts, menu.ts) and knows nothing of where it came
// from; the desk hands the views out and takes what is asked. Types and
// constants only.

import type { Call, PartType } from '../race.ts';
import type { AdmiraltyView } from './admiralty.ts';
import type { Command, Offer } from './command.ts';
import type { HomeView } from './home.ts';
import type {
  FoundView,
  Founding,
  PlanView,
  ResultView,
  StandingsView,
} from './loop.ts';
import type { MenuView } from './menu.ts';
import type {
  CalendarPaper,
  Dyed,
  FinancesPaper,
  HqPaper,
  MailPaper,
  ShipPaper,
  SponsorsPaper,
} from './papers.ts';
import type {
  CareerView,
  JobsView,
  OfferView,
  ProfileView,
  ScoutingFilter,
  ScoutingView,
  TeamView,
} from './people.ts';
import type { RivalView } from './rival.ts';
import type { ShellView } from './shell.ts';

/** The nav's tabs, in the order they stand. */
export const TABS = [
  'home',
  'player',
  'mail',
  'ship',
  'hq',
  'team',
  'drivers',
  'staff',
  'scouting',
  'finances',
  'sponsors',
  'standings',
  'calendar',
] as const;
export type Tab = (typeof TABS)[number];

/** A team as the office names it: its id (its page's), its emblem by number, its two colours as the page shows them
 *  ('#rrggbb'). */
export interface Team {
  id: number;
  name: string;
  emblem: number;
  colours: readonly [string, string];
}

/** How a thing stands, as the tone it is shown in. */
type Mood = 'good' | 'fair' | 'warn' | 'bad';

/** A word of judgment (Very Secure, Below Target) and the mood it is said in. */
export interface Verdict {
  label: string;
  mood: Mood;
}

/** Every screen of the office that draws a view, and the view it draws. */
export interface Views {
  menu: MenuView;
  home: HomeView;
  found: FoundView;
  plan: PlanView;
  result: ResultView;
  standings: StandingsView;
  team: Dyed<TeamView>;
  drivers: Dyed<TeamView>;
  staff: Dyed<TeamView>;
  profile: Dyed<ProfileView>;
  offer: Dyed<OfferView>;
  scouting: Dyed<ScoutingView>;
  player: Dyed<CareerView>;
  jobs: Dyed<JobsView>;
  mail: Dyed<MailPaper>;
  calendar: CalendarPaper;
  finances: FinancesPaper;
  sponsors: SponsorsPaper;
  hq: HqPaper;
  ship: ShipPaper;
  rival: RivalView;
  admiralty: AdmiraltyView;
}
export type Viewed = keyof Views;

/**
 * What a screen asks: to open another screen (a tab, or one a tab leads to),
 * to go on (Continue), the menu's four ways, of a job under way its details
 * or its cancelling, the team made, and her team's call for the race's start;
 * a command of the career's; a person's profile or the offer to them opened, a team's page,
 * the offer as it is drawn now, the scouting list's filter, a person put on
 * the shortlist or taken off it; a letter opened; the type of part on the
 * drawing board, and a slot's card picked.
 */
export type Ask =
  | { kind: 'open'; screen: Tab | Viewed }
  | { kind: 'continue' }
  | { kind: 'menu'; choice: 'new' | 'continue' | 'single' | 'preferences' }
  | { kind: 'job'; job: string; what: 'details' | 'cancel' }
  | { kind: 'found'; founding: Founding }
  | { kind: 'call'; call: Call }
  | { kind: 'send'; command: Command }
  | { kind: 'person'; id: number; screen: 'profile' | 'offer' }
  | { kind: 'team'; id: number }
  | { kind: 'round'; round: number }
  | { kind: 'draft'; offer: Offer }
  | { kind: 'filter'; filter: ScoutingFilter }
  | { kind: 'favourite'; id: number }
  | { kind: 'letter'; id: number }
  | { kind: 'design'; type: PartType }
  | { kind: 'card'; slot: number; card: string };

/**
 * The desk the office is drawn from: the shell's view, each screen's, and what
 * is asked of the career (the office opens screens itself). After an ask the
 * office draws again.
 */
export interface Desk {
  shell(): ShellView;
  view<K extends Viewed>(screen: K): Views[K];
  ask(a: Ask): void;
}
