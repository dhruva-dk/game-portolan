// The hand's unsteadiness: a seeded random and smooth value noise, so a line wanders the same way every time it is
// drawn (baked once, or inked in again live) and no two lines wander alike.

/** mulberry32: a small seeded random in [0, 1). */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A hash of an integer lattice point and a seed, in [0, 1). */
export function hash(i: number, j: number, seed: number): number {
  let h = Math.imul(i | 0, 374761393) ^ Math.imul(j | 0, 668265263) ^ Math.imul(seed | 0, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

const fade = (t: number) => t * t * (3 - 2 * t);

/** Smooth 1D value noise in [-1, 1]. */
export function noise1(x: number, seed: number): number {
  const i = Math.floor(x), f = x - i;
  const a = hash(i, 0, seed), b = hash(i + 1, 0, seed);
  return (a + (b - a) * fade(f)) * 2 - 1;
}

/** Smooth 2D value noise in [-1, 1]. */
export function noise2(x: number, y: number, seed: number): number {
  const i = Math.floor(x), j = Math.floor(y), fx = fade(x - i), fy = fade(y - j);
  const a = hash(i, j, seed), b = hash(i + 1, j, seed), c = hash(i, j + 1, seed), d = hash(i + 1, j + 1, seed);
  return (a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy) * 2 - 1;
}

/** Fractal 1D noise in about [-1, 1]. */
export function fbm1(x: number, seed: number, octaves = 3): number {
  let v = 0, amp = 0.6, f = 1;
  for (let o = 0; o < octaves; o++, amp *= 0.5, f *= 2.1) v += noise1(x * f, seed + o * 31) * amp;
  return v;
}

/** Fractal 2D noise in about [-1, 1]. */
export function fbm2(x: number, y: number, seed: number, octaves = 4): number {
  let v = 0, amp = 0.55, f = 1;
  for (let o = 0; o < octaves; o++, amp *= 0.5, f *= 2.03) v += noise2(x * f, y * f, seed + o * 17) * amp;
  return v;
}

/** A string's seed. */
export function seedOf(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

export const clamp = (x: number, a = 0, b = 1): number => (x < a ? a : x > b ? b : x);
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const smooth = (a: number, b: number, x: number): number => {
  const t = clamp((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
