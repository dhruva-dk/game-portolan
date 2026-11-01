// The world: a hand-built inland sea ringed by mountains, generated in code. Pure data: heights, biomes, flora,
// loot spawns and a navigation grid for the captains. Everything here is deterministic.

export const HALF = 1000; // the height field spans [-HALF, HALF] on x and z
export const RES = 801; // samples per side
export const CELL = (2 * HALF) / (RES - 1);
export const PLAY_R = 565; // the rim of the sailable sea: the storm wall stands here from the start
// The layout below is written on a looser grid and drawn in: K pulls places together, KS shrinks them a little less.
const K = 0.78, KS = 0.86;
export const SEA_FLOOR = -16;
export const DRAFT = -1.3; // water shallower than this grounds a hull

// ---------------------------------------------------------------- noise

export function rng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const PERM = new Uint8Array(512);
{
  const r = rng(1337), p = Array.from({ length: 256 }, (_, i) => i);
  for (let i = 255; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [p[i], p[j]] = [p[j], p[i]]; }
  for (let i = 0; i < 512; i++) PERM[i] = p[i & 255];
}
const G2 = [1, 1, -1, 1, 1, -1, -1, -1, 1, 0, -1, 0, 0, 1, 0, -1];
const F2 = 0.5 * (Math.sqrt(3) - 1), G2C = (3 - Math.sqrt(3)) / 6;

/** 2D simplex noise in [-1, 1]. */
export function noise(x: number, y: number): number {
  const s = (x + y) * F2, i = Math.floor(x + s), j = Math.floor(y + s);
  const t = (i + j) * G2C, x0 = x - (i - t), y0 = y - (j - t);
  const i1 = x0 > y0 ? 1 : 0, j1 = 1 - i1;
  const x1 = x0 - i1 + G2C, y1 = y0 - j1 + G2C, x2 = x0 - 1 + 2 * G2C, y2 = y0 - 1 + 2 * G2C;
  const ii = i & 255, jj = j & 255;
  let n = 0;
  let c = 0.5 - x0 * x0 - y0 * y0;
  if (c > 0) { const g = (PERM[ii + PERM[jj]] & 7) * 2; c *= c; n += c * c * (G2[g] * x0 + G2[g + 1] * y0); }
  c = 0.5 - x1 * x1 - y1 * y1;
  if (c > 0) { const g = (PERM[ii + i1 + PERM[jj + j1]] & 7) * 2; c *= c; n += c * c * (G2[g] * x1 + G2[g + 1] * y1); }
  c = 0.5 - x2 * x2 - y2 * y2;
  if (c > 0) { const g = (PERM[ii + 1 + PERM[jj + 1]] & 7) * 2; c *= c; n += c * c * (G2[g] * x2 + G2[g + 1] * y2); }
  return 70 * n;
}

export function fbm(x: number, y: number, oct = 4): number {
  let a = 0.5, f = 1, s = 0;
  for (let o = 0; o < oct; o++) { s += a * noise(x * f, y * f); f *= 2.03; a *= 0.5; }
  return s;
}

function ridged(x: number, y: number, oct = 4): number {
  let a = 0.5, f = 1, s = 0;
  for (let o = 0; o < oct; o++) { s += a * (1 - Math.abs(noise(x * f + o * 17, y * f - o * 9))); f *= 2.1; a *= 0.5; }
  return s;
}

export const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
export const smooth = (a: number, b: number, v: number) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const smax = (a: number, b: number, k: number) => { const h = clamp(0.5 + (b - a) / (2 * k), 0, 1); return lerp(a, b, h) + k * h * (1 - h); };

// ---------------------------------------------------------------- places

export type Biome = 'temperate' | 'blossom' | 'forest' | 'volcanic' | 'snow' | 'spires' | 'lush' | 'jade' | 'lagoon';
export const BIOMES: Biome[] = ['temperate', 'blossom', 'forest', 'volcanic', 'snow', 'spires', 'lush', 'jade', 'lagoon'];

export interface Place {
  name: string;
  x: number;
  z: number;
  r: number; // radius of influence
  biome: Biome;
  blurb: string;
}

export const PLACES: Place[] = ([
  { name: 'Glasswater', x: 0, z: 30, r: 230, biome: 'lagoon', blurb: 'A mirror-still lagoon ringed by blossom isles' },
  { name: 'Blossom Run', x: -360, z: 260, r: 230, biome: 'blossom', blurb: 'A river of petals through cherry meadows' },
  { name: 'Mistwood', x: -560, z: -110, r: 210, biome: 'forest', blurb: 'Cedar giants wrapped in fog' },
  { name: 'The Narrows', x: -40, z: -390, r: 200, biome: 'temperate', blurb: 'A cliff-walled gorge, one way in, one way out' },
  { name: 'The Spires', x: -420, z: -470, r: 140, biome: 'spires', blurb: 'Stone towers crowned with pines' },
  { name: 'Cinder Peak', x: 370, z: -320, r: 210, biome: 'volcanic', blurb: 'A smouldering cone over black sand' },
  { name: 'Frost Hollow', x: 150, z: -590, r: 150, biome: 'snow', blurb: 'Snowbound isles under the northern wall' },
  { name: 'Thunder Falls', x: 520, z: 70, r: 190, biome: 'lush', blurb: 'A great cascade off a jungle mesa' },
  { name: 'Moonbow Arch', x: 405, z: 345, r: 170, biome: 'temperate', blurb: 'A stone arch over a hidden cove' },
  { name: 'Jade Shallows', x: 30, z: 480, r: 190, biome: 'jade', blurb: 'Turquoise sandbars, easy to run aground' },
] as Place[]).map((p) => ({ ...p, x: p.x * K, z: p.z * K, r: p.r * KS }));

// ---------------------------------------------------------------- features

interface Feature {
  x: number;
  z: number;
  reach: number; // bounding radius
  eval(x: number, z: number, h: number): number;
}

const features: Feature[] = [];

function island(o: {
  x: number; z: number; rx: number; rz: number; rot?: number; H: number; p?: number; warp?: number; rough?: number;
  under?: number; seed?: number; plateau?: number;
}): void {
  o = { ...o, x: o.x * K, z: o.z * K, rx: o.rx * KS, rz: o.rz * KS };
  const rot = o.rot ?? 0, cr = Math.cos(rot), sr = Math.sin(rot), p = o.p ?? 1, warp = o.warp ?? 0.22;
  const rough = o.rough ?? 0.35, under = o.under ?? 0.35, seed = o.seed ?? (o.x * 0.013 + o.z * 0.007), R = Math.max(o.rx, o.rz);
  features.push({
    x: o.x, z: o.z, reach: R * 1.9 + 70,
    eval(x, z, h) {
      const dx = x - o.x, dz = z - o.z;
      const wx = dx + warp * R * fbm(x * 0.006 + seed, z * 0.006, 3), wz = dz + warp * R * fbm(x * 0.006 - 7.1, z * 0.006 + seed, 3);
      const lx = (wx * cr + wz * sr) / o.rx, lz = (-wx * sr + wz * cr) / o.rz;
      const d = Math.sqrt(lx * lx + lz * lz);
      let f: number;
      if (d >= 1) f = -Math.min(-SEA_FLOOR, (d - 1) * R * under);
      else {
        const t = 1 - d;
        let prof = Math.pow(t, p);
        if (o.plateau) prof = Math.min(1, prof * (1 + o.plateau));
        f = 0.6 + o.H * prof + o.H * rough * Math.pow(t, 0.8) * (ridged(x * 0.012 + seed, z * 0.012, 4) - 0.55);
        f = Math.max(f, 0.6 * smooth(0, 0.05, t));
      }
      return smax(h, f, 6);
    },
  });
}

function spire(x: number, z: number, rad: number, H: number, raw = false): void {
  if (!raw) { x *= K; z *= K; rad *= KS; }
  features.push({
    x, z, reach: rad * 1.6 + 10,
    eval(px, pz, h) {
      const dx = px - x, dz = pz - z;
      const a = Math.atan2(dz, dx);
      const d = Math.sqrt(dx * dx + dz * dz) / (rad * (1 + 0.18 * noise(Math.cos(a) * 1.5 + x, Math.sin(a) * 1.5 + z) + 0.06 * noise(a * 5, x)));
      let f: number;
      if (d < 1) f = H * (1 - Math.pow(d, 7)) + 3 * noise(px * 0.08, pz * 0.08) + (1 - d) * 6;
      else f = lerp(2.5, SEA_FLOOR, smooth(1, 1.45, d));
      return Math.max(h, f);
    },
  });
}

function river(points: number[][], width: number, depth = -4.2): void {
  width *= KS;
  let minx = Infinity, minz = Infinity, maxx = -Infinity, maxz = -Infinity;
  for (const [x, z] of points) { minx = Math.min(minx, x); maxx = Math.max(maxx, x); minz = Math.min(minz, z); maxz = Math.max(maxz, z); }
  const cx = (minx + maxx) / 2, cz = (minz + maxz) / 2;
  features.push({
    x: cx, z: cz, reach: Math.hypot(maxx - minx, maxz - minz) / 2 + 160,
    eval(x, z, h) {
      let best = Infinity;
      for (let i = 0; i < points.length - 1; i++) {
        const [ax, az] = points[i], [bx, bz] = points[i + 1];
        const vx = bx - ax, vz = bz - az, t = clamp(((x - ax) * vx + (z - az) * vz) / (vx * vx + vz * vz), 0, 1);
        const ex = ax + vx * t - x, ez = az + vz * t - z;
        best = Math.min(best, ex * ex + ez * ez);
      }
      const d = Math.sqrt(best) + 6 * noise(x * 0.02, z * 0.02), w = width / 2;
      if (d < w) return Math.min(h, lerp(depth, 0.2, smooth(w - 9, w, d)));
      const bank = 0.4 + (d - w) * 0.1 + Math.pow((d - w) / 70, 2) * 26;
      return h > bank ? lerp(bank, h, smooth(w + 30, w + 150, d)) : h;
    },
  });
}

/** A Catmull-Rom spline through control points, sampled every `step` metres. */
function spline(ctrl: number[][], step = 12): number[][] {
  const out: number[][] = [];
  for (let i = 0; i < ctrl.length - 1; i++) {
    const p0 = ctrl[Math.max(0, i - 1)], p1 = ctrl[i], p2 = ctrl[i + 1], p3 = ctrl[Math.min(ctrl.length - 1, i + 2)];
    const n = Math.max(2, Math.ceil(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) / step));
    for (let k = 0; k < n; k++) {
      const t = k / n, t2 = t * t, t3 = t2 * t;
      out.push([0, 1].map((c) => 0.5 * (2 * p1[c] + (-p0[c] + p2[c]) * t + (2 * p0[c] - 5 * p1[c] + 4 * p2[c] - p3[c]) * t2 + (-p0[c] + 3 * p1[c] - 3 * p2[c] + p3[c]) * t3)));
    }
  }
  out.push(ctrl[ctrl.length - 1]);
  return out;
}

export const RIVERS: number[][][] = [
  [[-610, 140], [-520, 200], [-440, 190], [-370, 260], [-300, 330], [-210, 320], [-130, 380]],
  [[-430, 470], [-400, 380], [-370, 260]],
].map((c) => spline(c.map(([x, z]) => [x * K, z * K])));

// Arch and waterfall are sculpted meshes; the height field gives them their feet.
export const ARCH = { ax: 360, az: 215.6, bx: 300.8, bz: 240, height: 44 }; // from a headland out to a sea stack, over open water
export const FALLS = { x: 0, z: 0, top: 0, dirx: -1, dirz: 0 }; // found after the heights exist

function layout(): void {
  // Glasswater: a broken ring of low blossom isles round a lagoon, a hero islet at its heart.
  for (let k = 0; k < 9; k++) {
    const a = (k / 9) * Math.PI * 2 + 0.2 + 0.15 * Math.sin(k * 7.3), R = 175 + 25 * Math.sin(k * 3.1);
    if (k === 2 || k === 6) continue; // two wide gates
    island({ x: Math.cos(a) * R, z: 30 + Math.sin(a) * R, rx: 48 + 14 * Math.sin(k * 5.7), rz: 30, rot: a + Math.PI / 2, H: 16 + 8 * Math.abs(Math.sin(k * 2.3)), p: 0.9, under: 0.3, rough: 0.25 });
  }
  island({ x: 6, z: 36, rx: 16, rz: 13, H: 4, p: 0.7, under: 0.4, rough: 0.1 });

  // Blossom Run: a broad meadow island cut by a meandering river.
  island({ x: -380, z: 290, rx: 245, rz: 175, rot: -0.35, H: 62, p: 1.35, under: 0.25, rough: 0.4 });
  // Mistwood: a high cedar island with cliffs.
  island({ x: -570, z: -110, rx: 150, rz: 195, rot: 0.2, H: 115, p: 0.75, under: 0.7, rough: 0.45 });
  island({ x: -440, z: -230, rx: 55, rz: 40, H: 30, p: 0.8, under: 0.6 });
  // The Narrows: two long ridges with a gorge between them.
  island({ x: -40, z: -462, rx: 240, rz: 55, rot: 0.05, H: 80, p: 0.45, under: 1.2, rough: 0.3, warp: 0.12 });
  island({ x: -60, z: -318, rx: 215, rz: 48, rot: 0.05, H: 68, p: 0.45, under: 1.2, rough: 0.3, warp: 0.12 });
  // The Spires: karst towers.
  {
    const r = rng(77);
    for (let i = 0; i < 26; i++) {
      const a = r() * Math.PI * 2, d = Math.sqrt(r()) * 130;
      spire(-420 + Math.cos(a) * d, -470 + Math.sin(a) * d * 0.8, 10 + r() * 14, 34 + r() * 70);
    }
  }
  // Cinder Peak: a volcano cone with a crater.
  features.push({
    x: 370 * K, z: -320 * K, reach: 260 * KS,
    eval(x, z, h) {
      const dx = x - 370 * K, dz = z + 320 * K, a = Math.atan2(dz, dx), dist = Math.hypot(dx, dz);
      const R = 165 * KS * (1 + 0.12 * noise(Math.cos(a) * 1.3, Math.sin(a) * 1.3 + 4));
      const d = dist / R;
      let f: number;
      if (d >= 1) f = -Math.min(-SEA_FLOOR, (d - 1) * R * 0.3);
      else {
        const t = 1 - d;
        f = 0.8 + 150 * Math.pow(t, 1.5) + 7 * t * noise(a * 9, dist * 0.03) * (0.5 + t) + 4 * ridged(x * 0.02, z * 0.02, 3) * t;
        f -= 52 * smooth(44, 16, dist);
      }
      return smax(h, f, 6);
    },
  });
  island({ x: 250, z: -180, rx: 40, rz: 30, H: 12, p: 0.9 });
  // Frost Hollow: snowbound isles near the north wall.
  island({ x: 130, z: -600, rx: 95, rz: 55, rot: 0.3, H: 45, p: 0.8, under: 0.5 });
  island({ x: 250, z: -560, rx: 50, rz: 40, H: 28, p: 0.9, under: 0.5 });
  island({ x: 30, z: -560, rx: 40, rz: 26, H: 18, p: 0.9, under: 0.5 });
  // Thunder Falls: a jungle mesa, cliffs on every side.
  island({ x: 540, z: 70, rx: 120, rz: 150, rot: 0.15, H: 72, p: 0.35, plateau: 0.6, under: 0.9, rough: 0.12, warp: 0.15 });
  // Moonbow Arch: a cove, and a stone arch from its headland out to a sea stack.
  island({ x: 430, z: 470, rx: 110, rz: 70, rot: -0.7, H: 50, p: 0.8, under: 0.5 });
  island({ x: 330, z: 330, rx: 70, rz: 45, rot: 0.6, H: 40, p: 0.8, under: 0.5 });
  spire(ARCH.ax, ARCH.az, 13 * KS, 40, true);
  spire(ARCH.bx, ARCH.bz, 13 * KS, 44, true);
  // Jade Shallows: sandbars over a raised floor.
  features.push({
    x: 30 * K, z: 480 * K, reach: 230 * KS,
    eval(x, z, h) {
      const dist = Math.hypot(x - 30 * K, (z - 480 * K) * 1.2);
      const k = smooth(190, 100, dist);
      if (k <= 0) return h;
      const bar = -2.6 + 1.9 * smooth(0.1, 0.7, fbm(x * 0.012, z * 0.012, 3) + 0.35);
      return lerp(h, Math.max(h, bar), k);
    },
  });
  island({ x: -20, z: 500, rx: 30, rz: 20, H: 4, p: 0.6, under: 0.15 });
  island({ x: 110, z: 450, rx: 24, rz: 18, H: 6, p: 0.6, under: 0.15 });
  island({ x: 60, z: 560, rx: 40, rz: 22, rot: 0.4, H: 9, p: 0.7, under: 0.2 });

  // Islets and sea stacks scattered through the open water, away from the places' hearts.
  const r = rng(4242);
  let placed = 0;
  const size = (f: Feature) => (f.reach > 90 ? (f.reach - 70) / 1.9 : (f.reach - 10) / 1.6);
  const solid = (x: number, z: number, d: number) => features.some((f) => Math.hypot(x * K - f.x, z * K - f.z) < d + size(f));
  for (let tries = 0; tries < 6000 && placed < 64; tries++) {
    const x = (r() * 2 - 1) * 680, z = (r() * 2 - 1) * 680;
    if (Math.hypot(x, z) > 660) continue;
    if (PLACES.some((p) => Math.hypot(x * K - p.x, z * K - p.z) < p.r * 0.5)) continue;
    const big = r() < 0.45;
    if (solid(x, z, big ? 75 : 42)) continue;
    if (!big && r() < 0.45) spire(x, z, 4 + r() * 6, 8 + r() * 26);
    else if (big) island({ x, z, rx: 30 + r() * 30, rz: 22 + r() * 22, rot: r() * 3, H: 14 + r() * 30, p: 0.9, under: 0.5, rough: 0.35 });
    else island({ x, z, rx: 12 + r() * 20, rz: 10 + r() * 14, rot: r() * 3, H: 5 + r() * 16, p: 0.8, under: 0.6, rough: 0.25 });
    placed++;
  }
}
layout();

/** Beyond the rim, the open ocean: a scatter of far isles no ship reaches, there to be seen round the globe. */
function ringHeight(x: number, z: number): number {
  const r = Math.hypot(x, z);
  const k = smooth(PLAY_R + 110, PLAY_R + 200, r) * smooth(HALF - 10, HALF - 90, r);
  if (k <= 0) return -Infinity;
  const blob = fbm(x * 0.0085 + 7, z * 0.0085 - 3, 3) - 0.36;
  if (blob <= -0.08) return -Infinity;
  const det = 16 * ridged(x * 0.02, z * 0.02, 4);
  return SEA_FLOOR + k * (Math.max(0, blob + 0.08) * 230 + det * smooth(-0.02, 0.06, blob));
}

/** The analytic height at any point, in metres above the still-water line. */
export function terrainHeight(x: number, z: number): number {
  let h = SEA_FLOOR + 3 * fbm(x * 0.004, z * 0.004, 2);
  for (const f of features) {
    const dx = x - f.x, dz = z - f.z;
    if (dx * dx + dz * dz < f.reach * f.reach) h = f.eval(x, z, h);
  }
  const ring = ringHeight(x, z);
  if (ring > -Infinity) h = smax(h, ring, 10);
  for (const rv of RIVERS) h = riverFeature(rv, x, z, h);
  return h;
}

const riverFeatures = RIVERS.map((pts, i) => {
  river(pts, i === 0 ? 62 : 48);
  return features.pop()!;
});
function riverFeature(pts: number[][], x: number, z: number, h: number): number {
  const f = riverFeatures[RIVERS.indexOf(pts)];
  const dx = x - f.x, dz = z - f.z;
  return dx * dx + dz * dz < f.reach * f.reach ? f.eval(x, z, h) : h;
}

// ---------------------------------------------------------------- the world

export interface Tree {
  x: number; y: number; z: number; s: number; rot: number; kind: number; tint: number;
}

export const TREE = { conifer: 0, cherry: 1, broadleaf: 2, pine: 3, snag: 4, snowfir: 5, bush: 6, maple: 7 } as const;

export interface LootSpot { x: number; z: number; place: number }

export interface World {
  heights: Float32Array; // RES * RES
  biome: Uint8Array; // RES * RES: index into BIOMES of the strongest place
  splat: Uint8Array; // RES * RES * 4: forest shade, snow, ash, blossom
  trees: Tree[];
  rocks: Tree[];
  clams: LootSpot[];
  orbs: LootSpot[];
  nav: Nav;
  falls: typeof FALLS;
  currents: number[][][]; // each a line of points down the middle of the stream, in the direction it runs
  flow: Float32Array; // FLOW.n * FLOW.n * 3: the stream's direction (x, z) and its strength
  ms: number;
}

export function sampleHeight(heights: Float32Array, x: number, z: number): number {
  const fx = clamp((x + HALF) / CELL, 0, RES - 1.001), fz = clamp((z + HALF) / CELL, 0, RES - 1.001);
  const ix = fx | 0, iz = fz | 0, tx = fx - ix, tz = fz - iz, i = iz * RES + ix;
  const a = heights[i], b = heights[i + 1], c = heights[i + RES], d = heights[i + RES + 1];
  return a + (b - a) * tx + (c - a) * tz + (a - b - c + d) * tx * tz;
}

export function placeInfluence(x: number, z: number): { i: number; k: number } {
  let best = -1, bk = 0;
  for (let i = 0; i < PLACES.length; i++) {
    const p = PLACES[i], k = smooth(p.r, p.r * 0.45, Math.hypot(x - p.x, z - p.z));
    if (k > bk) { bk = k; best = i; }
  }
  return { i: best, k: bk };
}

export function buildWorld(): World {
  const t0 = performance.now();
  const heights = new Float32Array(RES * RES);
  for (let iz = 0; iz < RES; iz++) {
    const z = -HALF + iz * CELL;
    for (let ix = 0; ix < RES; ix++) heights[iz * RES + ix] = terrainHeight(-HALF + ix * CELL, z);
  }
  const hAt = (x: number, z: number) => sampleHeight(heights, x, z);
  const slopeAt = (x: number, z: number) => {
    const gx = (hAt(x + CELL, z) - hAt(x - CELL, z)) / (2 * CELL), gz = (hAt(x, z + CELL) - hAt(x, z - CELL)) / (2 * CELL);
    return Math.hypot(gx, gz);
  };

  // biomes and splat
  const biome = new Uint8Array(RES * RES), splat = new Uint8Array(RES * RES * 4);
  for (let iz = 0; iz < RES; iz++) {
    const z = -HALF + iz * CELL;
    for (let ix = 0; ix < RES; ix++) {
      const x = -HALF + ix * CELL, i = iz * RES + ix, { i: pi, k } = placeInfluence(x, z);
      const b = pi >= 0 && k > 0.35 ? PLACES[pi].biome : 'temperate';
      biome[i] = BIOMES.indexOf(b);
      const h = heights[i], ring = smooth(PLAY_R, PLAY_R + 300, Math.hypot(x, z));
      const snow = Math.max(b === 'snow' ? k * smooth(1, 6, h) : 0, ring * smooth(330, 420, h + 40 * fbm(x * 0.01, z * 0.01, 2)));
      const ash = b === 'volcanic' ? k * smooth(-2, 2, h) : 0;
      splat[i * 4 + 1] = snow * 255;
      splat[i * 4 + 2] = ash * 255;
    }
  }

  // flora
  const trees: Tree[] = [], rocks: Tree[] = [];
  const r = rng(9001);
  const pick = (w: [number, number][]) => { let s = 0; for (const [, p] of w) s += p; let u = r() * s; for (const [k, p] of w) if ((u -= p) <= 0) return k; return w[0][0]; };
  const STEP = 6.5;
  for (let z = -HALF + 4; z < HALF - 4; z += STEP) {
    for (let x = -HALF + 4; x < HALF - 4; x += STEP) {
      const jx = x + (r() - 0.5) * STEP * 0.95, jz = z + (r() - 0.5) * STEP * 0.95;
      const dist = Math.hypot(jx, jz);
      if (dist > 990) continue;
      const h = hAt(jx, jz);
      if (h < 1.2) continue;
      const sl = slopeAt(jx, jz);
      const { i: pi, k } = placeInfluence(jx, jz);
      const b: Biome = pi >= 0 && k > 0.35 ? PLACES[pi].biome : 'temperate';
      const ring = dist > PLAY_R + 60;
      if (ring && r() > 0.8) continue; // the ring is drawn a little thinner, far away; the terrain paints its canopy
      if (ring && h > 300) continue;
      if (b === 'spires' && h > 12 && sl > 1.6 && r() > 0.08) continue;
      if (b !== 'spires' && sl > (ring ? 1.6 : 1.25)) continue;
      const patch = fbm(jx * 0.008 + 11, jz * 0.008, 3);
      let dens = smooth(-0.35, 0.15, patch) * smooth(1.2, 4, h);
      // riverbanks and lagoon shores are meadows dotted with blossom
      const shore = smooth(9, 2, h);
      if (b === 'blossom' || b === 'lagoon') dens *= lerp(1, 0.35, shore);
      if (b === 'forest') dens = Math.max(dens, 0.85 * smooth(1.2, 5, h));
      if (b === 'volcanic') dens *= 0.25 * smooth(110, 40, h);
      if (b === 'jade') dens *= 0.35;
      if (b === 'spires') dens = h > 30 ? 0.9 : 0.25;
      if (r() > dens) continue;
      let kind: number;
      const tint = r();
      switch (b) {
        case 'blossom': kind = pick([[TREE.cherry, h < 14 ? 5 : 1.2], [TREE.conifer, h > 18 ? 4 : 0.6], [TREE.broadleaf, 1.4], [TREE.bush, 1.4], [TREE.maple, 0.25]]); break;
        case 'lagoon': kind = pick([[TREE.cherry, 3], [TREE.broadleaf, 1.4], [TREE.pine, 1.2], [TREE.bush, 1.6], [TREE.maple, 0.5]]); break;
        case 'forest': kind = pick([[TREE.conifer, 9], [TREE.broadleaf, 1], [TREE.maple, 0.25]]); break;
        case 'volcanic': kind = pick([[TREE.snag, 3], [TREE.pine, 1]]); break;
        case 'snow': kind = TREE.snowfir; break;
        case 'spires': kind = pick([[TREE.pine, 6], [TREE.bush, 1]]); break;
        case 'lush': kind = pick([[TREE.broadleaf, 5], [TREE.conifer, 2], [TREE.cherry, 1], [TREE.bush, 2], [TREE.maple, 0.6]]); break;
        case 'jade': kind = pick([[TREE.pine, 3], [TREE.bush, 2]]); break;
        default: kind = ring
          ? pick([[TREE.conifer, 8], [TREE.broadleaf, 1.5], [TREE.snowfir, h > 260 ? 8 : 0]])
          : pick([[TREE.conifer, h > 12 ? 6 : 2], [TREE.broadleaf, 3], [TREE.cherry, h < 10 ? 1.4 : 0.3], [TREE.pine, sl > 0.6 ? 2 : 0.6], [TREE.bush, 1.2], [TREE.maple, 0.4]]);
      }
      const base = kind === TREE.bush ? 0.8 + r() * 0.6 : 0.75 + r() * 0.6;
      trees.push({ x: jx, y: h, z: jz, s: base * (ring ? 1.4 : 1), rot: r() * Math.PI * 2, kind, tint });
    }
  }

  // boulders on shores and in the shallows, a few on slopes
  for (let i = 0; i < 9000 && rocks.length < 1700; i++) {
    const x = (r() * 2 - 1) * 600, z = (r() * 2 - 1) * 600;
    const h = hAt(x, z);
    if (h < -3 || h > 40) continue;
    const shoreK = smooth(-3, -0.5, h) * smooth(4, 0.5, h);
    const slopeK = smooth(0.5, 1.2, slopeAt(x, z)) * 0.35;
    if (r() > Math.max(shoreK, slopeK) * 0.9) continue;
    rocks.push({ x, y: h, z, s: 0.6 + Math.pow(r(), 3) * 3.2, rot: r() * Math.PI * 2, kind: (r() * 5) | 0, tint: r() });
  }

  const nav = buildNav(heights);

  // loot spots: clams in the shallows at the waterline, orbs on open water near places and along channels
  const clams: LootSpot[] = [], orbs: LootSpot[] = [];
  const far = (list: LootSpot[], x: number, z: number, d: number) => list.every((s) => Math.hypot(s.x - x, s.z - z) > d);
  for (let pi = 0; pi < PLACES.length; pi++) {
    const p = PLACES[pi];
    let n = 0;
    for (let t = 0; t < 4000 && n < 7; t++) {
      const a = r() * Math.PI * 2, d = Math.sqrt(r()) * p.r;
      const x = p.x + Math.cos(a) * d, z = p.z + Math.sin(a) * d, h = hAt(x, z);
      if (h < -1.8 || h > -0.6 || !nav.nearWater(x, z, 16) || !far(clams, x, z, 40)) continue;
      clams.push({ x, z, place: pi });
      n++;
    }
    n = 0;
    for (let t = 0; t < 4000 && n < 11; t++) {
      const a = r() * Math.PI * 2, d = Math.sqrt(r()) * p.r * 0.9;
      const x = p.x + Math.cos(a) * d, z = p.z + Math.sin(a) * d;
      if (!nav.open(x, z) || !far(orbs, x, z, 30)) continue;
      orbs.push({ x, z, place: pi });
      n++;
    }
  }
  for (let t = 0; t < 20000 && clams.length < 80; t++) {
    const x = (r() * 2 - 1) * 540, z = (r() * 2 - 1) * 540, h = hAt(x, z);
    if (h < -1.8 || h > -0.6 || !nav.nearWater(x, z, 16) || !far(clams, x, z, 55)) continue;
    clams.push({ x, z, place: -1 });
  }
  for (let t = 0; t < 20000 && orbs.length < 170; t++) {
    const x = (r() * 2 - 1) * 540, z = (r() * 2 - 1) * 540;
    if (!nav.open(x, z) || !far(orbs, x, z, 36)) continue;
    orbs.push({ x, z, place: -1 });
  }

  // the falls pour off the mesa's west rim, toward Glasswater
  {
    let best = { x: 0, z: 0, top: 0, score: -Infinity };
    for (let k = -40; k <= 40; k += 2) {
      for (let s = 0; s < 120; s += 1) {
        const x = 540 * K - 20 - s, z = 70 * K + k;
        const h = hAt(x, z), hw = hAt(x - 6, z);
        if (h > 40 && hw < 10) {
          const score = h - Math.abs(k) * 0.4;
          if (score > best.score) best = { x, z, top: h, score };
          break;
        }
      }
    }
    Object.assign(FALLS, { x: best.x, z: best.z, top: best.top, dirx: -1, dirz: 0 });
  }

  const { currents, flow } = buildCurrents(nav);
  return { heights, biome, splat, trees, rocks, clams, orbs, nav, falls: FALLS, currents, flow, ms: performance.now() - t0 };
}

// ---------------------------------------------------------------- currents

/** The currents' grid over the sailable sea, the half-width of a stream, and its speed at the middle. */
export const FLOW = { n: 256, half: 640, w: 18, speed: 8 };

/** The stream under a point, in metres a second: [x, z]. */
export function flowAt(w: World, x: number, z: number, out: [number, number] = [0, 0]): [number, number] {
  const n = FLOW.n, fx = ((x + FLOW.half) / (2 * FLOW.half)) * n - 0.5, fz = ((z + FLOW.half) / (2 * FLOW.half)) * n - 0.5;
  const ix = Math.floor(fx), iz = Math.floor(fz);
  out[0] = out[1] = 0;
  if (ix < 0 || iz < 0 || ix >= n - 1 || iz >= n - 1) return out;
  const tx = fx - ix, tz = fz - iz, f = w.flow, o = (iz * n + ix) * 3, r = n * 3;
  // the four texels round it, each its direction times its strength, blended as the GPU blends them
  const a = f[o + 2] * (1 - tx) * (1 - tz), b = f[o + 5] * tx * (1 - tz), c = f[o + r + 2] * (1 - tx) * tz, d = f[o + r + 5] * tx * tz;
  out[0] = (f[o] * a + f[o + 3] * b + f[o + r] * c + f[o + r + 3] * d) * FLOW.speed;
  out[1] = (f[o + 1] * a + f[o + 4] * b + f[o + r + 1] * c + f[o + r + 4] * d) * FLOW.speed;
  return out;
}

/**
 * The currents: an outer gyre running anticlockwise round the islands in four reaches, and three races cutting
 * through the middle. Each is found as the way between two points that keeps furthest from the shores, smoothed,
 * then laid into the grid as a stream strongest at its middle and fading at its ends.
 */
function buildCurrents(nav: Nav): { currents: number[][][]; flow: Float32Array } {
  // clearance: how many cells to the nearest that a hull cannot sail (a chamfer distance)
  const N = NAV_RES, clr = new Float32Array(N * N);
  for (let i = 0; i < clr.length; i++) clr[i] = nav.pass[i] ? 1e6 : 0;
  for (let pass = 0; pass < 2; pass++) {
    const fwd = pass === 0;
    for (let k = 0; k < N * N; k++) {
      const c = fwd ? k : N * N - 1 - k, x = c % N, z = Math.floor(c / N);
      for (const [dx, dz, d] of (fwd ? [[-1, 0, 1], [0, -1, 1], [-1, -1, 1.414], [1, -1, 1.414]] : [[1, 0, 1], [0, 1, 1], [1, 1, 1.414], [-1, 1, 1.414]])) {
        const nx = x + dx, nz = z + dz;
        if (nx < 0 || nz < 0 || nx >= N || nz >= N) continue;
        clr[c] = Math.min(clr[c], clr[nz * N + nx] + d);
      }
    }
  }
  const inside = (c: number) => { const [x, z] = nav.center(c); return Math.hypot(x, z) < PLAY_R - 22; };
  // water a stream already runs through, which the next keeps out of where it can
  const taken = new Uint8Array(N * N);
  /** The way from a to b by open water, dearer the nearer it runs to a shore or another stream. */
  const channel = (ax: number, az: number, bx: number, bz: number): number[][] | null => {
    const start = nav.cell(...nav.nearestOpen(ax, az)), goal = nav.cell(...nav.nearestOpen(bx, bz));
    const g = new Float32Array(N * N).fill(Infinity), from = new Int32Array(N * N).fill(-1), done = new Uint8Array(N * N);
    const heap: [number, number][] = [];
    const push = (c: number, f: number) => {
      heap.push([f, c]);
      for (let i = heap.length - 1; i > 0;) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; }
    };
    const pop = () => {
      const top = heap[0], last = heap.pop()!;
      if (heap.length) {
        heap[0] = last;
        for (let i = 0; ;) {
          const l = 2 * i + 1, r = l + 1;
          let m = i;
          if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
          if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
          if (m === i) break;
          [heap[m], heap[i]] = [heap[i], heap[m]]; i = m;
        }
      }
      return top[1];
    };
    const gx = goal % N, gz = Math.floor(goal / N), h = (c: number) => Math.hypot((c % N) - gx, Math.floor(c / N) - gz);
    g[start] = 0;
    push(start, h(start));
    while (heap.length) {
      const c = pop();
      if (done[c]) continue;
      if (c === goal) break;
      done[c] = 1;
      const cx = c % N, cz = Math.floor(c / N);
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
        const nx = cx + dx, nz = cz + dz, n = nz * N + nx;
        if ((!dx && !dz) || nx < 0 || nz < 0 || nx >= N || nz >= N || !nav.pass[n] || done[n] || !inside(n)) continue;
        if (dx && dz && (!nav.pass[cz * N + nx] || !nav.pass[nz * N + cx])) continue;
        const near = Math.max(0, 1 - clr[n] / 5);
        const ng = g[c] + (dx && dz ? 1.414 : 1) * (1 + 10 * near * near + 6 * taken[n]);
        if (ng < g[n]) { g[n] = ng; from[n] = c; push(n, ng + h(n)); }
      }
    }
    if (from[goal] < 0) return null;
    const pts: number[][] = [];
    for (let c = goal; c !== -1; c = from[c]) pts.push(nav.center(c));
    return pts.reverse();
  };
  /** Smoothed (never to within a couple of cells of water too shoal to sail), then laid out again at an even step. */
  const smoothLine = (pts: number[][], step: number): number[][] => {
    let p = pts;
    for (let it = 0; it < 4; it++) p = p.map((q, i) => {
      if (i === 0 || i === p.length - 1) return q;
      let x = 0, z = 0, n = 0;
      for (let j = Math.max(0, i - 3); j <= Math.min(p.length - 1, i + 3); j++) { x += p[j][0]; z += p[j][1]; n++; }
      return clr[nav.cell(x / n, z / n)] >= 2 ? [x / n, z / n] : q;
    });
    const out = [p[0]];
    let carry = 0;
    for (let i = 1; i < p.length; i++) {
      const [ax, az] = p[i - 1], [bx, bz] = p[i], d = Math.hypot(bx - ax, bz - az);
      for (let t = step - carry; t <= d; t += step) out.push([ax + ((bx - ax) * t) / d, az + ((bz - az) * t) / d]);
      carry = (carry + d) % step;
    }
    return out;
  };
  const deg = Math.PI / 180, at = (r: number, a: number) => [Math.cos(a * deg) * r, Math.sin(a * deg) * r];
  const plan: [number[], number[]][] = [
    ...[10, 100, 190, 280].map((a): [number[], number[]] => [at(500, a), at(500, a + 62)]),
    ...[40, 160, 280].map((a): [number[], number[]] => [at(370, a), at(370, a + 165)]),
  ];
  // each is laid into the grid as it is found. Where two meet, the stronger there carries, so streams crossing never
  // cancel; and where a later one would run into the teeth of an earlier, it is cut there into separate reaches.
  const n = FLOW.n, cell = (2 * FLOW.half) / n, flow = new Float32Array(n * n * 3), wmax = new Float32Array(n * n);
  const gridAt = (x: number, z: number) => clamp(Math.floor((z + FLOW.half) / cell), 0, n - 1) * n + clamp(Math.floor((x + FLOW.half) / cell), 0, n - 1);
  const tangent = (line: number[][], i: number) => {
    const j = Math.min(i + 1, line.length - 1), k = Math.max(i - 1, 0);
    const tx = line[j][0] - line[k][0], tz = line[j][1] - line[k][1], tl = Math.hypot(tx, tz) || 1;
    return [tx / tl, tz / tl];
  };
  const lay = (line: number[][]) => {
    const len = (line.length - 1) * 6, r = Math.ceil(FLOW.w / cell);
    line.forEach(([x, z], i) => {
      const [tx, tz] = tangent(line, i), taper = smooth(0, 50, i * 6) * smooth(len, len - 70, i * 6);
      const cx = Math.floor((x + FLOW.half) / cell), cz = Math.floor((z + FLOW.half) / cell);
      for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
        const ix = cx + dx, iz = cz + dz;
        if (ix < 0 || iz < 0 || ix >= n || iz >= n) continue;
        const d = Math.hypot(-FLOW.half + (ix + 0.5) * cell - x, -FLOW.half + (iz + 0.5) * cell - z);
        if (d >= FLOW.w) continue;
        const w = (1 - (d / FLOW.w) ** 2) ** 2 * taper, c = iz * n + ix;
        if (w <= wmax[c]) continue;
        flow[c * 3] = tx;
        flow[c * 3 + 1] = tz;
        wmax[c] = w;
      }
      const c = nav.cell(x, z), ncx = c % N, ncz = Math.floor(c / N);
      for (let dz = -3; dz <= 3; dz++) for (let dx = -3; dx <= 3; dx++) {
        const nx = ncx + dx, nz = ncz + dz;
        if (nx >= 0 && nz >= 0 && nx < N && nz < N) taken[nz * N + nx] = 1;
      }
    });
  };
  const currents: number[][][] = [];
  for (const [a, b] of plan) {
    const raw = channel(a[0], a[1], b[0], b[1]);
    if (!raw || raw.length < 20) continue;
    const line = smoothLine(raw, 6);
    let run: number[][] = [];
    const close = () => { if (run.length >= 20) { currents.push(run); lay(run); } run = []; };
    line.forEach((p, i) => {
      const c = gridAt(p[0], p[1]), [tx, tz] = tangent(line, i);
      if (wmax[c] > 0.2 && flow[c * 3] * tx + flow[c * 3 + 1] * tz < 0.5) close();
      else run.push(p);
    });
    close();
  }
  for (let c = 0; c < n * n; c++) {
    const [x, z] = [-FLOW.half + ((c % n) + 0.5) * cell, -FLOW.half + (Math.floor(c / n) + 0.5) * cell];
    flow[c * 3 + 2] = nav.pass[nav.cell(x, z)] ? wmax[c] : 0;
  }
  return { currents, flow };
}

// ---------------------------------------------------------------- navigation

export const NAV_RES = 200;
export const NAV_CELL = (2 * HALF) / NAV_RES;

export class Nav {
  readonly pass: Uint8Array; // 1 where a hull can sail
  readonly heights: Float32Array;
  constructor(pass: Uint8Array, heights: Float32Array) {
    this.pass = pass;
    this.heights = heights;
  }
  cell(x: number, z: number): number {
    const ix = clamp(Math.floor((x + HALF) / NAV_CELL), 0, NAV_RES - 1), iz = clamp(Math.floor((z + HALF) / NAV_CELL), 0, NAV_RES - 1);
    return iz * NAV_RES + ix;
  }
  center(c: number): [number, number] {
    return [-HALF + ((c % NAV_RES) + 0.5) * NAV_CELL, -HALF + (Math.floor(c / NAV_RES) + 0.5) * NAV_CELL];
  }
  open(x: number, z: number): boolean {
    return this.pass[this.cell(x, z)] === 1 && sampleHeight(this.heights, x, z) < DRAFT - 1;
  }
  nearWater(x: number, z: number, d: number): boolean {
    for (let a = 0; a < 8; a++) if (this.open(x + Math.cos(a * 0.785) * d, z + Math.sin(a * 0.785) * d)) return true;
    return false;
  }
  /** The nearest open cell to a point, searching outward. */
  nearestOpen(x: number, z: number): [number, number] {
    const c0 = this.cell(x, z);
    if (this.pass[c0]) return [x, z];
    const cx = c0 % NAV_RES, cz = Math.floor(c0 / NAV_RES);
    for (let rad = 1; rad < 40; rad++) {
      let best = -1, bd = Infinity;
      for (let dz = -rad; dz <= rad; dz++) for (let dx = -rad; dx <= rad; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== rad) continue;
        const ix = cx + dx, iz = cz + dz;
        if (ix < 0 || iz < 0 || ix >= NAV_RES || iz >= NAV_RES) continue;
        const c = iz * NAV_RES + ix;
        if (this.pass[c] && dx * dx + dz * dz < bd) { bd = dx * dx + dz * dz; best = c; }
      }
      if (best >= 0) return this.center(best);
    }
    return [0, 30];
  }
  /** Clear line between two points over open cells. */
  clear(ax: number, az: number, bx: number, bz: number): boolean {
    const d = Math.hypot(bx - ax, bz - az), n = Math.ceil(d / (NAV_CELL * 0.5));
    for (let i = 1; i <= n; i++) {
      const t = i / n;
      if (!this.pass[this.cell(ax + (bx - ax) * t, az + (bz - az) * t)]) return false;
    }
    return true;
  }
  /** A* over open cells, string-pulled into waypoints. Null when there is no way. */
  path(ax: number, az: number, bx: number, bz: number, limit = 6000): number[][] | null {
    const start = this.cell(...this.nearestOpen(ax, az)), goal = this.cell(...this.nearestOpen(bx, bz));
    if (start === goal) return [[bx, bz]];
    const N = NAV_RES * NAV_RES;
    const g = new Float32Array(N).fill(Infinity), from = new Int32Array(N).fill(-1), closed = new Uint8Array(N);
    const heap: number[] = [], f: number[] = [];
    const gx = goal % NAV_RES, gz = Math.floor(goal / NAV_RES);
    const hcost = (c: number) => { const dx = Math.abs((c % NAV_RES) - gx), dz = Math.abs(Math.floor(c / NAV_RES) - gz); return Math.max(dx, dz) + 0.414 * Math.min(dx, dz); };
    const push = (c: number, fc: number) => {
      heap.push(c); f.push(fc);
      let i = heap.length - 1;
      while (i > 0) { const p = (i - 1) >> 1; if (f[p] <= f[i]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; [f[p], f[i]] = [f[i], f[p]]; i = p; }
    };
    const pop = () => {
      const top = heap[0], lc = heap.pop()!, lf = f.pop()!;
      if (heap.length) {
        heap[0] = lc; f[0] = lf;
        let i = 0;
        for (;;) {
          const l = 2 * i + 1, r2 = l + 1;
          let m = i;
          if (l < heap.length && f[l] < f[m]) m = l;
          if (r2 < heap.length && f[r2] < f[m]) m = r2;
          if (m === i) break;
          [heap[m], heap[i]] = [heap[i], heap[m]]; [f[m], f[i]] = [f[i], f[m]]; i = m;
        }
      }
      return top;
    };
    g[start] = 0;
    push(start, hcost(start));
    let found = false, expanded = 0;
    while (heap.length) {
      const c = pop();
      if (closed[c]) continue;
      if (c === goal) { found = true; break; }
      if (++expanded > limit) break;
      closed[c] = 1;
      const cx = c % NAV_RES, cz = Math.floor(c / NAV_RES);
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dz) continue;
        const nx = cx + dx, nz = cz + dz;
        if (nx < 0 || nz < 0 || nx >= NAV_RES || nz >= NAV_RES) continue;
        const n = nz * NAV_RES + nx;
        if (!this.pass[n] || closed[n]) continue;
        if (dx && dz && (!this.pass[cz * NAV_RES + nx] || !this.pass[nz * NAV_RES + cx])) continue;
        const ng = g[c] + (dx && dz ? 1.414 : 1);
        if (ng < g[n]) { g[n] = ng; from[n] = c; push(n, ng + hcost(n)); }
      }
    }
    if (!found) return null;
    const cells: number[] = [];
    for (let c = goal; c !== -1; c = from[c]) cells.push(c);
    cells.reverse();
    const pts = cells.map((c) => this.center(c));
    pts[pts.length - 1] = [bx, bz];
    const out: number[][] = [];
    let anchor = [ax, az];
    let i = 0;
    while (i < pts.length - 1) {
      let j = pts.length - 1;
      while (j > i + 1 && !this.clear(anchor[0], anchor[1], pts[j][0], pts[j][1])) j--;
      out.push(pts[j]);
      anchor = pts[j];
      i = j;
    }
    if (!out.length) out.push([bx, bz]);
    return out;
  }
}

function buildNav(heights: Float32Array): Nav {
  const pass = new Uint8Array(NAV_RES * NAV_RES);
  for (let iz = 0; iz < NAV_RES; iz++) for (let ix = 0; ix < NAV_RES; ix++) {
    const x = -HALF + (ix + 0.5) * NAV_CELL, z = -HALF + (iz + 0.5) * NAV_CELL;
    let ok = true;
    for (const [ox, oz] of [[0, 0], [-4, -4], [4, -4], [-4, 4], [4, 4]]) if (sampleHeight(heights, x + ox, z + oz) > DRAFT - 0.6) { ok = false; break; }
    pass[iz * NAV_RES + ix] = ok ? 1 : 0;
  }
  // keep only the water connected to the lagoon
  const seen = new Uint8Array(pass.length), stack = [Math.floor((30 + HALF) / NAV_CELL) * NAV_RES + Math.floor((0 + HALF) / NAV_CELL) + 8];
  while (stack.length) {
    const c = stack.pop()!;
    if (seen[c] || !pass[c]) continue;
    seen[c] = 1;
    const cx = c % NAV_RES, cz = Math.floor(c / NAV_RES);
    if (cx > 0) stack.push(c - 1);
    if (cx < NAV_RES - 1) stack.push(c + 1);
    if (cz > 0) stack.push(c - NAV_RES);
    if (cz < NAV_RES - 1) stack.push(c + NAV_RES);
  }
  for (let i = 0; i < pass.length; i++) pass[i] = seen[i];
  return new Nav(pass, heights);
}
