// Where a point on the sea falls on the screen, seen through an eye (snapshot.ts Eye) as the frame's camera draws it
// (frame.ts: placed and turned as the eye is, its field of view the eye's, vertical, across the view's own aspect).

import type { Eye } from '../snapshot';
import { R, add, dot, scale, type Vec3 } from '../world/sphere.ts';
import { inverse, rotate } from '../world/turn.ts';
import type { Point } from './aim';

/** Where a point on the sea (a unit vector), or `up` metres over it, falls through `eye` in a view `width` × `height`
 *  px; null behind the eye or past the sea's horizon from it. */
export function onScreen(eye: Eye, p: Vec3, width: number, height: number, up = 0): Point | null {
  if (dot(eye.position, p) <= R) return null;
  // in the eye's own frame (it looks down its −z), then through its lens
  const [vx, vy, vz] = rotate(add(scale(p, R + up), eye.position, -1), inverse(eye.orientation));
  if (vz >= 0) return null;
  const t = Math.tan((eye.fov * Math.PI) / 360), x = vx / -vz / (t * (width / height)), y = vy / -vz / t;
  return { x: ((x + 1) / 2) * width, y: ((1 - y) / 2) * height };
}
