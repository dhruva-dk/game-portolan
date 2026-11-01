import { PI, addScaled, cross, datan, datan2, dcos, dot, dsin, dtan, length, normalize, set, v3, type V3 } from './math.ts';

export const R = 554;
export const GRID = 512;
export const AREA_Q = 16777216;

export interface FaceUV {
  face: number;
  u: number;
  v: number;
}

function gnomonicUV(p: V3, out: FaceUV): FaceUV {
  const ax = Math.abs(p.x), ay = Math.abs(p.y), az = Math.abs(p.z);
  if (ax >= ay && ax >= az) {
    out.face = p.x >= 0 ? 0 : 1;
    out.u = (p.x >= 0 ? -p.z : p.z) / ax;
    out.v = p.y / ax;
  } else if (ay >= az) {
    out.face = p.y >= 0 ? 2 : 3;
    out.u = p.x / ay;
    out.v = (p.y >= 0 ? -p.z : p.z) / ay;
  } else {
    out.face = p.z >= 0 ? 4 : 5;
    out.u = (p.z >= 0 ? p.x : -p.x) / az;
    out.v = p.y / az;
  }
  return out;
}

export function faceUV(p: V3, out: FaceUV): FaceUV {
  gnomonicUV(p, out);
  out.u = datan(out.u) * (4 / PI);
  out.v = datan(out.v) * (4 / PI);
  return out;
}

export function gnomonicDir(face: number, gu: number, gv: number, out: V3): V3 {
  switch (face) {
    case 0: set(out, 1, gv, -gu); break;
    case 1: set(out, -1, gv, gu); break;
    case 2: set(out, gu, 1, -gv); break;
    case 3: set(out, gu, -1, gv); break;
    case 4: set(out, gu, gv, 1); break;
    default: set(out, -gu, gv, -1);
  }
  return normalize(out);
}

export function faceDir(face: number, u: number, v: number, out: V3): V3 {
  return gnomonicDir(face, dtan(u * (PI / 4)), dtan(v * (PI / 4)), out);
}

export interface CubeGrid {
  readonly n: number;
  readonly log: number;
  readonly cells: number;
  readonly edge: Int32Array;
  readonly area: Float64Array;
  readonly totalArea: number;
}

const probe = v3();
const scratchUV: FaceUV = { face: 0, u: 0, v: 0 };

export function cellOf(grid: CubeGrid, p: V3): number {
  const n = grid.n, f = faceUV(p, scratchUV);
  const i = Math.min(n - 1, Math.max(0, Math.floor((f.u + 1) * 0.5 * n)));
  const j = Math.min(n - 1, Math.max(0, Math.floor((f.v + 1) * 0.5 * n)));
  return (f.face << (2 * grid.log)) + (j << grid.log) + i;
}

export function cellDir(grid: CubeGrid, cell: number, out: V3): V3 {
  const n = grid.n, i = cell & (n - 1), j = (cell >> grid.log) & (n - 1);
  return faceDir(cell >> (2 * grid.log), ((i + 0.5) / n) * 2 - 1, ((j + 0.5) / n) * 2 - 1, out);
}

export function neighbor(grid: CubeGrid, cell: number, k: number): number {
  const n = grid.n, log = grid.log, i = cell & (n - 1), j = (cell >> log) & (n - 1), e = (cell >> (2 * log)) * 4 * n;
  if (k === 0) return i > 0 ? cell - 1 : grid.edge[e + j];
  if (k === 1) return i < n - 1 ? cell + 1 : grid.edge[e + n + j];
  if (k === 2) return j > 0 ? cell - n : grid.edge[e + 2 * n + i];
  return j < n - 1 ? cell + n : grid.edge[e + 3 * n + i];
}

export function cellArea(grid: CubeGrid, cell: number): number {
  return grid.area[cell & (grid.n * grid.n - 1)];
}

export function cubeGrid(n: number): CubeGrid {
  const log = 31 - Math.clz32(n);
  if (n < 2 || 1 << log !== n) throw new RangeError(`cubeGrid: ${n} is not a power of two`);
  const grid = { n, log, cells: 6 * n * n, edge: new Int32Array(24 * n), area: new Float64Array(n * n), totalArea: 0 };

  const e = 1 + 1e-6;
  for (let f = 0; f < 6; f++) {
    for (let k = 0; k < n; k++) {
      const t = ((k + 0.5) / n) * 2 - 1, b = f * 4 * n + k;
      grid.edge[b] = cellOf(grid, faceDir(f, -e, t, probe));
      grid.edge[b + n] = cellOf(grid, faceDir(f, e, t, probe));
      grid.edge[b + 2 * n] = cellOf(grid, faceDir(f, t, -e, probe));
      grid.edge[b + 3 * n] = cellOf(grid, faceDir(f, t, e, probe));
    }
  }

  const g = new Float64Array(n + 1), F = new Float64Array((n + 1) * (n + 1));
  for (let k = 0; k <= n; k++) g[k] = dtan(((k / n) * 2 - 1) * (PI / 4));
  for (let j = 0; j <= n; j++) {
    for (let i = 0; i <= n; i++) F[j * (n + 1) + i] = datan((g[i] * g[j]) / Math.sqrt(1 + g[i] * g[i] + g[j] * g[j]));
  }
  let total = 0;
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const a = j * (n + 1) + i, b = a + n + 1;
      const q = Math.round((F[b + 1] - F[b] - F[a + 1] + F[a]) * R * R * AREA_Q);
      grid.area[j * n + i] = q;
      total += 6 * q;
    }
  }
  grid.totalArea = total;
  return grid;
}

export const TERRITORY = cubeGrid(GRID);

const Y = v3(0, 1, 0);
const T1 = v3(), T2 = v3();

export function fromLatLon(lat: number, lon: number, out: V3): V3 {
  const c = dcos(lat);
  return set(out, c * dcos(lon), dsin(lat), -c * dsin(lon));
}

export function localFrame(p: V3, east: V3, north: V3): void {
  cross(east, Y, p);
  if (length(east) > 0) normalize(east);
  else set(east, 0, 0, -1);
  cross(north, p, east);
}

export function bearingOf(p: V3, t: V3): number {
  localFrame(p, T1, T2);
  return datan2(dot(t, T1), dot(t, T2));
}

export function tangentAt(p: V3, b: number, out: V3): V3 {
  localFrame(p, T1, T2);
  const s = dsin(b), c = dcos(b);
  return set(out, T2.x * c + T1.x * s, T2.y * c + T1.y * s, T2.z * c + T1.z * s);
}

export function tangentToward(p: V3, q: V3, out: V3): V3 {
  return normalize(addScaled(out, q, p, -dot(p, q)));
}

export function advance(p: V3, t: V3, dist: number, outP: V3, outT: V3): void {
  const a = dist / R, c = dcos(a), s = dsin(a);
  const px = p.x * c + t.x * s, py = p.y * c + t.y * s, pz = p.z * c + t.z * s;
  const tx = t.x * c - p.x * s, ty = t.y * c - p.y * s, tz = t.z * c - p.z * s;
  normalize(set(outP, px, py, pz));
  const d = tx * outP.x + ty * outP.y + tz * outP.z;
  normalize(set(outT, tx - outP.x * d, ty - outP.y * d, tz - outP.z * d));
}

export function angleBetween(a: V3, b: V3): number {
  return datan2(length(cross(T1, a, b)), dot(a, b));
}

export function surfaceDistance(a: V3, b: V3): number {
  return R * angleBetween(a, b);
}

export function horizonDistance(h: number): number {
  return R * datan2(Math.sqrt(h * (2 * R + h)), R);
}
