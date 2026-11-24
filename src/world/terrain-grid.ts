import {
  CELLS,
  N,
  PLANET_QUANTA,
  areaQuanta,
  centerOf,
  columnOf,
  faceOf,
  neighbor,
  rowOf,
} from './cells.ts';
import { smoothstep } from './scalar.ts';
import { R, faceUV, type Vec3 } from './sphere.ts';

const AREA_M2 = (4 * Math.PI * R * R) / PLANET_QUANTA;
export const areaOf = (c: number) => areaQuanta(c) * AREA_M2;
export const CELL = (R * Math.PI) / 2 / N;

let XYZ: Float64Array | null = null;
export function centers(): Float64Array {
  if (XYZ) return XYZ;
  XYZ = new Float64Array(3 * CELLS);
  for (let c = 0; c < CELLS; c++) XYZ.set(centerOf(c), 3 * c);
  return XYZ;
}

function arc(a: number, b: number): number {
  const p = centers(),
    dx = p[3 * a] - p[3 * b],
    dy = p[3 * a + 1] - p[3 * b + 1],
    dz = p[3 * a + 2] - p[3 * b + 2];
  return (
    2 * R * Math.asin(Math.min(1, Math.sqrt(dx * dx + dy * dy + dz * dz) / 2))
  );
}

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

export function shoreOf(field: ArrayLike<number>, level: number): Float32Array {
  const p = centers(),
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

function catmullRom(t: number, w: Float64Array) {
  const t2 = t * t,
    t3 = t2 * t;
  w[0] = 0.5 * (-t3 + 2 * t2 - t);
  w[1] = 0.5 * (3 * t3 - 5 * t2 + 2);
  w[2] = 0.5 * (-3 * t3 + 4 * t2 + t);
  w[3] = 0.5 * (t3 - t2);
}

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

const SPOT = new Int32Array(3);
function unfold(f: number, i: number, j: number, s: number) {
  const o = 5 * (4 * f + s),
    depth = s === 0 ? -1 - i : s === 1 ? i - N : s === 2 ? -1 - j : j - N;
  const along = FOLD[o + 3] + FOLD[o + 2] * (s < 2 ? j : i),
    across = FOLD[o + 4] === 0 ? depth : N - 1 - depth;
  SPOT[0] = FOLD[o];
  SPOT[1] = FOLD[o + 1] ? across : along;
  SPOT[2] = FOLD[o + 1] ? along : across;
}

function past(f: number, i: number, j: number): number {
  if (i >= 0 && i < N && j >= 0 && j < N) return f * N * N + j * N + i;
  unfold(f, i, j, i < 0 ? 0 : i >= N ? 1 : j < 0 ? 2 : 3);
  return past(SPOT[0], SPOT[1], SPOT[2]);
}

function pastCorner(f: number, i: number, j: number, s: number): number {
  unfold(f, i, j, s);
  return past(SPOT[0], SPOT[1], SPOT[2]);
}

const WU = new Float64Array(4),
  WV = new Float64Array(4);
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

const MID = [9 / 16, -1 / 16] as const;
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

export function between(values: ArrayLike<number>, at: Taps): number {
  let v = 0;
  for (let k = 0; k < at.n; k++) v += values[at.cell[k]] * at.weight[k];
  return v;
}
