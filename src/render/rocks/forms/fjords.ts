// The Fjords: glacier-polished granite slabs, and scree fans of angular blocks at the cliff feet.
import type * as THREE from 'three';
import { blob, finish, merge, pick, place, randomCuts, type Cut, type Lod } from '../mesh.ts';
import { Noise3, range, rng, smooth } from '../noise.ts';
import type { Part } from '../types.ts';

/**
 * A whaleback slab: a long dome smoothed on the side the glacier came from (+x) and plucked into steps on the
 * other, with exfoliation sheets peeling off its back; size is its length. The ground line is y = 0.
 */
export function graniteSlab(seed: number, size: number, lod: Lod): Part[] {
  const r = rng(seed), n = new Noise3(seed), L = size, H = L * range(r, 0.15, 0.24), W = L * range(r, 0.45, 0.7);
  const sheets = range(r, 2.5, 4.5), sheetPhase = r();
  // plucked lee face: steep cuts facing -x
  const lee: Cut[] = Array.from({ length: 3 + Math.floor(r() * 3) }, () => {
    const a = range(r, -0.7, 0.7), e = range(r, -0.1, 0.5), c = Math.cos(e);
    return { n: [-Math.cos(a) * c, Math.sin(e), Math.sin(a) * c] as [number, number, number], d: range(r, 0.55, 0.8) };
  });
  const geo = blob({
    detail: pick(lod, 18, 7, 3),
    radii: [L / 2, H, W / 2],
    shape: (x, y, z) => {
      const big = n.fbm(x * 0.8, y * 0.8, z * 0.8, 3) * 0.07;
      // onion-skin sheets: shallow steps across the dome
      const s = (y + 0.25 * n.fbm(x * 1.3, 4, z * 1.3, 2)) * sheets + sheetPhase;
      const step = s - Math.floor(s);
      const sheet = -0.03 * smooth(0.75, 1.0, step);
      return [big + sheet + n.noise(x * 6, y * 6, z * 6) * 0.008, smooth(0.8, 1.0, step) * 0.45];
    },
    cuts: lee,
    floor: -H * 0.2,
    cover: (_x, _y, _z, ny) => smooth(0.3, 0.9, ny),
  });
  geo.translate(0, H * 0.2, 0);
  return [{ geo: finish(geo) }];
}

/** Angular block with fresh fracture faces. */
function block(r: () => number, s: number, detail: number): THREE.BufferGeometry {
  const n = new Noise3(Math.floor(r() * 1e6));
  return blob({
    detail,
    radii: [s, s * range(r, 0.5, 0.85), s * range(r, 0.6, 1)],
    shape: (x, y, z) => [n.fbm(x * 2, y * 2, z * 2, 2) * 0.08, 0],
    cuts: randomCuts(r, 6, 0.5, 0.82),
    floor: -s * 0.25,
    piece: r(),
  });
}

/**
 * A scree fan: a heap of angular granite blocks spilling from an apex at the origin down along +z, biggest blocks
 * at the toe; size is the fan's radius. Lay it on the slope under a cliff.
 */
export function graniteScree(seed: number, size: number, lod: Lod): Part[] {
  const r = rng(seed), R = size;
  interface B { x: number; y: number; z: number; s: number; yaw: number; pitch: number; roll: number; seed: number }
  const all: B[] = [];
  const N = Math.min(70, Math.floor(18 + R * 4));
  for (let i = 0; i < N; i++) {
    const a = range(r, -1.05, 1.05), rr = R * Math.sqrt(range(r, 0.02, 1)), x = Math.sin(a) * rr, z = Math.cos(a) * rr;
    const s = R * range(r, 0.025, 0.07) * (0.5 + 1.1 * (rr / R));
    const thick = R * 0.1 * (1 - rr / R);
    all.push({ x, y: r() * thick + s * 0.35, z, s, yaw: r() * 6.3, pitch: range(r, -0.5, 0.5), roll: range(r, -0.5, 0.5), seed: Math.floor(r() * 1e6) });
  }
  all.sort((p, q) => q.s - p.s);
  const keep = all.slice(0, pick(lod, N, Math.ceil(N * 0.45), Math.ceil(N * 0.15)));
  const parts: THREE.BufferGeometry[] = keep.map((b) => {
    const g = block(rng(b.seed), b.s, pick(lod, b.s > R * 0.06 ? 2 : 1, 1, 0));
    return place(g, b.x, b.y, b.z, b.yaw, b.pitch, b.roll);
  });
  // the gravel bed the blocks lie in, thickest at the apex
  const n = new Noise3(seed + 1);
  const bed = blob({
    detail: pick(lod, 10, 5, 2),
    radii: [R * 0.85, R * 0.12, R * 0.6],
    shape: (x, y, z) => [n.fbm(x * 3, y * 3, z * 3, 3) * 0.1, 0.25],
    floor: 0,
    cover: () => 0.3,
  });
  parts.push(place(bed, 0, -R * 0.03, R * 0.42));
  return [{ geo: finish(merge(parts), 32) }];
}
