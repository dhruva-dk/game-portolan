// Seeded random numbers, the same for a seed every time.
//
// Pure arithmetic: no three, so it runs in node for the tests.

/**
 * A prime a seed is stepped by to seed another stream apart from it: the next
 * match's, a second noise's, a take's.
 */
export const STRIDE = 7919;

/** A seeded generator, 0…1 (mulberry32). */
export function random(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Two numbers mixed into one well-spread 32-bit seed (murmur3's finaliser over
 * both): hash(match, slot).
 */
export function hash(a: number, b: number): number {
  let h =
    Math.imul((a >>> 0) ^ 0x9e3779b9, 0x85ebca6b) ^
    Math.imul((b >>> 0) + 0x632be5ab, 0xc2b2ae35);
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}

/**
 * hash(a, b) as a number in [0, 1): a steady pseudo-random number for a pair of
 * integers (a cell and a stream, a step and a seed), the same every time.
 */
export const hash01 = (a: number, b: number) => hash(a, b) / 4294967296;
