// The arithmetic of single numbers that everything eases, mixes and bounds
// with, written once.
//
// Pure arithmetic: no three, so it runs in node for the tests.

/** x held within lo…hi (0…1 by default). */
export const clamp = (x: number, lo = 0, hi = 1) =>
  Math.min(hi, Math.max(lo, x));

/** t of the way from a to b (not held within them). */
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/**
 * 0 at e0 … 1 at e1, eased at both ends (3t² − 2t³), held beyond them; as
 * GLSL's and TSL's smoothstep.
 */
export const smoothstep = (e0: number, e1: number, x: number) => {
  const t = clamp((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
};

/**
 * Perlin's smoother step of t in 0…1 (6t⁵ − 15t⁴ + 10t³): eased at both ends,
 * its rate and its change of rate 0 there.
 */
export const smoother = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);

/**
 * smoother's integral from 0 to t (½ at 1): the distance covered at a rate
 * eased in by smoother.
 */
export const smootherIntegral = (t: number) =>
  t * t * t * t * (t * (t - 3) + 2.5);

/**
 * The cubic ease in and out of p in 0…1: 4p³ to the middle, mirrored after it.
 */
export const easeInOut = (p: number) =>
  p < 0.5 ? 4 * p * p * p : 1 - (-2 * p + 2) ** 3 / 2;

/** An angle, radians, brought within ±π. */
export const wrapAngle = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
