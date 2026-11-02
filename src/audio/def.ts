// How a sound is declared: the function that renders it, how many variants it has, which mixer bus it plays on,
// and how the engine treats it (priority when voices run out, how many may sound at once, how far it carries).
import type { Buf, Rng } from './dsp.ts';

/** Mixer buses: world effects, ambience beds and life, and the interface (never placed in space). */
export type Bus = 'fx' | 'amb' | 'ui';

/** How a sound's variants are chosen: at random, by weapon or item rarity (0–4), or by a level from 0 to 1. */
export type Grade = 'random' | 'rarity' | 'level';

export interface SoundDef {
  make: (r: Rng, v: number) => Buf | Buf[];
  variants: number;
  bus: Bus;
  /** Higher wins when voices run out. */
  priority: number;
  gain: number;
  /** How many may sound at once. */
  max: number;
  loop: boolean;
  /** Random playback-rate spread, as a fraction. */
  jitter: number;
  /** Metres beyond which it is not heard. */
  range: number;
  /** Metres within which it is heard at full strength; beyond, it falls off with distance. Great sounds carry. */
  near: number;
  grade: Grade;
  /** Loops played with a duration: how far the rate climbs by the end of it (the consumables charging up). */
  climb: number;
}

export function def(
  make: SoundDef['make'], variants: number, bus: Bus, priority: number, gain: number, max: number, extra: Partial<SoundDef> = {},
): SoundDef {
  return { make, variants, bus, priority, gain, max, loop: false, jitter: 0.04, range: bus === 'fx' ? 320 : 400, near: 20, grade: 'random', climb: 1, ...extra };
}

export const LOOP: Partial<SoundDef> = { loop: true, jitter: 0 };
export const RARITY: Partial<SoundDef> = { grade: 'rarity' };
export const LEVEL: Partial<SoundDef> = { grade: 'level' };
