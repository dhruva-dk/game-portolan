// The career's randomness (Phase B section 1). Each named stream draws `random(hash(worldSeed, name, counter))`
// (world/random.ts), its counter kept in the state, so the same state and command give the same result.
//
// Stream names are a section's word, and ':' and an id where a stream belongs to one thing: 'world', 'names',
// 'form:12' (crew 12's form draws), 'growth', 'retire', 'traits', 'injury'. A use takes one roll: a fresh generator
// for as many numbers as that use needs (one gull's making, one race's form), and the stream's counter steps once.

import { hash, random } from '../world/random.ts';
import { fnv } from './canon.ts';

/** A generator of numbers 0…1. */
export type Rand = () => number;

/** The streams' counters as the state keeps them. */
export type Streams = Readonly<Record<string, number>>;

/** Rolls on a state's streams during one command; `counters()` gives what goes back into the state. */
export interface Dice {
  roll(stream: string): Rand;
  counters(): Streams;
}

/** The dice of a world seed, from its streams' counters. */
export function dice(seed: number, streams: Streams): Dice {
  const counts: Record<string, number> = { ...streams };
  return {
    roll(stream) {
      const n = counts[stream] ?? 0;
      counts[stream] = n + 1;
      return random(hash(hash(seed, fnv(stream)), n));
    },
    counters: () => ({ ...counts }),
  };
}

/** A generator for a fixed key that is no stream's turn: a value seeded once forever (a gull's spread of a stat by
 *  their seed, a crew's view of a gull). Draws from it never change the state. */
export const seeded = (a: number, b: number): Rand => random(hash(a, b));

/** A whole number lo..hi (both included). */
export const between = (rand: Rand, lo: number, hi: number): number => lo + Math.floor(rand() * (hi - lo + 1));

/** A number lo..hi. */
export const within = (rand: Rand, lo: number, hi: number): number => lo + rand() * (hi - lo);

/** One of a list. */
export const pick = <T>(rand: Rand, list: readonly T[]): T => list[Math.floor(rand() * list.length)];

/** A list in a seeded order (Fisher–Yates), the list itself untouched. */
export function shuffled<T>(rand: Rand, list: readonly T[]): T[] {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** An index drawn by weight. */
export function weighted(rand: Rand, weights: readonly number[]): number {
  const total = weights.reduce((a, b) => a + b, 0);
  let r = rand() * total;
  for (let i = 0; i < weights.length; i++) {
    r -= weights[i];
    if (r < 0) return i;
  }
  return weights.length - 1;
}
