import type { Samples } from './dsp.ts';
import {
  GUNS,
  ready,
  reload,
  report,
  select,
  wind,
  type GunKind,
} from './sounds/guns.ts';
import {
  hurt,
  ring,
  shatter,
  sink,
  splash,
  strike,
  thud,
  whistle,
} from './sounds/blows.ts';
import { claim, closing, gust, mendHull, thunder, took } from './sounds/sea.ts';
import {
  built,
  card,
  close,
  coin,
  debt,
  frost,
  furl,
  knock,
  landed,
  launch,
  laurel,
  lost,
  open,
  painted,
  row,
  salute,
  seal,
  slam,
  stamp,
  standing,
  tap,
  tossed,
  unroll,
} from './sounds/ui.ts';

interface Sound {
  make: (rate: number, seed: number) => Samples;
  takes: number;
  level: number;
  priority: number;
  reach: number;
}

const REPORTS: Record<GunKind, Sound> = {
  cannon: {
    make: report(GUNS.cannon),
    takes: 3,
    level: -1,
    priority: 8,
    reach: 1400,
  },
  scatter: {
    make: report(GUNS.scatter),
    takes: 3,
    level: -1,
    priority: 8,
    reach: 1100,
  },
  repeater: {
    make: report(GUNS.repeater),
    takes: 5,
    level: -7,
    priority: 7,
    reach: 900,
  },
  harpoon: {
    make: report(GUNS.harpoon),
    takes: 2,
    level: -3,
    priority: 8,
    reach: 900,
  },
  mortar: {
    make: report(GUNS.mortar),
    takes: 2,
    level: 0,
    priority: 8,
    reach: 1600,
  },
};

const SOUND = {
  ready: { make: ready, takes: 2, level: -12, priority: 6, reach: 0 },
  wind: { make: wind, takes: 2, level: -10, priority: 6, reach: 160 },
  reload: { make: reload, takes: 2, level: -13, priority: 5, reach: 0 },
  select: { make: select, takes: 2, level: -14, priority: 3, reach: 0 },
  whistle: { make: whistle, takes: 3, level: -12, priority: 6, reach: 60 },
  splash: { make: splash, takes: 3, level: -8, priority: 4, reach: 700 },
  thud: { make: thud, takes: 2, level: -9, priority: 4, reach: 700 },
  strike: { make: strike, takes: 3, level: -5, priority: 6, reach: 900 },
  hurt: { make: hurt, takes: 2, level: -3, priority: 9, reach: 0 },
  ring: { make: ring, takes: 2, level: -4, priority: 8, reach: 0 },
  shatter: { make: shatter, takes: 1, level: -5, priority: 9, reach: 0 },
  sink: { make: sink, takes: 2, level: -4, priority: 7, reach: 1400 },
  gust: { make: gust, takes: 2, level: -7, priority: 6, reach: 0 },
  took: { make: took, takes: 2, level: -5, priority: 6, reach: 0 },
  mendHull: { make: mendHull, takes: 1, level: -6, priority: 6, reach: 0 },
  claim: { make: claim, takes: 1, level: -6, priority: 7, reach: 0 },
  closing: { make: closing, takes: 1, level: -10, priority: 5, reach: 0 },
  thunder: { make: thunder, takes: 1, level: -6, priority: 7, reach: 0 },
  tap: { make: tap, takes: 2, level: -16, priority: 5, reach: 0 },
  open: { make: open, takes: 1, level: -16, priority: 5, reach: 0 },
  close: { make: close, takes: 1, level: -12, priority: 5, reach: 0 },
  launch: { make: launch, takes: 1, level: -7, priority: 9, reach: 0 },
  lost: { make: lost, takes: 1, level: -6, priority: 9, reach: 0 },
  salute: { make: salute, takes: 1, level: -5, priority: 9, reach: 0 },
  stamp: { make: stamp, takes: 2, level: -17, priority: 4, reach: 0 },
  row: { make: row, takes: 2, level: -19, priority: 4, reach: 0 },
  coin: { make: coin, takes: 3, level: -22, priority: 4, reach: 0 },
  standing: { make: standing, takes: 1, level: -20, priority: 4, reach: 0 },
  landed: { make: landed, takes: 2, level: -15, priority: 4, reach: 0 },
  tossed: { make: tossed, takes: 2, level: -18, priority: 4, reach: 0 },
  slam: { make: slam, takes: 1, level: -15.5, priority: 4, reach: 0 },
  seal: { make: seal, takes: 1, level: -17, priority: 4, reach: 0 },
  built: { make: built, takes: 1, level: -15, priority: 4, reach: 0 },
  painted: { make: painted, takes: 1, level: -17, priority: 4, reach: 0 },
  knock: { make: knock, takes: 2, level: -17.5, priority: 4, reach: 0 },
  unroll: { make: unroll, takes: 2, level: -19, priority: 4, reach: 0 },
  furl: { make: furl, takes: 2, level: -19, priority: 4, reach: 0 },
  laurel: { make: laurel, takes: 1, level: -18, priority: 4, reach: 0 },
  card: { make: card, takes: 2, level: -17, priority: 4, reach: 0 },
  frost: { make: frost, takes: 1, level: -22, priority: 4, reach: 0 },
  debt: { make: debt, takes: 1, level: -16.5, priority: 4, reach: 0 },
} as const satisfies Record<string, Sound>;

export type SoundName = GunKind | keyof typeof SOUND;

export const SOUNDS: Record<SoundName, Sound> = { ...REPORTS, ...SOUND };

export const NAMES: readonly SoundName[] = Object.keys(SOUNDS).filter(
  (k): k is SoundName => k in SOUNDS
);
