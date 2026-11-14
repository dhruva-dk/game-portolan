// Film: a triangular dither of one 8-bit step over the finished frame, so the sky's and the haze's long gradients
// never band. No grain: the world's colours are flat, and stay so. Last, on the display-encoded image.
//
// The noise is an integer hash (PCG, three's `hash`) of the pixel and the frame: the old sin hash's precision ran out
// as the frame count grew, and its noise turned to a lattice of faint diagonal stripes over the whole frame.
//
// Cost: two hashes a pixel, in the frame's last pass.

import { frameId, hash, screenCoordinate, uint, vec4 } from 'three/tsl';
import type { FloatNode, Vec3Node, Vec4Node } from '../tsl';

/** A hash in 0…1 of the pixel and the frame, one of two streams (each seed a large odd step apart). */
const noise = (k: number): FloatNode => {
  const seed = uint(screenCoordinate.x).add(uint(screenCoordinate.y).mul(4099)).add(uint(frameId).mul(16777619)).add(uint(k * 0x3c6ef372 + 1));
  return hash(seed);
};

/** The display-encoded colour c, dithered. */
export const film = (c: Vec3Node): Vec4Node => vec4(c.add(noise(0).add(noise(1)).sub(1).div(255)), 1);
