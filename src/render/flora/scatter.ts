// Where the plants grow: each kind's rules (the height of the ground, how steep it is, how many to the hundred square
// metres, how tightly they gather) laid over the planet's height grid. Pure arithmetic over the grid, so it runs in a
// worker (scatter-worker.ts) and in node; the same rules and seed always grow the same plants in the same places.
//
// The grid's cells are the sampling unit. Every cell of a region whose ground the kind could grow on gets an expected
// count, the density times the cell's area times a clumping field, and that many plants (rounded by chance) are thrown
// into it at random, each then checked against the rules again where it actually stands. The clumping field is value
// noise at the kind's grove size, sharpened by how much it gathers and renormalised over the ground it grows on, so
// gathering moves plants into groves without changing how many there are. Plants with a crown (anything sparse
// enough to need room) keep their distance from each other's trunks, across kinds, so groves never stack trunks.
//
// Each plant comes out as a place, a size and a turn: a quaternion taking the plant's own frame (+Y up) to the
// planet's. Ground plants stand along the radius, small ones tipped part way to the slope; wall plants face out of
// the cliff with +Z; surface plants float at sea level.
import { HEIGHT_GRID, heightAt, regionAt } from '../../sim/world/index.ts';
import { R, faceDir } from '../../sim/sphere.ts';
import { cross, dot, normalize, v3, type V3 } from '../../sim/math.ts';

export type Anchor = 'ground' | 'wall' | 'surface';

export interface ScatterSpec {
  region: number;
  /** Ground height range, metres above mean sea level. */
  minHeight: number;
  maxHeight: number;
  /** Slope range, degrees from flat. */
  minSlope: number;
  maxSlope: number;
  /** Plants per 100 m² of ground the rules allow. */
  density: number;
  /** 0 scatters evenly, 1 gathers plants into tight groves. */
  clump: number;
  /** The size of a grove, metres. */
  grove: number;
  anchor: Anchor;
  /** Metres a plant keeps from any other plant that keeps its distance; 0 for undergrowth. */
  spacing: number;
  /** 0 stands along the radius, 1 along the ground's normal. */
  tilt: number;
  /** Smallest and largest size, as a factor. */
  size: readonly [number, number];
  /** How many built variants the plants are shared among. */
  variants: number;
  seed: number;
}

/** Ground where nothing grows: a landmark's footing or a beacon's. */
export interface Clearing {
  /** Unit vector. */
  at: V3;
  /** Metres. */
  r: number;
}

/** One kind's plants: 8 floats each (x, y, z, size, then the turn as a quaternion x, y, z, w), and each one's variant. */
export interface Scattered {
  data: Float32Array;
  variant: Uint8Array;
}

/** Floats per plant in Scattered.data. */
export const STRIDE = 8;

const DEG = Math.PI / 180;
const G = HEIGHT_GRID;

// ---------------------------------------------------------------- random

/** A hash of three integers to [0, 1). */
function hash3(x: number, y: number, z: number): number {
  let h = Math.imul(x | 0, 0x8da6b343) ^ Math.imul(y | 0, 0xd8163841) ^ Math.imul(z | 0, 0xcb1ab31f);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
}

/** Smooth value noise in [0, 1). */
function noise3(x: number, y: number, z: number, seed: number): number {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  const fx = x - ix, fy = y - iy, fz = z - iz;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy), sz = fz * fz * (3 - 2 * fz);
  const s = seed * 7919;
  const c = (a: number, b: number, d: number) => hash3(ix + a + s, iy + b, iz + d);
  const x00 = c(0, 0, 0) + (c(1, 0, 0) - c(0, 0, 0)) * sx, x10 = c(0, 1, 0) + (c(1, 1, 0) - c(0, 1, 0)) * sx;
  const x01 = c(0, 0, 1) + (c(1, 0, 1) - c(0, 0, 1)) * sx, x11 = c(0, 1, 1) + (c(1, 1, 1) - c(0, 1, 1)) * sx;
  const y0 = x00 + (x10 - x00) * sy, y1 = x01 + (x11 - x01) * sy;
  return y0 + (y1 - y0) * sz;
}

/** Mulberry32. */
function stream(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------- the ground

/** The cells of the grid that could hold a plant: the sea floor down to this depth, and all the land. */
const DEEPEST = -24;

interface Ground {
  /** Per kept cell: face, i, j packed as face * G * G + j * G + i. */
  cell: Int32Array;
  /** Height at the cell's middle, metres. */
  height: Float32Array;
  /** Slope at the cell's middle, degrees. */
  slope: Float32Array;
  /** Area, m². */
  area: Float32Array;
  /** The kept cells of each region: a start into the arrays above per region, and the end. */
  start: Int32Array;
}

const P = v3(), Q = v3(), E = v3(), N = v3(), U = v3();

/** A tangent frame at unit p: east and north. */
function frame(p: V3, east: V3, north: V3): void {
  // east is the equator's way round, except at the poles where any tangent will do
  if (Math.abs(p.y) > 0.999) { east.x = 1; east.y = 0; east.z = 0; } else { east.x = -p.z; east.y = 0; east.z = p.x; }
  const d = dot(east, p);
  east.x -= p.x * d; east.y -= p.y * d; east.z -= p.z * d;
  normalize(east);
  cross(north, p, east);
}

/** The ground's slope at unit p, degrees, and its normal into n. */
function slopeAt(p: V3, n: V3): number {
  frame(p, E, N);
  const step = 0.9 / R, h = (a: number, b: number) => {
    Q.x = p.x + (E.x * a + N.x * b) * step; Q.y = p.y + (E.y * a + N.y * b) * step; Q.z = p.z + (E.z * a + N.z * b) * step;
    return heightAt(normalize(Q));
  };
  const gx = (h(1, 0) - h(-1, 0)) / 1.8, gy = (h(0, 1) - h(0, -1)) / 1.8;
  n.x = p.x - E.x * gx - N.x * gy; n.y = p.y - E.y * gx - N.y * gy; n.z = p.z - E.z * gx - N.z * gy;
  normalize(n);
  return Math.atan(Math.hypot(gx, gy)) / DEG;
}

let ground: Ground | null = null;

/** Sorts the grid's cells by region, keeping those any plant could grow on. */
function survey(regions: number): Ground {
  if (ground) return ground;
  const total = 6 * G * G;
  const region = new Int8Array(total).fill(-1);
  const height = new Float32Array(total), slope = new Float32Array(total), area = new Float32Array(total);
  const counts = new Int32Array(regions);
  const a = v3(), b = v3(), c = v3();
  for (let f = 0; f < 6; f++) {
    for (let j = 0; j < G; j++) {
      for (let i = 0; i < G; i++) {
        const k = (f * G + j) * G + i;
        const u = ((i + 0.5) / G) * 2 - 1, v = ((j + 0.5) / G) * 2 - 1;
        faceDir(f, u, v, P);
        const h = heightAt(P);
        if (h < DEEPEST) continue;
        const r = regionAt(P);
        region[k] = r;
        height[k] = h;
        slope[k] = slopeAt(P, U);
        // the cell's area from its corners
        faceDir(f, (i / G) * 2 - 1, (j / G) * 2 - 1, a);
        faceDir(f, ((i + 1) / G) * 2 - 1, (j / G) * 2 - 1, b);
        faceDir(f, (i / G) * 2 - 1, ((j + 1) / G) * 2 - 1, c);
        const ex = b.x - a.x, ey = b.y - a.y, ez = b.z - a.z, nx = c.x - a.x, ny = c.y - a.y, nz = c.z - a.z;
        area[k] = Math.hypot(ey * nz - ez * ny, ez * nx - ex * nz, ex * ny - ey * nx) * R * R;
        counts[r]++;
      }
    }
  }
  const start = new Int32Array(regions + 1);
  for (let r = 0; r < regions; r++) start[r + 1] = start[r] + counts[r];
  const n = start[regions];
  const out: Ground = { cell: new Int32Array(n), height: new Float32Array(n), slope: new Float32Array(n), area: new Float32Array(n), start };
  const at = start.slice(0, regions);
  for (let k = 0; k < total; k++) {
    const r = region[k];
    if (r < 0) continue;
    const s = at[r]++;
    out.cell[s] = k; out.height[s] = height[k]; out.slope[s] = slope[k]; out.area[s] = area[k];
  }
  return (ground = out);
}

// ---------------------------------------------------------------- spacing

/** A hash grid of the trunks placed so far in one region, for kinds that keep their distance. */
class Trunks {
  readonly #cells = new Map<number, number[]>();
  readonly #size = 8;
  #key(x: number, y: number, z: number): number {
    const s = this.#size;
    return ((Math.floor(x / s) + 512) * 1024 + (Math.floor(y / s) + 512)) * 1024 + (Math.floor(z / s) + 512);
  }
  /** True if nothing within `d` metres of (x, y, z) stands on reserved ground. */
  free(x: number, y: number, z: number, d: number): boolean {
    const s = this.#size, reach = Math.ceil(d / s);
    const cx = Math.floor(x / s), cy = Math.floor(y / s), cz = Math.floor(z / s);
    for (let a = -reach; a <= reach; a++) for (let b = -reach; b <= reach; b++) for (let c = -reach; c <= reach; c++) {
      const list = this.#cells.get(((cx + a + 512) * 1024 + (cy + b + 512)) * 1024 + (cz + c + 512));
      if (!list) continue;
      for (let i = 0; i < list.length; i += 4) {
        const dx = list[i] - x, dy = list[i + 1] - y, dz = list[i + 2] - z, need = Math.max(d, list[i + 3]);
        if (dx * dx + dy * dy + dz * dz < need * need) return false;
      }
    }
    return true;
  }
  add(x: number, y: number, z: number, d: number): void {
    const k = this.#key(x, y, z);
    const list = this.#cells.get(k);
    if (list) list.push(x, y, z, d);
    else this.#cells.set(k, [x, y, z, d]);
  }
}

// ---------------------------------------------------------------- planting

/** Grows every kind, in order: kinds that keep their distance should come first, the biggest first. */
export function scatter(specs: readonly ScatterSpec[], clearings: readonly Clearing[], regions: number): Scattered[] {
  const g = survey(regions);
  const trunks = new Map<number, Trunks>();
  return specs.map((s) => plant(g, s, clearings, trunks.get(s.region) ?? trunks.set(s.region, new Trunks()).get(s.region)!));
}

function plant(g: Ground, s: ScatterSpec, clearings: readonly Clearing[], trunks: Trunks): Scattered {
  const out: number[] = [], variants: number[] = [];
  if (s.density <= 0) return { data: new Float32Array(0), variant: new Uint8Array(0) };
  const from = g.start[s.region], to = g.start[s.region + 1];
  // a cell is a candidate if any of it could fit: the height range widened by what the slope can change across it
  const pad = 1.6;
  const cells: number[] = [], weights: number[] = [];
  let sum = 0, groundArea = 0;
  const sharp = 1 + s.clump * 5;
  for (let k = from; k < to; k++) {
    const h = g.height[k], sl = g.slope[k];
    const span = pad * Math.tan(Math.min(sl, 80) * DEG) + 0.3;
    if (h + span < s.minHeight || h - span > s.maxHeight) continue;
    if (sl > s.maxSlope + 8 || sl < s.minSlope - 8) continue;
    const c = g.cell[k], f = Math.floor(c / (G * G)), j = Math.floor((c % (G * G)) / G), i = c % G;
    faceDir(f, ((i + 0.5) / G) * 2 - 1, ((j + 0.5) / G) * 2 - 1, P);
    let clear = true;
    for (const q of clearings) if (dot(P, q.at) > Math.cos(q.r / R)) { clear = false; break; }
    if (!clear) continue;
    // the clumping field: noise at the grove's size, sharpened by how much the kind gathers
    const sc = R / Math.max(s.grove, 1);
    const n = noise3(P.x * sc, P.y * sc, P.z * sc, s.seed) * 0.7 + noise3(P.x * sc * 2.3, P.y * sc * 2.3, P.z * sc * 2.3, s.seed + 1) * 0.3;
    const w = s.clump > 0 ? Math.pow(Math.max(0, (n - 0.25 * s.clump) / (1 - 0.25 * s.clump)), sharp) : 1;
    cells.push(k);
    weights.push(w);
    sum += w * g.area[k];
    groundArea += g.area[k];
  }
  if (!cells.length || sum <= 0) return { data: new Float32Array(0), variant: new Uint8Array(0) };
  const norm = groundArea / sum;
  const rand = stream(s.seed * 2654435761 + s.region * 97);
  const n = v3(), up = v3(), x = v3(), z = v3();
  for (let ci = 0; ci < cells.length; ci++) {
    const k = cells[ci];
    const expect = (s.density / 100) * g.area[k] * weights[ci] * norm;
    let count = Math.floor(expect);
    if (rand() < expect - count) count++;
    if (!count) continue;
    const c = g.cell[k], f = Math.floor(c / (G * G)), j = Math.floor((c % (G * G)) / G), i = c % G;
    for (let m = 0; m < count; m++) {
      faceDir(f, ((i + rand()) / G) * 2 - 1, ((j + rand()) / G) * 2 - 1, P);
      const h = heightAt(P);
      if (h < s.minHeight || h > s.maxHeight) continue;
      const sl = slopeAt(P, n);
      if (sl > s.maxSlope || sl < s.minSlope) continue;
      const size = s.size[0] + (s.size[1] - s.size[0]) * rand();
      const lift = s.anchor === 'surface' ? 0 : h;
      const sink = s.anchor === 'ground' ? Math.min(0.5, 0.06 + Math.tan(Math.min(sl, 70) * DEG) * 0.12) * size : 0.05;
      const r = R + lift - sink;
      const px = P.x * r, py = P.y * r, pz = P.z * r;
      if (s.spacing > 0) {
        const d = s.spacing * size;
        if (!trunks.free(px, py, pz, d)) continue;
        trunks.add(px, py, pz, d);
      }
      // the plant's frame
      if (s.anchor === 'wall') {
        up.x = P.x; up.y = P.y; up.z = P.z;
        // out of the face, level
        const d = dot(n, P);
        z.x = n.x - P.x * d; z.y = n.y - P.y * d; z.z = n.z - P.z * d;
        if (Math.hypot(z.x, z.y, z.z) < 1e-4) { frame(P, z, x); }
        normalize(z);
        cross(x, up, z);
      } else {
        const t = s.anchor === 'surface' ? 0 : s.tilt;
        up.x = P.x + (n.x - P.x) * t; up.y = P.y + (n.y - P.y) * t; up.z = P.z + (n.z - P.z) * t;
        normalize(up);
        frame(up, E, N);
        const a = rand() * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
        x.x = E.x * ca + N.x * sa; x.y = E.y * ca + N.y * sa; x.z = E.z * ca + N.z * sa;
        cross(z, x, up);
      }
      const q = quaternion(x, up, z);
      out.push(px, py, pz, size, q[0], q[1], q[2], q[3]);
      variants.push(Math.floor(rand() * s.variants) % s.variants);
    }
  }
  return { data: new Float32Array(out), variant: new Uint8Array(variants) };
}

/** The quaternion of the rotation whose columns are x, y, z. */
function quaternion(x: V3, y: V3, z: V3): [number, number, number, number] {
  const m00 = x.x, m10 = x.y, m20 = x.z, m01 = y.x, m11 = y.y, m21 = y.z, m02 = z.x, m12 = z.y, m22 = z.z;
  const tr = m00 + m11 + m22;
  if (tr > 0) {
    const s = 0.5 / Math.sqrt(tr + 1);
    return [(m21 - m12) * s, (m02 - m20) * s, (m10 - m01) * s, 0.25 / s];
  }
  if (m00 > m11 && m00 > m22) {
    const s = 2 * Math.sqrt(1 + m00 - m11 - m22);
    return [0.25 * s, (m01 + m10) / s, (m02 + m20) / s, (m21 - m12) / s];
  }
  if (m11 > m22) {
    const s = 2 * Math.sqrt(1 + m11 - m00 - m22);
    return [(m01 + m10) / s, 0.25 * s, (m12 + m21) / s, (m02 - m20) / s];
  }
  const s = 2 * Math.sqrt(1 + m22 - m00 - m11);
  return [(m02 + m20) / s, (m12 + m21) / s, 0.25 * s, (m10 - m01) / s];
}
