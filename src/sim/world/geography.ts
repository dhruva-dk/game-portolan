// The one fixed geography, built from the region data: height, signed coast distance, seabed, region and zones on
// the territory grid, the placed sites (lights, harbours, landmarks, falls, finds, stacks, floes), the fixed current
// lanes and the Great Current's seeded route. The simulation collides, slows and pays with these fields and the
// renderer meshes and paints the same ones, so the two never disagree.
//
// Each region's strokes become one smooth height field in its local chart (stroke vocabulary adapted from the
// earlier game's world.ts): land is a signed distance D from smooth unions of tapered capsules, carved by channels
// and bays and roughened by coastline noise; its height is a C1 profile of D (beach berm or cliff, blended by a
// cliffness field, plus ridge relief), and the seabed runs from the shallows over the region's shelf to the abyss.
// Reefs, bars, stacks, flats and cones join by smooth maxima. Deterministic math only: the same bits everywhere.
import { PI, datan2, dcos, dot, dsin, dtan, hash32, normalize, rngFrom, rngInt, set, v3, type V3 } from '../math.ts';
import { R, TERRITORY, cellOf, faceUV, fromLatLon, gnomonicDir, localFrame, neighbor } from '../sphere.ts';
import { DRAFT, FLOOR, REGIONS, TIDE, rimAt, type Perk, type Region } from './regions.ts';

const RIM = { r: 0, w: 0, crest: 0 };

/** Zone bits of the geography's zone field. */
export const ZONE = { kelp: 1, hot: 2, tidal: 4, lagoon: 8, harbour: 16, pack: 32, vortex: 64 } as const;
/** Water at least this far from the solid contour takes a hull's centre (nav, routes). */
export const CLEAR = 2;
/** The coast field is capped at ± this, u. */
export const COAST_CAP = 60;
/** Every feature's skirt sinks to this outside its reach, below any abyssal floor. */
const DEEP = -60;
/** A region's strokes reach no farther than this from its centre, u. */
const REACH = 104;
/** Domain warp: amplitude u, frequency 1/u. */
const WARP_A = 1.6, WARP_F = 0.03;

// ---------------------------------------------------------------------------------------------------------------
// Smooth scalar helpers, C1 Hermite splines and 2D gradient noise (integer hashing only).

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const hyp = (x: number, y: number) => Math.sqrt(x * x + y * y);
function smoothstep(a: number, b: number, x: number): number {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
}
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
// Knots (x, y, slope) for spline(): profiles are rebuilt per sample because their knots vary along the coast.
const KX = new Float64Array(8), KY = new Float64Array(8), KM = new Float64Array(8);
function knot(i: number, x: number, y: number, m: number): void {
  KX[i] = x; KY[i] = y; KM[i] = m;
}
/** Piecewise cubic through knots 0..n-1, flat outside. */
function spline(x: number, n: number): number {
  if (x <= KX[0]) return KY[0];
  for (let i = 1; i < n; i++) if (x < KX[i]) return herm(x, KX[i - 1], KX[i], KY[i - 1], KY[i], KM[i - 1], KM[i]);
  return KY[n - 1];
}

const G = 0.7071067811865476;
const GX = new Float64Array([1, -1, 0, 0, G, -G, G, -G]), GY = new Float64Array([0, 0, 1, -1, G, G, -G, -G]);
function lattice(ix: number, iy: number, s: number): number {
  let h = Math.imul(ix, 0x8da6b343) ^ Math.imul(iy, 0xd8163841) ^ s;
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
  return h ^ (h >>> 15);
}
/** Gradient noise, C2, roughly [−1, 1]. */
function noise(x: number, y: number, s: number): number {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
  const ux = fx * fx * fx * (fx * (fx * 6 - 15) + 10), uy = fy * fy * fy * (fy * (fy * 6 - 15) + 10);
  const ka = lattice(ix, iy, s) & 7, kb = lattice(ix + 1, iy, s) & 7;
  const kc = lattice(ix, iy + 1, s) & 7, kd = lattice(ix + 1, iy + 1, s) & 7;
  const a = GX[ka] * fx + GY[ka] * fy, b = GX[kb] * (fx - 1) + GY[kb] * fy;
  const c = GX[kc] * fx + GY[kc] * (fy - 1), d = GX[kd] * (fx - 1) + GY[kd] * (fy - 1);
  return 1.4 * (a + (b - a) * ux + (c - a + (a - b - c + d) * ux) * uy);
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
/** Sparse round knolls (coral and rock heads) on a jittered grid of `cell` u: 0 between, 1 on a crest. */
function knolls(x: number, y: number, cell: number, s: number): number {
  const fx = x / cell, fy = y / cell, ix = Math.floor(fx), iy = Math.floor(fy);
  let v = 0;
  for (let j = -1; j <= 1; j++) {
    for (let i = -1; i <= 1; i++) {
      const h = lattice(ix + i, iy + j, s);
      if ((h & 255) >= 90) continue;
      const dx = fx - ix - i - ((h >>> 8) & 255) / 255, dy = fy - iy - j - ((h >>> 16) & 255) / 255;
      const r = 0.2 + (0.3 * ((h >>> 24) & 255)) / 255, t = 1 - (dx * dx + dy * dy) / (r * r);
      if (t > 0 && t * t > v) v = t * t;
    }
  }
  return v;
}

// ---------------------------------------------------------------------------------------------------------------
// Region charts.

/** A region's local chart: centre and the east/north tangents there. */
export interface Chart { c: V3; e: V3; n: V3 }

export const CHARTS: readonly Chart[] = REGIONS.map((r) => {
  const c = fromLatLon(r.lat * (PI / 180), r.lon * (PI / 180), v3()), e = v3(), n = v3();
  localFrame(c, e, n);
  return { c, e, n };
});

/** The region whose centre is nearest p: its Voronoi cell, a face of the dual dodecahedron. */
export function regionOf(p: V3): number {
  let best = 0, bd = -2;
  for (let i = 0; i < CHARTS.length; i++) {
    const d = dot(p, CHARTS[i].c);
    if (d > bd) { bd = d; best = i; }
  }
  return best;
}

/** The unit direction at local chart point (x, y) of region `ri`. */
export function toWorld(ri: number, x: number, y: number, out: V3): V3 {
  const k = CHARTS[ri], s = x / R, t = y / R, w = Math.sqrt(Math.max(0, 1 - s * s - t * t));
  return normalize(set(out, k.e.x * s + k.n.x * t + k.c.x * w, k.e.y * s + k.n.y * t + k.c.y * w, k.e.z * s + k.n.z * t + k.c.z * w));
}

/** The unit tangent at p pointing along compass bearing b (degrees) of region `ri`'s chart. */
export function chartTangent(ri: number, p: V3, b: number, out: V3): V3 {
  const k = CHARTS[ri], s = dsin(b * (PI / 180)), c = dcos(b * (PI / 180));
  set(out, k.e.x * s + k.n.x * c, k.e.y * s + k.n.y * c, k.e.z * s + k.n.z * c);
  const d = dot(out, p);
  return normalize(set(out, out.x - d * p.x, out.y - d * p.y, out.z - d * p.z));
}

// ---------------------------------------------------------------------------------------------------------------
// Compiled strokes: one flat list of primitives per region, bucketed on an 8 u grid over the chart.

const SEG = 0, CUT = 1, BAY = 2, REEF = 3, BAR = 4, COL = 5, FLAT = 6, CONE = 7, KELP = 8, HOT = 9, PATCH = 10;

interface Prim {
  t: number;
  ax: number; ay: number; bx: number; by: number;
  /** Radii at a and b (capsules, carves), width (bars, reefs), radius (discs). */
  ra: number; rb: number;
  /** Ridge relief or crest or column height or flat depth or cone top. */
  h: number;
  cliff: number; ch: number;
  /** Floor of a flat; crater radius and floor of a cone; reef: lagoon depth (f2). */
  f0: number; f1: number; f2: number;
  gaps: readonly number[]; // reef passes: gx, gy (unit, chart), half-width, crest (NaN: deep)
  rim: Float64Array; // reef: its rim (radius, width, crest) at every whole degree of bearing 0 … 360 (regions.ts rimAt)
  great: boolean;
}

const NO_RIM = new Float64Array(0);
function prim(t: number, o: Partial<Prim>): Prim {
  return { t, ax: 0, ay: 0, bx: 0, by: 0, ra: 0, rb: 0, h: 0, cliff: 0, ch: 0, f0: 0, f1: 0, f2: 0, gaps: [], rim: NO_RIM, great: false, ...o };
}

/** A column of a stack wall or the Arch, in chart coordinates. */
export interface Column { x: number; y: number; r: number; h: number }

/** The columns of a wall along a polyline, packed too close for a hull to pass between (gaps under 1 u). */
function wallColumns(pts: readonly number[], r0: number, r1: number, h0: number, h1: number, seed: number): Column[] {
  const out: Column[] = [];
  let k = 0, carry = 0;
  for (let i = 0; i + 3 < pts.length; i += 2) {
    const ax = pts[i], ay = pts[i + 1], dx = pts[i + 2] - ax, dy = pts[i + 3] - ay, len = hyp(dx, dy);
    let s = carry;
    while (s < len) {
      const h = hash32(seed, k++), u = (h & 1023) / 1023, v = ((h >>> 10) & 1023) / 1023, w = ((h >>> 20) & 1023) / 1023;
      const r = mix(r0, r1, u), jitter = (v - 0.5) * 1.2;
      out.push({ x: ax + (dx * s) / len - (dy / len) * jitter, y: ay + (dy * s) / len + (dx / len) * jitter, r, h: mix(h0, h1, w) });
      s += 2 * r + 0.2 + 0.6 * v;
    }
    carry = s - len;
  }
  return out;
}

interface Compiled {
  region: Region;
  seed: number;
  prims: Prim[];
  /** Bucket b lists prims start[b] … start[b+1]−1 of `list`. */
  start: Int32Array;
  list: Int32Array;
  columns: Column[];
  shelf: readonly number[];
}

const BUCKET = 8, NB = Math.ceil((2 * REACH) / BUCKET);
const LAND_REACH = 36; // how far a land stroke's seabed runs before it reaches the abyss

function compile(region: Region, index: number): Compiled {
  const prims: Prim[] = [], reach: number[] = [], columns: Column[] = [];
  const add = (p: Prim, extra: number) => { prims.push(p); reach.push(extra); };
  const seg = (pts: readonly number[], t: number, o: Partial<Prim>, extra: number) => {
    if (pts.length === 3) add(prim(t, { ax: pts[0], ay: pts[1], bx: pts[0], by: pts[1], ra: pts[2], rb: pts[2], ...o }), extra);
    for (let i = 0; i + 5 < pts.length; i += 3) {
      add(prim(t, { ax: pts[i], ay: pts[i + 1], bx: pts[i + 3], by: pts[i + 4], ra: pts[i + 2], rb: pts[i + 5], ...o }), extra);
    }
  };
  for (const s of region.strokes) {
    switch (s.k) {
      case 'land': seg(s.pts, SEG, { h: s.top, cliff: s.cliff, ch: s.ch || region.shore.cliffH }, LAND_REACH); break;
      case 'carve': seg(s.pts, CUT, {}, 2); break;
      case 'bay': add(prim(BAY, { ax: s.x, ay: s.y, ra: s.r }), 8); break;
      case 'reef': {
        const gaps: number[] = [];
        for (const g of s.gaps) gaps.push(dsin(g.bearing * (PI / 180)), dcos(g.bearing * (PI / 180)), g.half, g.crest ?? NaN);
        const rim = new Float64Array(3 * 361);
        let rb = 0, ra = 0;
        for (let b = 0; b <= 360; b++) {
          rimAt(s.rim, b, RIM);
          rim[3 * b] = RIM.r; rim[3 * b + 1] = RIM.w; rim[3 * b + 2] = RIM.crest;
          rb = Math.max(rb, RIM.r);
          ra = Math.max(ra, RIM.w);
        }
        add(prim(REEF, { ax: s.x, ay: s.y, ra: ra + 2, rb: rb + 2, f2: s.lagoon, gaps, rim, great: s.great }), 36);
        break;
      }
      case 'patch':
        for (let i = 0; i + 2 < s.pts.length; i += 3) add(prim(PATCH, { ax: s.pts[i], ay: s.pts[i + 1], ra: s.pts[i + 2], h: s.crest }), 14);
        break;
      case 'bar':
        for (let i = 0; i + 3 < s.pts.length; i += 2) {
          add(prim(BAR, { ax: s.pts[i], ay: s.pts[i + 1], bx: s.pts[i + 2], by: s.pts[i + 3], ra: s.w, h: s.crest }), s.w + 16);
        }
        break;
      case 'column': columns.push({ x: s.x, y: s.y, r: s.r, h: s.h }); break;
      case 'stacks': columns.push(...wallColumns(s.pts, s.r0, s.r1, s.h0, s.h1, hash32(index, columns.length))); break;
      case 'flat': add(prim(FLAT, { ax: s.x, ay: s.y, ra: s.r, h: s.depth, f0: s.floor }), 16); break;
      case 'cone':
        add(prim(SEG, { ax: s.x, ay: s.y, bx: s.x, by: s.y, ra: s.r, rb: s.r, cliff: 0.25, ch: 4 }), LAND_REACH);
        add(prim(CONE, { ax: s.x, ay: s.y, ra: s.r, h: s.top, f0: s.crater, f1: s.floor }), 0);
        break;
      case 'kelp': add(prim(KELP, { ax: s.x, ay: s.y, ra: s.r }), 3); break;
      case 'hot': add(prim(HOT, { ax: s.x, ay: s.y, ra: s.r }), 2);
    }
  }
  for (const c of columns) add(prim(COL, { ax: c.x, ay: c.y, ra: c.r, h: c.h }), 8);

  // Bucket every primitive by the box it can influence (padded by the warp).
  const counts = new Int32Array(NB * NB + 1), boxes: number[] = [];
  for (let k = 0; k < prims.length; k++) {
    const p = prims[k], r = (p.t === REEF ? p.rb + p.ra : Math.max(p.ra, p.rb)) + reach[k] + WARP_A + 2;
    const x0 = Math.min(p.ax, p.t === SEG || p.t === CUT || p.t === BAR ? p.bx : p.ax) - r;
    const x1 = Math.max(p.ax, p.t === SEG || p.t === CUT || p.t === BAR ? p.bx : p.ax) + r;
    const y0 = Math.min(p.ay, p.t === SEG || p.t === CUT || p.t === BAR ? p.by : p.ay) - r;
    const y1 = Math.max(p.ay, p.t === SEG || p.t === CUT || p.t === BAR ? p.by : p.ay) + r;
    const i0 = Math.max(0, Math.floor((x0 + REACH) / BUCKET)), i1 = Math.min(NB - 1, Math.floor((x1 + REACH) / BUCKET));
    const j0 = Math.max(0, Math.floor((y0 + REACH) / BUCKET)), j1 = Math.min(NB - 1, Math.floor((y1 + REACH) / BUCKET));
    boxes.push(i0, i1, j0, j1);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) counts[j * NB + i + 1]++;
  }
  for (let b = 0; b < NB * NB; b++) counts[b + 1] += counts[b];
  const start = counts.slice(), fill = counts.slice(), list = new Int32Array(start[NB * NB]);
  for (let k = 0; k < prims.length; k++) {
    for (let j = boxes[k * 4 + 2]; j <= boxes[k * 4 + 3]; j++) {
      for (let i = boxes[k * 4]; i <= boxes[k * 4 + 1]; i++) list[fill[j * NB + i]++] = k;
    }
  }
  return { region, seed: hash32(0x9e0, index) & 0xfffff, prims, start, list, columns, shelf: region.shelf };
}

const COMPILED: readonly Compiled[] = REGIONS.map(compile);

// ---------------------------------------------------------------------------------------------------------------
// The height function of one region's chart. Results land in these scratch values.

let outH = 0, outFloor: number = FLOOR.sand, outZone = 0;
let capR = 0, segT = 0;

function segDist(px: number, py: number, p: Prim): number {
  const dx = p.bx - p.ax, dy = p.by - p.ay, qx = px - p.ax, qy = py - p.ay, l2 = dx * dx + dy * dy;
  segT = l2 > 0 ? clamp01((qx * dx + qy * dy) / l2) : 0;
  capR = p.ra + (p.rb - p.ra) * segT;
  return hyp(qx - dx * segT, qy - dy * segT);
}

/** The open ocean floor: an abyssal plain with broad, gentle swells. */
function abyss(p: V3): number {
  return -47 + 3 * (1.7 * p.x * p.z + 0.6 * p.y * p.y - 0.4 * p.x + 1.1 * p.z * p.y);
}

/** Height, floor and zones at chart point (x, y) of a compiled region; `base` is the abyss there. */
function sampleRegion(g: Compiled, x: number, y: number, base: number): void {
  const reg = g.region, sh = reg.shore, s = g.seed;
  let h = base, floor: number = sh.floor, zone = 0;
  const bi = Math.floor((x + REACH) / BUCKET), bj = Math.floor((y + REACH) / BUCKET);
  if (bi < 0 || bj < 0 || bi >= NB || bj >= NB) {
    outH = h; outFloor = floor; outZone = 0;
    return;
  }
  // The region's shelf: a smooth union of discs, its edge bent by a broad warp.
  {
    const wx = x + 6 * noise(x * 0.02, y * 0.02, s + 21), wy = y + 6 * noise(x * 0.02 + 5.2, y * 0.02, s + 22);
    let D = 1e9;
    for (let i = 0; i < g.shelf.length; i += 3) D = smin(D, hyp(wx - g.shelf[i], wy - g.shelf[i + 1]) - g.shelf[i + 2], 12);
    if (D < 34) {
      knot(0, 0, -sh.shelf[1], 0); knot(1, 12, -sh.shelf[1] - 12, -1.6); knot(2, 34, DEEP, 0);
      h = smax(h, spline(D, 3), 3);
    }
  }
  const wx = x + WARP_A * noise(x * WARP_F, y * WARP_F, s), wy = y + WARP_A * noise(x * WARP_F + 7.3, y * WARP_F - 2.1, s + 1);
  const b = bj * NB + bi, k0 = g.start[b], k1 = g.start[b + 1];

  // Land: signed distance, ridge relief, cliffness and cliff height (weighted toward the nearest strokes).
  let D = 1e9, rel = 0, clW = 0, cl = 0, hc = 0, cone = 0, coneSeen = false;
  for (let k = k0; k < k1; k++) {
    const p = g.prims[g.list[k]];
    if (p.t !== SEG) continue;
    const sd = segDist(wx, wy, p) - capR;
    D = smin(D, sd, 3);
    if (p.h > 0 && sd < 0) {
      const u = clamp01(-sd / capR);
      rel = smax(rel, p.h * u * (2 - u), 0.3 * p.h);
    }
    const w = 1 - smoothstep(-4, 10, sd);
    if (w > 0) { clW += w; cl += w * p.cliff; hc += w * p.ch; }
  }
  cl = clW > 0 ? cl / clW : 0;
  hc = clW > 0 ? hc / clW : sh.cliffH;
  for (let k = k0; k < k1; k++) {
    const p = g.prims[g.list[k]];
    if (p.t === CUT) {
      const d = segDist(wx, wy, p);
      D = smax(D, capR - d, 1.5);
    } else if (p.t === BAY) {
      const d = hyp(wx - p.ax, wy - p.ay);
      D = smax(D, p.ra - d, 3);
      cl -= 1.2 * (1 - smoothstep(p.ra - 2, p.ra + 6, d));
    } else if (p.t === CONE) {
      const rho = hyp(x - p.ax, y - p.ay);
      if (rho < p.ra) {
        // flanks steepening to the rim, the crater bowl inside, gullies down the slopes
        const uc = p.f0 / p.ra, v = 1 - (rho / p.ra - uc) / (1 - uc);
        const flank = p.h * v * v * (0.4 + 0.6 * v), q = rho / Math.max(p.f0, 1e-6);
        let c = smin(flank, p.f1 + (p.h - p.f1 + 6) * q * q * q * q, 4);
        if (rho > 1e-6) {
          const gl = 1 - Math.abs(noise(((x - p.ax) / rho) * 5.5, ((y - p.ay) / rho) * 5.5 + rho * 0.04, s + 13));
          c -= flank * 0.1 * gl * gl * smoothstep(p.f0, p.f0 * 2.5, rho);
        }
        cone = Math.max(cone, c);
      }
      coneSeen = true;
    }
  }
  const near = sh.shallows[0] + sh.shelf[0] + 6;
  if (D < LAND_REACH) {
    // the coastline's wiggle: smooth arcs on beaches, crenellations under cliffs
    const fade = 1 - smoothstep(near - 4, near + 2, D);
    const n1 = fade > 0 ? fade * noise(x * 0.035, y * 0.035, s + 2) : 0, n2 = fade > 0 ? fade * noise(x * 0.055 + 9.1, y * 0.055, s + 3) : 0;
    const c = smoothstep(0.35, 0.65, cl + 0.3 * n1), hcl = hc * (0.85 + 0.25 * n2);
    const Dn = fade > 0 ? D + fade * 0.7 * (0.5 + c) * fbm(x * 0.11, y * 0.11, s + 4, 3) : D;
    const w1 = sh.shallows[0] * (1 + 0.4 * n1), d1 = sh.shallows[1] * (1 + 0.3 * n2), d2 = sh.shelf[1], w2 = sh.shelf[0];
    const gs = Math.min((1.6 * sh.berm) / 4.5, (2.5 * d1) / w1), S = (2.4 * hcl) / 2.2;
    let lh: number;
    if (Dn <= 0) {
      const xl = -Dn, ramp = smoothstep(0, 9, xl);
      const hb = xl < 4.5 ? herm(xl, 0, 4.5, 0, sh.berm, gs, 0) : sh.berm;
      const hk = xl < 2.2 ? herm(xl, 0, 2.2, 0, hcl, S, 0) : hcl;
      const mountain = rel + (coneSeen ? cone : 0);
      lh = mix(hb, hk, c) + mountain * ramp + 0.25 * smoothstep(0, 3, xl) * noise(x * 0.3, y * 0.3, s + 6);
      if (rel > 0.5) {
        const r = 1 - Math.abs(noise(x * 0.06, y * 0.06, s + 7));
        lh += rel * ramp * 0.25 * (r * r - 0.5);
      }
      floor = c > 0.5 ? FLOOR.rock : sh.sand;
    } else {
      const wd = Math.max(0.8, (2.4 * d2) / S), end = w1 + w2 + 20;
      knot(0, 0, 0, -S); knot(1, wd, -d2, 0); knot(2, Math.max(end, wd + 8), DEEP, 0);
      const cliff = spline(Dn, 3);
      knot(0, 0, 0, -gs); knot(1, w1, -d1, (-0.6 * (d2 - d1)) / w2); knot(2, w1 + w2, -d2, 0); knot(3, w1 + w2 + 20, DEEP, 0);
      lh = mix(spline(Dn, 4), cliff, c);
      if (lh < -1.4 && lh > -9) lh += knolls(x, y, 5, s + 8) * 0.8 * (-1.4 - lh) * smoothstep(-9, -4, lh);
      if (Dn < near) floor = c > 0.5 ? FLOOR.rock : sh.sand;
    }
    h = smax(h, lh, 1.5);
  }

  // Reefs, bars, columns, flats; kelp and hot water.
  for (let k = k0; k < k1; k++) {
    const p = g.prims[g.list[k]];
    switch (p.t) {
      case REEF: {
        const lx = x - p.ax, ly = y - p.ay, rho = hyp(lx, ly);
        if (rho > p.rb + p.ra + 36) break;
        // the rim at this bearing, its line and its flat's edges roughened (ragged by a few tenths of a unit, the
        // flat's width by a fifth), so no stretch of it runs on as an even band
        let deg = datan2(lx, ly) * (180 / PI);
        if (deg < 0) deg += 360;
        const ib = Math.min(359, Math.floor(deg)), fb = deg - ib, L = p.rim, o = 3 * ib, r0 = mix(L[o], L[o + 3], fb);
        if (rho - r0 > 0.6 * p.ra + 37) break; // past the reef front's foot: the abyss either way
        const rr = r0 + 0.45 * noise(x * 0.19 + 2.3, y * 0.19 - 1.7, s + 17);
        const t = rho - rr, hw = (mix(L[o + 1], L[o + 4], fb) / 2) * (1 + 0.2 * noise(x * 0.13 - 4.1, y * 0.13 + 0.6, s + 18)), c = mix(L[o + 2], L[o + 5], fb);
        // the flat: highest along its seaward edge (the algal ridge), sloping down gently to the back reef, which falls
        // to the lagoon floor over 3 … 5 u (steeper in a small ring, so its lagoon is not all slope)
        knot(0, -hw - Math.min(5, Math.max(3, 0.3 * r0)), -p.f2, 0); knot(1, -hw, c - 0.3, 0.06); knot(2, 0.4 * hw, c, 0); knot(3, hw, c - 0.25, -0.3);
        knot(4, hw + 4, -8, -2); knot(5, hw + 14, -24, -1); knot(6, hw + 34, DEEP, 0);
        let rh = spline(t, 7);
        if (t < -hw - 2) rh += 0.8 * knolls(x, y, 8, s + 10) * Math.max(0, -1.4 - rh);
        // passes: deep channels, or sills awash at their own crest
        const ux = lx / Math.max(rho, 1e-6), uy = ly / Math.max(rho, 1e-6);
        for (let i = 0; i < p.gaps.length; i += 4) {
          const along = rr * Math.abs(ux * p.gaps[i + 1] - uy * p.gaps[i]), facing = ux * p.gaps[i] + uy * p.gaps[i + 1];
          if (facing <= 0) continue;
          const gw = 1 - smoothstep(p.gaps[i + 2], p.gaps[i + 2] + 1.5, along);
          const floorH = p.gaps[i + 3] === p.gaps[i + 3] ? p.gaps[i + 3] : -6;
          if (gw > 0 && t > -hw - 6 && t < hw + 6) rh += (Math.min(rh, floorH) - rh) * gw;
        }
        if (rh > h - 3) {
          if (t > -hw - 3 && t < hw + 8) floor = FLOOR.coral;
          else if (t <= -hw - 3) floor = FLOOR.sand;
        }
        h = smax(h, rh, 1.2);
        if (p.great && t < -hw - 0.5) zone |= ZONE.lagoon;
        break;
      }
      case PATCH: {
        // a patch reef: a flat-topped coral head, its edge lobed, steep sides down to the floor round it
        const d0 = hyp(x - p.ax, y - p.ay);
        if (d0 > 1.45 * p.ra + 14) break;
        const d = d0 - p.ra * (1 + 0.3 * noise(x * 0.45 + p.ax, y * 0.45 - p.ay, s + 19));
        if (d > 14) break;
        knot(0, -0.5 * p.ra, p.h, 0); knot(1, 0, p.h - 0.35, -0.5); knot(2, 2.5, -5, -1); knot(3, 14, DEEP, 0);
        const ph = spline(d, 4);
        if (ph > h - 1) floor = FLOOR.coral;
        h = smax(h, ph, 0.8);
        break;
      }
      case BAR: {
        const d = segDist(x, y, p);
        knot(0, 0, p.h, 0); knot(1, p.ra, p.h - 0.4, -0.3); knot(2, p.ra + 4, -4, 0); knot(3, p.ra + 16, DEEP, 0);
        const bh = spline(d + 0.6 * noise(x * 0.15, y * 0.15, s + 14), 4);
        if (bh > h) floor = sh.sand === FLOOR.sand || sh.sand === FLOOR.mud ? sh.sand : FLOOR.coral;
        h = smax(h, bh, 1);
        break;
      }
      case COL: {
        const u = hyp(x - p.ax, y - p.ay) - p.ra;
        if (u > 8) break;
        const S = (2.4 * p.h) / (0.3 * p.ra), wd = Math.max(0.6, 12 / S);
        knot(0, -0.3 * p.ra, p.h, 0); knot(1, 0, 0, -S); knot(2, wd, -4, 0); knot(3, wd + 6, DEEP, 0);
        const chh = spline(u, 4);
        if (chh > h - 1) floor = FLOOR.rock;
        h = smax(h, chh, 0.8);
        break;
      }
      case FLAT: {
        const d = hyp(x - p.ax, y - p.ay);
        knot(0, p.ra, -p.h, 0); knot(1, p.ra + 5, -p.h - 5, 0); knot(2, p.ra + 15, DEEP, 0);
        const fh = spline(d, 3) + 0.08 * noise(x * 0.4, y * 0.4, s + 12);
        if (fh > h + 0.5) floor = p.f0;
        h = smax(h, fh, 0.5);
        break;
      }
      case KELP: {
        const d = hyp(x - p.ax, y - p.ay) - p.ra * (1 + 0.25 * noise(x * 0.12, y * 0.12, s + 16));
        if (d < 0) zone |= ZONE.kelp;
        break;
      }
      case HOT:
        if (hyp(x - p.ax, y - p.ay) < p.ra * (1 + 0.2 * noise(x * 0.15, y * 0.15, s + 17))) zone |= ZONE.hot;
    }
  }
  if (zone & ZONE.kelp && h < -DRAFT) floor = FLOOR.kelp;
  if (reg.id === 'iceCrown' && h > -DRAFT) floor = FLOOR.ice;
  outH = h; outFloor = floor; outZone = zone;
}

const LOCAL = { x: 0, y: 0 };
/** The chart coordinates of p in region ri. */
export function toChart(ri: number, p: V3): { x: number; y: number } {
  const k = CHARTS[ri];
  LOCAL.x = R * dot(p, k.e);
  LOCAL.y = R * dot(p, k.n);
  return LOCAL;
}

/** Exact height at direction p, u above mean sea level (seabed negative); also sets the floor and zone scratch. */
function sampleAt(p: V3): number {
  const ri = regionOf(p), k = CHARTS[ri], base = abyss(p);
  const x = R * dot(p, k.e), y = R * dot(p, k.n);
  if (x * x + y * y < REACH * REACH) sampleRegion(COMPILED[ri], x, y, base);
  else { outH = base; outFloor = REGIONS[ri].shore.floor; outZone = 0; }
  return outH;
}
export function heightExact(p: V3): number {
  return sampleAt(p);
}

// ---------------------------------------------------------------------------------------------------------------
// The baked fields.

export interface Placed { region: number; pos: V3; facing: V3; height: number }
export interface Landmark extends Placed { name: string; perk: Perk; r: number }
export interface Harbour extends Placed { moorings: number; r: number }
export interface Light extends Placed { period: number }
export interface Find extends Placed { kind: 'wreck' | 'cache'; richness: number }
export interface Stack extends Placed { r: number }
/** An Ice Crown floe at time 0: chart radius from the pole, angle (rad), size; its ring turns at ring.speed. */
export interface Floe { ring: number; r: number; angle: number; size: number }
/** A fixed current lane between two regions: great-circle arc a → b, width and speed. */
export interface Lane { from: number; to: number; a: V3; b: V3; width: number; speed: number }

export interface Geography {
  /** Per territory cell (TERRITORY indexing): height u above mean sea level. */
  heights: Float32Array;
  /** Signed distance to the mean-tide solid contour, u, capped ±COAST_CAP: positive in navigable water. */
  coast: Float32Array;
  floor: Uint8Array;
  region: Uint8Array;
  zones: Uint8Array;
  landmarks: Landmark[];
  harbours: Harbour[];
  lights: Light[];
  cascades: Placed[];
  finds: Find[];
  stacks: Stack[];
  floes: Floe[];
  lanes: Lane[];
}

const N = TERRITORY.n, NN = N * N;
const TAN = new Float64Array(N);
for (let i = 0; i < N; i++) TAN[i] = dtan((((i + 0.5) / N) * 2 - 1) * (PI / 4));

/** Unit direction of every territory cell centre, xyz interleaved. */
function cellDirs(): Float32Array {
  const out = new Float32Array(6 * NN * 3), p = v3();
  let k = 0;
  for (let f = 0; f < 6; f++) {
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        gnomonicDir(f, TAN[i], TAN[j], p);
        out[k++] = p.x; out[k++] = p.y; out[k++] = p.z;
      }
    }
  }
  return out;
}

/**
 * Heights, floors and zones at every cell: exact wherever a 4×4 block reaches above −20, bilinear between block
 * corners where all four lie below it (every feature's skirt is wider than a block, so none is missed).
 */
function bake(P: Float32Array, geo: Geography): void {
  const B = 4, NBK = N / B, node = new Float32Array((NBK + 1) * (NBK + 1)), p = v3();
  const exact = (c: number) => {
    set(p, P[c * 3], P[c * 3 + 1], P[c * 3 + 2]);
    const h = sampleAt(p);
    geo.floor[c] = outFloor;
    geo.zones[c] = outZone;
    geo.region[c] = regionOf(p);
    return h;
  };
  const q = v3();
  for (let f = 0; f < 6; f++) {
    const base = f * NN;
    // block corners, including the far edge of the face (sampled just inside it)
    for (let b = 0; b <= NBK; b++) {
      for (let a = 0; a <= NBK; a++) {
        const i = Math.min(N - 1, a * B), j = Math.min(N - 1, b * B);
        set(q, P[(base + j * N + i) * 3], P[(base + j * N + i) * 3 + 1], P[(base + j * N + i) * 3 + 2]);
        node[b * (NBK + 1) + a] = sampleAt(q);
      }
    }
    for (let b = 0; b < NBK; b++) {
      for (let a = 0; a < NBK; a++) {
        const k = b * (NBK + 1) + a, c0 = base + b * B * N + a * B;
        const h00 = node[k], h10 = node[k + 1], h01 = node[k + NBK + 1], h11 = node[k + NBK + 2];
        const deep = Math.max(h00, h10, h01, h11) < -20;
        for (let j = 0; j < B; j++) {
          for (let i = 0; i < B; i++) {
            const c = c0 + j * N + i;
            if (deep) {
              geo.heights[c] = mix(mix(h00, h10, i / B), mix(h01, h11, i / B), j / B);
              set(p, P[c * 3], P[c * 3 + 1], P[c * 3 + 2]);
              const ri = regionOf(p);
              geo.region[c] = ri;
              geo.floor[c] = REGIONS[ri].shore.floor;
            } else geo.heights[c] = exact(c);
          }
        }
      }
    }
  }
}

/** Signed distance to the mean-tide solid contour: nearest-seed propagation (Dial buckets) from sub-cell crossings. */
function bakeCoast(heights: Float32Array, P: Float32Array): Float32Array {
  const total = heights.length, BW = 0.5, NBUCK = COAST_CAP / BW, SOLID = -DRAFT;
  const dist = new Float32Array(total).fill(COAST_CAP), seedOf = new Int32Array(total), done = new Uint8Array(total);
  const seeds: number[] = [], buckets: number[][] = [];
  for (let b = 0; b < NBUCK; b++) buckets.push([]);
  const offer = (c: number, k: number, d: number, from: number) => {
    if (d >= dist[c]) return;
    dist[c] = d;
    seedOf[c] = k;
    buckets[Math.max(from, Math.min(NBUCK - 1, Math.floor(d / BW)))].push(c);
  };
  const contour = (a: number, b: number) => {
    const ha = heights[a], hb = heights[b];
    if (ha >= SOLID === hb >= SOLID) return;
    const t = (SOLID - ha) / (hb - ha), a3 = a * 3, b3 = b * 3, dx = P[b3] - P[a3], dy = P[b3 + 1] - P[a3 + 1];
    const dz = P[b3 + 2] - P[a3 + 2], x = P[a3] + dx * t, y = P[a3 + 1] + dy * t, z = P[a3 + 2] + dz * t;
    const l = Math.sqrt(x * x + y * y + z * z), id = seeds.length / 3, span = Math.sqrt(dx * dx + dy * dy + dz * dz);
    seeds.push(x / l, y / l, z / l);
    offer(a, id, R * t * span, 0);
    offer(b, id, R * (1 - t) * span, 0);
  };
  for (let c = 0; c < total; c++) {
    contour(c, neighbor(TERRITORY, c, 1));
    contour(c, neighbor(TERRITORY, c, 3));
  }
  const ring = new Int32Array(8);
  for (let b = 0; b < NBUCK; b++) {
    const q = buckets[b];
    while (q.length) {
      const c = q.pop()!;
      if (done[c]) continue;
      done[c] = 1;
      const k = seedOf[c], sx = seeds[k * 3], sy = seeds[k * 3 + 1], sz = seeds[k * 3 + 2];
      const w = neighbor(TERRITORY, c, 0), e = neighbor(TERRITORY, c, 1);
      ring[0] = w; ring[1] = e; ring[2] = neighbor(TERRITORY, c, 2); ring[3] = neighbor(TERRITORY, c, 3);
      ring[4] = neighbor(TERRITORY, w, 2); ring[5] = neighbor(TERRITORY, w, 3);
      ring[6] = neighbor(TERRITORY, e, 2); ring[7] = neighbor(TERRITORY, e, 3);
      for (let r = 0; r < 8; r++) {
        const m = ring[r];
        if (done[m]) continue;
        const m3 = m * 3, dx = P[m3] - sx, dy = P[m3 + 1] - sy, dz = P[m3 + 2] - sz;
        const d = R * Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (d < COAST_CAP) offer(m, k, d, b);
      }
    }
  }
  for (let c = 0; c < total; c++) if (heights[c] >= SOLID) dist[c] = -dist[c];
  return dist;
}

// ---------------------------------------------------------------------------------------------------------------
// Sites.

/** Where a ray from (x, y) along bearing b crosses the mean-tide shore, as a distance along it (searching both ways). */
function shoreAlong(ri: number, x: number, y: number, b: number): number {
  const dx = dsin(b * (PI / 180)), dy = dcos(b * (PI / 180)), p = v3();
  const wet = (t: number) => sampleAt(toWorld(ri, x + dx * t, y + dy * t, p)) < -DRAFT;
  const startWet = wet(0);
  let t = 0;
  for (; Math.abs(t) < 80 && wet(t) === startWet; t += startWet ? -0.25 : 0.25);
  return startWet ? t + 0.125 : t - 0.125;
}

function place(ri: number, x: number, y: number, facing: number, inset: number | null): Placed {
  let px = x, py = y;
  if (inset !== null) {
    const t = shoreAlong(ri, x, y, facing) - inset;
    px += dsin(facing * (PI / 180)) * t;
    py += dcos(facing * (PI / 180)) * t;
  }
  const pos = toWorld(ri, px, py, v3());
  return { region: ri, pos, facing: chartTangent(ri, pos, facing, v3()), height: sampleAt(pos) };
}

function placeSites(geo: Geography): void {
  REGIONS.forEach((reg, ri) => {
    const m = reg.landmark;
    geo.landmarks.push({ ...place(ri, m.x, m.y, 0, null), name: m.name, perk: m.perk, r: m.r });
    for (const h of reg.harbours) geo.harbours.push({ ...place(ri, h.x, h.y, h.facing, null), moorings: h.moorings, r: h.r });
    for (const l of reg.lighthouses) geo.lights.push({ ...place(ri, l.x, l.y, l.facing, 2), period: l.period });
    for (const c of reg.cascades) geo.cascades.push(place(ri, c.x, c.y, c.facing, 1.2));
    for (const f of reg.finds) {
      geo.finds.push({ ...place(ri, f.x, f.y, f.facing, f.kind === 'cache' ? 1.5 : null), kind: f.kind, richness: reg.richness });
    }
    for (const c of COMPILED[ri].columns) {
      const pos = toWorld(ri, c.x, c.y, v3());
      geo.stacks.push({ region: ri, pos, facing: chartTangent(ri, pos, 0, v3()), height: c.h, r: c.r });
    }
    reg.mechanics.floes?.forEach((ring, k) => {
      for (let i = 0; i < ring.count; i++) {
        const h = hash32(ri * 16 + k, i), u = (h & 1023) / 1023, v = ((h >>> 10) & 1023) / 1023;
        geo.floes.push({ ring: k, r: ring.r + (v - 0.5) * 2, angle: ((i + 0.35 * (u - 0.5)) / ring.count) * 2 * PI,
          size: mix(ring.size0, ring.size1, ((h >>> 20) & 1023) / 1023) });
      }
    });
  });
}

/** Static zones that need no stroke: pack ice and the vortex (by chart radius) and harbour waters. */
function markZones(geo: Geography, P: Float32Array): void {
  const p = v3();
  for (let c = 0; c < geo.zones.length; c++) {
    const ri = geo.region[c], mech = REGIONS[ri].mechanics, h = geo.heights[c];
    if (h > -DRAFT - TIDE.amp && h <= -DRAFT + TIDE.amp) geo.zones[c] |= ZONE.tidal;
    if (!mech.packR && !mech.vortex) continue;
    set(p, P[c * 3], P[c * 3 + 1], P[c * 3 + 2]);
    const l = toChart(ri, p), r2 = l.x * l.x + l.y * l.y;
    if (mech.packR && r2 < mech.packR * mech.packR && h < -DRAFT) geo.zones[c] |= ZONE.pack;
    if (mech.vortex && r2 < mech.vortex.r * mech.vortex.r) geo.zones[c] |= ZONE.vortex;
  }
  for (const hb of geo.harbours) {
    // the harbour's waters: a disc of its radius round the anchorage, flood-filled through navigable cells only
    const start = cellOf(TERRITORY, hb.pos), stack = [start], lim = 1 - (hb.r * hb.r) / (2 * R * R);
    geo.zones[start] |= ZONE.harbour;
    while (stack.length) {
      const c = stack.pop()!;
      for (let k = 0; k < 4; k++) {
        const m = neighbor(TERRITORY, c, k);
        if (geo.zones[m] & ZONE.harbour || geo.coast[m] <= 0) continue;
        if (P[m * 3] * hb.pos.x + P[m * 3 + 1] * hb.pos.y + P[m * 3 + 2] * hb.pos.z < lim) continue;
        geo.zones[m] |= ZONE.harbour;
        stack.push(m);
      }
    }
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Currents.

/** Each region's five neighbours (the icosahedron's edges), nearest first. */
export const NEIGHBOURS: readonly (readonly number[])[] = CHARTS.map((a, i) =>
  CHARTS.map((b, j) => ({ j, d: dot(a.c, b.c) })).filter((o) => o.j !== i).sort((x, y) => y.d - x.d || x.j - y.j)
    .slice(0, 5).map((o) => o.j));

/** The fixed lanes: the upper ring flows east, the lower ring west, and four lanes join the poles and the rings. */
const LANE_PAIRS: readonly (readonly [string, string])[] = [
  ['fjords', 'basaltStacks'], ['basaltStacks', 'kelpShallows'], ['kelpShallows', 'amberShoals'],
  ['amberShoals', 'weepingIsle'], ['weepingIsle', 'fjords'],
  ['spiceIsles', 'coralAtolls'], ['coralAtolls', 'mangroveLabyrinth'], ['mangroveLabyrinth', 'fireArchipelago'],
  ['fireArchipelago', 'glassSea'], ['glassSea', 'spiceIsles'],
  ['iceCrown', 'kelpShallows'], ['weepingIsle', 'iceCrown'], ['maelstrom', 'glassSea'], ['mangroveLabyrinth', 'maelstrom'],
  ['amberShoals', 'mangroveLabyrinth'], ['spiceIsles', 'fjords'],
];
const LANE_RIM = 82, LANE_WIDTH = 10, LANE_SPEED = 4.5;

function buildLanes(): Lane[] {
  const index = (id: string) => REGIONS.findIndex((r) => r.id === id);
  return LANE_PAIRS.map(([f, t]) => {
    const from = index(f), to = index(t), a = v3(), b = v3(), u = v3();
    slerpToward(CHARTS[from].c, CHARTS[to].c, LANE_RIM, a, u);
    slerpToward(CHARTS[to].c, CHARTS[from].c, LANE_RIM, b, u);
    return { from, to, a, b, width: LANE_WIDTH, speed: LANE_SPEED };
  });
}

/** The point `dist` u from p along the great circle toward q. */
function slerpToward(p: V3, q: V3, dist: number, out: V3, t: V3): V3 {
  normalize(set(t, q.x - p.x * dot(p, q), q.y - p.y * dot(p, q), q.z - p.z * dot(p, q)));
  const a = dist / R, c = dcos(a), s = dsin(a);
  return normalize(set(out, p.x * c + t.x * s, p.y * c + t.y * s, p.z * c + t.z * s));
}

/** Every lane through each region: its designed passes, then half-circles round it at its rim (W→E north and south of
 * it, N→S east and west of it), each sampled every ~6°. */
const LANES_THROUGH: readonly (readonly (readonly number[])[])[] = REGIONS.map((r) => {
  const half = (a0: number, a1: number) => {
    const out: number[] = [];
    for (let k = 0; k <= 30; k++) {
      const a = (a0 + ((a1 - a0) * k) / 30) * (PI / 180);
      out.push(r.rim * dsin(a), r.rim * dcos(a));
    }
    return out;
  };
  return [...r.passes, half(270, 450), half(270, 90), half(0, 180), half(360, 180)];
});

/** The Great Current's route for a match: the regions it passes in order and its centreline every ~2 u. */
export interface CurrentRoute { regions: number[]; points: Float64Array; length: number }

/**
 * A smooth route through four or five neighbouring regions, chosen by the seed: a walk on the icosahedron that never
 * doubles back, riding through each region along the lane that best lines up with the way in and out.
 */
export function greatCurrent(seed: number): CurrentRoute {
  const rng = rngFrom(hash32(seed, 0xc0ffee)), regions = [rngInt(rng, REGIONS.length)], n = 4 + rngInt(rng, 2);
  while (regions.length < n) {
    const cur = regions[regions.length - 1], prev = regions.length > 1 ? regions[regions.length - 2] : -1;
    const opts = NEIGHBOURS[cur].filter((j) => !regions.includes(j) && (prev < 0 || !NEIGHBOURS[prev].includes(j)));
    const pool = opts.length ? opts : NEIGHBOURS[cur].filter((j) => !regions.includes(j));
    regions.push(pool[rngInt(rng, pool.length)]);
  }
  // Each region's lane, the one whose ends point back the way the route came and on toward where it goes.
  const way: V3[] = [], p = v3();
  regions.forEach((ri, i) => {
    const toward = (j: number) => {
      const l = toChart(ri, CHARTS[j].c), d = hyp(l.x, l.y);
      return { x: l.x / d, y: l.y / d };
    };
    const back = i > 0 ? toward(regions[i - 1]) : null, on = i < n - 1 ? toward(regions[i + 1]) : null;
    let best = LANES_THROUGH[ri][0], bestScore = -Infinity, flip = false;
    for (const lane of LANES_THROUGH[ri]) {
      const m = lane.length, ax = lane[0], ay = lane[1], bx = lane[m - 2], by = lane[m - 1], la = hyp(ax, ay), lb = hyp(bx, by);
      const fit = (sx: number, sy: number, ls: number, ex: number, ey: number, le: number) =>
        (back ? (sx * back.x + sy * back.y) / ls : 0) + (on ? (ex * on.x + ey * on.y) / le : 0);
      const f = fit(ax, ay, la, bx, by, lb), r = fit(bx, by, lb, ax, ay, la);
      if (f > bestScore) { bestScore = f; best = lane; flip = false; }
      if (r > bestScore) { bestScore = r; best = lane; flip = true; }
    }
    for (let k = 0; k < best.length; k += 2) {
      const kk = flip ? best.length - 2 - k : k;
      way.push(toWorld(ri, best[kk], best[kk + 1], v3()));
    }
  });
  // Round every corner (Chaikin cutting on the sphere), then resample every ~2 u.
  let pts = way;
  for (let it = 0; it < 4; it++) {
    const next: V3[] = [pts[0]];
    for (let i = 0; i + 1 < pts.length; i++) {
      const a = pts[i], b = pts[i + 1];
      next.push(normalize(v3(a.x * 0.75 + b.x * 0.25, a.y * 0.75 + b.y * 0.25, a.z * 0.75 + b.z * 0.25)));
      next.push(normalize(v3(a.x * 0.25 + b.x * 0.75, a.y * 0.25 + b.y * 0.75, a.z * 0.25 + b.z * 0.75)));
    }
    next.push(pts[pts.length - 1]);
    pts = next;
  }
  const out: number[] = [pts[0].x, pts[0].y, pts[0].z];
  let length = 0, carry = 0;
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = pts[i], b = pts[i + 1], seg = R * Math.sqrt((b.x - a.x) * (b.x - a.x) + (b.y - a.y) * (b.y - a.y) + (b.z - a.z) * (b.z - a.z));
    let s = 2 - carry;
    while (s <= seg) {
      const t = s / seg;
      normalize(set(p, a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, a.z + (b.z - a.z) * t));
      out.push(p.x, p.y, p.z);
      s += 2;
    }
    carry = seg - (s - 2);
    length += seg;
  }
  return { regions, points: new Float64Array(out), length };
}

// ---------------------------------------------------------------------------------------------------------------

/** Build the whole geography (≈ 1 s on a desktop; run it in the world worker). */
export function buildGeography(): Geography {
  const total = 6 * NN;
  const geo: Geography = {
    heights: new Float32Array(total), coast: new Float32Array(0), floor: new Uint8Array(total), region: new Uint8Array(total),
    zones: new Uint8Array(total), landmarks: [], harbours: [], lights: [], cascades: [], finds: [], stacks: [], floes: [],
    lanes: buildLanes(),
  };
  const P = cellDirs();
  bake(P, geo);
  geo.coast = bakeCoast(geo.heights, P);
  placeSites(geo);
  markZones(geo, P);
  return geo;
}

const UV = { face: 0, u: 0, v: 0 };
/** A territory-cell field bilinearly interpolated at direction p. */
function bilinear(field: Float32Array, p: V3): number {
  faceUV(p, UV);
  const fx = (UV.u + 1) * 0.5 * N - 0.5, fy = (UV.v + 1) * 0.5 * N - 0.5;
  const i = Math.max(0, Math.min(N - 2, Math.floor(fx))), j = Math.max(0, Math.min(N - 2, Math.floor(fy)));
  const tx = clamp01(fx - i), ty = clamp01(fy - j), b = UV.face * NN + j * N + i;
  return mix(mix(field[b], field[b + 1], tx), mix(field[b + N], field[b + N + 1], tx), ty);
}
export const heightAt = (geo: Geography, p: V3): number => bilinear(geo.heights, p);
export const coastAt = (geo: Geography, p: V3): number => bilinear(geo.coast, p);
/** Whether a hull can float at p at sea level `tide` (u above mean). */
export const navigable = (geo: Geography, p: V3, tide: number): boolean => heightAt(geo, p) < tide - DRAFT;

