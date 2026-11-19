// Where a point on the sea falls on the screen, seen through an eye (snapshot.ts Eye) as the frame's camera draws it
// (frame.ts: placed and turned as the eye is, its field of view the eye's, vertical, across the view's own aspect).

import type { Eye } from '../snapshot.ts';
import { R, add, dot, scale, type Vec3 } from '../world/sphere.ts';
import { inverse, rotate } from '../world/turn.ts';

/** A point on the screen, CSS px from its top left. */
export interface Point { x: number; y: number }

/** Where a point on the sea (a unit vector), or `up` metres over it, falls through `eye` in a view `width` × `height`
 *  px; null behind the eye or hidden from it by the sea's curve. */
export function onScreen(eye: Eye, p: Vec3, width: number, height: number, up = 0): Point | null {
  const d = add(scale(p, R + up), eye.position, -1);
  // where the line from the eye to it comes nearest the planet's centre: if that is between them and under the sea,
  // the sea hides it
  const t = -dot(eye.position, d) / dot(d, d), near = add(eye.position, d, t);
  if (t > 0 && t < 1 && dot(near, near) < R * R) return null;
  // in the eye's own frame (it looks down its −z), then through its lens
  const [vx, vy, vz] = rotate(d, inverse(eye.orientation));
  if (vz >= 0) return null;
  const k = Math.tan((eye.fov * Math.PI) / 360), x = vx / -vz / (k * (width / height)), y = vy / -vz / k;
  return { x: ((x + 1) / 2) * width, y: ((1 - y) / 2) * height };
}
