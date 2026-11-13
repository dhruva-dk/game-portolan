// An island's shape on its chart (planet-islands.ts): its coast, and how far any point lies from the water's edge.
//
// The coast is drawn as real low islands' are, as its distance from the centre round the turn (so every ray from the
// centre leaves the land once): a body drawn out long, a few headlands standing out of it and rounded coves bitten
// into it, some bent like a kidney round a broad bay, now and then a long spit tapering to its tip; then worn by
// fractal noise read along the coast itself through a warped domain (points, inlets, the small wander of a sand
// shore), and scaled so its area is the mean radius's circle's. Some larger islands hold a lagoon, some keep an
// offshore rock or two out in their shallows.
//
// The ground is laid by distance from the water's edge, not from the centre, so a beach is the same beach in the
// deepest bay as on the straightest shore: a grid of the signed distance to every outline (negative on land) over the
// chart, a metre apart: exact near the outlines, and carried across the grid by the nearest segment (raster sweeps,
// as Danielsson's, each node trying its neighbours' nearest segments and theirs either side), read back between
// nodes. Past the grid's edge the distance runs on from the nearest node, so the ground is continuous everywhere.
//
// Pure arithmetic: no three, so it runs in node for the tests.

import type { Noise3 } from './noise3.ts';

/** Steps round the full turn at which an outline is tabulated. */
export const TURN = 1024;

/** The segments an outline is measured by, every STRIDE steps of its table. */
const STRIDE = 1, SEGMENTS = TURN / STRIDE;

/** A closed outline about (cx, cz) on the chart, its distance from there at each of TURN + 1 angles. */
export interface Loop { cx: number; cz: number; table: Float64Array }

/** The loop's distance from its centre at angle t, read between the table's steps. */
export function radiusAt(loop: Loop, t: number): number {
  const u = ((((t / (2 * Math.PI)) % 1) + 1) % 1) * TURN, k = Math.floor(u), f = u - k;
  return loop.table[k] + (loop.table[k + 1] - loop.table[k]) * f;
}

/** Whether (x, z) lies within the loop. */
export const within = (loop: Loop, x: number, z: number) =>
  Math.hypot(x - loop.cx, z - loop.cz) < radiusAt(loop, Math.atan2(z - loop.cz, x - loop.cx));

/** A loop about (cx, cz) whose distance at angle t is f(t). */
export const loopOf = (cx: number, cz: number, f: (t: number) => number): Loop =>
  ({ cx, cz, table: Float64Array.from({ length: TURN + 1 }, (_, k) => f((k / TURN) * 2 * Math.PI)) });

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(Math.max((x - a) / (b - a), 0), 1);
  return t * t * (3 - 2 * t);
};

/** The finest the wear's noise is, metres. */
const FINEST = 4;

export interface Outline {
  /** How long it is drawn out (the body's eccentricity, 0…1); how many headlands and coves; whether bent like a
   *  kidney (a broad bay along one long side); whether a spit. */
  long: number; headlands: number; coves: number; bent: boolean; spit: boolean;
  /** The fractal wear's strength (a share of the radius) and its coarsest size, metres. */
  wear: number; size: number;
}

/** One feature of a coast round the turn: where (angle), how broad (radians either side), how far out (+) or in (−)
 *  (the log of the share of the radius), and how flat its middle (0 rounded … 1 nearly square). */
interface Feature { at: number; broad: number; out: number; flat: number }

/**
 * A coast about the chart's centre whose area is a circle's of `radius` metres; `at` the noise's place for it.
 */
export function coastline(radius: number, o: Outline, rand: () => number, noise: Noise3, at: readonly [number, number, number]): Loop {
  const turn = rand() * Math.PI, a = 1 + o.long, b = 1 - o.long * 0.6;
  const features: Feature[] = [];
  for (let i = 0; i < o.headlands; i++) features.push({ at: rand() * 2 * Math.PI, broad: lerp(0.3, 0.7, rand()), out: lerp(0.12, 0.4, rand()), flat: 0.2 });
  for (let i = 0; i < o.coves; i++) features.push({ at: rand() * 2 * Math.PI, broad: lerp(0.3, 0.6, rand()), out: -lerp(0.15, 0.4, rand()), flat: 0.5 });
  if (o.bent) features.push({ at: turn + (rand() < 0.5 ? 0.5 : -0.5) * Math.PI + (rand() - 0.5) * 0.4, broad: lerp(0.8, 1.1, rand()), out: -lerp(0.3, 0.5, rand()), flat: 0.4 });
  // a spit: narrow, leaning a little to one side, its tip rounded
  if (o.spit) features.push({ at: rand() * 2 * Math.PI, broad: lerp(0.12, 0.2, rand()), out: lerp(0.35, 0.6, rand()), flat: 0 });
  const lean = (rand() - 0.5) * 0.8;
  /** The features' sum at angle t. */
  const shaped = (t: number) => {
    let sum = 0;
    for (const f of features) {
      // (the angle off its middle, −π…π; a spit falls away more steeply on one side)
      const off = ((((t - f.at) % (2 * Math.PI)) + 3 * Math.PI) % (2 * Math.PI)) - Math.PI;
      const d = (Math.abs(off) / f.broad) * (f.flat === 0 ? 1 + lean * Math.sign(off) : 1);
      if (d < 1) sum += f.out * (1 - smoothstep(f.flat, 1, d));
    }
    return sum;
  };
  // the body: an ellipse about the centre, its features worked into it
  const body = (t: number) => Math.exp(shaped(t)) / Math.hypot(Math.cos(t - turn) / a, Math.sin(t - turn) / b);
  // worn: fractal noise read where the coast lies, through a domain warped by noise of its own
  const fbm = (x: number, z: number) => {
    // (octaves no finer than FINEST metres, so no notch is narrower than a beach)
    let v = 0, amp = 1, s = o.size, sum = 0;
    for (let i = 0; i < 4 && s >= FINEST; i++, amp *= 0.5, s *= 0.5) {
      v += amp * noise.value(x / s + at[0] + i * 7.1, z / s + at[1], at[2]);
      sum += amp;
    }
    return v / sum;
  };
  const worn = (t: number) => {
    const r = body(t) * radius, x = Math.cos(t) * r, z = Math.sin(t) * r, w = o.size * 0.6;
    const wx = x + w * noise.value(x / o.size + at[1], z / o.size + at[2], at[0]), wz = z + w * noise.value(x / o.size + at[2], z / o.size + at[0], at[1]);
    return r * Math.exp(o.wear * 2 * fbm(wx, wz));
  };
  const raw = loopOf(0, 0, worn);
  // scaled to the circle's area: ½∫r² dθ = πρ²
  let area = 0;
  for (let i = 0; i < TURN; i++) area += 0.5 * raw.table[i] ** 2 * ((2 * Math.PI) / TURN);
  const k = radius / Math.sqrt(area / Math.PI);
  return { cx: 0, cz: 0, table: raw.table.map((r) => r * k) };
}

/** A small round loop about (cx, cz), `radius` metres, its edge wandering a little; drawn out `long` (a share of the
 *  radius) along the angle `turn`, if asked. */
export function blob(cx: number, cz: number, radius: number, rand: () => number, drawn = { long: 0, turn: 0 }): Loop {
  const h = [2, 3, 5].map((n) => ({ n, a: (0.12 / n ** 0.6) * rand(), p: rand() * 2 * Math.PI }));
  return loopOf(cx, cz, (t) => radius * (1 + drawn.long * Math.cos(2 * (t - drawn.turn)) + h.reduce((s, w) => s + w.a * Math.cos(w.n * t + w.p), 0)));
}

/** The signed distance to the water's edge over a chart: metres, negative on land. */
export interface Field {
  /** At (x, z). */
  at(x: number, z: number): number;
  /** The least of it: how far the farthest point of land lies from the water. */
  deepest: number;
  /** Each node on land, as x, z pairs, a metre or so apart. */
  land: Float64Array;
  /** The same softened (blurred over `soften` metres), so its creases are rounded: along the land's middle and out
   *  from every inward corner of a coast; and the most it is inland. */
  soft(x: number, z: number): number;
  inmost: number;
}

/**
 * The signed distance to `loops`' edges over the chart's square of half-side `half` metres, `cell` metres a node;
 * `dry(x, z)` says which side is land; the inland distance softened over `soften` metres.
 */
export function distanceField(loops: readonly Loop[], dry: (x: number, z: number) => boolean, half: number, cell: number, soften: number): Field {
  const n = Math.ceil((2 * half) / cell) + 1, size = n * n;
  const node = (i: number) => -half + i * cell;
  // every edge's segments: start, run, and the first of its loop's (so a segment's neighbours are found)
  // (every other step of the table: a segment half a metre long on the largest coast, its sag a hair's breadth)
  const count = loops.length * SEGMENTS, sx = new Float64Array(count), sz = new Float64Array(count), ex = new Float64Array(count), ez = new Float64Array(count), inv = new Float64Array(count);
  loops.forEach((loop, l) => {
    const at = (k: number): [number, number] => {
      const t = (k / TURN) * 2 * Math.PI;
      return [loop.cx + Math.cos(t) * loop.table[k], loop.cz + Math.sin(t) * loop.table[k]];
    };
    for (let k = 0; k < SEGMENTS; k++) {
      const [ax, az] = at(k * STRIDE), [bx, bz] = at((k + 1) * STRIDE), g = l * SEGMENTS + k;
      sx[g] = ax; sz[g] = az; ex[g] = bx - ax; ez[g] = bz - az;
      inv[g] = 1 / (ex[g] * ex[g] + ez[g] * ez[g] || 1e-12);
    }
  });
  /** Squared distance from (x, z) to segment g. */
  const to = (g: number, x: number, z: number) => {
    const dx = x - sx[g], dz = z - sz[g], u = Math.min(Math.max((dx * ex[g] + dz * ez[g]) * inv[g], 0), 1);
    const qx = dx - ex[g] * u, qz = dz - ez[g] * u;
    return qx * qx + qz * qz;
  };
  const near = new Int32Array(size).fill(-1), d2 = new Float64Array(size).fill(Infinity);
  // exact near each edge: every node within a cell and a half of each segment
  for (let g = 0; g < count; g++) {
    const x0 = Math.min(sx[g], sx[g] + ex[g]), x1 = Math.max(sx[g], sx[g] + ex[g]), z0 = Math.min(sz[g], sz[g] + ez[g]), z1 = Math.max(sz[g], sz[g] + ez[g]);
    const i0 = Math.max(0, Math.floor((x0 + half) / cell - 1.5)), i1 = Math.min(n - 1, Math.ceil((x1 + half) / cell + 1.5));
    const j0 = Math.max(0, Math.floor((z0 + half) / cell - 1.5)), j1 = Math.min(n - 1, Math.ceil((z1 + half) / cell + 1.5));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const m = j * n + i, d = to(g, node(i), node(j));
      if (d < d2[m]) { d2[m] = d; near[m] = g; }
    }
  }
  // carried across the grid: each node tries a neighbour's nearest segment and the two either side of it
  const take = (m: number, o: number, x: number, z: number) => {
    const g = near[o];
    if (g < 0 || g === near[m]) return;
    const base = g - (g % SEGMENTS);
    for (let k = -1; k <= 1; k++) {
      const h = base + ((g - base + k + SEGMENTS) % SEGMENTS), d = to(h, x, z);
      if (d < d2[m]) { d2[m] = d; near[m] = h; }
    }
  };
  for (let round = 0; round < 1; round++) {
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const m = j * n + i, x = node(i), z = node(j);
        if (i > 0) take(m, m - 1, x, z);
        if (j > 0) {
          take(m, m - n, x, z);
          if (i > 0) take(m, m - n - 1, x, z);
          if (i < n - 1) take(m, m - n + 1, x, z);
        }
      }
      for (let i = n - 2; i >= 0; i--) take(j * n + i, j * n + i + 1, node(i), node(j));
    }
    for (let j = n - 1; j >= 0; j--) {
      for (let i = n - 1; i >= 0; i--) {
        const m = j * n + i, x = node(i), z = node(j);
        if (i < n - 1) take(m, m + 1, x, z);
        if (j < n - 1) {
          take(m, m + n, x, z);
          if (i < n - 1) take(m, m + n + 1, x, z);
          if (i > 0) take(m, m + n - 1, x, z);
        }
      }
      for (let i = 1; i < n; i++) take(j * n + i, j * n + i - 1, node(i), node(j));
    }
  }
  const s = new Float32Array(size), land: number[] = [];
  let deepest = 0;
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const m = j * n + i, d = Math.sqrt(d2[m]);
    if (dry(node(i), node(j))) {
      s[m] = -d;
      deepest = Math.min(deepest, -d);
      land.push(node(i), node(j));
    } else s[m] = d;
  }
  /** The farthest any outline reaches from the chart's centre, metres. */
  let outmost = 0;
  for (let g = 0; g < count; g++) outmost = Math.max(outmost, Math.hypot(sx[g], sz[g]));
  // blurred: three box passes each way, about a Gaussian
  const soft = s.slice(), line = new Float32Array(n), r = Math.max(1, Math.round(soften / cell / 1.7));
  for (let pass = 0; pass < 6; pass++) {
    const across = pass % 2 === 0, stride = across ? 1 : n;
    for (let a = 0; a < n; a++) {
      const first = across ? a * n : a;
      // (past the ends, carried on at the slope there: a field rising evenly blurs to itself, with no band at the edge)
      const head = soft[first + stride] - soft[first], tail = soft[first + (n - 1) * stride] - soft[first + (n - 2) * stride];
      const at = (k: number) => (k < 0 ? soft[first] + k * head : k > n - 1 ? soft[first + (n - 1) * stride] + (k - n + 1) * tail : soft[first + k * stride]);
      let sum = 0;
      for (let k = -r; k <= r; k++) sum += at(k);
      for (let k = 0; k < n; k++) {
        line[k] = sum / (2 * r + 1);
        sum += at(k + r + 1) - at(k - r);
      }
      for (let k = 0; k < n; k++) soft[first + k * stride] = line[k];
    }
  }
  /** Bilinear between the nodes of `g` at (x, z); off the grid, carried on from its edge at the slope there (so the
   *  distance has no kink where the grid ends). */
  const read = (g: Float32Array, x: number, z: number): number => {
    const gx = (x + half) / cell, gz = (z + half) / cell;
    const cx = Math.min(Math.max(gx, 0), n - 1), cz = Math.min(Math.max(gz, 0), n - 1);
    const i = Math.min(Math.floor(cx), n - 2), j = Math.min(Math.floor(cz), n - 2), fx = cx - i, fz = cz - j, m = j * n + i;
    const v = (g[m] * (1 - fx) + g[m + 1] * fx) * (1 - fz) + (g[m + n] * (1 - fx) + g[m + n + 1] * fx) * fz;
    if (gx === cx && gz === cz) return v;
    const sx = (g[m + 1] - g[m]) * (1 - fz) + (g[m + n + 1] - g[m + n]) * fz, sz = (g[m + n] - g[m]) * (1 - fx) + (g[m + n + 1] - g[m + 1]) * fx;
    return v + sx * (gx - cx) + sz * (gz - cz);
  };
  return {
    deepest,
    land: Float64Array.from(land),
    // (never nearer than the farthest point of any outline allows)
    at: (x, z) => Math.max(read(s, x, z), Math.hypot(x, z) - outmost),
    soft: (x, z) => Math.max(read(soft, x, z), Math.hypot(x, z) - outmost),
    inmost: -soft.reduce((a, b) => Math.min(a, b), 0),
  };
}
