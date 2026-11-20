// Seeded 3D gradient noise (Perlin's improved noise), with its gradient: for fields over the sphere, read at a
// point's position in metres (direction × R) over a feature size, so there are no seams or poles.
//
// Pure arithmetic: no three, so it runs in node for the tests.

import { random } from './random.ts';

/** The twelve edge directions of a cube, Perlin's gradients, as x, y, z triples. */
const G = new Float64Array([
  1, 1, 0, -1, 1, 0, 1, -1, 0, -1, -1, 0, 1, 0, 1, -1, 0, 1, 1, 0, -1, -1, 0, -1, 0, 1, 1, 0, -1, 1, 0, 1, -1, 0, -1, -1,
]);

interface Noise3 {
  /** About −1…1, features about one unit apart. */
  value(x: number, y: number, z: number): number;
  /** The same value, its gradient written into `grad` (x, y, z). */
  withGradient(x: number, y: number, z: number, grad: Float64Array): number;
}

export function createNoise3(seed: number): Noise3 {
  const rand = random(seed * 2654435761 + 11);
  const p = new Uint8Array(256).map((_, i) => i);
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [p[i], p[j]] = [p[j], p[i]];
  }
  // the permutation, doubled so lookups never wrap; each lattice point's gradient as an offset into G
  const perm = new Uint8Array(512).map((_, i) => p[i & 255]);
  const gi = new Uint8Array(512).map((_, i) => (perm[i] % 12) * 3);

  function noise(x: number, y: number, z: number, grad: Float64Array | null): number {
    const xf = Math.floor(x), yf = Math.floor(y), zf = Math.floor(z);
    const X = xf & 255, Y = yf & 255, Z = zf & 255;
    const fx = x - xf, fy = y - yf, fz = z - zf;
    // the corners' hashes
    const A = perm[X] + Y, B = perm[X + 1] + Y;
    const AA = perm[A] + Z, AB = perm[A + 1] + Z, BA = perm[B] + Z, BB = perm[B + 1] + Z;
    const a = gi[AA], b = gi[BA], c = gi[AB], d = gi[BB], e = gi[AA + 1], f = gi[BA + 1], g = gi[AB + 1], h = gi[BB + 1];
    const gx = fx - 1, gy = fy - 1, gz = fz - 1;
    const va = G[a] * fx + G[a + 1] * fy + G[a + 2] * fz;
    const vb = G[b] * gx + G[b + 1] * fy + G[b + 2] * fz;
    const vc = G[c] * fx + G[c + 1] * gy + G[c + 2] * fz;
    const vd = G[d] * gx + G[d + 1] * gy + G[d + 2] * fz;
    const ve = G[e] * fx + G[e + 1] * fy + G[e + 2] * gz;
    const vf = G[f] * gx + G[f + 1] * fy + G[f + 2] * gz;
    const vg = G[g] * fx + G[g + 1] * gy + G[g + 2] * gz;
    const vh = G[h] * gx + G[h + 1] * gy + G[h + 2] * gz;
    // quintic fade
    const u = fx * fx * fx * (fx * (fx * 6 - 15) + 10), v = fy * fy * fy * (fy * (fy * 6 - 15) + 10);
    const w = fz * fz * fz * (fz * (fz * 6 - 15) + 10);
    const k1 = vb - va, k2 = vc - va, k3 = ve - va;
    const k4 = va - vb - vc + vd, k5 = va - vc - ve + vg, k6 = va - vb - ve + vf;
    const k7 = -va + vb + vc - vd + ve - vf - vg + vh;
    const value = va + u * k1 + v * k2 + w * k3 + u * v * k4 + v * w * k5 + w * u * k6 + u * v * w * k7;
    if (grad) {
      const du = 30 * fx * fx * (fx - 1) * (fx - 1), dv = 30 * fy * fy * (fy - 1) * (fy - 1), dw = 30 * fz * fz * (fz - 1) * (fz - 1);
      // the gradients blended as the values are, plus the fades' own change
      for (let i = 0; i < 3; i++) {
        const ga = G[a + i], g1 = G[b + i] - ga, g2 = G[c + i] - ga, g3 = G[e + i] - ga;
        const g4 = ga - G[b + i] - G[c + i] + G[d + i], g5 = ga - G[c + i] - G[e + i] + G[g + i], g6 = ga - G[b + i] - G[e + i] + G[f + i];
        const g7 = -ga + G[b + i] + G[c + i] - G[d + i] + G[e + i] - G[f + i] - G[g + i] + G[h + i];
        grad[i] = ga + u * g1 + v * g2 + w * g3 + u * v * g4 + v * w * g5 + w * u * g6 + u * v * w * g7;
      }
      grad[0] += du * (k1 + v * k4 + w * k6 + v * w * k7);
      grad[1] += dv * (k2 + u * k4 + w * k5 + u * w * k7);
      grad[2] += dw * (k3 + v * k5 + u * k6 + u * v * k7);
    }
    return value;
  }

  return { value: (x, y, z) => noise(x, y, z, null), withGradient: (x, y, z, grad) => noise(x, y, z, grad) };
}
