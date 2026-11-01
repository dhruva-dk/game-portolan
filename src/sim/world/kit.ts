// The shape kit every region builds its terrain from: noise, signed distances and height profiles, all in a
// region's local chart (metres east and north of its centre). Ported from the old game's geography.ts and
// rescaled to metres. Each region composes these in its own code; nothing here is a terrain on its own.
//
// Deterministic: only + - * /, Math.sqrt/floor/abs/min/max/imul and ../math.ts helpers.
import { dcos, dsin } from '../math.ts';
import type { PropKind, PropSpec } from './spec.ts';

export const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);
export const mix = (a: number, b: number, t: number): number => a + (b - a) * t;
export const hyp = (x: number, y: number): number => Math.sqrt(x * x + y * y);

export function smoothstep(a: number, b: number, x: number): number {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
}

/** Smooth maximum and minimum with a blend radius k. */
export function smax(a: number, b: number, k: number): number {
  const h = clamp01(0.5 + (0.5 * (b - a)) / k);
  return a + (b - a) * h + k * h * (1 - h);
}
export function smin(a: number, b: number, k: number): number {
  const h = clamp01(0.5 + (0.5 * (b - a)) / k);
  return b + (a - b) * h - k * h * (1 - h);
}

// ---------------------------------------------------------------------------------------------------------
// Noise

const G = 0.7071067811865476;
const GX = new Float64Array([1, -1, 0, 0, G, -G, G, -G]), GY = new Float64Array([0, 0, 1, -1, G, G, -G, -G]);

export function lattice(ix: number, iy: number, s: number): number {
  let h = Math.imul(ix, 0x8da6b343) ^ Math.imul(iy, 0xd8163841) ^ s;
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
  return (h ^ (h >>> 15)) >>> 0;
}

/** A hash of two integers and a seed, in [0, 1). */
export const hash01 = (ix: number, iy: number, s: number): number => lattice(ix, iy, s) * 2.3283064365386963e-10;

/** Gradient noise, roughly in [-1, 1], with features about one unit across. */
export function noise(x: number, y: number, s: number): number {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
  const ux = fx * fx * fx * (fx * (fx * 6 - 15) + 10), uy = fy * fy * fy * (fy * (fy * 6 - 15) + 10);
  const ka = lattice(ix, iy, s) & 7, kb = lattice(ix + 1, iy, s) & 7;
  const kc = lattice(ix, iy + 1, s) & 7, kd = lattice(ix + 1, iy + 1, s) & 7;
  const a = GX[ka] * fx + GY[ka] * fy, b = GX[kb] * (fx - 1) + GY[kb] * fy;
  const c = GX[kc] * fx + GY[kc] * (fy - 1), d = GX[kd] * (fx - 1) + GY[kd] * (fy - 1);
  return 1.4 * (a + (b - a) * ux + (c - a + (a - b - c + d) * ux) * uy);
}

export function fbm(x: number, y: number, s: number, octaves: number): number {
  let sum = 0, amp = 0.6;
  for (let o = 0; o < octaves; o++) {
    sum += amp * noise(x, y, s + o * 7919);
    x = x * 2.03 + 17.1;
    y = y * 2.03 - 9.7;
    amp *= 0.45;
  }
  return sum;
}

/** Ridged noise in [0, 1]: sharp crests where the noise crosses zero. */
export function ridged(x: number, y: number, s: number): number {
  const n = 1 - Math.abs(noise(x, y, s));
  return n * n;
}

// ---------------------------------------------------------------------------------------------------------
// Signed distances (negative inside)

export function segDist(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax, dy = by - ay, qx = px - ax, qy = py - ay, l2 = dx * dx + dy * dy;
  const t = l2 > 0 ? clamp01((qx * dx + qy * dy) / l2) : 0;
  return hyp(qx - dx * t, qy - dy * t);
}

/** Distance to a polyline given as flat x, y pairs. */
export function polyDist(px: number, py: number, pts: readonly number[]): number {
  let d = 1e9;
  for (let i = 0; i + 3 < pts.length; i += 2) {
    const s = segDist(px, py, pts[i], pts[i + 1], pts[i + 2], pts[i + 3]);
    if (s < d) d = s;
  }
  return d;
}

/**
 * Signed distance to a tapered stroke: flat x, y, r triples, each segment a capsule whose radius runs from one
 * point's r to the next. Strokes are how coastlines, ridges and walls are drawn.
 */
export function strokeDist(px: number, py: number, pts: readonly number[]): number {
  let d = 1e9;
  for (let i = 0; i + 5 < pts.length; i += 3) {
    const ax = pts[i], ay = pts[i + 1], ra = pts[i + 2], bx = pts[i + 3], by = pts[i + 4], rb = pts[i + 5];
    const dx = bx - ax, dy = by - ay, qx = px - ax, qy = py - ay, l2 = dx * dx + dy * dy;
    const t = l2 > 0 ? clamp01((qx * dx + qy * dy) / l2) : 0;
    const s = hyp(qx - dx * t, qy - dy * t) - (ra + (rb - ra) * t);
    if (s < d) d = s;
  }
  if (pts.length === 3) d = hyp(px - pts[0], py - pts[1]) - pts[2];
  return d;
}

/** Signed distance to an ellipse-ish blob, stretched along a bearing (degrees, clockwise from north). */
export function blobDist(px: number, py: number, cx: number, cy: number, rx: number, ry: number, sinB: number, cosB: number): number {
  const dx = px - cx, dy = py - cy, u = dx * cosB - dy * sinB, v = dx * sinB + dy * cosB;
  const k = hyp(u / rx, v / ry);
  return (k - 1) * Math.min(rx, ry);
}

// ---------------------------------------------------------------------------------------------------------
// Height profiles

/**
 * Every profile below falls to -DEEP by the end of its reach, below any region's sea floor, so a region can
 * combine them with `over` against its own floor and skip them beyond their reach without leaving a seam.
 */
export const DEEP = 60;

/**
 * A coast from a signed distance sd (negative on land): land rises to `top` over `run` metres; off the shore a
 * shelf falls gently to -shelfDepth over `shelf` metres, then drops away to -DEEP over the next 20.
 * Reach: shelf + 20 metres.
 */
export function shore(sd: number, top: number, run: number, shelfDepth: number, shelf: number): number {
  if (sd <= 0) {
    const t = clamp01(-sd / run);
    return top * t * (2 - t);
  }
  if (sd < shelf) {
    const t = sd / shelf;
    return -shelfDepth * t * (2 - t);
  }
  return -shelfDepth - (DEEP - shelfDepth) * smoothstep(0, 20, sd - shelf);
}

/** A cliffed coast: land stands at `top` within `wall` metres, and the sea bed plunges to -DEEP within `shelf`. */
export function cliff(sd: number, top: number, wall: number, shelf: number): number {
  if (sd <= 0) return top * smoothstep(0, wall, -sd);
  return -DEEP * Math.sqrt(clamp01(sd / shelf));
}

/** A smooth dome of radius r and height top, plunging to -DEEP within `skirt` metres outside its rim. */
export function dome(rho: number, r: number, top: number, skirt: number): number {
  const u = rho / r;
  if (u < 1) return top * (1 - u * u) * (1 - u * u * 0.4);
  return -DEEP * smoothstep(0, skirt, rho - r);
}

/** A sheer needle or column of radius r: flat top at h, near-vertical walls. Reach: r + 5 + 0.3 r. */
export function needle(rho: number, r: number, h: number): number {
  const u = rho - r;
  if (u < 0) return h * smoothstep(0, Math.min(3, r * 0.4), -u);
  return -DEEP * smoothstep(0, 5 + r * 0.3, u);
}

/** A ring (atoll rim, crater wall, cliff ring) of radius r and half-width w, cresting at `crest`. */
export function ringBand(rho: number, r: number, w: number, crest: number, base: number): number {
  const t = Math.abs(rho - r) / w;
  if (t >= 1) return base;
  const s = 1 - t * t;
  return base + (crest - base) * s * s * (3 - 2 * s);
}

/** Smooth union of landforms: the higher wins, blended over k metres. */
export const over = (a: number, b: number, k = 2): number => smax(a, b, k);

// ---------------------------------------------------------------------------------------------------------
// Scatter: features dropped one per cell on a jittered grid, defined everywhere (so beyond a region's border).

export interface Scattered {
  /** Offset from the feature's centre. */
  dx: number;
  dy: number;
  /** Three hashes in [0, 1) for the feature's size, height and shape. */
  a: number;
  b: number;
  c: number;
}

const SC: Scattered = { dx: 0, dy: 0, a: 0, b: 0, c: 0 };

/**
 * The highest of `f` over the scattered features near (x, y). `keep` is the share of cells holding a feature,
 * `reach` how far (in cells) a feature can matter. `skip(cx, cy)` drops features whose centre is unwanted.
 */
export function scatter(
  x: number, y: number, cell: number, seed: number, keep: number, base: number,
  f: (s: Scattered) => number, skip?: (cx: number, cy: number) => boolean,
): number {
  const fx = x / cell, fy = y / cell, ix = Math.floor(fx), iy = Math.floor(fy);
  let v = base;
  for (let j = -1; j <= 1; j++) {
    for (let i = -1; i <= 1; i++) {
      const h = lattice(ix + i, iy + j, seed);
      if ((h & 1023) >= keep * 1024) continue;
      const cx = (ix + i + 0.15 + 0.7 * (((h >>> 10) & 255) / 255)) * cell;
      const cy = (iy + j + 0.15 + 0.7 * (((h >>> 18) & 255) / 255)) * cell;
      if (skip && skip(cx, cy)) continue;
      SC.dx = x - cx;
      SC.dy = y - cy;
      SC.a = hash01(ix + i, iy + j, seed + 1);
      SC.b = hash01(ix + i, iy + j, seed + 2);
      SC.c = hash01(ix + i, iy + j, seed + 3);
      const w = f(SC);
      if (w > v) v = w;
    }
  }
  return v;
}

// ---------------------------------------------------------------------------------------------------------
// Placing things

/** Points evenly around an arc, as flat x, y pairs. Bearings in degrees, clockwise from north. */
export function arcPts(cx: number, cy: number, r: number, b0: number, b1: number, n: number): number[] {
  const out: number[] = [];
  for (let i = 0; i <= n; i++) {
    const a = ((b0 + ((b1 - b0) * i) / n) * 3.141592653589793) / 180;
    out.push(cx + r * dsin(a), cy + r * dcos(a));
  }
  return out;
}

/** Every scattered feature whose centre lies in the box, in the same order and with the same hashes as scatter. */
export function scatterPoints(
  x0: number, y0: number, x1: number, y1: number, cell: number, seed: number, keep: number,
  skip?: (cx: number, cy: number) => boolean,
): { x: number; y: number; a: number; b: number; c: number }[] {
  const out: { x: number; y: number; a: number; b: number; c: number }[] = [];
  for (let iy = Math.floor(y0 / cell) - 1; iy <= Math.floor(y1 / cell) + 1; iy++) {
    for (let ix = Math.floor(x0 / cell) - 1; ix <= Math.floor(x1 / cell) + 1; ix++) {
      const h = lattice(ix, iy, seed);
      if ((h & 1023) >= keep * 1024) continue;
      const cx = (ix + 0.15 + 0.7 * (((h >>> 10) & 255) / 255)) * cell;
      const cy = (iy + 0.15 + 0.7 * (((h >>> 18) & 255) / 255)) * cell;
      if (cx < x0 || cx > x1 || cy < y0 || cy > y1 || (skip && skip(cx, cy))) continue;
      out.push({ x: cx, y: cy, a: hash01(ix, iy, seed + 1), b: hash01(ix, iy, seed + 2), c: hash01(ix, iy, seed + 3) });
    }
  }
  return out;
}

/**
 * Voronoi cells on a jittered grid: F1 and F2 are the distances to the nearest and second-nearest cell points,
 * and `id` is a hash of the nearest. (F2 - F1) / 2 is the distance to the nearest cell edge, so thresholding it
 * cuts land into islands separated by channels along the edges.
 */
export const CELLS = { f1: 0, f2: 0, id: 0, cx: 0, cy: 0 };
export function cells(x: number, y: number, cell: number, seed: number, jitter = 0.8): typeof CELLS {
  const fx = x / cell, fy = y / cell, ix = Math.floor(fx), iy = Math.floor(fy);
  let f1 = 1e9, f2 = 1e9, id = 0, bx = 0, by = 0;
  for (let j = -1; j <= 1; j++) {
    for (let i = -1; i <= 1; i++) {
      const h = lattice(ix + i, iy + j, seed);
      const px = (ix + i + 0.5 + jitter * ((h & 1023) / 1023 - 0.5)) * cell;
      const py = (iy + j + 0.5 + jitter * (((h >>> 10) & 1023) / 1023 - 0.5)) * cell;
      const d = hyp(x - px, y - py);
      if (d < f1) { f2 = f1; f1 = d; id = h; bx = px; by = py; }
      else if (d < f2) f2 = d;
    }
  }
  CELLS.f1 = f1; CELLS.f2 = f2; CELLS.id = id; CELLS.cx = bx; CELLS.cy = by;
  return CELLS;
}

// Ring regions sit at latitude ±31°. In a ring region's chart, how far a point is from the equator, in metres
// (positive inside the region's own hemisphere). `R` is the planet radius; `south` is true for the southern ring.
const SIN31 = 0.5150380749100542, COS31 = 0.8571673007021123;
export function fromEquator(x: number, y: number, R: number, south: boolean): number {
  const w = Math.sqrt(Math.max(0, 1 - (x * x + y * y) / (R * R)));
  return south ? R * SIN31 * w - COS31 * y : R * SIN31 * w + COS31 * y;
}

/** Quantises (x, y) to the centre of a hexagonal cell of the given size: columnar basalt, honeycomb, cracked mud. */
export const HEX = { x: 0, y: 0, id: 0 };
export function hexCell(x: number, y: number, size: number): typeof HEX {
  const q = ((x * 0.5773502691896258 - y / 3) / size), r = ((y * 2) / 3) / size;
  // Cube rounding.
  const cx = q, cz = r, cy = -cx - cz;
  let rx = Math.round(cx), ry = Math.round(cy), rz = Math.round(cz);
  const dx = Math.abs(rx - cx), dy = Math.abs(ry - cy), dz = Math.abs(rz - cz);
  if (dx > dy && dx > dz) rx = -ry - rz;
  else if (dy > dz) ry = -rx - rz;
  else rz = -rx - ry;
  HEX.x = size * 1.7320508075688772 * (rx + rz / 2);
  HEX.y = size * 1.5 * rz;
  HEX.id = lattice(rx, rz, 0x4e8);
  return HEX;
}

/**
 * Plants props of one kind on a jittered grid over a box, wherever the ground is between lo and hi metres.
 * Each stands `tall` metres (give or take a third) above the ground it grows from.
 */
export function plant(
  height: (x: number, y: number) => number, kind: PropKind, box: readonly [number, number, number, number],
  cell: number, seed: number, keep: number, lo: number, hi: number, r: number, tall: number,
): PropSpec[] {
  const out: PropSpec[] = [];
  for (const s of scatterPoints(box[0], box[1], box[2], box[3], cell, seed, keep)) {
    const g = height(s.x, s.y);
    if (g < lo || g > hi) continue;
    out.push({ kind, x: s.x, y: s.y, r: r * (0.8 + 0.4 * s.a), height: g + tall * (0.7 + 0.6 * s.b) });
  }
  return out;
}

const wetAt =(height: (x: number, y: number) => number, x: number, y: number, depth: number): boolean =>
  height(x, y) < -depth && height(x + 5, y) < -depth + 1 && height(x - 5, y) < -depth + 1
  && height(x, y + 5) < -depth + 1 && height(x, y - 5) < -depth + 1;

/**
 * Moves each x, y pair to the nearest point (searching outward in rings) where `height` is below -depth with a
 * margin all round, so a loot spot written near a channel lands in it. Deterministic.
 */
export function snapWet(height: (x: number, y: number) => number, pts: readonly number[], depth: number): number[] {
  const out: number[] = [];
  for (let i = 0; i + 1 < pts.length; i += 2) {
    const x = pts[i], y = pts[i + 1];
    let bx = x, by = y, found = false;
    for (let r = 0; r <= 80 && !found; r += 3) {
      const n = r === 0 ? 1 : Math.max(8, Math.round(r * 1.5));
      for (let k = 0; k < n && !found; k++) {
        const a = (k / n) * 6.283185307179586, px = x + r * dsin(a), py = y + r * dcos(a);
        if (wetAt(height, px, py, depth)) { bx = px; by = py; found = true; }
      }
    }
    out.push(bx, by);
  }
  return out;
}
