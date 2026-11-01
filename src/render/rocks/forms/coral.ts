// The Coral Atolls: beaches of broken coral (staghorn sticks, plates and worn heads) and living coral heads on the
// reef flat, some grown flat-topped at low-tide level as microatolls.
import type * as THREE from 'three';
import { Builder, blob, finish, merge, pick, place, randomCuts, type Lod } from '../mesh.ts';
import { Noise3, range, rng, smooth, worley } from '../noise.ts';
import type { Part } from '../types.ts';

/** A broken staghorn branch lying along x, optionally forked: length, radius. */
function stick(r: () => number, len: number, rad: number, sides: number, piece: number): THREE.BufferGeometry {
  const b = new Builder();
  const limb = (x0: number, z0: number, ang: number, l: number, r0: number) => {
    const rings: number[][] = [];
    const steps = 3;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps, x = x0 + Math.cos(ang) * l * t, z = z0 + Math.sin(ang) * l * t;
      const rr = r0 * (1 - 0.35 * t) * (1 + (r() - 0.5) * 0.25);
      rings.push(Array.from({ length: sides }, (_, k) => {
        const a = (k / sides) * Math.PI * 2;
        // ring around the limb's axis: cos across it (-sin, cos in xz) and sin up, the loft's winding with the
        // limb's direction as its up
        return b.vert(x - Math.sin(ang) * Math.cos(a) * rr, rr + Math.sin(a) * rr, z + Math.cos(ang) * Math.cos(a) * rr, 0, 0, 0, piece);
      }));
    }
    b.loft(rings);
    b.cap(rings[0], b.vert(x0 - Math.cos(ang) * r0 * 0.4, r0, z0 - Math.sin(ang) * r0 * 0.4, 0, 0, 0, piece), false);
    const ex = x0 + Math.cos(ang) * (l + r0 * 0.5), ez = z0 + Math.sin(ang) * (l + r0 * 0.5);
    b.cap(rings[steps], b.vert(ex, r0 * 0.7, ez, 0, 0, 0, piece), true);
  };
  limb(-len / 2, 0, 0, len, rad);
  if (r() < 0.45) limb(range(r, -0.2, 0.2) * len, 0, range(r, 0.5, 1.0) * (r() < 0.5 ? -1 : 1), len * range(r, 0.3, 0.55), rad * 0.75);
  return b.geometry();
}

/**
 * A rubble beach of coral fragments over a lumpy bed; size is the patch's radius. Pieces are bleached white,
 * cream, pink and salmon.
 */
export function coralRubble(seed: number, size: number, lod: Lod): Part[] {
  const r = rng(seed), R = size, n = new Noise3(seed);
  const parts: THREE.BufferGeometry[] = [];
  const bed = blob({
    detail: pick(lod, 14, 6, 3),
    radii: [R, Math.max(0.15, R * 0.07), R * 0.8],
    shape: (x, y, z) => {
      const v = n.fbm(x * 9, y * 9, z * 9, 3);
      return [v * 0.08 + n.fbm(x * 2, y * 2, z * 2, 2) * 0.08, smooth(0, -0.2, v) * 0.6];
    },
    floor: 0,
    piece: 0.5,
  });
  parts.push(bed);
  if (lod < 2) {
    const N = Math.min(160, Math.floor(R * R * 9));
    const keep = lod === 0 ? N : Math.floor(N * 0.35);
    for (let i = 0; i < N; i++) {
      const kind = r(), a = r() * Math.PI * 2, d = R * 0.9 * Math.sqrt(r()), piece = r(), sz = range(r, 0.6, 1.4);
      const x = Math.cos(a) * d, z = Math.sin(a) * d * 0.8, y = Math.max(0.02, R * 0.07 * (1 - (d / R) ** 2) * 0.8);
      const yaw = r() * 6.3, ps = Math.floor(r() * 1e6);
      if (i >= keep) continue;
      const pr = rng(ps);
      if (kind < 0.55) {
        parts.push(place(stick(pr, 0.35 * sz, 0.04 * sz, pick(lod, 6, 4, 4), piece), x, y - 0.02, z, yaw, range(pr, -0.15, 0.15), 0));
      } else if (kind < 0.8) {
        const pn = new Noise3(ps), s = 0.16 * sz;
        parts.push(place(blob({
          detail: pick(lod, 2, 1, 1),
          radii: [s, s * 0.7, s * 0.85],
          shape: (px, py, pz) => [pn.fbm(px * 4, py * 4, pz * 4, 2) * 0.15, 0.2],
          cuts: randomCuts(pr, 2, 0.5, 0.8),
          floor: -s * 0.3,
          piece,
        }), x, y + s * 0.3, z, yaw, 0, 0));
      } else {
        const s = 0.2 * sz;
        parts.push(place(blob({ detail: 1, radii: [s, 0.03 * sz, s * 0.8], cuts: randomCuts(pr, 3, 0.55, 0.85), piece }), x, y + 0.02, z, yaw, range(pr, -0.3, 0.3), range(pr, -0.3, 0.3)));
      }
    }
  }
  return [{ geo: finish(merge(parts), 40) }];
}

/**
 * A massive coral head, brain-grooved or knobbly, sometimes a microatoll whose top has grown flat at low water;
 * size is its width. Its foot sits at y = 0 on the reef.
 */
export function coralHead(seed: number, size: number, lod: Lod): Part[] {
  const r = rng(seed), n = new Noise3(seed), rx = size / 2, ry = rx * range(r, 0.5, 0.8);
  const micro = r() < 0.35, brain = r() < 0.55, k = range(r, 5, 8), ws = Math.floor(r() * 1e6);
  const geo = blob({
    detail: pick(lod, 16, 7, 2),
    radii: [rx, ry, rx * range(r, 0.8, 1)],
    shape: (x, y, z) => {
      let o = n.fbm(x * 1.6, y * 1.6, z * 1.6, 3) * 0.12, cav = 0;
      if (lod < 2) {
        if (brain) {
          const [d1, d2] = worley(x * k, y * k, z * k, ws);
          const ridge = smooth(0.0, 0.25, d2 - d1);
          o -= 0.035 * (1 - ridge);
          cav = (1 - ridge) * 0.5;
        } else {
          const knob = Math.max(0, n.noise(x * 11, y * 11, z * 11));
          o += 0.05 * knob;
          cav = (1 - knob) * 0.15;
        }
      }
      return [o, cav];
    },
    cuts: micro ? [{ n: [0, 1, 0], d: range(r, 0.35, 0.55) }] : undefined,
    floor: -ry * 0.25,
    piece: r(),
  });
  geo.translate(0, ry * 0.25, 0);
  return [{ geo: finish(geo) }];
}
