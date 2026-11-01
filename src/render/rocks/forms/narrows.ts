// The Narrows: banded sandstone, hard beds standing out as ledges over soft beds weathered back into overhangs,
// and the squared blocks that fall from them.
import type * as THREE from 'three';
import { blob, finish, loftRings, merge, pick, place, randomCuts, type Lod, type RingPt } from '../mesh.ts';
import { Noise3, range, rng, smooth } from '../noise.ts';
import type { Part } from '../types.ts';

interface Bed {
  y0: number;
  y1: number;
  /** Metres the bed stands out (+) or is weathered back (-). */
  out: number;
  /** Colour key for the material's band palette, in (0, 1]. */
  key: number;
}

function beds(r: () => number, from: number, to: number, scale: number): Bed[] {
  const out: Bed[] = [];
  let y = from;
  while (y < to) {
    const hard = r() < 0.45, t = range(r, 0.6, 2.4) * scale;
    out.push({ y0: y, y1: Math.min(to, y + t), out: hard ? range(r, 0.35, 1.0) * scale : -range(r, 0.1, 0.45) * scale, key: range(r, 0.02, 1) });
    y += t;
  }
  return out;
}

/**
 * A facade of sandstone beds; size is its height. The face looks along +z; its back is flattened to sit in the
 * terrain's cliff. Ledges and overhangs follow the beds, and the beds wear the band colours.
 */
export function sandstoneLedges(seed: number, size: number, lod: Lod): Part[] {
  const r = rng(seed), n = new Noise3(seed), H = size;
  const A = H * range(r, 0.55, 0.8), B = H * range(r, 0.28, 0.36), S = pick(lod, 64, 28, 12);
  const scale = Math.min(1.6, Math.max(0.6, H / 14));
  const layers = beds(r, -1.5, H, scale);
  const joints = Array.from({ length: 4 + Math.floor(r() * 4) }, () => r() * Math.PI * 2);
  const eps = 0.04 * scale;
  const ring = (y: number, bed: Bed, inset = 0, cav = 0): RingPt[] => {
    const t = Math.max(0, y / H);
    return Array.from({ length: S }, (_, j) => {
      const a = (j / S) * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
      // ledges taper and break along the face
      const vary = 0.55 + 0.7 * smooth(-0.3, 0.4, n.noise(ca * 1.8, bed.y0 * 0.3, sa * 1.8));
      const ex = bed.out > 0 ? bed.out * vary : bed.out;
      let x = A * (1 - 0.12 * t) * Math.sign(ca) * Math.pow(Math.abs(ca), 0.6);
      let z = B * (1 - 0.1 * t) * Math.sign(sa) * Math.pow(Math.abs(sa), 0.6);
      if (z < 0) z *= 0.6;
      const len = Math.hypot(x, z) || 1;
      let crack = 0;
      if (lod === 0) for (const jt of joints) crack = Math.max(crack, Math.exp(-((((a - jt + Math.PI * 3) % (Math.PI * 2) - Math.PI) / 0.025) ** 2)));
      const grow = ex - inset - crack * 0.35 * scale + 0.08 * scale * n.noise(ca * 4, y * 0.5, sa * 4);
      x += (x / len) * grow;
      z += (z / len) * grow;
      return { x, y, z, cav: Math.max(cav, crack * 0.7), cover: 0, accent: bed.key };
    });
  };
  const rings: RingPt[][] = [];
  layers.forEach((bed, i) => {
    const below = layers[i - 1];
    // the step between beds: an overhang's underside or a ledge's top
    if (below) rings.push(ring(bed.y0 + eps, bed, 0, bed.out > below.out ? 0.6 : 0));
    else rings.push(ring(bed.y0, bed));
    if (lod < 2) {
      // soft beds weather concave
      const mid = (bed.y0 + bed.y1) / 2;
      rings.push(ring(mid, bed, bed.out < 0 ? 0.25 * scale : 0.05 * scale, bed.out < 0 ? 0.35 : 0));
    }
    rings.push(ring(bed.y1, bed));
  });
  const geo = loftRings(rings, { x: 0, y: H + 0.1, z: 0, accent: layers[layers.length - 1].key }, { x: 0, y: -1.5, z: 0, cav: 1 });
  return [{ geo: finish(geo, 40) }];
}

/** A heap of squared sandstone blocks fallen from the beds above; size is the heap's radius. */
export function sandstoneBlocks(seed: number, size: number, lod: Lod): Part[] {
  const r = rng(seed), R = size;
  const parts: THREE.BufferGeometry[] = [];
  const count = 4 + Math.floor(r() * 5);
  for (let i = 0; i < count; i++) {
    const big = i === 0;
    const w = R * range(r, 0.3, 0.6) * (big ? 1.3 : 1), h = w * range(r, 0.35, 0.65), d = w * range(r, 0.55, 0.9);
    const a = r() * Math.PI * 2, rr = big ? 0 : R * range(r, 0.35, 0.85);
    const key0 = r(), layerT = range(r, 0.25, 0.45), bs = Math.floor(r() * 1e6);
    if (lod === 2 && !big && i > 3) continue;
    const n = new Noise3(bs);
    const g = blob({
      detail: pick(lod, 7, 3, 1),
      radii: [w / 2, h / 2, d / 2],
      shape: (x, y, z) => [n.fbm(x * 2.2, y * 2.2, z * 2.2, 3) * 0.05, smooth(0.0, -0.08, n.fbm(x * 2.2, y * 2.2, z * 2.2, 3)) * 0.4],
      cuts: [
        { n: [1, 0, 0], d: range(r, 0.8, 0.9) }, { n: [-1, 0, 0], d: range(r, 0.8, 0.9) },
        { n: [0, 1, 0], d: range(r, 0.75, 0.9) }, { n: [0, -1, 0], d: range(r, 0.75, 0.9) },
        { n: [0, 0, 1], d: range(r, 0.8, 0.9) }, { n: [0, 0, -1], d: range(r, 0.8, 0.9) },
        ...randomCuts(r, 2, 0.7, 0.88),
      ],
      accent: (_x, y) => {
        const layer = Math.floor(((y + 1) * h) / 2 / layerT);
        return 0.02 + ((key0 + layer * 0.37) % 1) * 0.98;
      },
      piece: r(),
    });
    parts.push(place(g, Math.cos(a) * rr, h * 0.38, Math.sin(a) * rr, r() * 6.3, range(r, -0.25, 0.25), range(r, -0.3, 0.3)));
  }
  return [{ geo: finish(merge(parts), 35) }];
}
