// Coastlines: the land's outline on the planet, traced once from its heights where they cross the sea's level, and
// inked over the live globe as a chartmaker inked a coast, one firm line of iron-gall where the land meets the water.
//
// The tracing is marching squares on each face of an equal-angle cube, the same grid the planet's heights are kept on,
// so the line follows the shore the terrain is built from. Its chains end at the faces' edges, where the next face's
// chains begin at the same points. A rock under three cells is left off, as a chartmaker left off what no ship would
// strike. Tracing touches no page or canvas, so a worker can do it.
//
// Inking projects each chain through the live camera (a Globe), keeps the runs on the near side of the limb and lays
// them as one ruled path with no tremor: the line is held to the geography, so it never crawls as the planet turns.
import { faceDir } from '../sim/sphere.ts';
import { v3 } from '../sim/math.ts';
import type { LineStyle, Pen, Pts } from './pen.ts';

export interface Coasts {
  /** Chains of points on the unit sphere: x, y, z, x, y, z, ... */
  chains: Float32Array[];
  /** Each chain's cap, four numbers a chain: its middle (a unit vector) and the angle from it to its farthest point. */
  caps: Float32Array;
}

/** The planet as the camera sees it this frame. */
export interface Globe {
  /** The unit vector from the planet's centre toward the eye. */
  eye: { x: number; y: number; z: number };
  /** The cosine of the angle from `eye` to the limb: a point shows where its dot with `eye` is greater. */
  horizon: number;
  /** Projects a point on the unit sphere to the screen, CSS pixels, into `out`; false when it is behind the eye. */
  project(x: number, y: number, z: number, out: { x: number; y: number }): boolean;
}

/** The edges of a cell, by the corners they join: bottom (a-b), right (b-c), top (d-c), left (a-d). */
const E = { bottom: 0, right: 1, top: 2, left: 3 } as const;
type Edge = (typeof E)[keyof typeof E];

/** For each corner case (bits a, b, c, d set where the land stands above the level), the edges each segment joins.
 *  The saddles (5 and 10) are settled by the cell's middle, below. */
const CASES: readonly (readonly (readonly [Edge, Edge])[])[] = [
  [], [[E.left, E.bottom]], [[E.bottom, E.right]], [[E.left, E.right]],
  [[E.right, E.top]], [], [[E.bottom, E.top]], [[E.left, E.top]],
  [[E.top, E.left]], [[E.bottom, E.top]], [], [[E.right, E.top]],
  [[E.right, E.left]], [[E.bottom, E.right]], [[E.left, E.bottom]], [],
];

/**
 * Traces where `height` crosses `level` over the whole sphere, on an n × n grid a cube face: the coasts as chains of
 * unit vectors.
 */
export function traceCoasts(height: (p: { x: number; y: number; z: number }) => number, n = 256, level = 0): Coasts {
  const N = n + 1, h = new Float32Array(N * N), p = v3(), q = v3();
  const chains: Float32Array[] = [];
  for (let f = 0; f < 6; f++) {
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) h[j * N + i] = height(faceDir(f, -1 + (2 * i) / n, -1 + (2 * j) / n, p)) - level;
    // the crossing on each edge, by its key: n × N horizontal edges first, then N × n vertical ones
    const H = n * N;
    const at = (key: number, out: Float64Array, o: number) => {
      let i0, j0, i1, j1;
      if (key < H) { j0 = j1 = Math.floor(key / n); i0 = key % n; i1 = i0 + 1; }
      else { const k = key - H; j0 = Math.floor(k / N); i0 = i1 = k % N; j1 = j0 + 1; }
      const a = h[j0 * N + i0], b = h[j1 * N + i1], s = a / (a - b);
      const u = -1 + (2 * (i0 + (i1 - i0) * s)) / n, v = -1 + (2 * (j0 + (j1 - j0) * s)) / n;
      faceDir(f, u, v, q);
      out[o] = q.x; out[o + 1] = q.y; out[o + 2] = q.z;
    };
    // the segments, each joining two edge keys, and each key's segments (two at most: the cells either side)
    const segA: number[] = [], segB: number[] = [];
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const a = h[j * N + i], b = h[j * N + i + 1], c = h[(j + 1) * N + i + 1], d = h[(j + 1) * N + i];
        const k = (a > 0 ? 1 : 0) | (b > 0 ? 2 : 0) | (c > 0 ? 4 : 0) | (d > 0 ? 8 : 0);
        if (k === 0 || k === 15) continue;
        const key = [j * n + i, H + j * N + i + 1, (j + 1) * n + i, H + j * N + i];
        let pairs: readonly (readonly [Edge, Edge])[] = CASES[k];
        if (k === 5 || k === 10) {
          // a saddle: the land joins across the middle if the middle stands above the level
          const mid = (a + b + c + d) / 4 > 0;
          pairs = (k === 5) === mid ? [[E.bottom, E.right], [E.top, E.left]] : [[E.left, E.bottom], [E.right, E.top]];
        }
        for (const [x, y] of pairs) { segA.push(key[x]); segB.push(key[y]); }
      }
    }
    const ends = new Map<number, number[]>();
    for (let s = 0; s < segA.length; s++) {
      for (const key of [segA[s], segB[s]]) {
        const l = ends.get(key);
        if (l) l.push(s); else ends.set(key, [s]);
      }
    }
    const used = new Uint8Array(segA.length);
    const walk = (s0: number, from: number): number[] => {
      const keys = [from];
      let s = s0, key = from;
      while (s >= 0 && !used[s]) {
        used[s] = 1;
        key = segA[s] === key ? segB[s] : segA[s];
        keys.push(key);
        const next = ends.get(key)!;
        s = next.length > 1 ? (next[0] === s ? next[1] : next[0]) : -1;
      }
      return keys;
    };
    const emit = (keys: number[]) => {
      if (keys.length < 4) return;
      const out = new Float64Array(keys.length * 3);
      keys.forEach((key, i) => at(key, out, i * 3));
      chains.push(Float32Array.from(out));
    };
    // open chains first, from their loose ends at the face's edge; then the closed ones
    for (const [key, list] of ends) if (list.length === 1 && !used[list[0]]) emit(walk(list[0], key));
    for (let s = 0; s < segA.length; s++) if (!used[s]) emit(walk(s, segA[s]));
  }
  const caps = new Float32Array(chains.length * 4);
  chains.forEach((c, k) => {
    let x = 0, y = 0, z = 0;
    for (let i = 0; i < c.length; i += 3) { x += c[i]; y += c[i + 1]; z += c[i + 2]; }
    const l = Math.hypot(x, y, z) || 1;
    x /= l; y /= l; z /= l;
    let most = 1;
    for (let i = 0; i < c.length; i += 3) most = Math.min(most, x * c[i] + y * c[i + 1] + z * c[i + 2]);
    caps.set([x, y, z, Math.acos(Math.max(-1, Math.min(1, most)))], k * 4);
  });
  return { chains, caps };
}

const P = { x: 0, y: 0 };

/** The coasts' runs on the near side of the globe, projected: one list of screen points a run. */
export function coastRuns(c: Coasts, globe: Globe): Pts[] {
  const { eye, horizon } = globe, out: Pts[] = [], limb = Math.acos(Math.max(-1, Math.min(1, horizon)));
  for (let k = 0; k < c.chains.length; k++) {
    // a chain wholly over the limb is passed by
    const m = k * 4, dc = c.caps[m] * eye.x + c.caps[m + 1] * eye.y + c.caps[m + 2] * eye.z;
    if (dc < Math.cos(Math.min(Math.PI, limb + c.caps[m + 3]))) continue;
    const ch = c.chains[k];
    let run: Pts | null = null, lx = 0, ly = 0;
    for (let i = 0; i < ch.length; i += 3) {
      const x = ch[i], y = ch[i + 1], z = ch[i + 2];
      if (x * eye.x + y * eye.y + z * eye.z <= horizon) {
        if (run && run.length >= 4) out.push(run);
        run = null;
        continue;
      }
      globe.project(x, y, z, P);
      if (!run) {
        run = [P.x, P.y];
        lx = P.x; ly = P.y;
      } else if (Math.abs(P.x - lx) + Math.abs(P.y - ly) > 1.2 || i === ch.length - 3) {
        run.push(P.x, P.y);
        lx = P.x; ly = P.y;
      }
    }
    if (run && run.length >= 4) out.push(run);
  }
  return out;
}

/** Inks the coasts over the globe, their first t laid: one firm line, no tremor. */
export function coasts(pen: Pen, c: Coasts, globe: Globe, st: LineStyle = {}, t = 1): void {
  if (t <= 0) return;
  pen.rule(coastRuns(c, globe), { w: 'fine', ink: 'iron', alpha: 0.9, wobble: 0, ...st }, t);
}
