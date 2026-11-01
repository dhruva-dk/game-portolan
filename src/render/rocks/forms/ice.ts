// The Ice Crown: blue-ice spires, pressure ridges and broken floes.
import type * as THREE from 'three';
import { blob, finish, loftRings, merge, pick, place, randomCuts, type Cut, type Lod, type RingPt } from '../mesh.ts';
import { Noise3, range, rng } from '../noise.ts';
import type { Part } from '../types.ts';

/** Box-like cuts: a slab with chipped, slightly rounded edges. */
function slabCuts(r: () => number): Cut[] {
  const c = (x: number, y: number, z: number, lo: number, hi: number): Cut => ({ n: [x, y, z], d: range(r, lo, hi) });
  return [
    c(1, 0, 0, 0.8, 0.9), c(-1, 0, 0, 0.8, 0.9), c(0, 1, 0, 0.82, 0.92), c(0, -1, 0, 0.82, 0.92), c(0, 0, 1, 0.75, 0.88), c(0, 0, -1, 0.75, 0.88),
    ...randomCuts(r, 2, 0.75, 0.9),
  ];
}

/** A broken block of ice or a slab: width, height, thickness. */
function iceBlock(r: () => number, w: number, h: number, t: number, detail: number): THREE.BufferGeometry {
  const n = new Noise3(Math.floor(r() * 1e6));
  return blob({
    detail,
    radii: [w / 2, h / 2, t / 2],
    shape: (x, y, z) => [n.fbm(x * 1.5, y * 1.5, z * 1.5, 3) * 0.06, 0],
    cuts: slabCuts(r),
    accent: (_x, y) => (y < 0 ? 0.25 : 0),
    piece: r(),
  });
}

/** A crown of leaning, faceted ice shards; size is the tallest shard's height. Rooted below the waterline. */
export function iceSpire(seed: number, size: number, lod: Lod): Part[] {
  const r = rng(seed), H = size, root = -0.12 * H;
  const parts: THREE.BufferGeometry[] = [];
  const shards = lod === 2 ? 3 : 5 + Math.floor(r() * 4);
  for (let k = 0; k < shards; k++) {
    const main = k === 0;
    const h = main ? H : H * range(r, 0.3, 0.72);
    const rb = main ? H * range(r, 0.13, 0.17) : h * range(r, 0.12, 0.2);
    const a = r() * Math.PI * 2, d = main ? 0 : H * range(r, 0.08, 0.2);
    const cx = Math.cos(a) * d, cz = Math.sin(a) * d;
    const lean = main ? range(r, 0, 0.06) : range(r, 0.08, 0.3), la = main ? r() * Math.PI * 2 : a;
    const sides = pick(lod, 5 + Math.floor(r() * 3), 5, 4);
    const radii = Array.from({ length: sides }, () => range(r, 0.72, 1.12));
    const phase = r() * Math.PI * 2;
    const nr = pick(lod, 8, 4, 2);
    const rings: RingPt[][] = [];
    let twist = 0, step = 1;
    for (let i = 0; i <= nr; i++) {
      const t = i / nr, y = root + (h * 0.9 - root) * t;
      if (i > 0 && i < nr && r() < 0.3) step *= range(r, 0.78, 0.9);
      twist += range(r, -0.12, 0.12);
      const rad = rb * Math.pow(1 - t * 0.82, 0.9) * step;
      const off = (y - root) * lean;
      rings.push(radii.map((q, j) => {
        const ang = phase + twist + (j / sides) * Math.PI * 2;
        return {
          x: cx + Math.cos(la) * off + Math.cos(ang) * rad * q,
          y: y + (r() - 0.5) * rb * 0.15,
          z: cz + Math.sin(la) * off + Math.sin(ang) * rad * q,
          cav: i === 0 ? 0.5 : 0,
          accent: i === 0 ? 0.3 : r() < 0.2 ? 0.4 : 0,
        };
      }));
    }
    const off = (h - root) * lean, tipJ = rb * 0.25;
    const tip: RingPt = { x: cx + Math.cos(la) * off + (r() - 0.5) * tipJ, y: h, z: cz + Math.sin(la) * off + (r() - 0.5) * tipJ };
    parts.push(loftRings(rings, tip, { x: cx, y: root - 1, z: cz, cav: 1 }, r()));
  }
  // broken blocks heaped at the foot
  if (lod < 2) {
    const n = pick(lod, 8, 4, 0);
    for (let i = 0; i < n; i++) {
      const s = H * range(r, 0.04, 0.09), a = r() * Math.PI * 2, d = H * range(r, 0.14, 0.3);
      const g = iceBlock(r, s * range(r, 1, 2), s * range(r, 0.6, 1.2), s * range(r, 0.5, 1), pick(lod, 2, 1, 0));
      parts.push(place(g, Math.cos(a) * d, s * 0.15, Math.sin(a) * d, r() * 6, range(r, -0.5, 0.5), range(r, -0.5, 0.5)));
    }
  }
  return [{ geo: finish(merge(parts), 28) }];
}

/** A pressure ridge: ice slabs shoved up and leaning on each other along x, on a snow berm; size is its length. */
export function icePressureRidge(seed: number, size: number, lod: Lod): Part[] {
  const r = rng(seed), n = new Noise3(seed), L = size, H = Math.min(5, L * range(r, 0.1, 0.16));
  const parts: THREE.BufferGeometry[] = [];
  const crest = (x: number) => H * Math.sqrt(Math.max(0, 1 - (2 * x / L) ** 2)) * (0.75 + 0.35 * n.noise(x * 0.3, 0.5, 0));
  // the berm of snow and crushed ice the slabs stand in
  parts.push(blob({
    detail: pick(lod, 12, 6, 3),
    radii: [L / 2, H * 0.4, Math.max(1.2, L * 0.09)],
    shape: (x, y, z) => [n.fbm(x * 2, y * 2, z * 2, 3) * 0.12, 0],
    floor: -H * 0.1,
    accent: () => 0.2,
  }));
  if (lod === 2) {
    parts.push(blob({
      detail: 3,
      radii: [L * 0.45, H * 0.85, Math.max(0.8, L * 0.05)],
      shape: (x, y, z) => [(n.ridged(x * 3, y * 3, z * 3, 2) - 0.5) * 0.3, 0],
      cuts: randomCuts(r, 4, 0.6, 0.85),
    }));
  } else {
    const count = Math.floor(L / pick(lod, 0.85, 1.6, 9));
    for (let i = 0; i < count; i++) {
      const x = -L / 2 + ((i + 0.5) / count) * L + range(r, -0.3, 0.3);
      const hp = crest(x);
      if (hp < 0.3) continue;
      const w = range(r, 0.9, 2.2), h = Math.min(hp * 1.3, range(r, 1, 2.4)) + 0.4, t = range(r, 0.25, 0.55);
      const side = r() < 0.5 ? -1 : 1, tilt = range(r, 0.35, 1.1) * side;
      const g = iceBlock(r, w, h, t, pick(lod, 3, 1, 0));
      parts.push(place(g, x, hp - h * 0.35 * Math.cos(tilt), -side * range(r, 0, 0.5), range(r, -0.5, 0.5), tilt, range(r, -0.25, 0.25)));
    }
  }
  return [{ geo: finish(merge(parts), 35) }];
}

/** A floe of sea ice with a snowy top, a wave-cut waterline and a white rim; size is its width. y = 0 is the sea. */
export function iceFloe(seed: number, size: number, lod: Lod): Part[] {
  const r = rng(seed), n = new Noise3(seed), R = size / 2;
  const f = range(r, 0.25, 0.42) * Math.min(1, 0.6 + size / 25), d = f * 3.2;
  const S = pick(lod, 48, 22, 10), K = pick(lod, 5, 2, 0);
  const ctrl = Array.from({ length: 6 + Math.floor(r() * 4) }, () => range(r, 0.72, 1.05));
  const outline = (a: number) => {
    const u = (a / (Math.PI * 2)) * ctrl.length, i = Math.floor(u) % ctrl.length, t = u - Math.floor(u);
    return R * (ctrl[i] * (1 - t) + ctrl[(i + 1) % ctrl.length] * t) * (1 + 0.05 * n.noise(Math.cos(a) * 3, 0, Math.sin(a) * 3));
  };
  const ring = (k: number, y: number, extra: Partial<RingPt> = {}, top = false): RingPt[] =>
    Array.from({ length: S }, (_, i) => {
      const a = (i / S) * Math.PI * 2, rr = outline(a) * k, x = Math.cos(a) * rr, z = Math.sin(a) * rr;
      const yy = top ? y + 0.1 * n.fbm(x * 0.4, 1, z * 0.4, 3) + 0.04 * n.noise(x * 2.5, 2, z * 0.6) : y;
      return { x, y: yy, z, cover: top ? 1 : 0, ...extra };
    });
  const rings: RingPt[][] = [
    ring(0.9, -d, { cav: 0.3 }),
    ring(1.0, -d * 0.4),
    ring(0.95, 0.02, { cav: 0.45 }),
    ring(1.0, f * 0.8),
    ring(0.97, f, { accent: 0.6 }, true),
  ];
  for (let k = 1; k <= K; k++) rings.push(ring(0.97 * (1 - k / (K + 1)), f + 0.02, {}, true));
  const parts: THREE.BufferGeometry[] = [loftRings(rings, { x: 0, y: f + 0.05 + 0.1 * n.fbm(0, 1, 0, 3), z: 0 }, { x: 0, y: -d, z: 0, cav: 0.5, cover: 0 })];
  // rafted slabs: pieces pushed up onto the floe when floes collide
  if (lod === 0 && size > 5) {
    for (let i = 0, m = 1 + Math.floor(r() * 3); i < m; i++) {
      const a = r() * Math.PI * 2, rr = outline(a) * range(r, 0.55, 0.85), s = range(r, 0.6, 1.4) * Math.min(1, size / 10);
      const g = iceBlock(r, s * 2, s * 0.35, s * 1.4, 2);
      parts.push(place(g, Math.cos(a) * rr, f + s * 0.1, Math.sin(a) * rr, r() * 6, range(r, -0.3, 0.3), range(r, -0.2, 0.2)));
    }
  }
  return [{ geo: finish(merge(parts), 45) }];
}
