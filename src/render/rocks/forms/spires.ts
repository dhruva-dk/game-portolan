// The Spires: pale limestone needles rising sheer from the sea, fluted by rain and undercut by a notch at the
// waterline, and cliff blocks with sea caves cut into them.
import { finish, loftRings, pick, type Lod, type RingPt } from '../mesh.ts';
import { Noise3, range, rng, smooth } from '../noise.ts';
import type { Part } from '../types.ts';

/** A bump of width w centred on c, 1 at the centre. */
const bump = (x: number, c: number, w: number) => Math.max(0, 1 - ((x - c) / w) ** 2) ** 2;

/** The notch the waves cut into limestone just above the waterline. */
const tidalNotch = (y: number) => bump(y, 0.7, 1.3);

/** A needle; size is its height above the sea. Its foot goes a few metres under the water. */
export function limestoneNeedle(seed: number, size: number, lod: Lod): Part[] {
  const r = rng(seed), n = new Noise3(seed), H = size;
  const R0 = H * range(r, 0.11, 0.16), S = pick(lod, 44, 18, 8);
  const lobes = 3 + Math.floor(r() * 3), lobeAmp = range(r, 0.08, 0.18), lobePh = r() * 6.3;
  const leanX = range(r, -0.08, 0.08), leanZ = range(r, -0.08, 0.08), bed = range(r, 2.5, 4.5);
  const foot = -Math.min(6, H * 0.15);
  // ring heights: dense through the notch, even above it, closing into a crown
  const ys = new Set<number>([foot, foot * 0.5, -0.4, 0, 0.35, 0.7, 1.05, 1.4, 2]);
  const body = pick(lod, 30, 11, 4);
  for (let i = 1; i <= body; i++) ys.add(2 + ((H * 0.94 - 2) * i) / body);
  const heights = [...ys].sort((a, b) => a - b).filter((y) => lod < 2 || y === foot || y === 0 || y > 2 || y === 0.7);
  const rings: RingPt[][] = heights.map((y) => {
    const t = Math.max(0, y / H);
    const taper = (1 - 0.35 * t) * (1 + 0.12 * n.fbm(0, y * 0.04, 3.3, 2)) * (y < 0 ? 1 + 0.12 * (y / foot) : 1);
    const notch = tidalNotch(y);
    const cx = leanX * H * t * t, cz = leanZ * H * t * t;
    return Array.from({ length: S }, (_, j) => {
      const a = (j / S) * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
      const flute = lod < 2 ? n.ridged(ca * 2.4, y * 0.02, sa * 2.4, 3) : 0.5;
      const ledge = smooth(0.8, 0.95, (y / bed + 0.25 * n.noise(ca, y * 0.1, sa)) % 1);
      let rad = R0 * taper * (1 + lobeAmp * Math.cos(lobes * a + lobePh) + 0.07 * n.fbm(ca * 1.6, y * 0.05, sa * 1.6, 3));
      rad *= 1 - 0.08 * flute - 0.2 * notch + 0.03 * ledge;
      return { x: cx + ca * rad, y, z: cz + sa * rad, cav: Math.min(1, flute * 0.55 + notch * 0.6) };
    });
  });
  // the crown: a rounded, broken top where the pines stand
  const top = heights[heights.length - 1], tR = rings[rings.length - 1];
  const shrink = (k: number, dy: number) => tR.map((p) => {
    const cx = leanX * H, cz = leanZ * H;
    return { x: cx + (p.x - cx) * k, y: top + dy + (r() - 0.5) * R0 * 0.08, z: cz + (p.z - cz) * k, cover: 1 };
  });
  rings.push(shrink(0.88, H * 0.025), shrink(0.6, H * 0.045));
  const geo = loftRings(rings, { x: leanX * H, y: top + H * 0.055, z: leanZ * H }, { x: 0, y: foot, z: 0, cav: 1 });
  return [{ geo: finish(geo) }];
}

/**
 * A limestone cliff block with an arched sea cave in its face (+z); size is its height. The cave mouth stands in
 * the water from below the waterline to about 0.4 of the height.
 */
export function limestoneSeaCave(seed: number, size: number, lod: Lod): Part[] {
  const r = rng(seed), n = new Noise3(seed), H = size;
  const A = H * range(r, 0.65, 0.85), B = H * range(r, 0.38, 0.5);
  const Hc = H * range(r, 0.3, 0.42), Wc = H * range(r, 0.12, 0.17), D = B * range(r, 1.0, 1.35);
  const K = pick(lod, 44, 20, 10), M = pick(lod, 17, 9, 3);
  const foot = -Math.min(5, H * 0.15);
  const ys = [foot, foot * 0.5, 0];
  const nc = pick(lod, 10, 5, 2);
  for (let i = 1; i <= nc; i++) ys.push(Hc * Math.sin((Math.PI / 2) * (i / nc)) * 0.999);
  ys.push(Hc * 1.04);
  const nt = pick(lod, 12, 5, 2);
  for (let i = 1; i <= nt; i++) ys.push(Hc * 1.04 + ((H - Hc * 1.04) * i) / nt);
  const sup = (a: number, ax: number, bz: number) => {
    const c = Math.cos(a), s = Math.sin(a);
    return [ax * Math.sign(c) * Math.sqrt(Math.abs(c)), bz * Math.sign(s) * Math.sqrt(Math.abs(s))];
  };
  const rings: RingPt[][] = ys.map((y) => {
    const t = Math.max(0, y / H);
    const ax = A * (1 - 0.18 * t), bz = B * (1 - 0.15 * t) * (1 - 0.1 * tidalNotch(y));
    // the arch: full width under the water, closing to nothing at the crown
    const h = y <= 0 ? Wc : y >= Hc ? 0 : Wc * Math.sqrt(1 - (y / Hc) ** 2);
    const depth = h > 0 ? D * Math.pow(h / Wc, 0.3) : 0;
    const delta = Math.asin(Math.min(1, (h / ax) ** 2));
    const out: RingPt[] = [];
    for (let i = 0; i < K; i++) {
      const a = Math.PI / 2 + delta + ((2 * Math.PI - 2 * delta) * i) / (K - 1);
      const [x0, z0] = sup(a, ax, bz);
      const rough = 1 + 0.06 * n.fbm(Math.cos(a) * 1.5, y * 0.06, Math.sin(a) * 1.5, 4) - 0.05 * n.ridged(Math.cos(a) * 3, y * 0.03, Math.sin(a) * 3, 2);
      out.push({ x: x0 * rough, y, z: (z0 < 0 ? z0 * 0.7 : z0) * rough, cav: tidalNotch(y) * 0.5 });
    }
    const zf = bz;
    for (let j = 1; j <= M; j++) {
      const s = j / (M + 1);
      const x = h * Math.cos(Math.PI * s), w = Math.pow(Math.sin(Math.PI * s), 0.35);
      const jit = 0.04 * Wc * n.noise(x * 0.5, y * 0.3, 7);
      out.push({ x: x + jit, y, z: zf - depth * w, cav: h > 0 ? 0.35 + 0.65 * w : 0.2, cover: 0 });
    }
    return out;
  });
  const geo = loftRings(rings, { x: 0, y: H * 1.03, z: 0 }, { x: 0, y: foot, z: 0, cav: 1 });
  return [{ geo: finish(geo, 55) }];
}
