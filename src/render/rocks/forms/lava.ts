// The Fire Archipelago: fresh 'a'a clinker, jagged and black with heat still glowing in its cracks, and ropy
// pahoehoe, smooth toes of lava wrinkled into ropes as they cooled.
import type * as THREE from 'three';
import { blob, finish, loftRings, merge, pick, place, randomCuts, type Lod, type RingPt } from '../mesh.ts';
import { Noise3, range, rng, smooth } from '../noise.ts';
import type { BuildOpts, Part } from '../types.ts';

/** A mound of fresh 'a'a clinker; size is its width. opts.hot sets how much its cracks glow. */
export function lavaFresh(seed: number, size: number, lod: Lod, opts: BuildOpts): Part[] {
  const r = rng(seed), n = new Noise3(seed), R = size / 2, ry = R * range(r, 0.3, 0.5), rz = R * range(r, 0.7, 1);
  const hot = opts.hot ?? (r() < 0.4 ? range(r, 0.5, 1) : 0);
  const parts: THREE.BufferGeometry[] = [];
  parts.push(blob({
    detail: pick(lod, 18, 7, 2),
    radii: [R, ry, rz],
    shape: (x, y, z) => {
      const jag = n.ridged(x * 2.5, y * 2.5, z * 2.5, 4) - 0.55, fine = n.fbm(x * 7, y * 7, z * 7, 2);
      const o = jag * 0.3 + fine * 0.07;
      return [o, smooth(0.0, -0.18, o) * 0.9];
    },
    cuts: randomCuts(r, 3, 0.65, 0.85),
    floor: -ry * 0.25,
    accent: (x, y, z) => hot * smooth(0.1, 0.5, -(n.ridged(x * 2.5, y * 2.5, z * 2.5, 4) - 0.55)),
  }));
  parts[0].translate(0, ry * 0.25, 0);
  // loose clinker on the surface
  const count = pick(lod, 26, 10, 0);
  for (let i = 0; i < count; i++) {
    const a = r() * Math.PI * 2, d = Math.sqrt(r()) * 0.85, x = Math.cos(a) * d * R, z = Math.sin(a) * d * rz;
    const s = R * range(r, 0.04, 0.11), cs = Math.floor(r() * 1e6), cn = new Noise3(cs), cr = rng(cs);
    const y = ry * 1.25 * Math.sqrt(Math.max(0, 1 - d * d)) * 0.85;
    parts.push(place(blob({
      detail: pick(lod, 2, 1, 0),
      radii: [s, s * range(cr, 0.5, 0.9), s * range(cr, 0.6, 1)],
      shape: (px, py, pz) => [(cn.ridged(px * 3, py * 3, pz * 3, 2) - 0.5) * 0.4, 0.3],
      cuts: randomCuts(cr, 4, 0.5, 0.8),
      accent: () => hot * 0.25,
      piece: cr(),
    }), x, y, z, cr() * 6.3, cr() * 3, cr() * 3));
  }
  return [{ geo: finish(merge(parts), 40) }];
}

/**
 * Pahoehoe: a run of overlapping lobes (toes) flowing along +x, their skins wrinkled into ropes bowed downstream;
 * size is the run's length. opts.hot makes the toes' margins glow where they are still breaking out.
 */
export function lavaRopy(seed: number, size: number, lod: Lod, opts: BuildOpts): Part[] {
  const r = rng(seed), n = new Noise3(seed);
  const hot = opts.hot ?? (r() < 0.3 ? range(r, 0.4, 0.9) : 0);
  const lobes = 3 + Math.floor(r() * 3);
  const NR = pick(lod, 22, 9, 4), NS = pick(lod, 48, 20, 8);
  const parts: THREE.BufferGeometry[] = [];
  let x0 = -size / 2;
  for (let k = 0; k < lobes; k++) {
    const L = size * range(r, 0.32, 0.55), W = L * range(r, 0.5, 0.75), Hl = range(r, 0.25, 0.55) * Math.min(1.4, 0.4 + size / 10);
    const lam = range(r, 0.45, 0.8), bow = range(r, 0.4, 0.9) / W, amp = 0.05 + 0.04 * Hl, ph = r() * 6.3;
    const cx = x0 + L * 0.45, cz = (r() - 0.5) * size * 0.35, yaw = range(r, -0.4, 0.4);
    x0 += L * range(r, 0.45, 0.65);
    if (lod === 2 && k > 1) continue;
    const edge = (a: number) => 1 + 0.14 * n.fbm(Math.cos(a) * 1.4 + k * 3, 0.5, Math.sin(a) * 1.4, 3);
    const ring = (f: number, yFix?: number): RingPt[] => Array.from({ length: NS }, (_, j) => {
      const a = (j / NS) * Math.PI * 2, e = edge(a), x = Math.cos(a) * (L / 2) * f * e, z = Math.sin(a) * (W / 2) * f * e;
      if (yFix !== undefined) return { x, y: yFix, z, cav: 0.6, cover: 0, accent: hot * 0.9 };
      const fade = 1 - f ** 4;
      const rope = Math.sin(((x + bow * z * z) / lam) * Math.PI * 2 + ph + 0.6 * n.noise(x * 0.5, k, z * 0.5));
      const y = Hl * Math.sqrt(Math.max(0, 1 - f ** 2.4)) + (rope * amp + 0.08 * n.fbm(x * 0.35, k, z * 0.35, 2)) * fade;
      return { x, y, z, cav: (0.5 - rope * 0.5) * 0.35 * fade, cover: 0, accent: hot * (smooth(0.8, 1.0, f) * 0.8 + (1 - rope) * 0.1 * fade) };
    });
    const rings: RingPt[][] = [ring(1.04, -0.25), ring(1.0, 0.02)];
    for (let i = 1; i < NR; i++) rings.push(ring(1 - i / NR));
    const g = loftRings(rings, { x: 0, y: Hl + 0.02, z: 0, cover: 0 }, { x: 0, y: -0.25, z: 0, cav: 1, cover: 0 }, r());
    parts.push(place(g, cx, 0, cz, yaw));
  }
  return [{ geo: finish(merge(parts)) }];
}
