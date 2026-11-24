import { SCREENS, type Screen } from '../player.ts';

export { SCREENS, type Screen };

export const TAPS = [
  'begin',
  'play',
  'settings',
  'close',
  'watch',
  'switch',
  'leave',
  'again',
  'seed',
  'sail',
  'livery',
] as const;
export const EVENTS = ['sunk', 'won', 'settled', 'over'] as const;
export type Tap = (typeof TAPS)[number];
type Event = (typeof EVENTS)[number];
export type Trigger = Tap | Event;

export const WAYS: Record<Screen, Partial<Record<Trigger, Screen>>> = {
  title: { begin: 'lobby' },
  lobby: {
    play: 'match',
    settings: 'settings',
    seed: 'seed',
    livery: 'livery',
  },
  settings: { close: 'lobby' },
  seed: { close: 'lobby', sail: 'lobby' },
  livery: { close: 'lobby' },
  match: { sunk: 'sinking', won: 'won' },
  sinking: { settled: 'sunk' },
  sunk: { watch: 'spectate', leave: 'lobby', again: 'lobby', over: 'result' },
  spectate: { switch: 'spectate', leave: 'lobby', over: 'result' },
  won: { settled: 'result' },
  result: { leave: 'lobby', again: 'lobby' },
};

export const IN_MATCH: readonly Screen[] = [
  'match',
  'sinking',
  'sunk',
  'spectate',
  'won',
  'result',
];

export const FADE = 320;

export const HOME = { cover: 250, hold: 500, frames: 3, lift: 350 } as const;

export type Leg = 'cover' | 'hold' | 'lift' | 'home';

export function wayHome(start: number) {
  let leg: Leg = 'cover',
    since = start,
    frames = 0;
  const into = (next: Leg, now: number) => {
    leg = next;
    since = now;
    return next;
  };
  return {
    get leg() {
      return leg;
    },
    drawn(now: number): Leg | null {
      if (leg === 'cover')
        return now - since >= HOME.cover ? into('hold', now) : null;
      if (leg === 'hold')
        return ++frames >= HOME.frames && now - since >= HOME.hold
          ? into('lift', now)
          : null;
      if (leg === 'lift')
        return now - since >= HOME.lift ? into('home', now) : null;
      return null;
    },
    covered(now: number): number {
      const t = Math.max(0, now - since);
      return leg === 'cover'
        ? Math.min(1, t / HOME.cover)
        : leg === 'hold'
          ? 1
          : leg === 'lift'
            ? Math.max(0, 1 - t / HOME.lift)
            : 0;
    },
  };
}

export const way = (screen: Screen, trigger: Trigger): Screen | null =>
  WAYS[screen][trigger] ?? null;

export function events(
  end: { how: string; settled: boolean; over: boolean } | null
): readonly Event[] {
  if (!end) return NONE;
  const so = end.how === 'won' ? SO_FAR.won : SO_FAR.sunk;
  return so[end.settled ? (end.over ? 2 : 1) : 0];
}

const NONE: readonly Event[] = Object.freeze([]);
const SO_FAR = {
  won: [['won'], ['won', 'settled'], ['won', 'settled', 'over']],
  sunk: [['sunk'], ['sunk', 'settled'], ['sunk', 'settled', 'over']],
} as const satisfies Record<'won' | 'sunk', readonly (readonly Event[])[]>;

export function course(screen: Screen, happened: readonly Event[]): Screen {
  let s = screen;
  for (const e of happened) s = way(s, e) ?? s;
  return s;
}
