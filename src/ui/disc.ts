// How the minimap lays the sphere flat: an azimuthal equidistant chart round her (every point at its true distance and
// bearing from her), turned so that `ahead` is up. Shared by what draws on the disc (minimap.ts, held.ts, isles.ts).

import { R, add, cross, dot, normalize, scale, type Vec3 } from '../world/sphere';

/** The disc as drawn now: her point, the way up and right (unit tangents there), the canvas's centre and its pixels a
 *  metre. */
export interface Lay { at: Vec3; ahead: Vec3; right: Vec3; c: number; k: number }

export function layOf(at: Vec3, ahead: Vec3, c: number, k: number): Lay {
  const up = normalize(ahead);
  const a = normalize(add(up, at, -dot(up, at)));
  return { at, ahead: a, right: cross(a, at), c, k };
}

/** Metres right and up of her, along the surface, of a point q (a unit vector). */
export function metres(l: Lay, q: Vec3): [number, number] {
  const cos = Math.min(1, Math.max(-1, dot(q, l.at))), t = add(q, l.at, -cos), s = Math.hypot(...t);
  if (s < 1e-12) return [0, 0];
  const f = (Math.acos(cos) * R) / s;
  return [dot(t, l.right) * f, dot(t, l.ahead) * f];
}

/** A point on the canvas, px. */
export function place(l: Lay, q: Vec3): [number, number] {
  const [x, y] = metres(l, q);
  return [l.c + x * l.k, l.c - y * l.k];
}

/** The point `x` metres along `e` and `y` along `n` from `o` (unit tangents there), the surface's own way. */
export function out(o: Vec3, e: Vec3, n: Vec3, x: number, y: number): Vec3 {
  const d = Math.hypot(x, y);
  if (d < 1e-9) return o;
  const a = d / R;
  return normalize(add(scale(o, Math.cos(a)), add(scale(e, x / d), n, y / d), Math.sin(a)));
}

/**
 * The canvas transform that lays an image drawn on `o`'s own flat chart (its x along `e`, its rows down along −n, `m`
 * metres a texel, centred on `o`) onto the disc: as setTransform's a, b, c, d, e, f.
 */
export function laid(l: Lay, o: Vec3, e: Vec3, n: Vec3, w: number, h: number, m: number): [number, number, number, number, number, number] {
  const step = 10;
  const [x0, y0] = place(l, o), [x1, y1] = place(l, out(o, e, n, step, 0)), [x2, y2] = place(l, out(o, e, n, 0, -step));
  const a = ((x1 - x0) / step) * m, b = ((y1 - y0) / step) * m, c = ((x2 - x0) / step) * m, d = ((y2 - y0) / step) * m;
  return [a, b, c, d, x0 - a * (w / 2) - c * (h / 2), y0 - b * (w / 2) - d * (h / 2)];
}
