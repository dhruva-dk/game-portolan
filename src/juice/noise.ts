// Smooth 1D noise for camera shake: seeded, so a captured frame strip comes out the same every run.

function hash(i: number, seed: number): number {
  let h = Math.imul(i | 0, 374761393) ^ Math.imul(seed | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h & 0xffff) / 0x8000 - 1;
}

/** Gradient noise in about [-1, 1], one lattice cell per unit of `x`. */
export function noise1(x: number, seed: number): number {
  const i = Math.floor(x), f = x - i;
  const a = hash(i, seed) * f, b = hash(i + 1, seed) * (f - 1);
  const u = f * f * f * (f * (f * 6 - 15) + 10);
  return (a + (b - a) * u) * 2;
}
