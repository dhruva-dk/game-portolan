// The seam between the career and the office (MANAGER.md, the office): what
// the office's screens draw and what they ask, as plain data. A screen draws one
// view (its own file here, as menu.ts is the menu's) and knows nothing of where
// it came from; the desk hands the views out and takes what is asked. Types
// and constants only.

import type { MenuView } from './menu.ts';
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

/** A team as the office names it: its emblem by number, its two colours as the page shows them ('#rrggbb'). */
export interface Team {
  name: string;
  emblem: number;
  colours: readonly [string, string];
}

/** Every screen of the office that draws a view, and the view it draws. */
export interface Views {
  menu: MenuView;
}
export type Viewed = keyof Views;

/**
 * What a screen asks: to open another screen (a tab, or one a tab leads to),
 * to go on (Continue), the menu's four ways, and of a job under way its
 * details or its cancelling.
 */
export type Ask =
  | { kind: 'open'; screen: Tab | Viewed }
  | { kind: 'continue' }
  | { kind: 'menu'; choice: 'new' | 'continue' | 'single' | 'preferences' }
  | { kind: 'job'; job: string; what: 'details' | 'cancel' };

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
