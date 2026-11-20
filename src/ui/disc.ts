// How the minimap lays the sphere flat: an azimuthal equidistant chart round
// her (every point at its true distance and bearing from her), north up. Shared
// by what draws on the disc (minimap.ts, held.ts, ground.ts).
//
// Read many times a redraw, so nothing here makes a new array: the disc is laid
// into one kept by its drawer, and place, metres and laid each answer in one of
// their own, good until the next call.

import { R, type Vec3 } from '../world/sphere.ts';

export type Mutable = [number, number, number];

/**
 * A point and the way up and right from it (unit tangents there): where a flat
 * chart is drawn from.
 */
export interface Spot {
  at: Vec3;
  ahead: Vec3;
  right: Vec3;
}

/**
 * The disc as drawn now: her point, the way up (north) and right, the canvas's
 * centre and its pixels a metre.
 */
export interface Lay extends Spot {
  at: Mutable;
  ahead: Mutable;
  right: Mutable;
  c: number;
  k: number;
}

/**
 * Sets the canvas's transform to lay an image drawn on `o`'s own flat chart
 * (its x along `e`, its rows down along −n, `w` × `h` texels, `m` metres a
 * texel, centred on `o`) onto the disc (laid).
 */
export type LayOnto = (
  o: Vec3,
  e: Vec3,
  n: Vec3,
  w: number,
  h: number,
  m: number
) => void;

/** A disc to lay. */
export const newLay = (): Lay => ({
  at: [0, 0, 1],
  ahead: [0, 1, 0],
  right: [1, 0, 0],
  c: 0,
  k: 1,
});

/**
 * Lays `l` round `at` (a unit vector), north up as frameAt has it, centred at
 * `c` px, `k` px a metre.
 */
export function layAt(l: Lay, at: Vec3, c: number, k: number): Lay {
  const [x, y, z] = at;
  // north: the pole's way along the surface; at the pole itself, frameAt's (up
  // × −z)
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
  // right: ahead × at
  l.right[0] = ny * z - nz * y;
  l.right[1] = nz * x - nx * z;
  l.right[2] = nx * y - ny * x;
  l.c = c;
  l.k = k;
  return l;
}

/** metres' and place's answers. */
const xy: [number, number] = [0, 0];

/**
 * Metres right and up of her, along the surface, of a point q (a unit vector).
 */
export function metres(l: Lay, q: Vec3): readonly [number, number] {
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

/** A point on the canvas, px. */
export function place(l: Lay, q: Vec3): readonly [number, number] {
  const m = metres(l, q);
  xy[0] = l.c + m[0] * l.k;
  xy[1] = l.c - m[1] * l.k;
  return xy;
}

/**
 * Into `q`, the point `x` metres right and `y` up from the spot, the surface's
 * own way; held.ts and ground.ts read their samples by it.
 */
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

/** laid's scratch: the image's spot, a point out from it, its answer. */
const from: Spot = { at: [0, 0, 1], ahead: [0, 1, 0], right: [1, 0, 0] };
const out: Mutable = [0, 0, 0];
const T: [number, number, number, number, number, number] = [0, 0, 0, 0, 0, 0];

/**
 * The canvas transform that lays an image drawn on `o`'s own flat chart (its x
 * along `e`, its rows down along −n, `m` metres a texel, centred on `o`) onto
 * the disc: as setTransform's a, b, c, d, e, f.
 */
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
