// Where a point on the sea falls on the screen, seen through an eye (snapshot.ts Eye) as the frame's camera draws it
// (frame.ts: placed and turned as the eye is, its field of view the eye's, vertical, across the view's own aspect).

import type { Eye } from '../snapshot.ts';
import { R, type Vec3 } from '../world/sphere.ts';

/** A point on the screen, CSS px from its top left. */
export interface Point { x: number; y: number }
/** The view's size, CSS px. */
export interface View { width: number; height: number }

/** Where a point on the sea (a unit vector), or `up` metres over it, falls through `eye` on `view`, written into
 *  `out`; null behind the eye or hidden from it by the sea's curve. (world/sphere.ts's and world/turn.ts's arithmetic
 *  written out on plain numbers, so that placing a point each frame makes nothing.) */
export function placed(out: Point, eye: Eye, p: Vec3, up: number, view: View): Point | null {
  const e = eye.position, k = R + up;
  const dx = p[0] * k - e[0], dy = p[1] * k - e[1], dz = p[2] * k - e[2];
  // where the line from the eye to it comes nearest the planet's centre: if that is between them and under the sea,
  // the sea hides it
  const t = -(e[0] * dx + e[1] * dy + e[2] * dz) / (dx * dx + dy * dy + dz * dz);
  const nx = e[0] + dx * t, ny = e[1] + dy * t, nz = e[2] + dz * t;
  if (t > 0 && t < 1 && nx * nx + ny * ny + nz * nz < R * R) return null;
  // in the eye's own frame (it looks down its −z), turned by the inverse of its turn (v' = q⁻¹ v q, with
  // q⁻¹ = (−x, −y, −z, w): t = 2 (−q × v), v' = v + w t + (−q) × t), then through its lens
  const [qx, qy, qz, qw] = eye.orientation;
  const tx = 2 * -(qy * dz - qz * dy), ty = 2 * -(qz * dx - qx * dz), tz = 2 * -(qx * dy - qy * dx);
  const vx = dx + qw * tx - (qy * tz - qz * ty), vy = dy + qw * ty - (qz * tx - qx * tz);
  const vz = dz + qw * tz - (qx * ty - qy * tx);
  if (vz >= 0) return null;
  const { width, height } = view, f = Math.tan((eye.fov * Math.PI) / 360);
  const x = vx / -vz / (f * (width / height)), y = vy / -vz / f;
  out.x = ((x + 1) / 2) * width;
  out.y = ((1 - y) / 2) * height;
  return out;
}

/** Where a point on the sea (a unit vector), or `up` metres over it, falls through `eye` in a view `width` × `height`
 *  px; null behind the eye or hidden from it by the sea's curve. */
export const onScreen = (eye: Eye, p: Vec3, width: number, height: number, up = 0): Point | null =>
  placed({ x: 0, y: 0 }, eye, p, up, { width, height });
