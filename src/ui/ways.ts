// The screens and every way between them, as data: the table the flow (flow.ts) follows and nothing else. A way is
// taken by her tap on something drawn for it, or by the match's own course (the game's), never by a clock of the
// UI's own. Each screen fades or cross-fades into the next (FADE); none is cut to. Home from a match, the parchment
// comes over it and lifts off the lobby once it is drawn (HOME, wayHome).
//   title     the chart over the world loading; once ready, a tap anywhere          → the office (below)
//   lobby     over her ship at anchor: PLAY → match (the world cross-fades to the eye coming down from space)
//   match     the arrival, then her hands on her ship; she sinks → sinking; she is the last afloat → won
//   sinking   the camera held on her ship going down, the HUD gone; the beat done → sunk, or → result if the match
//             is over
//   sunk      her result over the live world, with WATCH → spectate, SKIP → spectate (the race run on to its end under
//             the parchment, the world not drawn, then lifted off her result) and LEAVE → lobby (by the parchment:
//             HOME); the race over → result
//   spectate  watching another ship: turn to the next or the one before; SKIP; LEAVE → lobby; the race over → result
//   won       the camera circling her, the HUD gone; the beat done → result
//   result    her result over the live world, one way on: LEAVE → lobby

//
// The office (Phase C, ui/office/): the management screens on one page over the world, the top bar's tabs on each.
//   title     a tap → home (founded), found (no career yet) or recover (the save damaged): the desk says which
//   found     founding the crew → home;  recover: each way forward → home, a new career → found
//   home …    the top bar's tabs (home, crew, ship, rookery, market, league, finance, mail), the player's name
//             (career), Continue (plan on race day, jobs when sacked), the gear (settings)
//   settings  a dialog over home: close → home
//   plan      the race plan: to the anchorage → lobby (PLAY from there, until batch 4's race plan sails it)
//   lobby     her ship at anchor: PLAY → match; the gear → settings; the office → home

import { OFFICE, SCREENS, type OfficeScreen, type Screen } from '../player.ts';

export { OFFICE, SCREENS, type OfficeScreen, type Screen };

/** The top bar's eight tabs, in order: each a tap of the same name. */
export const TABS = ['home', 'crew', 'ship', 'rookery', 'market', 'league', 'finance', 'mail'] as const;
/** What moves a screen on: her taps, and the match's own course. */
export const TAPS = ['begin', 'play', 'settings', 'close', 'watch', 'skip', 'switch', 'leave',
  ...TABS, 'career', 'profile', 'offer', 'plan', 'season', 'jobs', 'found', 'recover', 'anchorage'] as const;
export const EVENTS = ['sunk', 'won', 'settled', 'over'] as const;
export type Tap = (typeof TAPS)[number];
export type Event = (typeof EVENTS)[number];
export type Trigger = Tap | Event;

/** The top bar's ways, from every office screen it shows on. */
const TOP = {
  home: 'home', crew: 'crew', ship: 'ship', rookery: 'rookery', market: 'market', league: 'league', finance: 'finance', mail: 'mail',
  career: 'career', settings: 'settings', plan: 'plan', jobs: 'jobs', profile: 'profile',
} as const satisfies Partial<Record<Tap, Screen>>;

/** Every way on from each screen: what takes it, and where to. */
export const WAYS: Record<Screen, Partial<Record<Trigger, Screen>>> = {
  title: { begin: 'home', found: 'found', recover: 'recover' },
  found: { home: 'home' },
  recover: { home: 'home', found: 'found' },
  home: TOP, career: TOP, crew: TOP, profile: { ...TOP, offer: 'offer' }, offer: TOP, market: TOP, ship: TOP, rookery: TOP,
  finance: TOP, league: { ...TOP, season: 'season' }, mail: TOP,
  plan: { ...TOP, anchorage: 'lobby' },
  season: { home: 'home' },
  jobs: { home: 'home' },
  lobby: { play: 'match', settings: 'settings', home: 'home' },
  settings: { close: 'home' },
  match: { sunk: 'sinking', won: 'won' },
  sinking: { settled: 'sunk' },
  sunk: { watch: 'spectate', skip: 'spectate', leave: 'lobby', over: 'result' },
  spectate: { switch: 'spectate', skip: 'spectate', leave: 'lobby', over: 'result' },
  won: { settled: 'result' },
  result: { leave: 'lobby' },
};

/** The screens over a match under way. */
export const IN_MATCH: readonly Screen[] = ['match', 'sinking', 'sunk', 'spectate', 'won', 'result'];

/** Milliseconds a screen takes to fade in or out, or the world to cross-fade from one sea to another (PLAY). */
export const FADE = 320;

/** The way home from a match (LEAVE), in milliseconds: the parchment coming over the match (cover); held, once the
 *  match is put away and the lobby made under it, at least so long (hold) and until the lobby's first frames are drawn
 *  (frames, counted from the first drawn after the change); and lifted off the lobby (lift). */
export const HOME = { cover: 250, hold: 500, frames: 3, lift: 350 } as const;

/** Where the way home stands: the parchment coming over the match, held while the lobby is made and drawn under it,
 *  lifting off it, or home. */
export type Leg = 'cover' | 'hold' | 'lift' | 'home';

/** The way home, begun at `start` ms (its parchment set coming over the match then), moved on by the frames drawn:
 *  covered, the change is made under it; held until the lobby is ready (HOME.frames of its frames drawn) and at least
 *  HOME.hold, and until `ready` (Skip's: the race over); then lifted. Nothing lifts it on a clock alone. */
export function wayHome(start: number, ready: () => boolean = () => true) {
  let leg: Leg = 'cover', since = start, frames = 0;
  const into = (next: Leg, now: number) => {
    leg = next;
    since = now;
    return next;
  };
  return {
    get leg() {
      return leg;
    },
    /** A frame drawn at `now` ms: the leg the way has just come to, or null. At 'hold' the change is to be made, under
     *  the parchment and after this frame; every frame drawn after it is the lobby's. */
    drawn(now: number): Leg | null {
      if (leg === 'cover') return now - since >= HOME.cover ? into('hold', now) : null;
      if (leg === 'hold') return ++frames >= HOME.frames && now - since >= HOME.hold && ready() ? into('lift', now) : null;
      if (leg === 'lift') return now - since >= HOME.lift ? into('home', now) : null;
      return null;
    },
    /** How much of the world the parchment covers at `now` ms, 0…1. */
    covered(now: number): number {
      const t = Math.max(0, now - since);
      return leg === 'cover' ? Math.min(1, t / HOME.cover) : leg === 'hold' ? 1 : leg === 'lift' ? Math.max(0, 1 - t / HOME.lift) : 0;
    },
  };
}

/** Where `trigger` takes `screen`, or null if it does not move it. */
export const way = (screen: Screen, trigger: Trigger): Screen | null => WAYS[screen][trigger] ?? null;

/** The match's course as it reaches the screens (player.ts End: null while she fights), as the events it amounts to
 *  so far, in order: she sank or won; the beat on it done (settled); the match over. */
export function events(end: { how: string; settled: boolean; over: boolean } | null): Event[] {
  if (!end) return [];
  return [end.how === 'won' ? 'won' : 'sunk', ...(end.settled ? ['settled' as const] : []), ...(end.settled && end.over ? ['over' as const] : [])];
}

/** Where the match's course has taken `screen`: each of its events taken in turn, where it has a way. */
export const course = (screen: Screen, happened: readonly Event[]): Screen =>
  happened.reduce((s: Screen, e) => way(s, e) ?? s, screen);
