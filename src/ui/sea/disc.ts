import { R, type Vec3 } from '../../world/sphere.ts';

export type Mutable = [number, number, number];

export interface Spot {
  at: Vec3;
  ahead: Vec3;
  right: Vec3;
}

export interface Lay extends Spot {
  at: Mutable;
  ahead: Mutable;
  right: Mutable;
  c: number;
  k: number;
}

export type LayOnto = (
  o: Vec3,
  e: Vec3,
  n: Vec3,
  w: number,
  h: number,
  m: number
) => void;

export const newLay = (): Lay => ({
  at: [0, 0, 1],
  ahead: [0, 1, 0],
  right: [1, 0, 0],
  c: 0,
  k: 1,
});

export function layAt(l: Lay, at: Vec3, c: number, k: number): Lay {
  const [x, y, z] = at;
  let nx = -y * x,
    ny = 1 - y * y,
    nz = -y * z;
  const s = Math.sqrt(nx * nx + ny * ny + nz * nz);
  if (s > 1e-9) [nx, ny, nz] = [nx / s, ny / s, nz / s];
  else [nx, ny, nz] = [-y, x, 0];
  l.at[0] = x;
  l.at[1] = y;
  l.at[2] = z;
  l.ahead[0] = nx;
  l.ahead[1] = ny;
  l.ahead[2] = nz;
  l.right[0] = ny * z - nz * y;
  l.right[1] = nz * x - nx * z;
  l.right[2] = nx * y - ny * x;
  l.c = c;
  l.k = k;
  return l;
}

const xy: [number, number] = [0, 0];

export function meters(l: Lay, q: Vec3): readonly [number, number] {
  const a = l.at,
    cos = Math.min(1, Math.max(-1, q[0] * a[0] + q[1] * a[1] + q[2] * a[2]));
  const tx = q[0] - a[0] * cos,
    ty = q[1] - a[1] * cos,
    tz = q[2] - a[2] * cos,
    s = Math.sqrt(tx * tx + ty * ty + tz * tz);
  if (s < 1e-12) {
    xy[0] = xy[1] = 0;
    return xy;
  }
  const f = (Math.acos(cos) * R) / s;
  xy[0] = (tx * l.right[0] + ty * l.right[1] + tz * l.right[2]) * f;
  xy[1] = (tx * l.ahead[0] + ty * l.ahead[1] + tz * l.ahead[2]) * f;
  return xy;
}

export function place(l: Lay, q: Vec3): readonly [number, number] {
  const m = meters(l, q);
  xy[0] = l.c + m[0] * l.k;
  xy[1] = l.c - m[1] * l.k;
  return xy;
}

export function outInto(q: Mutable, s: Spot, x: number, y: number): Vec3 {
  const { at: o, right: e, ahead: n } = s;
  const d = Math.sqrt(x * x + y * y) || 1e-9,
    cs = Math.cos(d / R),
    sn = Math.sin(d / R) / d;
  q[0] = o[0] * cs + (e[0] * x + n[0] * y) * sn;
  q[1] = o[1] * cs + (e[1] * x + n[1] * y) * sn;
  q[2] = o[2] * cs + (e[2] * x + n[2] * y) * sn;
  return q;
}

const from: Spot = { at: [0, 0, 1], ahead: [0, 1, 0], right: [1, 0, 0] };
const out: Mutable = [0, 0, 0];
const T: [number, number, number, number, number, number] = [0, 0, 0, 0, 0, 0];

export function laid(
  l: Lay,
  o: Vec3,
  e: Vec3,
  n: Vec3,
  w: number,
  h: number,
  m: number
): Readonly<typeof T> {
  const step = 10;
  from.at = o;
  from.right = e;
  from.ahead = n;
  let p = place(l, o);
  const x0 = p[0],
    y0 = p[1];
  p = place(l, outInto(out, from, step, 0));
  const x1 = p[0],
    y1 = p[1];
  p = place(l, outInto(out, from, 0, -step));
  const x2 = p[0],
    y2 = p[1];
  const a = ((x1 - x0) / step) * m,
    b = ((y1 - y0) / step) * m,
    c = ((x2 - x0) / step) * m,
    d = ((y2 - y0) / step) * m;
  T[0] = a;
  T[1] = b;
  T[2] = c;
  T[3] = d;
  T[4] = x0 - a * (w / 2) - c * (h / 2);
  T[5] = y0 - b * (w / 2) - d * (h / 2);
  return T;
}
