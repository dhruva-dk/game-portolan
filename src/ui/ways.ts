// The screens and every way between them, as data: the table the flow (flow.ts) follows and nothing else. A way is
// taken by her tap on something drawn for it, or by the match's own course (the game's), never by a clock of the
// UI's own. Each screen fades or cross-fades into the next (FADE); none is cut to.
//   title     the chart over the world loading; once ready, a tap anywhere          → lobby
//   lobby     over her ship at anchor: PLAY → match (the world cross-fades to the eye coming down from space); her
//             plate → rank; the wheel → settings
//   rank, settings  folios over the lobby, each with its close mark (a tap outside closes it too) → lobby
//   match     the arrival, then her hands on her ship; she sinks → sinking; she is the last afloat → won
//   sinking   the camera held on her ship going down, the HUD gone; the beat done → sunk, or → result if the match
//             is over
//   sunk      her result over the live world, with WATCH → spectate and LEAVE → lobby; the match over → result
//   spectate  watching another ship: turn to the next or the one before; LEAVE → lobby; the match over → result
//   won       the camera circling her, the HUD gone; the beat done → result
//   result    her result over the live world, one way on: LEAVE → lobby

export const SCREENS = ['title', 'lobby', 'rank', 'settings', 'match', 'sinking', 'sunk', 'spectate', 'won', 'result'] as const;
export type Screen = (typeof SCREENS)[number];
export const isScreen = (s: string): s is Screen => (SCREENS as readonly string[]).includes(s);

/** What moves a screen on: her taps, and the match's own course. */
export const TAPS = ['begin', 'play', 'rank', 'settings', 'close', 'watch', 'switch', 'leave'] as const;
export const EVENTS = ['sunk', 'won', 'settled', 'over'] as const;
export type Tap = (typeof TAPS)[number];
export type Event = (typeof EVENTS)[number];
export type Trigger = Tap | Event;

/** Every way on from each screen: what takes it, and where to. */
export const WAYS: Record<Screen, Partial<Record<Trigger, Screen>>> = {
  title: { begin: 'lobby' },
  lobby: { play: 'match', rank: 'rank', settings: 'settings' },
  rank: { close: 'lobby' },
  settings: { close: 'lobby' },
  match: { sunk: 'sinking', won: 'won' },
  sinking: { settled: 'sunk' },
  sunk: { watch: 'spectate', leave: 'lobby', over: 'result' },
  spectate: { switch: 'spectate', leave: 'lobby', over: 'result' },
  won: { settled: 'result' },
  result: { leave: 'lobby' },
};

/** The screens over a match under way, and those laid over the lobby. */
export const IN_MATCH: readonly Screen[] = ['match', 'sinking', 'sunk', 'spectate', 'won', 'result'];
export const OVER_LOBBY: readonly Screen[] = ['lobby', 'rank', 'settings'];

/** Milliseconds a screen takes to fade in or out, or the world to cross-fade from one sea to another. */
export const FADE = 320;

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
