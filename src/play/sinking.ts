import type { PoseOut, ShipPose } from '../world/pose.ts';
import {
  add,
  cross,
  normalize,
  rotateAbout,
  type Out3,
} from '../world/sphere.ts';

const SINKING = { seconds: 7, depth: 34, list: 0.55, trim: 0.3 } as const;

const up1: Out3 = [0, 0, 0],
  beam: Out3 = [0, 0, 0];

export function sinking(
  pose: ShipPose,
  seconds: number,
  side: number,
  out?: PoseOut
): ShipPose | null {
  const t = seconds / SINKING.seconds;
  if (t >= 1) return null;
  const list = SINKING.list * Math.min(1, 2 * t) * side,
    trim = SINKING.trim * t * t;
  rotateAbout(pose.up, pose.forward, list, up1);
  normalize(cross(up1, pose.forward, beam), beam);
  const forward = rotateAbout(pose.forward, beam, -trim, out?.forward),
    up = rotateAbout(up1, beam, -trim, out?.up);
  const position = add(
    pose.position,
    pose.up,
    -SINKING.depth * t * t,
    out?.position
  );
  return out ?? { position, forward, up };
}
