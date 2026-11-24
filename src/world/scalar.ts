export const clamp = (x: number, lo = 0, hi = 1) =>
  Math.min(hi, Math.max(lo, x));

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export const smoothstep = (e0: number, e1: number, x: number) => {
  const t = clamp((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
};

export const smoother = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);

export const smootherIntegral = (t: number) =>
  t * t * t * t * (t * (t - 3) + 2.5);

export const easeInOut = (p: number) =>
  p < 0.5 ? 4 * p * p * p : 1 - (-2 * p + 2) ** 3 / 2;

export const wrapAngle = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
