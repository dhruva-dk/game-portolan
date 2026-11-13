// Film: a fine grain over the finished frame, strongest in the mid-tones as a print's is, and a triangular dither of
// one 8-bit step so the sky's and the haze's long gradients never band. Last, on the display-encoded image.
//
// The noise is an integer hash (PCG, three's `hash`) of the pixel and the frame: the old sin hash's precision ran out
// as the frame count grew, and its noise turned to a lattice of faint diagonal stripes over the whole frame.
//
// Cost: three hashes a pixel, in the frame's last pass.

import { dot, float, frameId, hash, screenCoordinate, uint, vec3, vec4 } from 'three/tsl';
import type { FloatNode, Vec3Node, Vec4Node } from '../tsl';

/** The grain's strength at mid-grey (it falls to nothing at black and white). */
const GRAIN = 0.035;

/** A hash in 0…1 of the pixel and the frame, one of three streams (each seed a large odd step apart). */
const noise = (k: number): FloatNode => {
  const seed = uint(screenCoordinate.x).add(uint(screenCoordinate.y).mul(4099)).add(uint(frameId).mul(16777619)).add(uint(k * 0x3c6ef372 + 1));
  return hash(seed);
};

/** The display-encoded colour c, grained and dithered. */
export const film = (c: Vec3Node): Vec4Node => {
  const l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  const grain = noise(0).sub(0.5).mul(l.mul(float(1).sub(l)).mul(4 * GRAIN));
  const dither = noise(1).add(noise(2)).sub(1).div(255);
  return vec4(c.add(grain).add(dither), 1);
};
