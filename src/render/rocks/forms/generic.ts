// Generic sea boulders and tide-pool rocks: shared by every region, each wearing its region's skin.
import * as THREE from 'three';
import { blob, finish, loftRings, pick, randomCuts, type Lod, type RingPt } from '../mesh.ts';
import { Noise3, range, rng, smooth } from '../noise.ts';
import type { Part } from '../types.ts';

/** A water-worn, sub-angular boulder; size is its width. The ground line is y = 0, a quarter of it buried. */
export function seaBoulder(seed: number, size: number, lod: Lod): Part[] {
  const r = rng(seed), n = new Noise3(seed);
  const rx = size / 2, ry = rx * range(r, 0.5, 0.8), rz = rx * range(r, 0.65, 0.95);
  const geo = blob({
    detail: pick(lod, 13, 6, 2),
    radii: [rx, ry, rz],
    shape: (x, y, z) => {
      const a = n.fbm(x * 1.2, y * 1.2, z * 1.2, 4), b = n.fbm(x * 3.7 + 9, y * 3.7, z * 3.7, 3);
      return [a * 0.2 + b * 0.05, smooth(0.0, 0.3, -a - b * 0.5) * 0.6];
    },
    cuts: randomCuts(r, Math.floor(range(r, 2, 5)), 0.72, 0.9),
    floor: -ry * 0.3,
    cover: (_x, y) => smooth(0, ry * 0.6, y),
  });
  geo.translate(0, ry * 0.3, 0);
  return [{ geo: finish(geo) }];
}

/** A low rock shelf with pools of standing water in its top; size is its width. The top sits up to ~0.8 m above y = 0. */
export function tidePoolRock(seed: number, size: number, lod: Lod): Part[] {
  const r = rng(seed), n = new Noise3(seed + 7);
  const R = size / 2, H = range(r, 0.35, 0.8);
  const K = pick(lod, 16, 7, 3), S = pick(lod, 56, 24, 10);
  const basins: { x: number; z: number; r: number; d: number }[] = [];
  if (lod < 2) {
    for (let i = 0, tries = 0; basins.length < 2 + Math.floor(r() * 3) && tries < 40; tries++) {
      const a = r() * Math.PI * 2, d = Math.sqrt(r()) * R * 0.55, br = range(r, 0.12, 0.28) * R;
      const b = { x: Math.cos(a) * d, z: Math.sin(a) * d, r: br, d: range(r, 0.15, 0.4) };
      if (basins.every((o) => Math.hypot(o.x - b.x, o.z - b.z) > o.r + b.r + 0.15)) basins.push(b);
      i++;
    }
  }
  const outline = (a: number) => R * (1 + 0.22 * n.fbm(Math.cos(a) * 1.3, 0, Math.sin(a) * 1.3, 3));
  const top = (x: number, z: number, f: number) => H * smooth(1.05, 0.7, f) + 0.12 * n.fbm(x * 0.6, 3.1, z * 0.6, 3) + 0.04 * n.noise(x * 3, 1.7, z * 3);
  const bowl = (x: number, z: number) => {
    let d = 0;
    for (const b of basins) {
      const t = Math.hypot(x - b.x, z - b.z) / b.r;
      if (t < 1) d = Math.max(d, b.d * (1 - t * t) * (1 - t * t) + 0.04 * (1 - t));
    }
    return d;
  };
  const ring = (f: number, y?: number, flare = 1): RingPt[] =>
    Array.from({ length: S }, (_, i) => {
      const a = (i / S) * Math.PI * 2, rr = outline(a) * f * flare, x = Math.cos(a) * rr, z = Math.sin(a) * rr;
      const b = y === undefined ? bowl(x, z) : 0;
      return { x, y: y ?? top(x, z, f) - b, z, cav: Math.min(0.7, b * 1.6) + (y !== undefined && y < 0 ? 0.3 : 0), cover: y === undefined ? 1 : 0 };
    });
  const rings: RingPt[][] = [ring(1, -0.9, 1.12), ring(1, -0.15, 1.06)];
  for (let k = 0; k < K; k++) rings.push(ring(1 - k / K));
  const geo = loftRings(rings, { x: 0, y: top(0, 0, 0) - bowl(0, 0), z: 0 }, { x: 0, y: -0.9, z: 0, cav: 1, cover: 0 });
  const parts: Part[] = [{ geo: finish(geo) }];
  for (const b of basins) {
    const disc = new THREE.CircleGeometry(b.r * 0.86, pick(lod, 24, 12, 6));
    disc.rotateX(-Math.PI / 2);
    disc.translate(b.x, top(b.x, b.z, Math.hypot(b.x, b.z) / R) - b.d * 0.3, b.z);
    parts.push({ geo: disc, pool: true });
  }
  return parts;
}
