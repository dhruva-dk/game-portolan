// The screens and every way between them, as data: the table the flow (flow.ts) follows and nothing else. A way is
// taken by her tap on something drawn for it, or by the match's own course (the game's), never by a clock of the
// UI's own. Each screen fades or cross-fades into the next (FADE); none is cut to. Home from a match, the parchment
// comes over it and lifts off the lobby once it is drawn (HOME, wayHome).
//   title     the chart over the world loading; once ready, by itself (begin)        → lobby
//   lobby     over her ship at anchor: PLAY → match (the world cross-fades to the eye coming down from space); the
//             wheel → settings
//   settings  a folio over the lobby, with its close mark (a tap outside closes it too) → lobby
//   match     the arrival, then her hands on her ship; she sinks → sinking; she is the last afloat → won
//   sinking   the camera held on her ship going down, the HUD gone; the beat done → sunk, or → result if the match
//             is over
//   sunk      her result over the live world, with WATCH → spectate and LEAVE → lobby (by the parchment: HOME); the
//             match over → result
//   spectate  watching another ship: turn to the next or the one before; LEAVE → lobby; the match over → result
//   won       the camera circling her, the HUD gone; the beat done → result
//   result    her result over the live world, one way on: LEAVE → lobby

import { SCREENS, type Screen } from '../player.ts';

export { SCREENS, type Screen };

/** What moves a screen on: her taps, and the match's own course. */
export const TAPS = ['begin', 'play', 'settings', 'close', 'watch', 'switch', 'leave'] as const;
export const EVENTS = ['sunk', 'won', 'settled', 'over'] as const;
export type Tap = (typeof TAPS)[number];
export type Event = (typeof EVENTS)[number];
export type Trigger = Tap | Event;

/** Every way on from each screen: what takes it, and where to. */
export const WAYS: Record<Screen, Partial<Record<Trigger, Screen>>> = {
  title: { begin: 'lobby' },
  lobby: { play: 'match', settings: 'settings' },
  settings: { close: 'lobby' },
  match: { sunk: 'sinking', won: 'won' },
  sinking: { settled: 'sunk' },
  sunk: { watch: 'spectate', leave: 'lobby', over: 'result' },
  spectate: { switch: 'spectate', leave: 'lobby', over: 'result' },
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
 *  HOME.hold; then lifted. Nothing lifts it on a clock alone. */
export function wayHome(start: number) {
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
      if (leg === 'hold') return ++frames >= HOME.frames && now - since >= HOME.hold ? into('lift', now) : null;
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
export function events(end: { how: string; settled: boolean; over: boolean } | null): readonly Event[] {
  if (!end) return NONE;
  const so = end.how === 'won' ? SO_FAR.won : SO_FAR.sunk;
  return so[end.settled ? (end.over ? 2 : 1) : 0];
}

/** events' answers, made once (it is read every frame): none; and sunk or won, then settled, then over. */
const NONE: readonly Event[] = Object.freeze([]);
const SO_FAR = {
  won: [['won'], ['won', 'settled'], ['won', 'settled', 'over']],
  sunk: [['sunk'], ['sunk', 'settled'], ['sunk', 'settled', 'over']],
} as const satisfies Record<'won' | 'sunk', readonly (readonly Event[])[]>;

/** Where the match's course has taken `screen`: each of its events taken in turn, where it has a way. */
export function course(screen: Screen, happened: readonly Event[]): Screen {
  let s = screen;
  for (const e of happened) s = way(s, e) ?? s;
  return s;
}
