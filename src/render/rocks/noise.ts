// Seeded randomness and 3D noise for the rock generators. This is render code, so it may use Math.sin and friends;
// it is still fully seeded, so the same seed always builds the same rock.

/** A small fast seeded generator (mulberry32). Returns numbers in [0, 1). */
export function rng(seed: number): () => number {
  let a = (Math.floor(seed) ^ 0x9e3779b9) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Uniform in [a, b). */
export const range = (r: () => number, a: number, b: number) => a + (b - a) * r();

/** Integer hash of up to three ints, in [0, 1). */
export function hash3(x: number, y: number, z: number, seed = 0): number {
  let h = Math.imul(x | 0, 0x8da6b343) ^ Math.imul(y | 0, 0xd8163841) ^ Math.imul(z | 0, 0xcb1ab31f) ^ Math.imul(seed | 0, 0x165667b1);
  h = Math.imul(h ^ (h >>> 13), 0x5bd1e995);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

const GRAD = [
  [1, 1, 0], [-1, 1, 0], [1, -1, 0], [-1, -1, 0], [1, 0, 1], [-1, 0, 1], [1, 0, -1], [-1, 0, -1],
  [0, 1, 1], [0, -1, 1], [0, 1, -1], [0, -1, -1], [1, 1, 0], [-1, 1, 0], [0, -1, 1], [0, -1, -1],
];

/** Seeded 3D gradient noise, roughly in [-1, 1]. */
export class Noise3 {
  private perm = new Uint8Array(512);

  constructor(seed: number) {
    const r = rng(seed), p = Array.from({ length: 256 }, (_, i) => i);
    for (let i = 255; i > 0; i--) {
      const j = Math.floor(r() * (i + 1));
      [p[i], p[j]] = [p[j], p[i]];
    }
    for (let i = 0; i < 512; i++) this.perm[i] = p[i & 255];
  }

  noise(x: number, y: number, z: number): number {
    const P = this.perm;
    const X = Math.floor(x), Y = Math.floor(y), Z = Math.floor(z);
    const xf = x - X, yf = y - Y, zf = z - Z;
    const xi = X & 255, yi = Y & 255, zi = Z & 255;
    const u = fade(xf), v = fade(yf), w = fade(zf);
    const g = (h: number, dx: number, dy: number, dz: number) => {
      const G = GRAD[h & 15];
      return G[0] * dx + G[1] * dy + G[2] * dz;
    };
    const a = P[xi] + yi, aa = P[a] + zi, ab = P[a + 1] + zi, b = P[xi + 1] + yi, ba = P[b] + zi, bb = P[b + 1] + zi;
    const x1 = lerp(g(P[aa], xf, yf, zf), g(P[ba], xf - 1, yf, zf), u);
    const x2 = lerp(g(P[ab], xf, yf - 1, zf), g(P[bb], xf - 1, yf - 1, zf), u);
    const x3 = lerp(g(P[aa + 1], xf, yf, zf - 1), g(P[ba + 1], xf - 1, yf, zf - 1), u);
    const x4 = lerp(g(P[ab + 1], xf, yf - 1, zf - 1), g(P[bb + 1], xf - 1, yf - 1, zf - 1), u);
    return lerp(lerp(x1, x2, v), lerp(x3, x4, v), w);
  }

  /** Fractal sum, normalised to about [-1, 1]. */
  fbm(x: number, y: number, z: number, octaves = 4, lac = 2.03, gain = 0.5): number {
    let s = 0, a = 1, f = 1, n = 0;
    for (let o = 0; o < octaves; o++) {
      s += a * this.noise(x * f + o * 17.1, y * f - o * 9.3, z * f + o * 3.7);
      n += a;
      a *= gain;
      f *= lac;
    }
    return s / n;
  }

  /** Ridged fractal in [0, 1]: sharp crests where the noise crosses zero. */
  ridged(x: number, y: number, z: number, octaves = 4): number {
    let s = 0, a = 1, f = 1, n = 0;
    for (let o = 0; o < octaves; o++) {
      const v = 1 - Math.abs(this.noise(x * f + o * 31.7, y * f + o * 7.1, z * f - o * 11.9));
      s += a * v * v;
      n += a;
      a *= 0.5;
      f *= 2.1;
    }
    return s / n;
  }
}

/** Distance to the nearest and second-nearest feature point of a seeded 3D cell grid (Worley). */
export function worley(x: number, y: number, z: number, seed: number): [number, number] {
  const X = Math.floor(x), Y = Math.floor(y), Z = Math.floor(z);
  let d1 = 9, d2 = 9;
  for (let k = -1; k <= 1; k++) for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
    const cx = X + i, cy = Y + j, cz = Z + k;
    const px = cx + hash3(cx, cy, cz, seed), py = cy + hash3(cx, cy, cz, seed + 1), pz = cz + hash3(cx, cy, cz, seed + 2);
    const d = Math.sqrt((px - x) ** 2 + (py - y) ** 2 + (pz - z) ** 2);
    if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d;
  }
  return [d1, d2];
}

export const fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const clamp = (x: number, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
export const smooth = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
