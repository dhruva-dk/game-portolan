// The Weeping Isle: black cliffs streaming with water, cut by the gullies the falls run down, with mossy ledges,
// an overhanging lip the falls leap from, and pools among the rocks at the foot.
import { finish, loftRings, pick, place, type Lod, type RingPt } from '../mesh.ts';
import { Noise3, range, rng, smooth } from '../noise.ts';
import type { Part } from '../types.ts';
import { tidePoolRock } from './generic.ts';

/**
 * A cliff face looking along +z, its back flattened into the island's dome; size is its height. gullies() gives
 * where each gully meets the sea, so falls can be hung on them.
 */
export function weepingCliff(seed: number, size: number, lod: Lod): Part[] {
  const r = rng(seed), n = new Noise3(seed), H = size;
  const A = H * range(r, 0.5, 0.7), B = H * range(r, 0.22, 0.3);
  const S = pick(lod, 60, 26, 10), NR = pick(lod, 40, 16, 6);
  const gul = gulliesOf(seed);
  const ledgeT = range(r, 4, 7), foot = -Math.min(5, H * 0.12);
  const ys: number[] = [foot, foot / 2, 0];
  for (let i = 1; i <= NR; i++) ys.push(H * Math.pow(i / NR, 0.9));
  const rings: RingPt[][] = ys.map((y) => {
    const t = Math.max(0, y / H);
    const lip = smooth(0.8, 0.9, t) * (1 - smooth(0.93, 1.0, t)) * 0.14;
    const dome = t > 0.93 ? 1 - 0.6 * smooth(0.93, 1.0, t) : 1;
    const ledge = smooth(0.82, 0.96, (y / ledgeT + 0.3 * n.noise(0, y * 0.2, 1)) % 1);
    return Array.from({ length: S }, (_, j) => {
      const a = (j / S) * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
      let g = 0;
      for (const q of gul) {
        const d = ((a - q.a + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
        g = Math.max(g, Math.exp(-((d / q.w) ** 2)) * q.depth * smooth(-0.1, 0.25, t));
      }
      const rough = n.ridged(ca * 3, y * 0.05, sa * 3, 3) - 0.5;
      const front = smooth(-0.2, 0.4, sa);
      let k = (1 + 0.06 * rough + 0.04 * n.fbm(ca * 1.2, y * 0.02, sa * 1.2, 3)) * (1 - g * front) * (1 + (lip + 0.035 * ledge) * front) * dome;
      if (y < 0) k *= 1 + 0.1 * (y / foot);
      const x = A * (1 - 0.15 * t) * Math.sign(ca) * Math.pow(Math.abs(ca), 0.7) * k;
      let z = B * (1 - 0.2 * t) * Math.sign(sa) * Math.pow(Math.abs(sa), 0.7) * k;
      if (z < 0) z *= 0.45;
      return { x, y, z, cav: Math.min(1, g * 3 + (lip > 0.05 ? 0.4 : 0) + Math.max(0, -rough) * 0.5), cover: 0.4 + 0.6 * ledge };
    });
  });
  const parts: Part[] = [{ geo: finish(loftRings(rings, { x: 0, y: H * 1.02, z: 0, cover: 1 }, { x: 0, y: foot, z: 0, cav: 1 })) }];
  // pools at the foot of the gullies, where the falls land
  if (lod < 2) {
    for (const q of gul.slice(0, 2)) {
      const ps = Math.max(3, Math.min(9, H * 0.18));
      const zf = B * Math.pow(Math.max(0, Math.sin(q.a)), 0.7) + ps * 0.35, xf = A * Math.sign(Math.cos(q.a)) * Math.pow(Math.abs(Math.cos(q.a)), 0.7);
      for (const p of tidePoolRock(seed + Math.round(q.a * 100), ps, lod)) {
        place(p.geo, xf, 0, zf, q.a);
        parts.push(p);
      }
    }
  }
  return parts;
}

/** The gullies of a cliff built from this seed: angle around the cliff (pi/2 is straight out), width, depth. */
export function gulliesOf(seed: number): { a: number; w: number; depth: number }[] {
  const r = rng(seed * 31 + 5);
  return Array.from({ length: 2 + Math.floor(r() * 3) }, () => ({ a: Math.PI / 2 + range(r, -0.9, 0.9), w: range(r, 0.05, 0.1), depth: range(r, 0.1, 0.2) }));
}
