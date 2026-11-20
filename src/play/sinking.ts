// A ship sunk, as she is drawn going down: she lists to one side and settles by the stern, slowly at first as she
// fills and then faster, until her trucks are under and she is gone. Only her drawn pose: the sim has already taken
// her off the sea.

import type { PoseOut, ShipPose } from '../world/pose.ts';
import { add, cross, normalize, rotateAbout, type Out3 } from '../world/sphere.ts';

const SINKING = {
  /** Seconds from sunk to gone. */
  seconds: 7,
  /** Metres she goes down by then: past her mainmast's truck. */
  depth: 34,
  /** Her list, radians, reached in the first half; and how far she goes down by the stern. */
  list: 0.55,
  trim: 0.3,
} as const;

/** sinking's working vectors. */
const up1: Out3 = [0, 0, 0], beam: Out3 = [0, 0, 0];

/** Her pose `seconds` after she was sunk at `pose`, listing to port (`side` +1) or starboard (−1), into `out` (not
 *  pose); null once gone. */
export function sinking(pose: ShipPose, seconds: number, side: number, out?: PoseOut): ShipPose | null {
  const t = seconds / SINKING.seconds;
  if (t >= 1) return null;
  const list = SINKING.list * Math.min(1, 2 * t) * side, trim = SINKING.trim * t * t;
  // listed about her keel, then her stern down about her beam (each turned about an axis square to it)
  rotateAbout(pose.up, pose.forward, list, up1);
  normalize(cross(up1, pose.forward, beam), beam);
  const forward = rotateAbout(pose.forward, beam, -trim, out?.forward), up = rotateAbout(up1, beam, -trim, out?.up);
  const position = add(pose.position, pose.up, -SINKING.depth * t * t, out?.position);
  return out ?? { position, forward, up };
}
