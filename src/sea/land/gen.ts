// PROTOTYPE (land look): one patch of coast, generated whole. Throwaway code that answers "can code-made land reach the
// north star's look?"; the real thing is an offline bake (see the land handoff). Pure TypeScript, no DOM, so it runs in
// a worker here and could run in node as the bake.
//
// Water first: the coast is designed as a field (a sound with land either side, islands in it), then the mountains
// are grown on the land by uplift against fluvial erosion (stream power, solved implicitly after Braun and Willett
// 2013) with the sea as base level, so every valley drains to the sea. Then thermal erosion for scree, beaches where
// the coast is gentle, a shelf under the shallows, and the maps the renderer reads.
//
// The patch is a square in the plane round the ship's start: x along her first heading, y to port.

export interface LandMaps {
  /** Side of the patch, metres, and texels a side. */
  size: number;
  n: number;
  /** Height over the sea, metres (negative under it). */
  height: Float32Array;
  /** Albedo (sRGB) and forest density. */
  colour: Uint8Array;
  /** Normal x and y in the patch's plane (0.5 is level), AO, broadleaf share of the forest. */
  normal: Uint8Array;
  /** Sand, snow, rock and grass weights for the near detail. */
  material: Uint8Array;
  /** Trees: x, y, height, type + seed (type 0 conifer, 1 broadleaf). */
  trees: Float32Array;
  /** Milliseconds each stage took. */
  timing: Record<string, number>;
  /** The eroded heights before detail, at the coarse grid (for looking at). */
  coarse: Float32Array;
}

// ---------------------------------------------------------------- noise

function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const GX = [1, -1, 1, -1, 1.41, -1.41, 0, 0], GY = [1, 1, -1, -1, 0, 0, 1.41, -1.41];
const grad = (h: number, dx: number, dy: number) => GX[h & 7] * dx + GY[h & 7] * dy;

class Noise {
  readonly #p = new Uint8Array(512);
  constructor(seed: number) {
    const r = rng(seed);
    const p = Array.from({ length: 256 }, (_, i) => i);
    for (let i = 255; i > 0; i--) {
      const j = Math.floor(r() * (i + 1));
      [p[i], p[j]] = [p[j], p[i]];
    }
    for (let i = 0; i < 512; i++) this.#p[i] = p[i & 255];
  }
  /** Gradient noise, about -1 to 1. */
  at(x: number, y: number): number {
    const p = this.#p;
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const X = xi & 255, Y = yi & 255;
    const u = xf * xf * xf * (xf * (xf * 6 - 15) + 10), v = yf * yf * yf * (yf * (yf * 6 - 15) + 10);
    const aa = p[p[X] + Y], ab = p[p[X] + Y + 1], ba = p[p[X + 1] + Y], bb = p[p[X + 1] + Y + 1];
    const gaa = grad(aa, xf, yf), gab = grad(ab, xf, yf - 1);
    const x1 = gaa + u * (grad(ba, xf - 1, yf) - gaa);
    const x2 = gab + u * (grad(bb, xf - 1, yf - 1) - gab);
    return x1 + v * (x2 - x1);
  }
  fbm(x: number, y: number, octaves: number, gain = 0.5): number {
    let s = 0, a = 1, f = 1, w = 0;
    for (let o = 0; o < octaves; o++) {
      s += this.at(x * f + o * 17.3, y * f - o * 9.1) * a;
      w += a;
      a *= gain;
      f *= 2.03;
    }
    return s / w;
  }
  ridged(x: number, y: number, octaves: number): number {
    let s = 0, a = 1, f = 1, w = 0, prev = 1;
    for (let o = 0; o < octaves; o++) {
      const r = 1 - Math.abs(this.at(x * f + o * 31.7, y * f + o * 7.7));
      s += r * r * a * prev;
      prev = r;
      w += a;
      a *= 0.5;
      f *= 2.1;
    }
    return s / w;
  }
}

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

// ---------------------------------------------------------------- distance transform (Felzenszwalb and Huttenlocher)

function edt1(f: Float64Array, n: number, d: Float64Array, v: Int32Array, z: Float64Array): void {
  let k = 0;
  v[0] = 0;
  z[0] = -Infinity;
  z[1] = Infinity;
  for (let q = 1; q < n; q++) {
    let s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    while (s <= z[k]) {
      k--;
      s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    }
    k++;
    v[k] = q;
    z[k] = s;
    z[k + 1] = Infinity;
  }
  k = 0;
  for (let q = 0; q < n; q++) {
    while (z[k + 1] < q) k++;
    d[q] = (q - v[k]) * (q - v[k]) + f[v[k]];
  }
}

/** Distance, in texels, from each texel to the nearest texel where `inside` is false. */
function distanceTo(inside: Uint8Array, n: number): Float32Array {
  const BIG = 1e12;
  const g = new Float64Array(n * n);
  for (let i = 0; i < n * n; i++) g[i] = inside[i] ? BIG : 0;
  const f = new Float64Array(n), d = new Float64Array(n), v = new Int32Array(n), z = new Float64Array(n + 1);
  for (let x = 0; x < n; x++) {
    for (let y = 0; y < n; y++) f[y] = g[y * n + x];
    edt1(f, n, d, v, z);
    for (let y = 0; y < n; y++) g[y * n + x] = d[y];
  }
  const out = new Float32Array(n * n);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) f[x] = g[y * n + x];
    edt1(f, n, d, v, z);
    for (let x = 0; x < n; x++) out[y * n + x] = Math.sqrt(d[x]);
  }
  return out;
}

// ---------------------------------------------------------------- the coast, designed

interface Coast {
  /** Land where positive, roughly metres from the coast near it. */
  field(x: number, y: number): number;
  /** How much the land here wants to rise (uplift), 0–1. */
  uplift(x: number, y: number): number;
  /** How gentle the coast is here: 1 a wide beach, 0 straight into the sea. */
  beach(x: number, y: number): number;
}

function sound(noise: Noise, size: number): Coast {
  const warp = (x: number, y: number) => [x + 220 * noise.fbm(x / 900, y / 900, 3), y + 160 * noise.fbm(x / 700 + 40, y / 700 - 12, 3)];
  const islands = [
    [520, 470, 130], [1350, 260, 90], [-520, 560, 170], [1900, 700, 220], [880, 760, 70], [-1350, 300, 110],
  ];
  // the starboard shore: a long coast running ahead, bending toward port in the distance
  const starboard = (x: number, y: number) => -y - 230 - 70 * noise.fbm(x / 420, 3.3, 4) + Math.max(0, x - 900) * 0.22 + 60 * smooth(-200, 300, x);
  // across the sound, the far range
  const port = (x: number, y: number) => y - 1000 - 220 * noise.fbm(x / 650, 9.1, 4) + Math.max(0, x - 1200) * 0.35 + Math.max(0, -x - 1200) * 0.25;
  const island = (x: number, y: number) => {
    let best = -1e9;
    for (const [cx, cy, r] of islands) best = Math.max(best, r - Math.hypot(x - cx, y - cy));
    return best < -400 ? best : best + 45 * noise.fbm(x / 160, y / 160, 3);
  };
  return {
    field(x0, y0) {
      const [x, y] = warp(x0, y0);
      // fjord inlets cut into the starboard shore
      const inlet = 160 * Math.max(0, noise.ridged(x / 520, 77.7, 2) - 0.72) / 0.28;
      // the land ends in a coast before the patch does
      const rim = 260 * smooth(size * 0.5 - 520, size * 0.5 - 60, Math.max(Math.abs(x0), Math.abs(y0)));
      return Math.max(starboard(x, y) - inlet, port(x, y), island(x, y)) - rim;
    },
    uplift(x0, y0) {
      const [x, y] = warp(x0, y0);
      const s = starboard(x, y), p = port(x, y), i = island(x, y);
      const ridges = 0.55 + 0.45 * noise.fbm(x / 1100, y / 1100, 3);
      if (i >= s && i >= p) return 0.18 + 0.12 * smooth(0, 200, i);
      if (p > s) return (0.35 + 0.65 * smooth(0, 700, p)) * ridges + 0.1;
      return (0.2 + 0.8 * smooth(80, 900, s)) * ridges;
    },
    beach(x, y) {
      return smooth(-0.1, 0.35, noise.fbm(x / 600 + 5, y / 600 - 3, 3) + 0.25 * (1 - smooth(300, 700, Math.abs(y))));
    },
  };
}

// ---------------------------------------------------------------- the mountains: stream power

/**
 * Uplift against fluvial erosion on an n×n grid of `dx`-metre cells. `sea` cells are the base level and stay at 0.
 * Returns heights (arbitrary units: rescale afterwards) and the drainage area of each cell, m².
 */
function streamPower(n: number, dx: number, sea: Uint8Array, uplift: Float32Array, start: Float32Array, iterations: number, creep: number) {
  const N = n * n;
  const h = Float32Array.from(start);
  const rcv = new Int32Array(N), rlen = new Float32Array(N), area = new Float32Array(N);
  const ndon = new Int32Array(N), doff = new Int32Array(N + 1), don = new Int32Array(N), stack = new Int32Array(N);
  const DX = [1, -1, 0, 0, 1, 1, -1, -1], DY = [0, 0, 1, -1, 1, -1, 1, -1];
  const LEN = DX.map((x, k) => Math.hypot(x, DY[k]) * dx);
  const K = 2.2e-4, M = 0.5, DT = 120;
  // a fixed bias per cell in choosing where it drains, so the channels wander instead of running down the grid
  const r = rng(n * 7 + 3), bias = Float32Array.from({ length: N }, () => 0.7 + 0.6 * r());
  for (let it = 0; it < iterations; it++) {
    // each cell drains to its steepest neighbour downhill
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const i = y * n + x;
        rcv[i] = i;
        rlen[i] = dx;
        if (sea[i]) continue;
        let best = 0;
        for (let k = 0; k < 8; k++) {
          const xx = x + DX[k], yy = y + DY[k];
          if (xx < 0 || yy < 0 || xx >= n || yy >= n) continue;
          const j = yy * n + xx;
          const s = ((h[i] - h[j]) / LEN[k]) * bias[j];
          if (s > best) { best = s; rcv[i] = j; rlen[i] = LEN[k]; }
        }
      }
    }
    // donors, then an order in which every cell comes after the one it drains to
    ndon.fill(0);
    for (let i = 0; i < N; i++) if (rcv[i] !== i) ndon[rcv[i]]++;
    doff[0] = 0;
    for (let i = 0; i < N; i++) doff[i + 1] = doff[i] + ndon[i];
    ndon.fill(0);
    for (let i = 0; i < N; i++) if (rcv[i] !== i) { const r = rcv[i]; don[doff[r] + ndon[r]++] = i; }
    let top = 0;
    const work: number[] = [];
    for (let b = 0; b < N; b++) {
      if (rcv[b] !== b) continue;
      work.push(b);
      while (work.length) {
        const i = work.pop()!;
        stack[top++] = i;
        for (let k = doff[i]; k < doff[i + 1]; k++) work.push(don[k]);
      }
    }
    // the area each cell gathers
    area.fill(dx * dx);
    for (let k = N - 1; k >= 0; k--) { const i = stack[k]; if (rcv[i] !== i) area[rcv[i]] += area[i]; }
    // lifted, and cut by the water through it (implicit, so any step is stable)
    for (let k = 0; k < N; k++) {
      const i = stack[k];
      if (sea[i]) continue;
      const r = rcv[i];
      if (r === i) { h[i] += DT * uplift[i]; continue; }
      const f = (K * DT * Math.pow(area[i], M)) / rlen[i];
      h[i] = (h[i] + DT * uplift[i] + f * h[r]) / (1 + f);
    }
    // soil creep rounds what is finer than the rivers can cut
    for (let pass = 0; pass < creep; pass++) {
      const g = Float32Array.from(h);
      for (let y = 1; y < n - 1; y++) {
        for (let x = 1; x < n - 1; x++) {
          const i = y * n + x;
          if (!sea[i]) h[i] = g[i] + 0.12 * (g[i - 1] + g[i + 1] + g[i - n] + g[i + n] - 4 * g[i]);
        }
      }
    }
  }
  return { h, area };
}

// ---------------------------------------------------------------- resampling

function bicubic(src: Float32Array, n: number, u: number, v: number): number {
  const x = u * n - 0.5, y = v * n - 0.5;
  const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
  // Catmull-Rom weights
  const x0 = ((-fx + 2) * fx - 1) * fx / 2, x1 = ((3 * fx - 5) * fx * fx + 2) / 2, x2 = ((-3 * fx + 4) * fx + 1) * fx / 2, x3 = ((fx - 1) * fx * fx) / 2;
  const y0 = ((-fy + 2) * fy - 1) * fy / 2, y1 = ((3 * fy - 5) * fy * fy + 2) / 2, y2 = ((-3 * fy + 4) * fy + 1) * fy / 2, y3 = ((fy - 1) * fy * fy) / 2;
  const m = n - 1;
  const c0 = xi - 1 < 0 ? 0 : xi - 1 > m ? m : xi - 1, c1 = xi < 0 ? 0 : xi > m ? m : xi, c2 = xi + 1 > m ? m : xi + 1 < 0 ? 0 : xi + 1, c3 = xi + 2 > m ? m : xi + 2 < 0 ? 0 : xi + 2;
  const row = (r: number) => {
    const o = (r < 0 ? 0 : r > m ? m : r) * n;
    return src[o + c0] * x0 + src[o + c1] * x1 + src[o + c2] * x2 + src[o + c3] * x3;
  };
  return row(yi - 1) * y0 + row(yi) * y1 + row(yi + 1) * y2 + row(yi + 2) * y3;
}

/** Box blur of radius r texels, by summed area. */
function blur(src: Float32Array, n: number, r: number): Float32Array {
  const sat = new Float64Array((n + 1) * (n + 1));
  for (let y = 0; y < n; y++) {
    let row = 0;
    for (let x = 0; x < n; x++) {
      row += src[y * n + x];
      sat[(y + 1) * (n + 1) + x + 1] = sat[y * (n + 1) + x + 1] + row;
    }
  }
  const out = new Float32Array(n * n);
  for (let y = 0; y < n; y++) {
    const y0 = Math.max(0, y - r), y1 = Math.min(n, y + r + 1);
    for (let x = 0; x < n; x++) {
      const x0 = Math.max(0, x - r), x1 = Math.min(n, x + r + 1);
      const s = sat[y1 * (n + 1) + x1] - sat[y0 * (n + 1) + x1] - sat[y1 * (n + 1) + x0] + sat[y0 * (n + 1) + x0];
      out[y * n + x] = s / ((x1 - x0) * (y1 - y0));
    }
  }
  return out;
}

// ---------------------------------------------------------------- the whole patch

const PEAK = 760;

export function generate(seed = 7, size = 4096, n = 1024, coarse = 512): LandMaps {
  const timing: Record<string, number> = {};
  let t0 = performance.now();
  const lap = (name: string) => { const t = performance.now(); timing[name] = Math.round(t - t0); t0 = t; };
  const noise = new Noise(seed), detail = new Noise(seed + 101);
  const coast = sound(noise, size);
  const at = (i: number, m: number) => ((i + 0.5) / m - 0.5) * size;

  // the coast and the uplift at the coarse grid
  const cdx = size / coarse;
  const cSea = new Uint8Array(coarse * coarse), cUp = new Float32Array(coarse * coarse), cStart = new Float32Array(coarse * coarse);
  for (let y = 0; y < coarse; y++) {
    for (let x = 0; x < coarse; x++) {
      const i = y * coarse + x, px = at(x, coarse), py = at(y, coarse);
      const f = coast.field(px, py);
      cSea[i] = f <= 0 ? 1 : 0;
      cUp[i] = coast.uplift(px, py) * (0.85 + 0.3 * noise.fbm(px / 140, py / 140, 3));
      // a gentle rise from the coast with noise in it, so the first drainage is not straight lines
      cStart[i] = f > 0 ? Math.min(f, 600) * 0.05 + 6 * (1 + detail.fbm(px / 90, py / 90, 3)) : 0;
    }
  }
  lap('coast');
  // the big valleys first on a grid half as fine, then the detail
  const half = coarse / 2;
  const hSea = new Uint8Array(half * half), hUp = new Float32Array(half * half), hStart = new Float32Array(half * half);
  for (let y = 0; y < half; y++) for (let x = 0; x < half; x++) {
    const i = y * half + x, j = 2 * y * coarse + 2 * x;
    hSea[i] = cSea[j] & cSea[j + 1] & cSea[j + coarse] & cSea[j + coarse + 1];
    hUp[i] = (cUp[j] + cUp[j + 1] + cUp[j + coarse] + cUp[j + coarse + 1]) / 4;
    hStart[i] = hSea[i] ? 0 : (cStart[j] + cStart[j + 1] + cStart[j + coarse] + cStart[j + coarse + 1]) / 4;
  }
  const big = streamPower(half, cdx * 2, hSea, hUp, hStart, 40, 2).h;
  for (let y = 0; y < coarse; y++) for (let x = 0; x < coarse; x++) {
    const i = y * coarse + x;
    cStart[i] = cSea[i] ? 0 : Math.max(0.1, bicubic(big, half, (x + 0.5) / coarse, (y + 0.5) / coarse)) + cStart[i] * 0.05;
  }
  const { h: cH, area: cArea } = streamPower(coarse, cdx, cSea, cUp, cStart, 16, 0);
  lap('erosion');
  let top = 0;
  for (let i = 0; i < cH.length; i++) top = Math.max(top, cH[i]);
  const k = PEAK / top;
  // a concave profile: gentle foothills that steepen into the peaks
  for (let i = 0; i < cH.length; i++) cH[i] = Math.pow(cH[i] * k / PEAK, 1.7) * PEAK;
  const cWet = new Float32Array(cArea.length);
  for (let i = 0; i < cArea.length; i++) cWet[i] = clamp01((Math.log(cArea[i] / (cdx * cdx)) - 2) / 7);

  // the fine grid: the coast again (crisp), the mountains resampled with rock in them
  const N = n * n, dx = size / n;
  const sea = new Uint8Array(N), field = new Float32Array(N), h = new Float32Array(N), wet = new Float32Array(N), beach = new Float32Array(N);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const i = y * n + x, px = at(x, n), py = at(y, n);
      const f = coast.field(px, py);
      field[i] = f;
      sea[i] = f <= 0 ? 1 : 0;
      const u = (x + 0.5) / n, v = (y + 0.5) / n;
      const m = Math.max(0, bicubic(cH, coarse, u, v));
      wet[i] = clamp01(bicubic(cWet, coarse, u, v));
      beach[i] = coast.beach(px, py);
      // crags: ridged detail that grows with height, so silhouettes break up and the low ground stays smooth
      const crag = detail.ridged(px / 75, py / 75, 4) - 0.45;
      h[i] = m + crag * 26 * smooth(40, 400, m) + detail.fbm(px / 30, py / 30, 3) * 2.5 * smooth(5, 60, m);
    }
  }
  lap('resample');

  // talus: anything steeper than the scree's angle slides down a little (a few passes)
  {
    const talus = Math.tan((42 * Math.PI) / 180) * dx;
    const next = new Float32Array(N);
    for (let pass = 0; pass < 6; pass++) {
      next.set(h);
      for (let y = 1; y < n - 1; y++) {
        for (let x = 1; x < n - 1; x++) {
          const i = y * n + x;
          if (sea[i]) continue;
          let lo = i, drop = 0;
          for (const j of [i - 1, i + 1, i - n, i + n]) if (h[i] - h[j] > drop) { drop = h[i] - h[j]; lo = j; }
          if (drop > talus * 1.6) {
            const move = (drop - talus * 1.6) * 0.25;
            next[i] -= move;
            next[lo] += move;
          }
        }
      }
      h.set(next);
    }
  }
  lap('talus');

  // the shore: beaches where it is gentle, a shelf under the shallows, deep water off the cliffs
  const toSea = distanceTo(Uint8Array.from(sea, (s) => 1 - s), n);
  const toLand = distanceTo(sea, n);
  for (let i = 0; i < N; i++) {
    const b = beach[i];
    if (!sea[i]) {
      const d = toSea[i] * dx;
      const width = 18 + 70 * b;
      const sand = Math.min(2.4, d * 0.06) * b + Math.min(d * 0.5, 3) * (1 - b);
      const rise = smooth(width * 0.4 * b, width * b + 50, d);
      h[i] = sand + Math.max(0, h[i]) * rise;
    } else {
      const d = toLand[i] * dx;
      const slope = 0.03 + 0.4 * (1 - b) * (1 - b);
      h[i] = -Math.min(0.4 + d * slope + Math.max(0, d - 60) * 0.12, 48) * (1 + 0.15 * detail.fbm(i % n / 40, i / n / 40, 2));
    }
  }
  lap('shore');

  // ---------------- the maps
  const colour = new Uint8Array(N * 4), normal = new Uint8Array(N * 4), material = new Uint8Array(N * 4);
  const near = blur(h, n, 6), far = blur(h, n, 24);
  const enc = (c: number) => Math.round(255 * (c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055));
  const forestAt = new Float32Array(N), leafAt = new Float32Array(N);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const i = y * n + x, px = at(x, n), py = at(y, n);
      const hx = (h[y * n + Math.min(n - 1, x + 1)] - h[y * n + Math.max(0, x - 1)]) / (2 * dx);
      const hy = (h[Math.min(n - 1, y + 1) * n + x] - h[Math.max(0, y - 1) * n + x]) / (2 * dx);
      const slope = Math.hypot(hx, hy);
      const nl = 1 / Math.sqrt(hx * hx + hy * hy + 1);
      const ao = Math.min(1, Math.max(0.3, 1 - 0.02 * Math.max(near[i] - h[i], 0) - 0.006 * Math.max(far[i] - h[i], 0)));
      const z = h[i];
      const v1 = noise.fbm(px / 260, py / 260, 4), v2 = detail.fbm(px / 60, py / 60, 3);
      let r: number, g: number, b: number, forest = 0, leaf = 0, sand = 0, snow = 0, rock = 0, grass = 0;
      if (sea[i]) {
        // the seabed: sand in the shallows, darker and weedier out deep, rock off the cliffs
        const deep = smooth(1, 20, -z);
        const rk = (1 - beach[i]) * 0.7;
        r = 0.36 - 0.2 * deep - 0.12 * rk; g = 0.32 - 0.16 * deep - 0.1 * rk; b = 0.24 - 0.12 * deep - 0.08 * rk;
        sand = 1 - rk;
        rock = rk;
      } else {
        const d = toSea[i] * dx;
        rock = Math.max(smooth(0.72, 1.05, slope + 0.12 * v2), smooth(480, 700, z) * 0.6);
        const snowLine = 450 + 70 * v1 - 90 * wet[i];
        snow = smooth(snowLine - 25, snowLine + 45, z) * (1 - smooth(1.0, 1.5, slope));
        const treeLine = 250 + 60 * v1 - 40 * wet[i];
        const clearing = smooth(-0.35, 0.05, noise.fbm(px / 180 + 20, py / 180, 3) + 0.25 * wet[i]);
        forest = (1 - smooth(treeLine - 70, treeLine + 15, z)) * (1 - smooth(0.6, 0.85, slope)) * clearing * smooth(4, 14, z) * smooth(25 + 40 * beach[i], 55 + 50 * beach[i], d);
        leaf = clamp01(0.75 * (1 - smooth(10, 140, z)) + 0.35 * v1 + 0.15 * v2);
        sand = (1 - smooth(1.8, 3.2, z)) * smooth(0.15, 0.5, beach[i]) * (1 - smooth(0.25, 0.45, slope));
        const scrub = smooth(90, 220, z) * (1 - snow);
        grass = clamp01(1 - sand - rock - snow - scrub * 0.8);
        // the ground's colour: meadow and autumn scrub mixed by height and patch, forest floor under trees
        const meadow = [0.085 + 0.03 * v2, 0.11 + 0.02 * v1, 0.04];
        const heath = [0.19 + 0.06 * v1 + 0.03 * v2, 0.1 + 0.03 * v2, 0.045];
        const olive = [0.12, 0.105, 0.05];
        const s1 = clamp01(scrub * (0.7 + 0.5 * v1)), s2 = clamp01(0.5 + v2);
        let gr = [meadow[0] + (heath[0] * s2 + olive[0] * (1 - s2) - meadow[0]) * s1, meadow[1] + (heath[1] * s2 + olive[1] * (1 - s2) - meadow[1]) * s1, meadow[2] + (heath[2] * s2 + olive[2] * (1 - s2) - meadow[2]) * s1];
        const floor = [0.055, 0.045, 0.03];
        gr = gr.map((c, k) => c + (floor[k] - c) * forest);
        const stone = [0.15 + 0.03 * v2, 0.155 + 0.025 * v2, 0.145 + 0.02 * v2].map((c) => c * (0.75 + 0.35 * clamp01(0.5 + v1)) * (1 - 0.35 * wet[i] * smooth(0, 200, z)));
        const sandC = z < 0.7 ? [0.2, 0.17, 0.12] : [0.43, 0.38, 0.29];
        const snowC = [0.78, 0.8, 0.84];
        const mix3 = (a: number[], c: number[], w: number) => a.map((v, k) => v + (c[k] - v) * w);
        let c = mix3(gr, stone, rock);
        c = mix3(c, sandC, sand * (1 - rock));
        c = mix3(c, snowC, snow);
        [r, g, b] = c;
      }
      colour[i * 4] = enc(r); colour[i * 4 + 1] = enc(g); colour[i * 4 + 2] = enc(b); colour[i * 4 + 3] = Math.round(255 * forest);
      normal[i * 4] = Math.round(255 * (0.5 - 0.5 * hx * nl)); normal[i * 4 + 1] = Math.round(255 * (0.5 - 0.5 * hy * nl));
      normal[i * 4 + 2] = Math.round(255 * ao); normal[i * 4 + 3] = Math.round(255 * leaf);
      material[i * 4] = Math.round(255 * sand); material[i * 4 + 1] = Math.round(255 * snow); material[i * 4 + 2] = Math.round(255 * rock); material[i * 4 + 3] = Math.round(255 * grass);
      forestAt[i] = forest;
      leafAt[i] = leaf;
    }
  }
  lap('maps');

  // ---------------- the trees: a jittered grid kept where the forest is, and a few in the open
  const r = rng(seed * 31 + 5);
  const SPACING = 6.5, cells = Math.floor(size / SPACING);
  const trees: number[] = [];
  for (let cy = 0; cy < cells; cy++) {
    for (let cx = 0; cx < cells; cx++) {
      const px = (cx + 0.15 + 0.7 * r()) * SPACING - size / 2, py = (cy + 0.15 + 0.7 * r()) * SPACING - size / 2;
      const ix = Math.min(n - 1, Math.floor((px / size + 0.5) * n)), iy = Math.min(n - 1, Math.floor((py / size + 0.5) * n));
      const i = iy * n + ix;
      const f = forestAt[i];
      const keep = r();
      if (sea[i] || h[i] < 2.5 || keep > Math.max(f * 1.05, 0.012 * (1 - material[i * 4 + 2] / 255) * (h[i] < 260 ? 1 : 0))) continue;
      const broad = r() < leafAt[i] ? 1 : 0;
      const height = (broad ? 9 + 7 * r() : 13 + 13 * r()) * (0.55 + 0.45 * (1 - smooth(120, 300, h[i]))) * (0.8 + 0.2 * f);
      trees.push(px, py, height, broad + 0.999 * r());
    }
  }
  lap('trees');

  return { size, n, height: h, colour, normal, material, trees: new Float32Array(trees), timing, coarse: cH };
}
