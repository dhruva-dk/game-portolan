// Film: a fine grain over the finished frame, strongest in the mid-tones as a print's is, and a triangular dither of
// one 8-bit step so the sky's and the haze's long gradients never band. Last, on the display-encoded image.
//
// Cost: one hash a pixel, in the frame's last pass.

import { float, frameId, fract, sin, dot, screenCoordinate, vec2, vec3, vec4 } from 'three/tsl';
import type { FloatNode, Vec3Node, Vec4Node } from '../tsl';

/** The grain's strength at mid-grey (it falls to nothing at black and white). */
const GRAIN = 0.035;

/** A hash in 0…1 of the pixel and the frame, one of three streams. */
const hash = (k: number): FloatNode => {
  const p = screenCoordinate.xy.add(vec2(float(frameId).mul(17.13 + k), float(frameId).mul(5.71 + 3 * k)));
  return fract(sin(dot(p, vec2(12.9898 + k, 78.233 - k))).mul(43758.5453));
};

/** The display-encoded colour c, grained and dithered. */
export const film = (c: Vec3Node): Vec4Node => {
  const l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  const grain = hash(0).sub(0.5).mul(l.mul(float(1).sub(l)).mul(4 * GRAIN));
  const dither = hash(1).add(hash(2)).sub(1).div(255);
  return vec4(c.add(grain).add(dither), 1);
};
