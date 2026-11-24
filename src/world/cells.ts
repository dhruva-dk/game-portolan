import {
  R,
  faceUV,
  normalize,
  put,
  type FaceUV,
  type Out3,
  type Vec3,
} from './sphere.ts';

export const N = 256;
const NN = N * N,
  LOG = 8;
export const CELLS = 6 * NN;

export type ReadCells = ArrayLike<number>;

function onFace(f: number, gu: number, gv: number, out?: Out3): Vec3 {
  switch (f) {
    case 0:
      return put(out, 1, gv, -gu);
    case 1:
      return put(out, -1, gv, gu);
    case 2:
      return put(out, gu, 1, -gv);
    case 3:
      return put(out, gu, -1, gv);
    case 4:
      return put(out, gu, gv, 1);
    default:
      return put(out, -gu, gv, -1);
  }
}

const atUV = (f: number, u: number, v: number, out?: Out3): Vec3 =>
  onFace(f, Math.tan(u * (Math.PI / 4)), Math.tan(v * (Math.PI / 4)), out);

export function cubeCells(n: number) {
  const nn = n * n,
    log = 31 - Math.clz32(n),
    uv: FaceUV = { face: 0, u: 0, v: 0 },
    onCube: Out3 = [0, 0, 0];
  const tan = Float64Array.from({ length: n }, (_, k) =>
    Math.tan((((k + 0.5) / n) * 2 - 1) * (Math.PI / 4))
  );
  const cellOf = (p: Vec3): number => {
    const { face, u, v } = faceUV(p, uv);
    const i = Math.min(n - 1, Math.max(0, Math.floor((u + 1) * 0.5 * n)));
    const j = Math.min(n - 1, Math.max(0, Math.floor((v + 1) * 0.5 * n)));
    return face * nn + j * n + i;
  };
  const edge = new Int32Array(24 * n);
  for (let f = 0; f < 6; f++) {
    for (let k = 0; k < n; k++) {
      const t = ((k + 0.5) / n) * 2 - 1,
        b = f * 4 * n + k,
        e = 1 + 1e-6;
      edge[b] = cellOf(atUV(f, -e, t));
      edge[b + n] = cellOf(atUV(f, e, t));
      edge[b + 2 * n] = cellOf(atUV(f, t, -e));
      edge[b + 3 * n] = cellOf(atUV(f, t, e));
    }
  }
  return {
    cellOf,
    tan,
    center: (c: number, out?: Out3): Vec3 =>
      normalize(
        onFace(
          c >> (2 * log),
          tan[c & (n - 1)],
          tan[(c >> log) & (n - 1)],
          onCube
        ),
        out
      ),
    neighbor(c: number, k: number): number {
      const i = c & (n - 1),
        j = (c >> log) & (n - 1),
        e = (c >> (2 * log)) * 4 * n;
      if (k === 0) return i > 0 ? c - 1 : edge[e + j];
      if (k === 1) return i < n - 1 ? c + 1 : edge[e + n + j];
      if (k === 2) return j > 0 ? c - n : edge[e + 2 * n + i];
      return j < n - 1 ? c + n : edge[e + 3 * n + i];
    },
  };
}

const CUBE = cubeCells(N),
  TAN = CUBE.tan;

export const faceOf = (c: number) => c >> (2 * LOG);
export const columnOf = (c: number) => c & (N - 1);
export const rowOf = (c: number) => (c >> LOG) & (N - 1);

export const cellOf = CUBE.cellOf;

export const centerOf = CUBE.center;

const toward: Out3 = [0, 0, 0];

export function cosTo(c: number, u: Vec3): number {
  const q = onFace(faceOf(c), TAN[columnOf(c)], TAN[rowOf(c)], toward),
    x = q[0],
    y = q[1],
    z = q[2];
  return (x * u[0] + y * u[1] + z * u[2]) / Math.sqrt(x * x + y * y + z * z);
}

export const neighbor = CUBE.neighbor;

export function adjacent(a: number, b: number): boolean {
  for (let k = 0; k < 4; k++) if (neighbor(a, k) === b) return true;
  return false;
}

export function wrapped(f: number, i: number, j: number): number {
  const inI = i >= 0 && i < N,
    inJ = j >= 0 && j < N;
  if (inI && inJ) return f * NN + j * N + i;
  const ci = Math.min(N - 1, Math.max(0, i)),
    cj = Math.min(N - 1, Math.max(0, j)),
    own = f * NN + cj * N + ci;
  const across = (c: number, di: number, dj: number) =>
    di < 0
      ? neighbor(c, 0)
      : di > 0
        ? neighbor(c, 1)
        : dj < 0
          ? neighbor(c, 2)
          : neighbor(c, 3);
  const di = i < 0 ? -1 : i >= N ? 1 : 0,
    dj = j < 0 ? -1 : j >= N ? 1 : 0;
  if (inJ) return across(own, di, 0);
  if (inI) return across(own, 0, dj);
  return Math.min(own, across(own, di, 0), across(own, 0, dj));
}

const past: Out3 = [0, 0, 0];

export function beyond(f: number, i: number, j: number): number {
  if (i >= 0 && i < N && j >= 0 && j < N) return f * NN + j * N + i;
  return cellOf(
    atUV(f, ((i + 0.5) / N) * 2 - 1, ((j + 0.5) / N) * 2 - 1, past)
  );
}

const AREA_Q = 1 << 20;
const AREA = new Float64Array(NN);
let total = 0;
{
  const g = Float64Array.from({ length: N + 1 }, (_, k) =>
    Math.tan(((k / N) * 2 - 1) * (Math.PI / 4))
  );
  const F = (i: number, j: number) =>
    Math.atan((g[i] * g[j]) / Math.sqrt(1 + g[i] * g[i] + g[j] * g[j]));
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      AREA[j * N + i] = Math.round(
        (F(i + 1, j + 1) - F(i, j + 1) - F(i + 1, j) + F(i, j)) * R * R * AREA_Q
      );
      total += 6 * AREA[j * N + i];
    }
  }
}
export const areaQuanta = (c: number) => AREA[c & (NN - 1)];
export const PLANET_QUANTA = total;

export function trace(
  p0: Vec3,
  c0: number,
  p1: Vec3,
  c1: number,
  out: number[],
  depth = 12
): void {
  if (c0 === c1) return;
  if (adjacent(c0, c1)) {
    out.push(c1);
    return;
  }
  if (depth === 0) {
    for (let k = 0; k < 4; k++) {
      const n = neighbor(c0, k);
      if (adjacent(n, c1)) {
        out.push(n);
        break;
      }
    }
    out.push(c1);
    return;
  }
  const m = normalize([p0[0] + p1[0], p0[1] + p1[1], p0[2] + p1[2]]),
    cm = cellOf(m);
  if (cm !== c0) trace(p0, c0, m, cm, out, depth - 1);
  if (cm !== c1) trace(m, cm, p1, c1, out, depth - 1);
}
