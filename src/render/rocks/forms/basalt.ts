// The Basalt Stacks: hexagonal columns packed edge to edge, stepping down into the sea or standing as a stack, and
// beaches of black water-rounded boulders.
import type * as THREE from 'three';
import { Builder, blob, finish, merge, pick, place, type Lod } from '../mesh.ts';
import { Noise3, hash3, range, rng, smooth } from '../noise.ts';
import type { Part } from '../types.ts';

interface ColumnSpec {
  /** Hexagon circumradius, metres. */
  s: number;
  /** Cells whose centre passes this test become columns. */
  inside: (x: number, z: number) => boolean;
  /** Height of a column's top. */
  top: (x: number, z: number, rand: number) => number;
  /** Where every column's foot is. */
  bottom: number;
  /** Tops above this get turf. */
  turfAbove: number;
  /** Horizontal joints cut into the upper part of each column. */
  joints: number;
  /** Bevel on the top edge, metres. */
  bevel: number;
  seed: number;
}

/**
 * Packs prisms on a jittered hexagonal lattice. Corners are shared between neighbours (their jitter comes from a
 * hash of the corner's position), so the columns fit edge to edge with no gaps, as real columnar joints do.
 */
function columns(spec: ColumnSpec, extent: number): THREE.BufferGeometry {
  const { s, seed } = spec, b = new Builder(), sq3 = Math.sqrt(3);
  const corner = (x: number, z: number): [number, number] => {
    const kx = Math.round(x * 50), kz = Math.round(z * 50);
    return [x + (hash3(kx, kz, 1, seed) - 0.5) * 0.36 * s, z + (hash3(kx, kz, 2, seed) - 0.5) * 0.36 * s];
  };
  const qn = Math.ceil(extent / (s * sq3)) + 2, rn = Math.ceil(extent / (s * 1.5)) + 2;
  for (let rr = -rn; rr <= rn; rr++) for (let q = -qn; q <= qn; q++) {
    const cx = s * sq3 * (q + rr / 2), cz = s * 1.5 * rr;
    if (!spec.inside(cx, cz)) continue;
    const rand = hash3(q, rr, 3, seed), piece = hash3(q, rr, 4, seed);
    const top = spec.top(cx, cz, rand), bot = spec.bottom;
    if (top <= bot + 0.2) continue;
    const pts = Array.from({ length: 6 }, (_, k) => {
      const a = (Math.PI / 180) * (30 + 60 * k);
      return corner(cx + s * Math.cos(a), cz + s * Math.sin(a));
    });
    const turf = top > spec.turfAbove ? 1 : 0;
    const ring = (y: number, inset: number, cav: number, cover: number) =>
      pts.map(([x, z]) => b.vert(x + (cx - x) * inset, y, z + (cz - z) * inset, cav, cover, 0, piece));
    const rings: number[][] = [ring(bot, 0, 0.9, 0)];
    // joints: thin grooves across the upper part of the column
    for (let j = spec.joints; j >= 1; j--) {
      const y = top - j * range(rng(Math.floor(rand * 1e6) + j), 0.45, 0.8);
      if (y <= bot + 0.3) continue;
      const cav = smooth(0, 1.8, top - y) * 0.7;
      rings.push(ring(y - 0.025, 0, cav, 0), ring(y, 0.04, cav + 0.2, 0), ring(y + 0.025, 0, cav, 0));
    }
    if (spec.bevel > 0) rings.push(ring(top - spec.bevel, 0, 0, 0.3), ring(top, spec.bevel / s, 0, turf));
    else rings.push(ring(top, 0, 0, turf));
    b.loft(rings);
    // tops are cupped or domed, as the ball-and-socket joints break
    const dome = (rand - 0.5) * 0.12 * s;
    b.cap(rings[rings.length - 1], b.vert(cx, top + dome, cz, 0, turf, 0, piece), true);
  }
  return b.geometry();
}

/**
 * Columns stepping down into the sea, the causeway; size is the field's radius. The tops climb from below the
 * waterline at +z (seaward) to a few metres up at -z (inland).
 */
export function basaltColumns(seed: number, size: number, lod: Lod): Part[] {
  const r = rng(seed), n = new Noise3(seed), R = size, Rz = R * 0.75;
  const s = Math.min(0.85, Math.max(0.45, R * 0.06)) * (lod === 2 ? 2.4 : 1);
  const Hmax = Math.max(2, R * range(r, 0.3, 0.4)), steps = range(r, 0.25, 0.4);
  const geo = columns({
    s, seed,
    inside: (x, z) => (x / R) ** 2 + (z / Rz) ** 2 < 0.85 + 0.25 * n.noise(x * 0.15, 0, z * 0.15),
    top: (x, z, rand) => {
      const u = Math.max(-1, Math.min(1, z / Rz));
      let y = Hmax * (0.5 - 0.5 * u) * (1 - 0.3 * (x / R) ** 2) - 0.8;
      y += (rand - 0.5) * 0.7 + 0.5 * n.noise(x * 0.25, 1, z * 0.25);
      y = Math.round(y / steps) * steps;
      if (rand < 0.1) y -= range(rng(Math.floor(rand * 1e7)), 0.4, 1.2);
      return y;
    },
    bottom: -3,
    turfAbove: Hmax * 0.7,
    joints: pick(lod, 2, 0, 0),
    bevel: lod === 0 ? 0.05 : 0,
  }, R + 2);
  return [{ geo: finish(geo, 25) }];
}

/** A sea stack of tall columns with a turf cap and a crumbling rim; size is its height. */
export function basaltStack(seed: number, size: number, lod: Lod): Part[] {
  const r = rng(seed), n = new Noise3(seed), H = size, R = H * range(r, 0.18, 0.28);
  const s = Math.min(1.0, Math.max(0.5, R * 0.12)) * (lod === 2 ? 2.2 : 1);
  const geo = columns({
    s, seed,
    inside: (x, z) => Math.hypot(x, z) < R * (1 + 0.18 * n.noise(x * 0.2, 2, z * 0.2)),
    top: (x, z, rand) => {
      const d = Math.hypot(x, z) / R;
      let y = H * (1 - 0.12 * d * d) + (rand - 0.5) * 0.6 + 0.6 * n.noise(x * 0.3, 5, z * 0.3);
      if (d > 0.7 && rand < 0.55) y -= H * range(rng(Math.floor(rand * 1e7)), 0.05, 0.45) * smooth(0.7, 1.0, d);
      return y;
    },
    bottom: -4,
    turfAbove: H * 0.85,
    joints: pick(lod, 3, 1, 0),
    bevel: lod === 0 ? 0.06 : 0,
  }, R * 1.3 + 2);
  return [{ geo: finish(geo, 25) }];
}

/** A beach of black, water-rounded boulders packed together; size is the patch's radius. */
export function boulderBeach(seed: number, size: number, lod: Lod): Part[] {
  const r = rng(seed), R = size;
  interface B { x: number; z: number; rb: number; seed: number }
  const all: B[] = [];
  for (let tries = 0; tries < 900 && all.length < 70; tries++) {
    const a = r() * Math.PI * 2, d = R * Math.sqrt(r()), rb = range(r, 0.22, 0.75) * (1 - 0.35 * (d / R));
    const x = Math.cos(a) * d, z = Math.sin(a) * d * 0.7;
    if (all.every((o) => Math.hypot(o.x - x, o.z - z) > (o.rb + rb) * 0.82)) all.push({ x, z, rb, seed: Math.floor(r() * 1e6) });
  }
  all.sort((p, q) => q.rb - p.rb);
  const keep = all.slice(0, pick(lod, all.length, Math.ceil(all.length * 0.45), Math.ceil(all.length * 0.15)));
  const parts = keep.map((b) => {
    const br = rng(b.seed), n = new Noise3(b.seed), ry = b.rb * range(br, 0.5, 0.75);
    const g = blob({
      detail: pick(lod, 4, 2, 1),
      radii: [b.rb, ry, b.rb * range(br, 0.7, 1)],
      shape: (x, y, z) => [n.fbm(x * 1.3, y * 1.3, z * 1.3, 3) * 0.1, 0],
      floor: -ry * 0.35,
      cover: () => 0,
      piece: br(),
    });
    return place(g, b.x, ry * 0.4, b.z, br() * 6.3, range(br, -0.15, 0.15), range(br, -0.15, 0.15));
  });
  return [{ geo: finish(merge(parts)) }];
}
