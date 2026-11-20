// The algorithms the terrain (terrain.ts) runs over the planet's cells
// (cells.ts, 6 × 256², about 3.4 m a cell): the level that leaves a share of
// the planet's area above it, the distance to a contour, connected parts,
// discs; and reading a per-cell value smoothly at any point, between the cells'
// centres.
//
// Pure arithmetic: no three, so it runs in node for the tests.

import {
  CELLS,
  N,
  PLANET_QUANTA,
  areaQuanta,
  centreOf,
  columnOf,
  faceOf,
  neighbor,
  rowOf,
} from './cells.ts';
import { smoothstep } from './scalar.ts';
import { R, faceUV, type Vec3 } from './sphere.ts';

/** Square metres in an area quantum (cells.ts), and a cell's area. */
const AREA_M2 = (4 * Math.PI * R * R) / PLANET_QUANTA;
export const areaOf = (c: number) => areaQuanta(c) * AREA_M2;
/** A cell's breadth at a face's middle, metres. */
export const CELL = (R * Math.PI) / 2 / N;

let XYZ: Float64Array | null = null;
/** Every cell centre's unit vector, x, y, z a cell. */
export function centres(): Float64Array {
  if (XYZ) return XYZ;
  XYZ = new Float64Array(3 * CELLS);
  for (let c = 0; c < CELLS; c++) XYZ.set(centreOf(c), 3 * c);
  return XYZ;
}

/** Metres along the surface between two cells' centres. */
function arc(a: number, b: number): number {
  const p = centres(),
    dx = p[3 * a] - p[3 * b],
    dy = p[3 * a + 1] - p[3 * b + 1],
    dz = p[3 * a + 2] - p[3 * b + 2];
  return (
    2 * R * Math.asin(Math.min(1, Math.sqrt(dx * dx + dy * dy + dz * dz) / 2))
  );
}

/** A binary min-heap of cells by key. */
export function heap() {
  let key = new Float64Array(4096),
    val = new Int32Array(4096),
    n = 0;
  return {
    get size() {
      return n;
    },
    push(k: number, v: number) {
      if (n === key.length) {
        const k2 = new Float64Array(n * 2),
          v2 = new Int32Array(n * 2);
        k2.set(key);
        v2.set(val);
        key = k2;
        val = v2;
      }
      let i = n++;
      while (i > 0) {
        const p = (i - 1) >> 1;
        if (key[p] <= k) break;
        key[i] = key[p];
        val[i] = val[p];
        i = p;
      }
      key[i] = k;
      val[i] = v;
    },
    /** The least key's cell; its key in `top`. */
    pop(): number {
      const v = val[0];
      this.top = key[0];
      const k = key[--n],
        x = val[n];
      let i = 0;
      for (;;) {
        let c = 2 * i + 1;
        if (c >= n) break;
        if (c + 1 < n && key[c + 1] < key[c]) c++;
        if (key[c] >= k) break;
        key[i] = key[c];
        val[i] = val[c];
        i = c;
      }
      key[i] = k;
      val[i] = x;
      return v;
    },
    top: 0,
  };
}

/**
 * The level in `field` below which `1 − share` of the planet's area lies
 * (area-weighted, so exact whatever the cells' sizes).
 */
export function seaLevel(field: Float32Array, share: number): number {
  const order = Int32Array.from({ length: CELLS }, (_, c) => c).sort(
    (a, b) => field[a] - field[b]
  );
  const wet = (1 - share) * PLANET_QUANTA;
  let sum = 0;
  for (const c of order) {
    sum += areaQuanta(c);
    if (sum >= wet) return field[c];
  }
  return field[order[CELLS - 1]];
}

/**
 * Signed distance from each cell's centre to the coast, metres, positive at sea
 * (where `field` < `level`).
 *
 * The coast is the level's contour through the field, found between cells:
 * wherever two neighbours lie either side of it, the field crosses it at the
 * point a straight line between their centres says. Those points seed a vector
 * propagation outward (each cell keeps the nearest seed point any neighbour
 * knows, measured from itself), one sweep for both sides at once. So the
 * distance is to a smooth coast, not to a cell's square across it, and the
 * coast it gives reads as a curve rather than a staircase of cells.
 */
export function shoreOf(field: ArrayLike<number>, level: number): Float32Array {
  // (float64: a float32 rounding a distance up would let the same distance
  // improve on itself, without end)
  const p = centres(),
    dist = new Float64Array(CELLS).fill(Infinity),
    src = new Float64Array(3 * CELLS),
    h = heap();
  const from = (c: number, x: number, y: number, z: number) => {
    const dx = p[3 * c] - x,
      dy = p[3 * c + 1] - y,
      dz = p[3 * c + 2] - z;
    return (
      2 * R * Math.asin(Math.min(1, Math.sqrt(dx * dx + dy * dy + dz * dz) / 2))
    );
  };
  const take = (c: number, x: number, y: number, z: number, d: number) => {
    dist[c] = d;
    src[3 * c] = x;
    src[3 * c + 1] = y;
    src[3 * c + 2] = z;
    h.push(d, c);
  };
  for (let c = 0; c < CELLS; c++) {
    const wet = field[c] < level;
    for (let k = 0; k < 4; k++) {
      const n = neighbor(c, k);
      if (field[n] < level === wet) continue;
      const t = (level - field[c]) / (field[n] - field[c]);
      let x = p[3 * c] + t * (p[3 * n] - p[3 * c]),
        y = p[3 * c + 1] + t * (p[3 * n + 1] - p[3 * c + 1]);
      let z = p[3 * c + 2] + t * (p[3 * n + 2] - p[3 * c + 2]);
      const l = Math.hypot(x, y, z);
      x /= l;
      y /= l;
      z /= l;
      const d = from(c, x, y, z);
      if (d < dist[c]) take(c, x, y, z, d);
    }
  }
  while (h.size) {
    const c = h.pop();
    if (h.top > dist[c]) continue;
    const x = src[3 * c],
      y = src[3 * c + 1],
      z = src[3 * c + 2];
    for (let k = 0; k < 4; k++) {
      const n = neighbor(c, k),
        d = from(n, x, y, z);
      if (d < dist[n]) take(n, x, y, z, d);
    }
  }
  return Float32Array.from({ length: CELLS }, (_, c) =>
    field[c] < level ? dist[c] : -dist[c]
  );
}

/**
 * The connected parts of `mask` (sides shared): each cell's part (−1 off the
 * mask), and each part's area, m².
 */
export function components(mask: Uint8Array): {
  part: Int32Array;
  area: number[];
} {
  const part = new Int32Array(CELLS).fill(-1),
    area: number[] = [],
    stack: number[] = [];
  for (let s = 0; s < CELLS; s++) {
    if (!mask[s] || part[s] >= 0) continue;
    const id = area.length;
    let a = 0;
    part[s] = id;
    stack.push(s);
    while (stack.length) {
      const c = stack.pop()!;
      a += areaOf(c);
      for (let k = 0; k < 4; k++) {
        const n = neighbor(c, k);
        if (mask[n] && part[n] < 0) {
          part[n] = id;
          stack.push(n);
        }
      }
    }
    area.push(a);
  }
  return { part, area };
}

/**
 * Every cell within `radius` metres of cell `c`'s centre, passed to `visit`;
 * `seen` and a fresh `mark` keep each to once.
 */
export function disc(
  c: number,
  radius: number,
  seen: Int32Array,
  mark: number,
  visit: (n: number) => void
) {
  const stack = [c];
  seen[c] = mark;
  while (stack.length) {
    const x = stack.pop()!;
    visit(x);
    for (let k = 0; k < 4; k++) {
      const n = neighbor(x, k);
      if (seen[n] !== mark && arc(n, c) <= radius) {
        seen[n] = mark;
        stack.push(n);
      }
    }
  }
}

/**
 * The sixteen cells whose centres surround a point and each one's weight, `n`
 * in all: near a corner of the cube up to sixteen more (locate).
 */
interface Taps {
  cell: Int32Array;
  weight: Float64Array;
  n: number;
}
export const taps = (): Taps => ({
  cell: new Int32Array(32),
  weight: new Float64Array(32),
  n: 16,
});

/**
 * Catmull-Rom's four weights at fraction t between the middle two of four
 * evenly spaced samples.
 */
function catmullRom(t: number, w: Float64Array) {
  const t2 = t * t,
    t3 = t2 * t;
  w[0] = 0.5 * (-t3 + 2 * t2 - t);
  w[1] = 0.5 * (3 * t3 - 5 * t2 + 2);
  w[2] = 0.5 * (-3 * t3 + 4 * t2 + t);
  w[3] = 0.5 * (t3 - t2);
}

// Each face's lattice carried on past each of its sides (0 −u, 1 +u, 2 −v, 3
// +v) as the next face unfolds flat beside it, five numbers a side: that face;
// whether a place along the edge is a row of that face's (1) or a column (0);
// the sign and offset taking a place along this face's edge to one along that
// face's; and its column or row at the edge. Along an edge the two faces' cells
// line up one for one (cells.ts), so unfolded they make one lattice across it.
const FOLD = new Int32Array(24 * 5);
for (let f = 0; f < 6; f++)
  for (let s = 0; s < 4; s++) {
    const rim = s === 0 || s === 2 ? 0 : N - 1;
    const edge = (k: number) => f * N * N + (s < 2 ? k * N + rim : rim * N + k);
    const a = neighbor(edge(0), s),
      b = neighbor(edge(1), s),
      o = 5 * (4 * f + s),
      rows = +(columnOf(a) === columnOf(b));
    FOLD.set(
      [
        faceOf(a),
        rows,
        rows ? rowOf(b) - rowOf(a) : columnOf(b) - columnOf(a),
        rows ? rowOf(a) : columnOf(a),
        rows ? columnOf(a) : rowOf(a),
      ],
      o
    );
  }

/** unfold's answer: a face, column and row. */
const SPOT = new Int32Array(3);
/**
 * Column i, row j of face f's lattice, past its side s (and maybe past another
 * side too), as the column and row of the next face's lattice unfolded beside
 * it, into SPOT.
 */
function unfold(f: number, i: number, j: number, s: number) {
  const o = 5 * (4 * f + s),
    depth = s === 0 ? -1 - i : s === 1 ? i - N : s === 2 ? -1 - j : j - N;
  const along = FOLD[o + 3] + FOLD[o + 2] * (s < 2 ? j : i),
    across = FOLD[o + 4] === 0 ? depth : N - 1 - depth;
  SPOT[0] = FOLD[o];
  SPOT[1] = FOLD[o + 1] ? across : along;
  SPOT[2] = FOLD[o + 1] ? along : across;
}

/**
 * The cell at column i, row j of face f's lattice, past at most one of its
 * sides: there, the unfolded next face's.
 */
function past(f: number, i: number, j: number): number {
  if (i >= 0 && i < N && j >= 0 && j < N) return f * N * N + j * N + i;
  unfold(f, i, j, i < 0 ? 0 : i >= N ? 1 : j < 0 ? 2 : 3);
  return past(SPOT[0], SPOT[1], SPOT[2]);
}

/**
 * The cell at column i, row j of face f's lattice, past two sides at once
 * (beyond a corner of the cube, where no cell lies): unfolded across side s
 * first, then on past the next face's side as `past` reads it there.
 */
function pastCorner(f: number, i: number, j: number, s: number): number {
  unfold(f, i, j, s);
  return past(SPOT[0], SPOT[1], SPOT[2]);
}

const WU = new Float64Array(4),
  WV = new Float64Array(4);
/**
 * Where unit vector p falls among the cells' centres, into `at`: the 4 × 4
 * round it on its face's lattice of centres (equi-angular, as cells.ts lays
 * them) and their bicubic Catmull-Rom weights. Read through them a field is
 * smooth, its slope continuous (no creases along the cells' rows for the light
 * to catch), and at a cell's centre it is exactly the cell's own value.
 *
 * Past the face's edge the lattice runs on over the next face unfolded flat
 * beside it, so a point on the edge reads the same cells with the same weights
 * from either face, and the field runs on across the seam without a step.
 * Beyond a corner of the cube, where three faces meet and the unfolded lattices
 * can't all agree, a tap is read both ways (across one edge then the other, and
 * the other way round), each weighted by how near the point lies to the edge
 * that way agrees with. That leaves the corner itself read differently from
 * each way into it, so within half a cell of it (short of the corner cells'
 * centres) the reading eases into one all three faces share there.
 */
export function locate(p: Vec3, at: Taps): void {
  const { face, u, v } = faceUV(p);
  const x = (u + 1) * 0.5 * N - 0.5,
    y = (v + 1) * 0.5 * N - 0.5;
  const i = Math.floor(x),
    j = Math.floor(y);
  catmullRom(x - i, WU);
  catmullRom(y - j, WV);
  at.n = 16;
  if (i >= 1 && i < N - 2 && j >= 1 && j < N - 2) {
    for (let b = 0; b < 4; b++)
      for (let a = 0; a < 4; a++) {
        const k = 4 * b + a;
        at.cell[k] = face * N * N + (j + b - 1) * N + i + a - 1;
        at.weight[k] = WU[a] * WV[b];
      }
    return;
  }
  // how far the point lies from the nearer u and v edges, cells; and the share
  // of a tap beyond a corner read across the u edge first, which is the reading
  // that agrees with the next face's there
  const du = Math.min(x + 0.5, N - 0.5 - x),
    dv = Math.min(y + 0.5, N - 0.5 - y);
  const first = du + dv > 0 ? dv / (du + dv) : 0.5;
  for (let b = 0; b < 4; b++)
    for (let a = 0; a < 4; a++) {
      const k = 4 * b + a,
        ci = i + a - 1,
        cj = j + b - 1,
        w = WU[a] * WV[b];
      if ((ci >= 0 && ci < N) || (cj >= 0 && cj < N)) {
        at.cell[k] = past(face, ci, cj);
        at.weight[k] = w;
        continue;
      }
      at.cell[k] = pastCorner(face, ci, cj, ci < 0 ? 0 : 1);
      at.weight[k] = w * first;
      at.cell[at.n] = pastCorner(face, ci, cj, cj < 0 ? 2 : 3);
      at.weight[at.n++] = w * (1 - first);
    }
  const corner = 1 - smoothstep(0, 0.5, Math.hypot(du, dv));
  if (corner > 0) cornerTaps(face, x < N / 2, y < N / 2, corner, at);
}

/**
 * Catmull-Rom's weights at the middle of the nearer and farther cell either
 * side of it.
 */
const MID = [9 / 16, -1 / 16] as const;
/**
 * Eases `at` by `share` into the reading at the corner of face f nearest the
 * point (low u if `lowU`, low v if `lowV`) that all three faces meeting there
 * share: each face's 2 × 2 cells at the corner, weighted as the bicubic weighs
 * them there, the three faces alike.
 */
function cornerTaps(
  f: number,
  lowU: boolean,
  lowV: boolean,
  share: number,
  at: Taps
) {
  for (let k = 0; k < at.n; k++) at.weight[k] *= 1 - share;
  for (let b = 0; b < 2; b++)
    for (let a = 0; a < 2; a++) {
      const own = lowU ? a : N - 1 - a,
        row = lowV ? b : N - 1 - b,
        w = (share * 4 * MID[a] * MID[b]) / 3;
      const out = lowU ? -1 - a : N + a,
        outRow = lowV ? -1 - b : N + b;
      at.cell[at.n] = past(f, own, row);
      at.cell[at.n + 1] = past(f, out, row);
      at.cell[at.n + 2] = past(f, own, outRow);
      for (let k = 0; k < 3; k++) at.weight[at.n++] = w;
    }
}

/** A per-cell value read smoothly where `at` was located. */
export function between(values: ArrayLike<number>, at: Taps): number {
  let v = 0;
  for (let k = 0; k < at.n; k++) v += values[at.cell[k]] * at.weight[k];
  return v;
}
