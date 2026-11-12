// The simulation runs in fixed steps, whatever the frame rate, so it does the same thing on every device and every
// run; what is drawn is blended between the last two steps by how far the frame has got into the next.
//
// Pure arithmetic: no three, so it runs in node for the tests.

import type { ShipPose } from '../world/pose.ts';
import { add, dot, normalize, scale } from '../world/sphere.ts';

/** Seconds a step. */
export const STEP = 1 / 30;
/** The most steps a frame takes; a longer stall is let go rather than caught up. */
const MOST = 4;

/** A clock of fixed steps: given a frame's seconds, how many steps to take, and how far into the next it then is (0–1). */
export function fixedClock(step = STEP) {
  let banked = 0;
  return (dt: number) => {
    banked += dt;
    const steps = Math.min(Math.floor(banked / step), MOST);
    banked = Math.min(banked - steps * step, step);
    return { steps, between: banked / step };
  };
}

/** A pose t of the way from a to b (0–1): positions straight between, axes turned between and kept square. */
export function blendPose(a: ShipPose, b: ShipPose, t: number): ShipPose {
  const up = normalize(add(scale(a.up, 1 - t), b.up, t));
  const f = add(scale(a.forward, 1 - t), b.forward, t);
  return { position: add(scale(a.position, 1 - t), b.position, t), forward: normalize(add(f, up, -dot(f, up))), up };
}
