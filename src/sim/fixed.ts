import type { PoseOut, ShipPose } from '../world/pose.ts';
import { add, dot, normalize, scale, type Out3 } from '../world/sphere.ts';

export const STEP = 1 / 30;
const MOST = 4;

export function fixedClock(step = STEP) {
  let banked = 0;
  return (dt: number) => {
    banked += dt;
    const steps = Math.min(Math.floor(banked / step), MOST);
    banked = Math.min(banked - steps * step, step);
    return { steps, between: banked / step };
  };
}

const f0: Out3 = [0, 0, 0];

export function blendPose(
  a: ShipPose,
  b: ShipPose,
  t: number,
  out?: PoseOut
): ShipPose {
  const f = add(scale(a.forward, 1 - t, f0), b.forward, t, f0);
  const up = normalize(
    add(scale(a.up, 1 - t, out?.up), b.up, t, out?.up),
    out?.up
  );
  const position = add(
    scale(a.position, 1 - t, out?.position),
    b.position,
    t,
    out?.position
  );
  const forward = normalize(
    add(f, up, -dot(f, up), out?.forward),
    out?.forward
  );
  return out ?? { position, forward, up };
}
