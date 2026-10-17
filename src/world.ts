// Seeded planet generation: archipelagos, landmarks and the height field. Pure data, no rendering.
// Everything here feeds the simulation (islands are solid), so it uses the deterministic d* math.
//
// Every island is drawn in its own tangent plane (world units) from a handful of strokes: tapered
// capsules for bodies, ridges, headlands and spits, discs carved out for bays, a reef ring for atolls,
// columns for stacks, sandbars, a cone for the volcano. The strokes give a signed coast distance D;
// height is a C1 profile of D (beach or cliff, blended by a smooth cliffness field) plus inland relief,
// so every coast gets the chart's clean bands: berm, sandbar, turquoise lagoon, reef crest, blue shelf,
// deep water. Archipelagos share a shelf; islands, shelves and the abyssal floor are joined with smooth
// maxima, so the whole planet is one C1 field.
import {
  R, PI, HN, SOLID, Rng, type V3, type FaceUV, v3, dot, cross, normalize, chord, clamp01, mix, sphereDir,
  dsin, dcos, dtan, dasin, faceUV, gnomonicUV, gnomonicDir, wrapCell, smoothstep,
} from './sim.ts';

export type Climate = 'tropical' | 'temperate' | 'polar';
/** Landform. The biome comes from `climate`: a tropical 'forest' island is jungle, a temperate one pine wood. */
export type IslandKind = 'atoll' | 'greatAtoll' | 'volcano' | 'forest' | 'waterfall' | 'stacks' | 'basalt' | 'village' | 'cay';

export interface Island {
  id: number;
  kind: IslandKind;
  climate: Climate;
  center: V3; // unit vector
  radius: number; // footprint radius including reef and shelf drop-off, world units
  peak: number; // highest point above sea level, world units
  seed: number;
  sand: 'white' | 'gold' | 'black'; // beach colour: coral sand, temperate sand, volcanic sand / polar shingle
  rock: 'limestone' | 'sandstone' | 'basalt'; // cliff material: pale reef rock, layered strata, dark columns
}

export type SiteKind =
  | 'lighthouse' | 'village' | 'hut' | 'pier' | 'waterfall' | 'arch' | 'stack' | 'caldera' | 'lavaflow' | 'channel'
  | 'buoy' | 'pole';

/**
 * A hand-picked spot for a landmark or prop. `pos` is a unit vector, `facing` a unit tangent at `pos`.
 *   lighthouse  level pad on top of a cliffed headland (h ≥ 4); facing = seaward (open water within 8 u);
 *               size = pad radius (flat to ±0.15); height = ground height
 *   village     centre of the stilt-hut cluster in a round sheltered bay; facing = toward the bay mouth;
 *               size = radius of the flat shallow floor (≈ -0.5, non-navigable); height = floor height
 *   hut         one stilt hut over the bay floor; facing = toward the pier; size = footprint radius;
 *               height = seabed, in (-0.75, -0.25), coastAt < -1.5 so no hull reaches it
 *   pier        root of the timber pier on the beach; facing = along the pier, seaward; size = length (its far end
 *               stands in the flat, coastAt < -10); height = ground at the root
 *   waterfall   lip of the fall at the top of a sheer cliff (18-24 u); facing = seaward; size = drop = height;
 *               the sea is ≥ 9 u deep within 6 u of the lip
 *   arch        midpoint between the feet at sea level; facing = foot A → foot B; size = span between foot centres;
 *               height = crown top. Each foot is also a 'stack' site; the water under the span is a rock sill
 *               (≈ -0.5, coastAt < -0.9), never navigable
 *   stack       sea stack (every column at least 6 u tall); facing = away from the island centre;
 *               size = waterline radius; height = top
 *   caldera     crater centre; size = rim radius; height = rim height (the floor is height(pos))
 *   lavaflow    vent of an old flow on the outer rim; facing = downhill; size = path length; height = vent height;
 *               path = centreline from the vent across its delta into the sea (last point under water)
 *   channel     the single pass through the great atoll's reef; facing = lagoon → open sea; size = navigable width;
 *               height = floor. The lagoon behind it is navigable.
 *   buoy        cask buoy in shallow non-navigable water (h in (SOLID, -0.38), coastAt < -1); size = cask length;
 *               height = seabed
 *   pole        marker pole in shallow non-navigable water (h in (SOLID, -0.05), coastAt < -1); facing = lean
 *               direction; size = height above water; height = seabed
 */
export interface Site {
  kind: SiteKind;
  island: number; // island id, -1 for open water
  pos: V3;
  facing: V3;
  size: number;
  height: number;
  path?: V3[]; // lavaflow only
}

export interface World {
  seed: number;
  islands: Island[];
  sites: Site[];
  /** Height above sea level per HN cell centre, world units (seabed negative; smoothly interpolated below -20). */
  heights: Float32Array;
  /** Signed distance to the navigable boundary per HN cell, world units (>0 navigable water), capped at ±60. */
  coast: Float32Array;
  /** Exact height above sea level at a unit direction (seabed negative). */
  height(p: V3): number;
  /** `coast` bilinearly interpolated at a unit direction. */
  coastAt(p: V3): number;
  /** 0 tropical … 1 temperate … 2 polar, continuous. */
  climate(p: V3): number;
}

const DEEP = -60; // every island and shelf field sinks to this outside its reach, below any abyssal floor
const COAST_CAP = 60;
const NC = 24; // spatial index cells per cube-face edge
const REEF = 0, SHELF = 1, STEEP = 2; // underwater profile families

// ---------------------------------------------------------------------------------------------
// Smooth scalar helpers, C1 Hermite splines and 2D gradient noise (integer hashing only).
const hyp = (x: number, y: number) => Math.sqrt(x * x + y * y);
function smax(a: number, b: number, k: number): number {
  const h = clamp01(0.5 + (0.5 * (b - a)) / k);
  return a + (b - a) * h + k * h * (1 - h);
}
function smin(a: number, b: number, k: number): number {
  const h = clamp01(0.5 + (0.5 * (b - a)) / k);
  return b + (a - b) * h - k * h * (1 - h);
}
function herm(x: number, x0: number, x1: number, y0: number, y1: number, m0: number, m1: number): number {
  const d = x1 - x0, t = (x - x0) / d, t2 = t * t, t3 = t2 * t;
  return (2 * t3 - 3 * t2 + 1) * y0 + (t3 - 2 * t2 + t) * d * m0 + (3 * t2 - 2 * t3) * y1 + (t3 - t2) * d * m1;
}
// Knots (x, y, slope) for spline(); profiles are rebuilt per sample because their knots vary along the coast.
const KX = new Float64Array(8), KY = new Float64Array(8), KM = new Float64Array(8);
function knot(i: number, x: number, y: number, m: number): void {
  KX[i] = x; KY[i] = y; KM[i] = m;
}
/** Piecewise cubic through knots 0..n-1, flat outside (end slopes are always 0). */
function spline(x: number, n: number): number {
  if (x <= KX[0]) return KY[0];
  for (let i = 1; i < n; i++) if (x < KX[i]) return herm(x, KX[i - 1], KX[i], KY[i - 1], KY[i], KM[i - 1], KM[i]);
  return KY[n - 1];
}

const G = 0.7071067811865476;
const GX = new Float64Array([1, -1, 0, 0, G, -G, G, -G]), GY = new Float64Array([0, 0, 1, -1, G, G, -G, -G]);
function corner(ix: number, iy: number, s: number, fx: number, fy: number): number {
  let h = Math.imul(ix, 0x8da6b343) ^ Math.imul(iy, 0xd8163841) ^ s;
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
  const k = (h ^ (h >>> 15)) & 7;
  return GX[k] * fx + GY[k] * fy;
}
/** Gradient noise, C2, roughly [-1, 1]. */
function noise(x: number, y: number, s: number): number {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
  const ux = fx * fx * fx * (fx * (fx * 6 - 15) + 10), uy = fy * fy * fy * (fy * (fy * 6 - 15) + 10);
  const a = corner(ix, iy, s, fx, fy), b = corner(ix + 1, iy, s, fx - 1, fy);
  const c = corner(ix, iy + 1, s, fx, fy - 1), d = corner(ix + 1, iy + 1, s, fx - 1, fy - 1);
  return 1.4 * (a + (b - a) * ux + (c - a + (a - b - c + d) * ux) * uy);
}
let warpX = 0, warpY = 0; // the two channels of the last warp() call
/** Two independent gradient-noise channels from one lattice walk (a domain warp). */
function warp(x: number, y: number, s: number): void {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
  const ux = fx * fx * fx * (fx * (fx * 6 - 15) + 10), uy = fy * fy * fy * (fy * (fy * 6 - 15) + 10);
  let a = 0, b = 0, c = 0, d = 0, e = 0, f = 0, g = 0, h = 0;
  for (let k = 0; k < 4; k++) {
    const cx = k & 1, cy = k >> 1, gx = fx - cx, gy = fy - cy;
    let q = Math.imul(ix + cx, 0x8da6b343) ^ Math.imul(iy + cy, 0xd8163841) ^ s;
    q = Math.imul(q ^ (q >>> 15), 0x2c1b3c6d);
    q = Math.imul(q ^ (q >>> 12), 0x297a2d39);
    q ^= q >>> 15;
    const v = GX[q & 7] * gx + GY[q & 7] * gy, w = GX[(q >>> 3) & 7] * gx + GY[(q >>> 3) & 7] * gy;
    if (k === 0) { a = v; e = w; } else if (k === 1) { b = v; f = w; } else if (k === 2) { c = v; g = w; } else { d = v; h = w; }
  }
  warpX = 1.4 * (a + (b - a) * ux + (c - a + (a - b - c + d) * ux) * uy);
  warpY = 1.4 * (e + (f - e) * ux + (g - e + (e - f - g + h) * ux) * uy);
}
function fbm(x: number, y: number, s: number, octaves: number): number {
  let sum = 0, amp = 0.6;
  for (let o = 0; o < octaves; o++) {
    sum += amp * noise(x, y, s + o * 7919);
    x = x * 2.03 + 17.1;
    y = y * 2.03 - 9.7;
    amp *= 0.45;
  }
  return sum;
}
/**
 * Sparse round knolls (coral heads, rock heads) on a jittered grid of `cell` world units, about `density` of the
 * cells holding one: 0 between knolls, rising smoothly to 1 on a crest.
 */
function knolls(x: number, y: number, cell: number, density: number, s: number): number {
  const fx = x / cell, fy = y / cell, ix = Math.floor(fx), iy = Math.floor(fy);
  let v = 0;
  for (let j = -1; j <= 1; j++) {
    for (let i = -1; i <= 1; i++) {
      let h = Math.imul(ix + i, 0x8da6b343) ^ Math.imul(iy + j, 0xd8163841) ^ s;
      h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
      h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
      h ^= h >>> 15;
      if ((h & 255) >= density * 256) continue;
      const dx = fx - ix - i - ((h >>> 8) & 255) / 255, dy = fy - iy - j - ((h >>> 16) & 255) / 255;
      const r = 0.2 + (0.3 * ((h >>> 24) & 255)) / 255, t = 1 - (dx * dx + dy * dy) / (r * r);
      if (t > 0) v = Math.max(v, t * t);
    }
  }
  return v;
}
function rot(x: number, y: number, a: number): [number, number] {
  const c = dcos(a), s = dsin(a);
  return [x * c - y * s, x * s + y * c];
}

// ---------------------------------------------------------------------------------------------
// Strokes, in island-local coordinates.
interface Cap { ax: number; ay: number; bx: number; by: number; ra: number; rb: number; top: number; cliff: number }
interface Disc { x: number; y: number; r: number; h: number }
interface Seg { ax: number; ay: number; bx: number; by: number; w: number; h: number }
interface Ring { r0: number; ecc: number; ux: number; uy: number; lobe: number; wc: number; wb: number; dl: number }
interface Cone { r: number; top: number; rc: number; floor: number }
interface Head { x: number; y: number; dx: number; dy: number }
/**
 * A site found while shaping an island, in its local frame; height defaults to the ground at (x, y). The arch keeps
 * its feet in `path`, in stroke coordinates (before the warp is undone).
 */
interface Mark { kind: SiteKind; x: number; y: number; dx: number; dy: number; size: number; height?: number; path?: number[] }

const cap = (ax: number, ay: number, bx: number, by: number, ra: number, rb: number, top = 0, cliff = 0): Cap =>
  ({ ax, ay, bx, by, ra, rb, top, cliff });

let capR = 0; // radius of the last capDist() at its closest axis point
function capDist(x: number, y: number, c: Cap): number {
  const dx = c.bx - c.ax, dy = c.by - c.ay, px = x - c.ax, py = y - c.ay, l2 = dx * dx + dy * dy;
  const t = l2 > 0 ? clamp01((px * dx + py * dy) / l2) : 0;
  capR = c.ra + (c.rb - c.ra) * t;
  return hyp(px - dx * t, py - dy * t) - capR;
}
let segT = 0; // parameter of the last segDist() closest point
function segDist(x: number, y: number, s: Seg): number {
  const dx = s.bx - s.ax, dy = s.by - s.ay, px = x - s.ax, py = y - s.ay, l2 = dx * dx + dy * dy;
  segT = l2 > 0 ? clamp01((px * dx + py * dy) / l2) : 0;
  return hyp(px - dx * segT, py - dy * segT);
}
/** Sea stack: vertical walls from a rounded top straight down to a narrow rocky skirt at -5. */
function column(x: number, y: number, c: Disc): number {
  const u = hyp(x - c.x, y - c.y) - c.r, sh = 0.3 * c.r, S = (2.4 * c.h) / sh, wd = Math.max(0.6, 12 / S);
  knot(0, -sh, c.h, 0); knot(1, 0, 0, -S); knot(2, wd, -5, 0); knot(3, wd + 12, DEEP, 0);
  return spline(u, 4);
}
/** Sandbar or rock sill along a segment, crest at h. */
function bar(x: number, y: number, b: Seg): number {
  knot(0, 0, b.h, 0); knot(1, b.w, b.h - 0.5, -0.4); knot(2, b.w + 5, -7, 0); knot(3, b.w + 20, DEEP, 0);
  return spline(segDist(x, y, b), 4);
}

// ---------------------------------------------------------------------------------------------
// Fields: anything with a tangent frame and a local height function, joined by smooth maxima.
interface Field { c: V3; e1: V3; e2: V3; cosInf: number; at(x: number, y: number): number }

function orient(f: Field, c: V3, angle: number, reach: number): void {
  const e = normalize(Math.abs(c.y) < 0.9 ? v3(c.z, 0, -c.x) : v3(0, -c.z, c.y));
  const n = cross(c, e, v3());
  const ca = dcos(angle), sa = dsin(angle);
  f.c = c;
  f.e1 = v3(e.x * ca + n.x * sa, e.y * ca + n.y * sa, e.z * ca + n.z * sa);
  f.e2 = cross(c, f.e1, v3());
  const s = Math.min(1, reach / R);
  f.cosInf = Math.sqrt(1 - s * s);
}
/** Unit direction of local point (x, y) on field f (inverse orthographic projection). */
function toDir(f: Field, x: number, y: number): V3 {
  const s = x / R, t = y / R, w = Math.sqrt(Math.max(0, 1 - s * s - t * t));
  return normalize(v3(f.e1.x * s + f.e2.x * t + f.c.x * w, f.e1.y * s + f.e2.y * t + f.c.y * w, f.e1.z * s + f.e2.z * t + f.c.z * w));
}
/** Unit tangent at p along local direction (dx, dy). */
function toTangent(f: Field, p: V3, dx: number, dy: number): V3 {
  const t = v3(f.e1.x * dx + f.e2.x * dy, f.e1.y * dx + f.e2.y * dy, f.e1.z * dx + f.e2.z * dy);
  const k = dot(t, p);
  return normalize(v3(t.x - k * p.x, t.y - k * p.y, t.z - k * p.z));
}

let strokeRel = 0, strokeCliff = 0; // inland relief and cliffness left by Isle.strokes()
let shoreN1 = 0, shoreN2 = 0, shoreC = 0, shoreHc = 0; // along-shore variation, cliffness, cliff height: Isle.coastline()

class Isle implements Field {
  c = v3(0, 0, 1);
  e1 = v3(1, 0, 0);
  e2 = v3(0, 1, 0);
  cosInf = 1;
  kind: IslandKind;
  seed: number;
  ns: number;
  climate: Climate = 'tropical';
  ext = 0; // radius of the strokes
  caps: Cap[] = [];
  bays: Disc[] = [];
  cols: Disc[] = [];
  bars: Seg[] = [];
  troughs: Seg[] = []; // channels cut to an absolute floor h
  gullies: Seg[] = []; // stream beds cut h deep, deepening toward b
  lava: Seg[] = []; // flow tongues raised h
  flats: Disc[] = []; // level shallow floors at h
  pads: Disc[] = []; // level ground at h
  boosts: Disc[] = []; // raise the cliff height to h and force cliffs
  // bays: coves carved out of the land, their floor as deep as the shallows h units offshore
  ring: Ring | null = null;
  cone: Cone | null = null;
  heads: Head[] = [];
  marks: Mark[] = [];
  // coast profile
  water = SHELF;
  berm = 0.9; bw = 4.5; rampW = 9;
  cliffBase = 0; cliffAmp = 0.35; cliffH = 6; cw = 2.2;
  w1a = 3; w1b = 8; d1a = 1.2; d1b = 3; w2 = 10; d2 = 11;
  warp = 2.5; coastA = 0.8; tail = 20; // tail: drop from the shelf break to the abyss
  sand: Island['sand'] = 'white';
  rock: Island['rock'] = 'limestone';

  constructor(kind: IslandKind, seed: number) {
    this.kind = kind;
    this.seed = seed;
    this.ns = seed & 0xfffff;
  }

  /** Distance from the coast beyond which the strokes add nothing. */
  get reach(): number {
    return Math.max(this.near + 20, 24) + this.coastA + 1;
  }

  /** Distance from the coast beyond which shallows, reefs and cliffs have dropped to the shelf: no more variation. */
  get near(): number {
    return this.w1b + (this.water === REEF ? 14 : this.water === SHELF ? this.w2 : 4) + 2;
  }

  measure(): void {
    let e = 0;
    for (const c of this.caps) e = Math.max(e, hyp(c.ax, c.ay) + c.ra, hyp(c.bx, c.by) + c.rb);
    for (const c of this.cols) e = Math.max(e, hyp(c.x, c.y) + c.r);
    for (const b of this.bars) e = Math.max(e, hyp(b.ax, b.ay) + b.w, hyp(b.bx, b.by) + b.w);
    if (this.ring) e = Math.max(e, this.ring.r0 * (1 + this.ring.ecc + 1.5 * this.ring.lobe) + this.ring.wc);
    this.ext = e;
  }

  /** The domain warp that bends every stroke; leaves the warped coordinates in warpX, warpY. */
  private bend(x: number, y: number): void {
    const a = this.warp * (1 - smoothstep(this.ext + 4, this.ext + 14, hyp(x, y)));
    warpX = x;
    warpY = y;
    if (a > 0) {
      const ox = x, oy = y;
      warp(x * 0.035, y * 0.035, this.ns);
      warpX = ox + a * warpX;
      warpY = oy + a * warpY;
    }
  }

  /** Local point that the warp carries onto (x, y): where a stroke placed at (x, y) actually appears. */
  unbend(x: number, y: number): [number, number] {
    let px = x, py = y;
    for (let k = 0; k < 8; k++) {
      this.bend(px, py);
      px += x - warpX;
      py += y - warpY;
    }
    return [px, py];
  }

  at(x: number, y: number): number {
    const s = this.ns;
    this.bend(x, y);
    const wx = warpX, wy = warpY;
    let h = this.caps.length ? this.land(x, y, this.strokes(wx, wy)) : DEEP;
    if (this.ring) h = smax(h, this.reef(x, y), 1.5);
    for (const b of this.bars) h = smax(h, bar(wx, wy, b), 1);
    for (const c of this.cols) h = smax(h, column(wx, wy, c), 1.2);
    for (const fl of this.flats) {
      knot(0, fl.r, fl.h, 0); knot(1, fl.r + 5, -6, 0); knot(2, fl.r + 15, DEEP, 0);
      h = smax(h, spline(hyp(x - fl.x, y - fl.y), 3) + 0.05 * noise(x * 0.4, y * 0.4, s + 12), 0.5);
    }
    for (const t of this.troughs) {
      const d0 = segDist(x, y, t), e = 2 * segT - 1, d = Math.max(0, d0 - t.w * (1 + 0.6 * e * e) - 0.8 * noise(segT * 4, 0.5, s + 15));
      h = smin(h, t.h + 1.5 * d * d, 1);
    }
    for (const p of this.pads) h = mix(p.h, h, smoothstep(p.r, p.r + 3, hyp(x - p.x, y - p.y)));
    return h;
  }

  /** Signed coast distance including coastline noise (negative on land). */
  coastD(x: number, y: number): number {
    this.bend(x, y);
    return this.coastline(x, y, this.strokes(warpX, warpY));
  }

  private strokes(wx: number, wy: number): number {
    let D = 1e9, rel = 0, cl = this.cliffBase;
    for (const c of this.caps) {
      const sd = capDist(wx, wy, c);
      D = smin(D, sd, 3);
      if (c.top > 0 && sd < 0) {
        // ridges merge into saddles and summits rather than stacking up where strokes overlap
        const u = clamp01(-sd / capR);
        rel = smax(rel, c.top * u * (2 - u), 0.3 * c.top);
      }
      if (c.cliff) cl += c.cliff * (1 - smoothstep(-6, 8, sd));
    }
    for (const b of this.bays) {
      const d = hyp(wx - b.x, wy - b.y);
      D = smax(D, smin(b.r - d, b.h, 2), 3); // a cove floor never sinks below the depth of shallows h out
      cl -= 1.5 * (1 - smoothstep(b.r - 2, b.r + 6, d));
    }
    strokeRel = rel;
    strokeCliff = cl;
    return D;
  }

  /**
   * Coast distance with the coastline's wiggle; leaves cliffness and along-shore variation in scratch. The variation
   * (wide sandy shallows where the coast is low, deeper water under high cliffs) fades out beyond the shelf break,
   * where it would not show and only cost time.
   */
  private coastline(x: number, y: number, D0: number): number {
    const s = this.ns, fade = 1 - smoothstep(this.near - 6, this.near, D0);
    let n1 = 0, n2 = 0;
    if (fade > 0) {
      n1 = fade * noise(x * 0.035, y * 0.035, s + 2);
      n2 = fade * noise(x * 0.055 + 9.1, y * 0.055, s + 3);
    }
    let cl = strokeCliff + this.cliffAmp * n1, hc = this.cliffH * (0.8 + 0.3 * n2);
    for (const b of this.boosts) {
      const d = hyp(x - b.x, y - b.y);
      hc = mix(hc, b.h, 1 - smoothstep(b.r * 0.4, b.r, d));
      cl += 2 * (1 - smoothstep(0, b.r * 1.6, d)); // a gentle falloff: cliffness also shapes the seabed offshore
    }
    const c = smoothstep(0.35, 0.65, cl);
    shoreN1 = n1; shoreN2 = n2; shoreC = c; shoreHc = hc;
    // beaches sweep in smooth arcs, rocky shores are crenellated
    return fade > 0 ? D0 + fade * this.coastA * (0.5 + c) * fbm(x * 0.11, y * 0.11, s + 1, 3) : D0;
  }

  private land(x: number, y: number, D0: number): number {
    if (D0 > this.reach) return DEEP;
    const s = this.ns, rel = strokeRel, D = this.coastline(x, y, D0), n1 = shoreN1, n2 = shoreN2, c = shoreC, hc = shoreHc;
    const w1 = mix(this.w1a, this.w1b, 0.5 - 0.5 * n1), d1 = mix(this.d1a, this.d1b, 0.5 + 0.5 * n2);
    const g = Math.min((1.6 * this.berm) / this.bw, (2.5 * d1) / w1); // shoreline slope, shared by both sides
    const S = (2.4 * hc) / this.cw;
    let h: number;
    if (D <= 0) {
      const xl = -D, ramp = smoothstep(0, this.rampW, xl);
      const hb = xl < this.bw ? herm(xl, 0, this.bw, 0, this.berm, g, 0) : this.berm;
      const hk = xl < this.cw ? herm(xl, 0, this.cw, 0, hc, S, 0) : hc;
      const mountain = rel + (this.cone ? this.coneRelief(x, y) : 0);
      h = mix(hb, hk, c) + mountain * ramp;
      // hummocks everywhere, ridges and ravines on the mountains
      h += 0.25 * smoothstep(0, 3, xl) * noise(x * 0.3, y * 0.3, s + 6);
      if (rel > 0.5) {
        const r = 1 - Math.abs(noise(x * 0.06, y * 0.06, s + 7));
        h += rel * ramp * 0.25 * (r * r - 0.5);
      }
    } else {
      // cliffs plunge straight to the shelf, then share the beach profile's run-out so the deep stays seamless
      const wd = Math.max(0.8, (2.4 * this.d2) / S), end = w1 + (this.water === REEF ? 33 : (this.water === SHELF ? this.w2 : 4) + this.tail);
      knot(0, 0, 0, -S); knot(1, wd, -this.d2, 0); knot(2, Math.max(end, wd + 8), DEEP, 0);
      const cliff = spline(D, 3);
      h = mix(this.shore(D, g, w1, d1), cliff, c);
      // coral heads and boulders in the shallows; they never reach SOLID
      if (h < -1.2 && h > -9) h += knolls(x, y, this.water === REEF ? 7 : 5, 0.35, s + 8) * 0.9 * (-1.2 - h) * smoothstep(-9, -4, h);
    }
    if (this.lava.length) {
      let r = 0;
      for (const l of this.lava) r = Math.max(r, l.h * (1 - smoothstep(0, l.w, segDist(x, y, l))));
      h += r;
    }
    for (const gl of this.gullies) {
      const d = segDist(x, y, gl);
      h -= gl.h * (1 - smoothstep(gl.w * 0.3, gl.w, d)) * smoothstep(0, 0.4, segT);
    }
    return h;
  }

  /** Water-side beach profile: shallows of depth d1 out to w1, then a reef crest or a shelf, then deep. */
  private shore(D: number, g: number, w1: number, d1: number): number {
    knot(0, 0, 0, -g);
    if (this.water === REEF) {
      knot(1, w1, -d1, 0); knot(2, w1 + 2.5, -0.32, 0); knot(3, w1 + 6, -6, -1.6);
      knot(4, w1 + 13, -this.d2, 0); knot(5, w1 + 33, DEEP, 0);
      return spline(D, 6);
    }
    const w2 = this.water === SHELF ? this.w2 : 4;
    knot(1, w1, -d1, (-0.6 * (this.d2 - d1)) / w2); knot(2, w1 + w2, -this.d2, 0); knot(3, w1 + w2 + this.tail, DEEP, 0);
    return spline(D, 4);
  }

  ringR(cx: number, cy: number): number {
    const g = this.ring!, cr = cx * g.ux + cy * g.uy, s = this.ns + 11;
    return g.r0 * (1 + g.ecc * (2 * cr * cr - 1) + g.lobe * (noise(cx * 1.7 + 3.1, cy * 1.7 - 4.3, s) +
      0.4 * noise(cx * 4.1 - 1.3, cy * 4.1 + 2.9, s + 1)));
  }

  private reef(x: number, y: number): number {
    const g = this.ring!, s = this.ns, rho = hyp(x, y), back = g.wc + g.wb;
    const t = rho > 1e-6 ? rho - this.ringR(x / rho, y / rho) : -g.r0;
    knot(0, -back, -g.dl, 0); knot(1, -g.wc, -0.55, 0); knot(2, 0, -0.3, 0); knot(3, 1.8, -1.1, -1.5);
    knot(4, 5, -9, -2.2); knot(5, 14, -26, -1); knot(6, 34, DEEP, 0);
    let h = spline(t, 7);
    const lagoon = 1 - smoothstep(-back - 6, -back, t);
    if (lagoon > 0) {
      h += lagoon * 0.7 * noise(x * 0.05, y * 0.05, s + 9);
      h += lagoon * knolls(x, y, 9, 0.55, s + 10) * 0.9 * Math.max(0, -1.3 - h);
    }
    return h;
  }

  private coneRelief(x: number, y: number): number {
    const k = this.cone!, rho = hyp(x, y);
    if (rho >= k.r) return 0;
    const uc = k.rc / k.r, v = 1 - (rho / k.r - uc) / (1 - uc); // 1 at the rim, 0 at the foot
    const flank = k.top * v * v * (0.4 + 0.6 * v);
    const q = rho / k.rc, bowl = k.floor + (k.top - k.floor + 6) * q * q * q * q;
    let h = smin(flank, bowl, 4);
    if (rho > 1e-6) {
      const gl = 1 - Math.abs(noise((x / rho) * 5.5, (y / rho) * 5.5 + rho * 0.04, this.ns + 13));
      h -= flank * 0.1 * gl * gl * smoothstep(k.rc, k.rc * 2.5, rho);
    }
    return h;
  }
}

/** The blue shelf an archipelago's high islands stand on. */
class Shelf implements Field {
  c = v3(0, 0, 1);
  e1 = v3(1, 0, 0);
  e2 = v3(0, 1, 0);
  cosInf = 1;
  ns: number;
  top: number;
  discs: Disc[] = [];

  constructor(seed: number, top: number) {
    this.ns = seed & 0xfffff;
    this.top = top;
  }

  get reach(): number {
    let e = 0;
    for (const d of this.discs) e = Math.max(e, hyp(d.x, d.y) + d.r);
    return e + 42;
  }

  at(x: number, y: number): number {
    const s = this.ns;
    warp(x * 0.02, y * 0.02, s);
    const wx = x + 6 * warpX, wy = y + 6 * warpY;
    let D = 1e9;
    for (const d of this.discs) D = smin(D, hyp(wx - d.x, wy - d.y) - d.r, 12);
    if (D > 34) return DEEP;
    knot(0, 0, -this.top, 0); knot(1, 12, -this.top - 12, -1.6); knot(2, 34, DEEP, 0);
    return spline(D, 3) + (D < 14 ? 1.5 * noise(x * 0.045, y * 0.045, s + 1) * (1 - smoothstep(0, 14, D)) : 0);
  }
}

// ---------------------------------------------------------------------------------------------
// Island designs. Each builds strokes around its local origin; placement happens afterwards.
function tropicalCoast(g: Isle, rng: Rng): void {
  g.climate = 'tropical'; g.water = REEF; g.sand = 'white'; g.rock = 'limestone';
  g.berm = rng.range(0.7, 1); g.bw = rng.range(3.5, 5.5);
  g.w1a = 1.5; g.w1b = rng.range(7, 14); g.d1a = 0.6; g.d1b = rng.range(2.5, 4); g.d2 = 13;
  g.cliffBase = 0; g.cliffAmp = 0.3; g.cliffH = rng.range(3, 6);
}
function temperateCoast(g: Isle, rng: Rng): void {
  g.climate = 'temperate'; g.water = SHELF; g.sand = 'gold'; g.rock = 'sandstone';
  g.berm = rng.range(0.8, 1.2); g.bw = rng.range(3.5, 5);
  g.w1a = 1.5; g.w1b = rng.range(4, 8); g.d1a = 1.4; g.d1b = 4.5; g.w2 = rng.range(7, 12); g.d2 = 11;
  g.cliffBase = 0.3; g.cliffAmp = 0.45; g.cliffH = rng.range(6, 12);
}
function polarCoast(g: Isle, rng: Rng): void {
  g.climate = 'polar'; g.water = STEEP; g.sand = 'black'; g.rock = 'basalt';
  g.berm = 0.7; g.bw = 3; g.w1a = 1; g.w1b = 3; g.d1a = 1.5; g.d1b = 3; g.d2 = 12;
  g.cliffBase = 0.75; g.cliffAmp = 0.3; g.cliffH = rng.range(4, 8);
}

interface Spine { px: number[]; py: number[]; rad: number[] }

/**
 * A high island: a bent ridge spine with necks and bulges, broad lobes, slender cliffed points that kink at the
 * neck and shed rocks off their tips, round coves with beaches between them, and maybe a hooked spit.
 */
function genForest(g: Isle, rng: Rng, size: number, tropical: boolean): Spine {
  (tropical ? tropicalCoast : temperateCoast)(g, rng);
  const n = 2 + rng.int(2) + (size > 18 ? 1 : 0);
  const px = [0], py = [0];
  let a = rng.range(0, 2 * PI);
  for (let k = 0; k < n; k++) {
    a += rng.range(-0.8, 0.8);
    const l = (size * rng.range(1.3, 1.9)) / n;
    px.push(px[k] + l * dcos(a));
    py.push(py[k] + l * dsin(a));
  }
  const mx = px.reduce((s, v) => s + v, 0) / px.length, my = py.reduce((s, v) => s + v, 0) / py.length;
  for (let k = 0; k <= n; k++) { px[k] -= mx; py[k] -= my; }
  const rad = px.map((_, k) => size * (k === 0 || k === n ? rng.range(0.18, 0.3) : rng.range(0.28, 0.52)));
  const top = Math.min(26, size * (tropical ? rng.range(0.75, 1) : rng.range(0.55, 0.8)));
  for (let k = 0; k < n; k++) g.caps.push(cap(px[k], py[k], px[k + 1], py[k + 1], rad[k], rad[k + 1], top * rng.range(0.5, 0.8)));

  const spot = () => {
    const sg = rng.int(n), t = rng.range(0.15, 0.85), side = rng.next() < 0.5 ? 1 : -1;
    const sx = px[sg + 1] - px[sg], sy = py[sg + 1] - py[sg], sl = hyp(sx, sy) || 1;
    const [dx, dy] = rot((-sy / sl) * side, (sx / sl) * side, rng.range(-0.6, 0.6));
    return { x: mix(px[sg], px[sg + 1], t), y: mix(py[sg], py[sg + 1], t), r: mix(rad[sg], rad[sg + 1], t), dx, dy };
  };
  const points = (tropical ? 1 : 2) + rng.int(2), lobes = rng.int(3);
  for (let k = 0; k < lobes; k++) {
    const o = spot(), len = o.r * rng.range(0.9, 1.5);
    g.caps.push(cap(o.x, o.y, o.x + o.dx * len, o.y + o.dy * len, o.r * 0.8, o.r * rng.range(0.35, 0.55), top * rng.range(0.25, 0.5)));
  }
  for (let k = 0; k < points; k++) {
    const o = spot(), l1 = o.r + rng.range(2, 6), qx = o.x + o.dx * l1, qy = o.y + o.dy * l1, rn = rng.range(3, 4.2);
    const [ex, ey] = rot(o.dx, o.dy, rng.range(-0.55, 0.55)), l2 = rng.range(4, 9), tx = qx + ex * l2, ty = qy + ey * l2;
    g.caps.push(cap(o.x, o.y, qx, qy, o.r * 0.45, rn, rng.range(4, 7), 1.4));
    g.caps.push(cap(qx, qy, tx, ty, rn, rng.range(1.6, 2.4), rng.range(3, 5), 1.4));
    g.heads.push({ x: tx, y: ty, dx: ex, dy: ey });
    for (let m = rng.int(tropical ? 2 : 4); m > 0; m--) {
      const d = rng.range(4.5, 10), w = rng.range(-3.5, 3.5);
      g.cols.push({ x: tx + ex * d - ey * w, y: ty + ey * d + ex * w, r: rng.range(0.9, 2), h: tropical ? rng.range(0.8, 3) : rng.range(2, 9) });
    }
  }
  for (let k = 1 + rng.int(3); k > 0; k--) {
    const o = spot(), br = rng.range(6, 11), off = o.r + rng.range(-1, 3), bx = o.x + o.dx * off, by = o.y + o.dy * off;
    const clear = g.caps.every((c) => !c.cliff || segDist(bx, by, { ax: c.ax, ay: c.ay, bx: c.bx, by: c.by, w: 0, h: 0 }) > br + c.ra + 2);
    if (clear) g.bays.push({ x: bx, y: by, r: br, h: rng.range(2.5, 5) });
  }
  if (rng.next() < 0.6) {
    const e = rng.next() < 0.5 ? 0 : n, o = e === 0 ? 1 : n - 1;
    let dx = px[e] - px[o], dy = py[e] - py[o];
    const l = hyp(dx, dy) || 1;
    dx /= l; dy /= l;
    let x = px[e] + dx * rad[e] * 0.6, y = py[e] + dy * rad[e] * 0.6, w = rng.range(2, 2.6);
    const turn = (rng.next() < 0.5 ? 1 : -1) * rng.range(0.35, 0.6);
    for (let k = 0; k < 5; k++) {
      [dx, dy] = rot(dx, dy, turn);
      const step = rng.range(4, 7), nx = x + dx * step, ny = y + dy * step;
      if (k < 3) g.caps.push(cap(x, y, nx, ny, w, w * 0.8, 0, -1.2));
      else g.bars.push({ ax: x, ay: y, bx: nx, by: ny, w: 1.8, h: k === 3 ? -0.35 : -0.65 });
      x = nx; y = ny; w *= 0.8;
    }
  }
  return { px, py, rad };
}

/** A low sand island on a wide reef apron with a hooked sandbar tail. */
function genCay(g: Isle, rng: Rng, size: number, tropical: boolean): void {
  (tropical ? tropicalCoast : temperateCoast)(g, rng);
  g.cliffBase = -1; g.cliffAmp = 0;
  if (tropical) { g.w1a = 3; g.w1b = rng.range(8, 14); g.d1a = 0.5; g.d1b = 2.2; }
  let [dx, dy] = rot(1, 0, rng.range(0, 2 * PI));
  const l = rng.range(0.5, 1.5) * size;
  g.caps.push(cap((-dx * l) / 2, (-dy * l) / 2, (dx * l) / 2, (dy * l) / 2, size * rng.range(0.55, 0.8), size * rng.range(0.35, 0.6), rng.range(0.2, 0.7)));
  let x = (dx * l) / 2, y = (dy * l) / 2;
  const turn = (rng.next() < 0.5 ? 1 : -1) * rng.range(0.3, 0.55);
  for (let k = 0; k < 3; k++) {
    [dx, dy] = rot(dx, dy, turn);
    const step = rng.range(4, 7), nx = x + dx * step, ny = y + dy * step;
    g.bars.push({ ax: x, ay: y, bx: nx, by: ny, w: 2 - k * 0.3, h: -0.1 - k * 0.3 });
    x = nx; y = ny;
  }
}

/** A reef ring around a lagoon with sand motus on the rim; the great atoll also gets its single channel. */
function genAtoll(g: Isle, rng: Rng, r0: number, great: boolean): void {
  tropicalCoast(g, rng);
  g.water = STEEP; g.w1a = 1.5; g.w1b = 3; g.d1a = 0.6; g.d1b = 1.2; g.d2 = 8; g.tail = 10;
  g.cliffBase = -1; g.cliffAmp = 0; g.warp = 1.2;
  const [ux, uy] = rot(1, 0, rng.range(0, 2 * PI));
  g.ring = {
    r0, ecc: rng.range(0.08, 0.22), ux, uy, lobe: rng.range(0.05, 0.1),
    wc: great ? 5 : 2.5, wb: great ? 4 : 3, dl: great ? rng.range(4.6, 5.2) : rng.range(2.4, 3.4),
  };
  const count = great ? 5 + rng.int(3) : 2 + rng.int(3), slot = (2 * PI) / count, a0 = rng.range(0, 2 * PI);
  let gapA = 0, gapW = 0, prevEnd = 0, firstStart = 0;
  for (let i = 0; i < count; i++) {
    const ac = a0 + (i + rng.range(-0.2, 0.2)) * slot, span = slot * rng.range(0.3, 0.6);
    const r = great ? rng.range(2.6, 3.8) : rng.range(1.8, 3), top = rng.range(0.3, 0.9);
    const radii = [r * rng.range(0.35, 0.8), r, r * rng.range(0.3, 0.7)];
    let qx = 0, qy = 0;
    for (let j = 0; j <= 2; j++) {
      const a = ac - span / 2 + (j * span) / 2, cx = dcos(a), cy = dsin(a), rr = g.ringR(cx, cy) + rng.range(-0.2, 1.4);
      if (j) g.caps.push(cap(qx, qy, cx * rr, cy * rr, radii[j - 1], radii[j], top));
      qx = cx * rr; qy = cy * rr;
    }
    if (i === 0) firstStart = ac - span / 2;
    else if (ac - span / 2 - prevEnd > gapW) { gapW = ac - span / 2 - prevEnd; gapA = (ac - span / 2 + prevEnd) / 2; }
    prevEnd = ac + span / 2;
  }
  if (firstStart + 2 * PI - prevEnd > gapW) gapA = (firstStart + 2 * PI + prevEnd) / 2;
  if (!great) return;
  const dx = dcos(gapA), dy = dsin(gapA), rr = g.ringR(dx, dy), ring = g.ring;
  const inner = rr - ring.wc - ring.wb - 5, floor = -ring.dl - 0.6;
  g.troughs.push({ ax: dx * inner, ay: dy * inner, bx: dx * (rr + 8), by: dy * (rr + 8), w: 3.6, h: floor });
  g.marks.push({ kind: 'channel', x: dx * rr, y: dy * rr, dx, dy, size: 0, height: floor });
}

/** The volcano: a concave cone with a caldera, black-sand coves and three old lava flows ending in deltas. */
function genVolcano(g: Isle, rng: Rng): void {
  g.climate = 'tropical'; g.water = SHELF; g.sand = 'black'; g.rock = 'basalt';
  g.berm = 0.8; g.bw = 4; g.w1a = 2; g.w1b = 5; g.d1a = 1.5; g.d1b = 3; g.w2 = 8; g.d2 = 14;
  g.cliffBase = 0; g.cliffAmp = 0.3; g.cliffH = rng.range(2.5, 4); g.rampW = 6;
  const r = rng.range(33, 38), top = rng.range(38, 44), rc = rng.range(6.5, 8);
  g.cone = { r: r * 1.08, top, rc, floor: top - rng.range(9, 12) };
  g.caps.push(cap(0, 0, 0, 0, r * 0.72, r * 0.72));
  for (let k = 4 + rng.int(3); k > 0; k--) {
    const [dx, dy] = rot(1, 0, rng.range(0, 2 * PI)), l = r * rng.range(0.45, 0.7);
    g.caps.push(cap(0, 0, dx * l, dy * l, r * rng.range(0.3, 0.45), r * rng.range(0.18, 0.32)));
  }
  const [qx, qy] = rot(r * 0.5, 0, rng.range(0, 2 * PI));
  g.caps.push(cap(qx, qy, qx, qy, 5, 5, rng.range(5, 8)));
  g.marks.push({ kind: 'caldera', x: 0, y: 0, dx: 1, dy: 0, size: rc, height: top });
  const a0 = rng.range(0, 2 * PI);
  const shoreAt = (dx: number, dy: number) => {
    let d = r * 0.4;
    while (g.coastD(dx * d, dy * d) < 0 && d < 2 * r) d += 0.5;
    return d;
  };
  for (let k = 0; k < 2; k++) {
    const [dx, dy] = rot(1, 0, a0 + PI / 3 + k * (2 * PI / 3) + rng.range(-0.3, 0.3)), d = shoreAt(dx, dy);
    g.bays.push({ x: dx * (d + 1), y: dy * (d + 1), r: rng.range(5, 8), h: 3 });
  }
  g.gullies.push({ ax: dcos(a0) * rc * 0.75, ay: dsin(a0) * rc * 0.75, bx: dcos(a0) * (rc + 2), by: dsin(a0) * (rc + 2), w: 3.5, h: 4 });
  for (let k = 0; k < 3; k++) {
    const a = a0 + (k * 2 * PI) / 3 + (k ? rng.range(-0.4, 0.4) : 0), dx = dcos(a), dy = dsin(a), shore = shoreAt(dx, dy);
    g.caps.push(cap(dx * (shore - 6), dy * (shore - 6), dx * (shore + 3), dy * (shore + 3), 4, 6.5, 0, 1.2));
    const w = rng.range(2.6, 3.6), path: number[] = [];
    for (let rho = rc + 1.5; rho < shore + 17; rho += 3) {
      const b = a + 0.25 * noise(rho * 0.045, k * 5.3, g.ns + 14) * (1 - smoothstep(shore - 12, shore, rho));
      path.push(rho * dcos(b), rho * dsin(b));
    }
    for (let i = 2; i < path.length; i += 2) g.lava.push({ ax: path[i - 2], ay: path[i - 1], bx: path[i], by: path[i + 1], w, h: 0.9 });
    const fx = path[2] - path[0], fy = path[3] - path[1], fl = hyp(fx, fy);
    g.marks.push({ kind: 'lavaflow', x: path[0], y: path[1], dx: fx / fl, dy: fy / fl, size: (path.length / 2 - 1) * 3, path });
  }
}

/** The fishing village island: a jungle horseshoe around a round, shallow, sheltered bay opening east. */
function genVillage(g: Isle, rng: Rng): void {
  tropicalCoast(g, rng);
  const rb = rng.range(10.5, 12.5), size = rng.range(20, 25), ring = rb + size * 0.4;
  let px = 0, py = 0;
  for (let k = 0; k <= 4; k++) {
    const a = PI * (0.62 + (0.76 * k) / 4) + rng.range(-0.08, 0.08), x = ring * dcos(a), y = ring * dsin(a);
    if (k) g.caps.push(cap(px, py, x, y, size * rng.range(0.3, 0.45), size * rng.range(0.3, 0.45), size * rng.range(0.45, 0.75)));
    px = x; py = y;
  }
  const [lx, ly] = rot(-ring - size * 0.3, 0, rng.range(-0.6, 0.6));
  g.caps.push(cap(-ring * 0.8, 0, lx, ly, size * 0.35, size * rng.range(0.15, 0.25), size * 0.3));
  for (const side of [1, -1]) {
    const tx = rb * rng.range(0.85, 1.1), ty = side * rb * rng.range(0.5, 0.65), my = side * (rb + 4.5);
    g.caps.push(cap(ring * dcos(PI * 0.62), side * ring * dsin(PI * 0.62), rb * 0.3, my, 6, 4.5, 6));
    g.caps.push(cap(rb * 0.3, my, tx, ty, 4.5, 3.4, 5, 1.4));
    const hl = hyp(tx + rb, ty);
    g.heads.push({ x: tx, y: ty, dx: (tx + rb) / hl, dy: ty / hl });
  }
  g.bays.push({ x: 0, y: 0, r: rb, h: 6 });
  g.flats.push({ x: -1, y: 0, r: rb + 1.5, h: -0.5 });
  g.marks.push({ kind: 'village', x: -rb * 0.2, y: 0, dx: 1, dy: 0, size: rb, height: -0.5 });
  let x = 0;
  while (g.at(x, 0) < 0.3 && x > -2 * rb) x -= 0.25;
  g.marks.push({ kind: 'pier', x, y: 0, dx: 1, dy: 0, size: 1 - x });
}

/** The waterfall island: a temperate forest island with one tall sheer cliff and a stream cut to its lip. */
function genWaterfall(g: Isle, rng: Rng): void {
  const sp = genForest(g, rng, rng.range(24, 28), false);
  const m = Math.floor(sp.px.length / 2), ox = sp.px[m], oy = sp.py[m];
  let best = -1e9, bx = 0, by = 0, bdx = 1, bdy = 0;
  for (let k = 0; k < 32; k++) {
    const [dx, dy] = rot(1, 0, (k / 32) * 2 * PI);
    let rho = 0;
    while (g.coastD(ox + dx * rho, oy + dy * rho) < 0 && rho < 120) rho += 0.5;
    const x = ox + dx * rho, y = oy + dy * rho;
    if (rho < 10) continue;
    let score = 30;
    for (const h of g.heads) score = Math.min(score, hyp(h.x - x, h.y - y));
    for (const b of g.bays) score = Math.min(score, hyp(b.x - x, b.y - y) - b.r);
    for (const c of g.cols) score = Math.min(score, hyp(c.x - x, c.y - y));
    for (const b of g.bars) score = Math.min(score, hyp(b.ax - x, b.ay - y));
    score += 0.5 * g.at(x - dx * 8, y - dy * 8);
    if (score > best) { best = score; bx = x; by = y; bdx = dx; bdy = dy; }
  }
  g.boosts.push({ x: bx, y: by, r: 16, h: rng.range(19, 23) });
  // the lip sits just behind the top edge of the cliff profile
  let lx = bx, ly = by;
  while (g.coastD(lx, ly) > -g.cw - 0.4) { lx -= bdx * 0.1; ly -= bdy * 0.1; }
  const e = 0.25, gx = g.coastD(lx + e, ly) - g.coastD(lx - e, ly), gy = g.coastD(lx, ly + e) - g.coastD(lx, ly - e);
  const gl = hyp(gx, gy) || 1, fx = gx / gl, fy = gy / gl;
  g.gullies.push({ ax: lx - fx * 16, ay: ly - fy * 16, bx: lx, by: ly, w: 2.6, h: 1.8 });
  g.marks.push({ kind: 'waterfall', x: lx, y: ly, dx: fx, dy: fy, size: 0 });
}

/** Move every stroke and mark of a design by (dx, dy) so its local origin sits mid-footprint. */
function shift(g: Isle, dx: number, dy: number): void {
  for (const c of g.caps) { c.ax += dx; c.ay += dy; c.bx += dx; c.by += dy; }
  for (const d of [...g.bays, ...g.cols, ...g.flats, ...g.pads, ...g.boosts, ...g.heads]) { d.x += dx; d.y += dy; }
  for (const b of [...g.bars, ...g.troughs, ...g.gullies, ...g.lava]) { b.ax += dx; b.ay += dy; b.bx += dx; b.by += dy; }
  for (const m of g.marks) {
    m.x += dx; m.y += dy;
    for (let i = 0; m.path && i < m.path.length; i += 2) { m.path[i] += dx; m.path[i + 1] += dy; }
  }
}

/** The sea arch: a sandstone headland whose point springs an arch to a stack, then a fan of tall stacks. */
function genStacks(g: Isle, rng: Rng): void {
  temperateCoast(g, rng);
  g.cliffBase = 0.8; g.cliffH = rng.range(9, 13); g.w1b = 4;
  const size = rng.range(13, 17);
  g.caps.push(cap(-size * 0.9, rng.range(-4, 4), size * 0.1, rng.range(-3, 3), size * 0.55, size * 0.5, rng.range(5, 9)));
  g.caps.push(cap(-size * 0.4, size * 0.3, -size * 0.2, -size * 0.6, size * 0.4, size * 0.35, rng.range(3, 6)));
  const tip = size + rng.range(6, 9);
  g.caps.push(cap(size * 0.1, 0, tip, 0, 5, 3.4, 3, 1.5));
  g.heads.push({ x: tip, y: 0, dx: 1, dy: 0 });
  const [dx, dy] = rot(1, 0, rng.range(-0.45, 0.45));
  const span = rng.range(13, 16), crown = rng.range(12, 15);
  const ax = tip + dx * 2, ay = dy * 2, bx = ax + dx * span, by = ay + dy * span;
  g.cols.push({ x: ax, y: ay, r: 3.4, h: crown + 0.6 }, { x: bx, y: by, r: 3.1, h: crown + 0.4 });
  g.bars.push({ ax, ay, bx, by, w: 3.6, h: -0.45 });
  g.marks.push({ kind: 'arch', x: (ax + bx) / 2, y: (ay + by) / 2, dx, dy, size: span, height: crown, path: [ax, ay, bx, by] });
  // the stacks stand on the wave-cut platform of the headland they once were
  for (let k = 0; k < 4; k++) {
    const d0 = span * 0.3 + k * rng.range(8, 12), d1 = d0 + rng.range(6, 12), o0 = rng.range(-6, 6), o1 = rng.range(-6, 6);
    g.bars.push({ ax: ax + dx * d0 - dy * o0, ay: ay + dy * d0 + dx * o0, bx: ax + dx * d1 - dy * o1, by: ay + dy * d1 + dx * o1, w: rng.range(5, 9), h: rng.range(-6.2, -5) });
  }
  const n = 6 + rng.int(4);
  for (let k = 0, tries = 0; k < n && tries < 300; tries++) {
    const d = span + 7 + rng.range(0, 34), o = rng.range(-12, 12), r = rng.range(1.8, 3.6);
    const x = ax + dx * d - dy * o, y = ay + dy * d + dx * o;
    if (g.cols.some((c) => hyp(c.x - x, c.y - y) < c.r + r + 5)) continue;
    g.cols.push({ x, y, r, h: rng.range(9, 24) * (1 - (d - span) / 70) });
    k++;
  }
  for (let k = 0, tries = 0; k < 4 && tries < 100; tries++) {
    const d = rng.range(span, span + 40), o = rng.range(-15, 15), r = rng.range(0.9, 1.5);
    const x = ax + dx * d - dy * o, y = ay + dy * d + dx * o;
    if (g.cols.some((c) => hyp(c.x - x, c.y - y) < c.r + r + 2.5)) continue;
    g.cols.push({ x, y, r, h: rng.range(0.4, 2.5) });
    k++;
  }
  let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
  for (const c of g.cols) { x0 = Math.min(x0, c.x - c.r); x1 = Math.max(x1, c.x + c.r); y0 = Math.min(y0, c.y - c.r); y1 = Math.max(y1, c.y + c.r); }
  for (const c of g.caps) { x0 = Math.min(x0, c.ax - c.ra); x1 = Math.max(x1, c.ax + c.ra); y0 = Math.min(y0, c.ay - c.ra); y1 = Math.max(y1, c.ay + c.ra); }
  shift(g, -(x0 + x1) / 2, -(y0 + y1) / 2);
}

/** Dark basalt islets: narrow cliff-girt ridges in a row, sheer stacks and awash skerries strung off their ends. */
function genBasalt(g: Isle, rng: Rng, size: number, polar: boolean): void {
  polarCoast(g, rng);
  if (!polar) g.climate = 'temperate';
  const [ax, ay] = rot(1, 0, rng.range(0, 2 * PI)), n = 1 + rng.int(2), tips: number[] = [];
  for (let k = 0; k < n; k++) {
    const c = (k - (n - 1) / 2) * size * 1.1, o = rng.range(-0.3, 0.3) * size;
    let [dx, dy] = rot(ax, ay, rng.range(-0.5, 0.5));
    const l = size * rng.range(0.5, 0.8), r = size * rng.range(0.22, 0.34);
    let x = ax * c - ay * o - (dx * l) / 2, y = ay * c + ax * o - (dy * l) / 2;
    tips.push(x, y, -dx, -dy);
    for (let j = 0; j < 2; j++) {
      const nx = x + (dx * l) / 2, ny = y + (dy * l) / 2;
      g.caps.push(cap(x, y, nx, ny, j ? r : r * 0.6, j ? r * 0.5 : r, rng.range(1, 3)));
      x = nx; y = ny;
      [dx, dy] = rot(dx, dy, rng.range(-0.6, 0.6));
    }
    tips.push(x, y, dx, dy);
  }
  for (let k = 4 + rng.int(5), tries = 0; k > 0 && tries < 200; tries++) {
    const t = rng.int(tips.length / 4) * 4, d = rng.range(3, 16), w = rng.range(-5, 5) * (d / 16);
    const x = tips[t] + tips[t + 2] * d - tips[t + 3] * w, y = tips[t + 1] + tips[t + 3] * d + tips[t + 2] * w;
    const r = k > 2 ? rng.range(1.4, 3) : rng.range(0.7, 1.3);
    if (g.cols.some((c) => hyp(c.x - x, c.y - y) < c.r + r + 2.5)) continue;
    g.cols.push({ x, y, r, h: k > 2 ? rng.range(5, 16) * (1 - d / 30) : rng.range(0.3, 1.4) });
    k--;
  }
}

// ---------------------------------------------------------------------------------------------
// Layout: five landmark archipelagos spread in longitude within their climate bands, a basalt group in
// each polar cap, and generic archipelagos dropped by best-candidate sampling so open sea stays wide.
const LANDMARKS: { kind: IslandKind; lo: number; hi: number }[] = [
  { kind: 'greatAtoll', lo: 0.02, hi: 0.14 },
  { kind: 'volcano', lo: 0.08, hi: 0.2 },
  { kind: 'village', lo: 0.05, hi: 0.18 },
  { kind: 'waterfall', lo: 0.56, hi: 0.68 },
  { kind: 'stacks', lo: 0.64, hi: 0.74 },
];

function climateAt(p: V3): number {
  const a = Math.abs(p.y) + 0.03 * dsin(5.1 * p.x + 2.3) + 0.03 * dsin(4.3 * p.z - 1.1);
  return smoothstep(0.3, 0.48, a) + smoothstep(0.8, 0.9, a);
}

/** Islands of one archipelago, shaped but not yet placed; the first is the main island. */
function populate(theme: IslandKind | null, climate: number, rng: Rng): Isle[] {
  const out: Isle[] = [];
  const make = (kind: IslandKind, build: (g: Isle, r: Rng) => void) => {
    const g = new Isle(kind, rng.u32());
    build(g, new Rng(g.seed));
    out.push(g);
  };
  const cay = (trop: boolean) => make('cay', (g, r) => genCay(g, r, r.range(3, 6), trop));
  const atoll = () => make('atoll', (g, r) => genAtoll(g, r, r.range(12, 22), false));
  const forest = (lo: number, hi: number, trop: boolean) => make('forest', (g, r) => genForest(g, r, r.range(lo, hi), trop));
  const basalt = (lo: number, hi: number, polar: boolean) => make('basalt', (g, r) => genBasalt(g, r, r.range(lo, hi), polar));
  const some = (n: number, f: () => void) => { for (let k = 0; k < n; k++) f(); };
  switch (theme) {
    case 'greatAtoll':
      make('greatAtoll', (g, r) => genAtoll(g, r, r.range(46, 52), true));
      some(1 + rng.int(2), () => (rng.next() < 0.5 ? cay(true) : atoll()));
      break;
    case 'volcano':
      make('volcano', genVolcano);
      some(1 + rng.int(2), () => (rng.next() < 0.5 ? cay(true) : forest(7, 11, true)));
      break;
    case 'village':
      make('village', genVillage);
      some(1 + rng.int(2), () => (rng.next() < 0.6 ? cay(true) : atoll()));
      break;
    case 'waterfall':
      make('waterfall', genWaterfall);
      some(1 + rng.int(2), () => forest(9, 15, false));
      if (rng.next() < 0.5) cay(false);
      break;
    case 'stacks':
      make('stacks', genStacks);
      forest(10, 15, false);
      if (rng.next() < 0.5) basalt(5, 9, false);
      break;
    default:
      if (climate > 1.5) some(2 + rng.int(3), () => basalt(7, 13, true));
      else if (climate > 0.5) {
        forest(18, 30, false);
        some(1 + rng.int(3), () => {
          const k = rng.next();
          if (k < 0.45) forest(9, 15, false);
          else if (k < 0.7 || climate < 0.9) cay(false);
          else basalt(6, 10, false);
        });
      } else if (rng.next() < 0.5) {
        atoll();
        some(1 + rng.int(3), () => (rng.next() < 0.6 ? cay(true) : atoll()));
      } else {
        forest(14, 22, true);
        some(1 + rng.int(3), () => (rng.next() < 0.6 ? cay(true) : atoll()));
      }
  }
  for (const g of out) g.measure();
  return out;
}

interface Planet { isles: Isle[]; shelves: Shelf[] }

function layout(rng: Rng): Planet {
  const centers: { c: V3; theme: IslandKind | null }[] = [];
  const lon0 = rng.range(0, 2 * PI), slots = [0, 1, 2, 3, 4];
  for (let k = 4; k > 0; k--) {
    const j = rng.int(k + 1);
    [slots[k], slots[j]] = [slots[j], slots[k]];
  }
  LANDMARKS.forEach((m, k) => {
    const y = (rng.next() < 0.5 ? -1 : 1) * rng.range(m.lo, m.hi);
    centers.push({ c: sphereDir(y, lon0 + (slots[k] * 2 * PI) / 5 + rng.range(-0.3, 0.3)), theme: m.kind });
  });
  for (const s of [1, -1]) centers.push({ c: sphereDir(s * rng.range(0.93, 0.97), rng.range(0, 2 * PI)), theme: null });
  for (let k = 0; k < 8; k++) {
    let best: V3 = v3(), bestD = -2;
    for (let t = 0; t < 24; t++) {
      const c = sphereDir(rng.range(-0.88, 0.88), rng.range(0, 2 * PI));
      let near = -1;
      for (const o of centers) near = Math.max(near, dot(o.c, c));
      if (-near > bestD) { bestD = -near; best = c; }
    }
    centers.push({ c: best, theme: null });
  }

  const isles: Isle[] = [], shelves: Shelf[] = [];
  for (const { c, theme } of centers) {
    const group = populate(theme, climateAt(c), rng);
    const shelf = new Shelf(rng.u32(), rng.range(10, 14));
    // companions string out along the archipelago's axis like a chain, spreading around only when crowded
    const placed: { g: Isle; x: number; y: number }[] = [], axis = rng.range(0, 2 * PI);
    for (const g of group) {
      let x = rng.range(-6, 6), y = rng.range(-6, 6), ok = !placed.length;
      for (let t = 0; !ok && t < 80; t++) {
        const m = placed[rng.int(placed.length)], a = t < 40 ? axis + (rng.next() < 0.5 ? 0 : PI) + rng.range(-0.6, 0.6) : rng.range(0, 2 * PI);
        [x, y] = rot(m.g.ext + g.ext + rng.range(5, 16), 0, a);
        x += m.x; y += m.y;
        ok = hyp(x, y) + g.ext < 110 && placed.every((o) => hyp(o.x - x, o.y - y) > o.g.ext + g.ext + 5);
      }
      if (!ok) continue;
      placed.push({ g, x, y });
      if (g.kind !== 'atoll' && g.kind !== 'greatAtoll') shelf.discs.push({ x, y, r: g.ext * 0.85 + 6, h: 0 });
    }
    orient(shelf, c, rng.range(0, 2 * PI), shelf.reach);
    for (const { g, x, y } of placed) {
      orient(g, toDir(shelf, x, y), rng.range(0, 2 * PI), g.ext + g.warp + g.reach);
      isles.push(g);
    }
    if (shelf.discs.length) shelves.push(shelf);
  }
  return { isles, shelves };
}

// ---------------------------------------------------------------------------------------------
// Spatial index: per coarse cube-face cell (plain gnomonic coordinates), the fields that may reach it.
const coarseUV: FaceUV = { face: 0, u: 0, v: 0 };
function coarseCell(p: V3): number {
  const { face, u, v } = gnomonicUV(p, coarseUV);
  const i = Math.min(NC - 1, Math.floor((u + 1) * 0.5 * NC)), j = Math.min(NC - 1, Math.floor((v + 1) * 0.5 * NC));
  return (face * NC + j) * NC + i;
}

function buildIndex(fields: Field[]): { start: Int32Array; list: Int32Array } {
  const cells = 6 * NC * NC, start = new Int32Array(cells + 1), lists: number[] = [];
  const cc = v3(), corner = v3();
  const acos = (x: number) => PI / 2 - dasin(Math.max(-1, Math.min(1, x)));
  const reach = fields.map((f) => acos(f.cosInf));
  for (let cell = 0; cell < cells; cell++) {
    const f = Math.floor(cell / (NC * NC)), j = Math.floor(cell / NC) % NC, i = cell % NC;
    gnomonicDir(f, ((i + 0.5) / NC) * 2 - 1, ((j + 0.5) / NC) * 2 - 1, cc);
    let minDot = 1;
    for (let k = 0; k < 4; k++) {
      gnomonicDir(f, ((i + (k & 1)) / NC) * 2 - 1, ((j + (k >> 1)) / NC) * 2 - 1, corner);
      minDot = Math.min(minDot, dot(cc, corner));
    }
    const half = acos(minDot);
    start[cell] = lists.length;
    fields.forEach((fl, k) => {
      const a = half + reach[k];
      if (a >= PI || dot(cc, fl.c) >= dcos(a)) lists.push(k);
    });
  }
  start[cells] = lists.length;
  return { start, list: Int32Array.from(lists) };
}

// ---------------------------------------------------------------------------------------------
// Baked grids.
const TAN = new Float64Array(HN);
for (let i = 0; i < HN; i++) TAN[i] = dtan((((i + 0.5) / HN) * 2 - 1) * (PI / 4));

/** Unit direction of every HN cell centre, xyz interleaved. */
function cellDirs(): Float32Array {
  const out = new Float32Array(6 * HN * HN * 3), p = v3();
  let k = 0;
  for (let f = 0; f < 6; f++) {
    for (let j = 0; j < HN; j++) {
      for (let i = 0; i < HN; i++) {
        gnomonicDir(f, TAN[i], TAN[j], p);
        out[k++] = p.x; out[k++] = p.y; out[k++] = p.z;
      }
    }
  }
  return out;
}

/**
 * Heights at every cell centre: exact wherever a 4×4 block of cells reaches above the shelf break, bilinear between
 * block corners where all four lie below -20 (every feature's skirt is wider than a block, so none is missed).
 */
function bakeHeights(height: (p: V3) => number, P: Float32Array): Float32Array {
  const B = 4, NBK = HN / B, out = new Float32Array(6 * HN * HN), node = new Float32Array(NBK * NBK), p = v3();
  const exact = (c: number) => {
    p.x = P[c * 3]; p.y = P[c * 3 + 1]; p.z = P[c * 3 + 2];
    return height(p);
  };
  for (let f = 0; f < 6; f++) {
    const base = f * HN * HN;
    for (let b = 0; b < NBK; b++) for (let a = 0; a < NBK; a++) node[b * NBK + a] = exact(base + b * B * HN + a * B);
    for (let b = 0; b < NBK; b++) {
      for (let a = 0; a < NBK; a++) {
        const c0 = base + b * B * HN + a * B;
        const k = b * NBK + a, abyss = a < NBK - 1 && b < NBK - 1;
        const h00 = node[k], h10 = abyss ? node[k + 1] : 0, h01 = abyss ? node[k + NBK] : 0, h11 = abyss ? node[k + NBK + 1] : 0;
        if (abyss && Math.max(h00, h10, h01, h11) < -20) {
          for (let j = 0; j < B; j++) {
            for (let i = 0; i < B; i++) out[c0 + j * HN + i] = mix(mix(h00, h10, i / B), mix(h01, h11, i / B), j / B);
          }
        } else {
          for (let j = 0; j < B; j++) for (let i = 0; i < B; i++) out[c0 + j * HN + i] = i || j ? exact(c0 + j * HN + i) : h00;
        }
      }
    }
  }
  return out;
}

/** Signed distance to the SOLID contour: nearest-seed propagation (Dial buckets) from sub-cell contour crossings. */
function bakeCoast(heights: Float32Array, P: Float32Array): Float32Array {
  const total = heights.length, nn = HN * HN, BW = 0.5, NB = COAST_CAP / BW;
  const dist = new Float32Array(total).fill(COAST_CAP), seedOf = new Int32Array(total);
  const done = new Uint8Array(total), seeds: number[] = [];
  const buckets: number[][] = Array.from({ length: NB }, () => []);
  const offer = (c: number, k: number, d: number, from: number) => {
    if (d >= dist[c]) return;
    dist[c] = d;
    seedOf[c] = k;
    buckets[Math.max(from, Math.min(NB - 1, Math.floor(d / BW)))].push(c);
  };
  const contour = (a: number, b: number) => {
    const ha = heights[a], hb = heights[b];
    if (ha >= SOLID === hb >= SOLID) return;
    const t = (SOLID - ha) / (hb - ha), a3 = a * 3, b3 = b * 3, dx = P[b3] - P[a3], dy = P[b3 + 1] - P[a3 + 1];
    const dz = P[b3 + 2] - P[a3 + 2], x = P[a3] + dx * t, y = P[a3 + 1] + dy * t, z = P[a3 + 2] + dz * t;
    const l = Math.sqrt(x * x + y * y + z * z), id = seeds.length / 3, span = hyp(hyp(dx, dy), dz);
    seeds.push(x / l, y / l, z / l);
    offer(a, id, R * t * span, 0);
    offer(b, id, R * (1 - t) * span, 0);
  };
  for (let c = 0; c < total; c++) {
    const f = Math.floor(c / nn), r = c - f * nn, j = Math.floor(r / HN), i = r - j * HN;
    contour(c, i < HN - 1 ? c + 1 : wrapCell(f, i + 1, j, HN));
    contour(c, j < HN - 1 ? c + HN : wrapCell(f, i, j + 1, HN));
    if (i === 0) contour(c, wrapCell(f, i - 1, j, HN));
    if (j === 0) contour(c, wrapCell(f, i, j - 1, HN));
  }
  for (let b = 0; b < NB; b++) {
    const q = buckets[b];
    while (q.length) {
      const c = q.pop()!;
      if (done[c]) continue;
      done[c] = 1;
      const k = seedOf[c], sx = seeds[k * 3], sy = seeds[k * 3 + 1], sz = seeds[k * 3 + 2];
      const f = Math.floor(c / nn), r = c - f * nn, j = Math.floor(r / HN), i = r - j * HN;
      const inner = i > 0 && j > 0 && i < HN - 1 && j < HN - 1;
      for (let dj = -1; dj <= 1; dj++) {
        for (let di = -1; di <= 1; di++) {
          if (!di && !dj) continue;
          const m = inner ? c + dj * HN + di : wrapCell(f, i + di, j + dj, HN);
          if (done[m]) continue;
          const m3 = m * 3, dx = P[m3] - sx, dy = P[m3 + 1] - sy, dz = P[m3 + 2] - sz;
          const d = R * Math.sqrt(dx * dx + dy * dy + dz * dz);
          if (d < COAST_CAP) offer(m, k, d, b);
        }
      }
    }
  }
  for (let c = 0; c < total; c++) if (heights[c] >= SOLID) dist[c] = -dist[c];
  return dist;
}

// ---------------------------------------------------------------------------------------------
export function createWorld(seed: number): World {
  const rng = new Rng(seed ^ 0x77a1);
  const { isles, shelves } = layout(rng);
  const fields: Field[] = [...shelves, ...isles];
  const { start, list } = buildIndex(fields);

  const height = (p: V3): number => {
    let h = -47 + 3 * (1.7 * p.x * p.z + 0.6 * p.y * p.y - 0.4 * p.x + 1.1 * p.z * p.y);
    const cell = coarseCell(p);
    for (let k = start[cell], e = start[cell + 1]; k < e; k++) {
      const f = fields[list[k]];
      if (dot(p, f.c) < f.cosInf) continue;
      h = smax(h, f.at(R * dot(p, f.e1), R * dot(p, f.e2)), 3);
    }
    return h;
  };

  const islands = isles.map((g, id): Island => ({
    id, kind: g.kind, climate: g.climate, center: g.c, radius: g.ext + g.w1b + (g.water === REEF ? 13 : g.water === SHELF ? g.w2 : 4),
    peak: 0, seed: g.seed, sand: g.sand, rock: g.rock,
  }));

  // Lighthouses on the headlands that spread best around the planet, one per island.
  const cands: { g: number; x: number; y: number; dx: number; dy: number; h: number; p: V3 }[] = [];
  isles.forEach((g, gi) => {
    for (const hd of g.heads) {
      for (let t = 0; t < 14; t += 0.5) {
        const x = hd.x - hd.dx * t, y = hd.y - hd.dy * t;
        if (g.coastD(x, y) > -3.2) continue;
        const h = g.at(x, y), e = 0.25, gx = g.coastD(x + e, y) - g.coastD(x - e, y), gy = g.coastD(x, y + e) - g.coastD(x, y - e);
        const gl = hyp(gx, gy) || 1;
        const dx = gx / gl, dy = gy / gl;
        if (h > 4 && g.at(x + dx * 8, y + dy * 8) < 0) cands.push({ g: gi, x, y, dx, dy, h, p: toDir(g, x, y) });
        break;
      }
    }
  });
  const chosen: typeof cands = [];
  while (chosen.length < 6) {
    let best = -1, bestD = -2;
    cands.forEach((c, k) => {
      if (chosen.some((o) => o.g === c.g)) return;
      let near = -1;
      for (const o of chosen) near = Math.max(near, dot(o.p, c.p));
      if (-near > bestD) { bestD = -near; best = k; }
    });
    if (best < 0) break;
    chosen.push(cands[best]);
  }
  for (const c of chosen) {
    isles[c.g].pads.push({ x: c.x, y: c.y, r: 2.4, h: c.h });
    isles[c.g].marks.push({ kind: 'lighthouse', x: c.x, y: c.y, dx: c.dx, dy: c.dy, size: 2.4 });
  }

  const P = cellDirs(), heights = bakeHeights(height, P), coast = bakeCoast(heights, P);
  const uv: FaceUV = { face: 0, u: 0, v: 0 };
  const coastAt = (q: V3): number => {
    faceUV(q, uv);
    const fx = (uv.u + 1) * 0.5 * HN - 0.5, fy = (uv.v + 1) * 0.5 * HN - 0.5;
    const i = Math.max(0, Math.min(HN - 2, Math.floor(fx))), j = Math.max(0, Math.min(HN - 2, Math.floor(fy)));
    const tx = clamp01(fx - i), ty = clamp01(fy - j), b = uv.face * HN * HN + j * HN + i;
    return mix(mix(coast[b], coast[b + 1], tx), mix(coast[b + HN], coast[b + HN + 1], tx), ty);
  };

  const sites: Site[] = [];
  isles.forEach((g, id) => {
    for (const m of g.marks) {
      if (m.kind === 'arch') {
        // the feet are columns drawn through the warp: report where they really stand
        const [ax, ay] = g.unbend(m.path![0], m.path![1]), [bx, by] = g.unbend(m.path![2], m.path![3]), l = hyp(bx - ax, by - ay);
        const pos = toDir(g, (ax + bx) / 2, (ay + by) / 2);
        sites.push({ kind: 'arch', island: id, pos, facing: toTangent(g, pos, (bx - ax) / l, (by - ay) / l), size: l, height: m.height! });
        continue;
      }
      const pos = toDir(g, m.x, m.y);
      const site: Site = { kind: m.kind, island: id, pos, facing: toTangent(g, pos, m.dx, m.dy), size: m.size, height: m.height ?? height(pos) };
      if (m.kind === 'waterfall') site.size = site.height;
      if (m.path) {
        const path: V3[] = [];
        for (let i = 0; i < m.path.length; i += 2) path.push(toDir(g, m.path[i], m.path[i + 1]));
        site.path = path;
      }
      sites.push(site);
    }
    for (const c of g.cols) {
      if (c.h < 6) continue;
      const [x, y] = g.unbend(c.x, c.y), pos = toDir(g, x, y), hl = hyp(x, y) || 1;
      sites.push({ kind: 'stack', island: id, pos, facing: toTangent(g, pos, x / hl, y / hl), size: c.r, height: c.h });
    }
    let peak = 0, px = 0, py = 0;
    for (let y = -g.ext; y <= g.ext; y += 2.5) {
      for (let x = -g.ext; x <= g.ext; x += 2.5) {
        const h = g.at(x, y);
        if (h > peak) { peak = h; px = x; py = y; }
      }
    }
    for (let step = 1.2; step > 0.1; step *= 0.5) {
      for (let k = 0; k < 8; k++) {
        const [dx, dy] = rot(step, 0, (k * PI) / 4), h = g.at(px + dx, py + dy);
        if (h > peak) { peak = h; px += dx; py += dy; }
      }
    }
    islands[id].peak = peak;
  });

  // Props that must never be hit: everything stands in shallow water at least a metre inside the SOLID contour.
  const prng = new Rng(seed ^ 0x5eed), props: V3[] = [];
  const prop = (kind: SiteKind, id: number, x: number, y: number, size: number, ok: (h: number, c: number) => boolean,
    dx = 1, dy = 0): boolean => {
    const g = isles[id], pos = toDir(g, x, y), h = height(pos), c = coastAt(pos);
    if (!ok(h, c) || props.some((o) => chord(o, pos) < 3)) return false;
    props.push(pos);
    sites.push({ kind, island: id, pos, facing: toTangent(g, pos, dx, dy), size, height: h });
    return true;
  };
  const buoy = (h: number, c: number) => h > -0.78 && h < -0.38 && c < -1;
  const pole = (h: number, c: number) => h > -0.78 && h < -0.05 && c < -1;
  const lean = (): [number, number] => rot(1, 0, prng.range(0, 2 * PI));
  isles.forEach((g, id) => {
    const ch = g.marks.find((m) => m.kind === 'channel');
    if (ch) {
      // navigable width across the pass, then poles flanking its mouth and casks on the back-reef flat
      const site = sites.find((t) => t.kind === 'channel')!;
      const rr = hyp(ch.x, ch.y), arc = (o: number): [number, number] => {
        const [cx, cy] = rot(ch.dx, ch.dy, o / rr), r = g.ringR(cx, cy);
        return [cx * r, cy * r];
      };
      let w = 0;
      for (const side of [1, -1]) for (let o = 0; o < 30 && coastAt(toDir(g, ...arc(o * side))) > 0; o += 0.25) w += 0.25;
      site.size = w;
      for (const side of [1, -1]) {
        let poles = 0, casks = 0;
        for (let o = w / 2 + 1; o < w / 2 + 14 && (poles < 1 || casks < 1); o += 0.5) {
          for (let t = 2; t > -9; t -= 1) {
            const [ax, ay] = arc(o * side), x = ax + ch.dx * t, y = ay + ch.dy * t;
            if (t > -2 && !poles) poles += +prop('pole', id, x, y, prng.range(1.8, 2.6), pole, ...lean());
            else if (t <= -2 && !casks) casks += +prop('buoy', id, x, y, 0.55, buoy);
          }
        }
      }
    }
    const vil = g.marks.find((m) => m.kind === 'village'), pier = g.marks.find((m) => m.kind === 'pier');
    if (vil && pier) {
      const ex = pier.x + pier.dx * pier.size, ey = pier.y + pier.dy * pier.size;
      const pierSeg: Seg = { ax: pier.x, ay: pier.y, bx: ex, by: ey, w: 0, h: 0 };
      const spots: [number, number, number][] = [];
      for (let k = 0; k < 600; k++) {
        const r = Math.sqrt(k / 600) * vil.size, [x, y] = rot(r, 0, k * 2.399963);
        const d = segDist(vil.x + x, vil.y + y, pierSeg);
        if (d > 2.4) spots.push([vil.x + x, vil.y + y, Math.abs(d - 3.6) + 0.15 * hyp(vil.x + x - ex, vil.y + y - ey)]);
      }
      spots.sort((a, b) => a[2] - b[2]);
      let huts = 0;
      for (const [x, y] of spots) {
        if (huts === 7) break;
        let dry = false;
        for (let k = 0; k < 6 && !dry; k++) {
          const [ox, oy] = rot(1.4, 0, (k * PI) / 3);
          dry = height(toDir(g, x + ox, y + oy)) > -0.15;
        }
        segDist(x, y, pierSeg);
        const tx = mix(pierSeg.ax, pierSeg.bx, segT) - x, ty = mix(pierSeg.ay, pierSeg.by, segT) - y, tl = hyp(tx, ty);
        if (!dry && prop('hut', id, x, y, 0.65, (h, c) => h > -0.75 && h < -0.25 && c < -1.5, tx / tl, ty / tl)) huts++;
      }
      // harbour casks and mouth poles near the edge of the flat
      let casks = 0, poles = 0;
      for (let k = 0; k < 400 && (casks < 2 || poles < 2); k++) {
        const x = vil.x + prng.range(0.2, 1.3) * vil.size, y = vil.y + prng.range(-0.7, 0.7) * vil.size;
        const edge = coastAt(toDir(g, x, y)) > -3;
        if (edge && casks < 2) casks += +prop('buoy', id, x, y, 0.55, buoy);
        else if (edge && poles < 2) poles += +prop('pole', id, x, y, prng.range(1.8, 2.6), pole, ...lean());
      }
    }
  });
  // a marker pole on the reef edge of a few fringing reefs
  let marked = 0;
  isles.forEach((g, id) => {
    if (g.water !== REEF || marked >= 4 || g.kind === 'village') return;
    const [dx, dy] = rot(1, 0, prng.range(0, 2 * PI));
    for (let r = g.ext * 0.3; r < g.ext + 30; r += 0.5) {
      if (coastAt(toDir(g, dx * r, dy * r)) < -1 && coastAt(toDir(g, dx * (r + 2.5), dy * (r + 2.5))) > 0) {
        if (prop('pole', id, dx * r, dy * r, prng.range(1.8, 2.6), pole, ...lean())) marked++;
        break;
      }
    }
  });

  return { seed, islands, sites, heights, coast, height, coastAt, climate: climateAt };
}
