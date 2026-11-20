// Every sound there is, as a table (SOUNDS): how it is made (its recipe: sounds/*.ts), how many takes of it to make
// (each its own seed, so a sound heard again is not the same one), its level, its priority for a
// voice (voices.ts) and how far off it carries. The takes are made once the sound has begun (audio.ts), a few each
// frame (fill), never on the frame a sound is wanted.

import type { Samples } from './dsp.ts';
import { GUNS, ready, reload, report, select, swap, wind, type GunKind } from './sounds/guns.ts';
import { hurt, ring, shatter, sink, splash, strike, thud, whistle } from './sounds/blows.ts';
import { claim, closing, cut, enter, gust, leave, mendHull, mendWard, rope, took } from './sounds/sea.ts';
import { close, launch, lost, open, salute, tap } from './sounds/ui.ts';

/**
 * A sound:
 *   make      its recipe, at the context's rate, from a seed
 *   takes     how many to make
 *   level     its level, dB (the recipes are made to a peak of 0.9; this sets them against each other)
 *   priority  for a voice when all are taken (voices.ts): a sound takes the voice of one lower, never higher
 *   reach     metres past which it is not heard (placed sounds)
 */
interface Sound { make: (rate: number, seed: number) => Samples; takes: number; level: number; priority: number; reach: number }

/** Each gun's report, by kind (sounds/guns.ts GUNS): the repeater's quieter and with more takes, as it fires ten a
 *  second; the mortar's carrying furthest. */
const REPORTS: Record<GunKind, Sound> = {
  cannon: { make: report(GUNS.cannon), takes: 3, level: -1, priority: 8, reach: 1400 },
  scatter: { make: report(GUNS.scatter), takes: 3, level: -1, priority: 8, reach: 1100 },
  repeater: { make: report(GUNS.repeater), takes: 5, level: -7, priority: 7, reach: 900 },
  harpoon: { make: report(GUNS.harpoon), takes: 2, level: -3, priority: 8, reach: 900 },
  mortar: { make: report(GUNS.mortar), takes: 2, level: 0, priority: 8, reach: 1600 },
};

const SOUND = {
  ready: { make: ready, takes: 2, level: -12, priority: 6, reach: 0 },
  wind: { make: wind, takes: 2, level: -10, priority: 6, reach: 160 },
  reload: { make: reload, takes: 2, level: -13, priority: 5, reach: 0 },
  swap: { make: swap, takes: 2, level: -7, priority: 7, reach: 0 },
  select: { make: select, takes: 2, level: -14, priority: 3, reach: 0 },
  whistle: { make: whistle, takes: 3, level: -12, priority: 6, reach: 60 },
  splash: { make: splash, takes: 3, level: -8, priority: 4, reach: 700 },
  thud: { make: thud, takes: 2, level: -9, priority: 4, reach: 700 },
  strike: { make: strike, takes: 3, level: -5, priority: 6, reach: 900 },
  hurt: { make: hurt, takes: 2, level: -3, priority: 9, reach: 0 },
  ring: { make: ring, takes: 2, level: -4, priority: 8, reach: 0 },
  shatter: { make: shatter, takes: 1, level: -5, priority: 9, reach: 0 },
  sink: { make: sink, takes: 2, level: -4, priority: 7, reach: 1400 },
  rope: { make: rope, takes: 3, level: -21, priority: 1, reach: 0 },
  gust: { make: gust, takes: 2, level: -7, priority: 6, reach: 0 },
  took: { make: took, takes: 2, level: -5, priority: 6, reach: 0 },
  mendWard: { make: mendWard, takes: 1, level: -11, priority: 6, reach: 0 },
  mendHull: { make: mendHull, takes: 1, level: -6, priority: 6, reach: 0 },
  claim: { make: claim, takes: 1, level: -6, priority: 7, reach: 0 },
  cut: { make: cut, takes: 2, level: -4, priority: 7, reach: 0 },
  enter: { make: enter, takes: 1, level: -20, priority: 3, reach: 0 },
  leave: { make: leave, takes: 1, level: -24, priority: 3, reach: 0 },
  closing: { make: closing, takes: 1, level: -10, priority: 5, reach: 0 },
  tap: { make: tap, takes: 2, level: -16, priority: 5, reach: 0 },
  open: { make: open, takes: 1, level: -16, priority: 5, reach: 0 },
  close: { make: close, takes: 1, level: -12, priority: 5, reach: 0 },
  launch: { make: launch, takes: 1, level: -7, priority: 9, reach: 0 },
  lost: { make: lost, takes: 1, level: -6, priority: 9, reach: 0 },
  salute: { make: salute, takes: 1, level: -5, priority: 9, reach: 0 },
} as const satisfies Record<string, Sound>;

/** A sound's name: a gun's kind, or one of the rest. */
export type SoundName = GunKind | keyof typeof SOUND;

export const SOUNDS: Record<SoundName, Sound> = { ...REPORTS, ...SOUND };

/** Every sound's name. */
export const NAMES: readonly SoundName[] = Object.keys(SOUNDS).filter((k): k is SoundName => k in SOUNDS);
