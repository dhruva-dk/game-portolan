// The Maelstrom: storm-cut slate, steeply dipping plates planed off by the waves into stepped shelves, with slabby
// boulders thrown up on them.
import type * as THREE from 'three';
import { blob, finish, merge, pick, place, randomCuts, type Lod } from '../mesh.ts';
import { Noise3, range, rng, smooth } from '../noise.ts';
import type { Part } from '../types.ts';

/**
 * A shelf of slate plates striking along z and stepping down toward the sea at +x; size is its length along x.
 * The top steps from about a quarter of the length high at -x down to the waterline at +x.
 */
export function slateShelf(seed: number, size: number, lod: Lod): Part[] {
  const r = rng(seed), n = new Noise3(seed), L = size;
  // plates lean 18-28 degrees off vertical, all the same way
  const Hs = Math.min(7, L * range(r, 0.2, 0.3)), lean = range(r, 0.32, 0.48) * (r() < 0.5 ? -1 : 1);
  const stepH = range(r, 0.5, 0.9), W = L * range(r, 0.5, 0.7);
  const count = Math.max(3, Math.floor(L / pick(lod, 0.55, 1.1, 3)));
  const shelf = (x: number) => Math.round((Hs * (0.5 - x / L) * (1 + 0.15 * n.noise(x * 0.2, 0, 1))) / stepH) * stepH;
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < count; i++) {
    const x = -L / 2 + ((i + 0.5) / count) * L, t = (L / count) * range(r, 0.8, 1.05);
    const top = shelf(x) + range(r, -0.2, 0.25), bottom = -2.5, len = (top - bottom + 1.5) / Math.cos(lean);
    const w = W * range(r, 0.75, 1.15), zc = range(r, -0.12, 0.12) * W;
    const ps = Math.floor(r() * 1e6), pr = rng(ps), pn = new Noise3(ps);
    const g = blob({
      detail: pick(lod, 4, 2, 1),
      radii: [t / 2, len / 2, w / 2],
      shape: (px, py, pz) => [pn.fbm(px * 2, py * 2, pz * 2, 2) * 0.04, 0],
      cuts: [{ n: [1, 0, 0], d: 0.9 }, { n: [-1, 0, 0], d: 0.9 }, { n: [0, 0, 1], d: range(pr, 0.75, 0.95) }, { n: [0, 0, -1], d: range(pr, 0.75, 0.95) }, ...randomCuts(pr, 2, 0.7, 0.9)],
      piece: pr(),
    });
    // lean the plate, stand it on the bed, then let the waves plane its top flat and jagged
    place(g, x, (top + bottom) / 2, zc, 0, 0, lean);
    const p = g.getAttribute('position') as THREE.BufferAttribute, a = g.getAttribute('aRock') as THREE.BufferAttribute;
    for (let v = 0; v < p.count; v++) {
      const vx = p.getX(v), vz = p.getZ(v);
      const cap = top + 0.12 * n.noise(vx * 1.5, 3, vz * 1.5) + 0.06 * n.noise(vx * 6, 4, vz * 6);
      if (p.getY(v) > cap) p.setY(v, cap);
      a.setX(v, smooth(top - 0.3, top - 2.5, p.getY(v)) * 0.7);
      a.setY(v, 0);
    }
    parts.push(g);
  }
  // slabby boulders thrown up on the shelf
  if (lod < 2) {
    for (let i = 0, m = pick(lod, 7, 4, 0); i < m; i++) {
      const x = range(r, -0.45, 0.45) * L, z = range(r, -0.3, 0.3) * W, s = range(r, 0.4, 1.2) * Math.min(1.5, L / 12);
      const bs = Math.floor(r() * 1e6), br = rng(bs), bn = new Noise3(bs);
      const g = blob({
        detail: pick(lod, 3, 1, 0),
        radii: [s, s * range(br, 0.25, 0.4), s * range(br, 0.6, 0.9)],
        shape: (px, py, pz) => [bn.fbm(px * 2, py * 2, pz * 2, 2) * 0.08, 0],
        cuts: randomCuts(br, 5, 0.6, 0.85),
        floor: -s * 0.1,
        piece: br(),
      });
      parts.push(place(g, x, shelf(x) + s * 0.25, z, br() * 6.3, range(br, -0.2, 0.2), range(br, -0.2, 0.2)));
    }
  }
  return [{ geo: finish(merge(parts), 30) }];
}
