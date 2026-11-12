// A ship sunk, as she is drawn going down: she lists to one side and settles by the stern, slowly at first as she
// fills and then faster, until her trucks are under and she is gone. Only her drawn pose: the sim has already taken
// her off the sea.

import type { ShipPose } from '../world/pose';
import { add, cross, normalize, scale, type Vec3 } from '../world/sphere';

export const SINKING = {
  /** Seconds from sunk to gone. */
  seconds: 7,
  /** Metres she goes down by then: past her mainmast's truck. */
  depth: 34,
  /** Her list, radians, reached in the first half; and how far she goes down by the stern. */
  list: 0.55,
  trim: 0.3,
} as const;

/** v turned `a` radians about the unit axis k (Rodrigues). */
const turn = (v: Vec3, k: Vec3, a: number): Vec3 => add(scale(v, Math.cos(a)), cross(k, v), Math.sin(a));

/** Her pose `seconds` after she was sunk at `pose`, listing to port (`side` +1) or starboard (−1); null once gone. */
export function sinking(pose: ShipPose, seconds: number, side: number): ShipPose | null {
  const t = seconds / SINKING.seconds;
  if (t >= 1) return null;
  const list = SINKING.list * Math.min(1, 2 * t) * side, trim = SINKING.trim * t * t;
  // listed about her keel, then her stern down about her beam
  const up1 = turn(pose.up, pose.forward, list);
  const beam = normalize(cross(up1, pose.forward));
  const forward = turn(pose.forward, beam, -trim), up = turn(up1, beam, -trim);
  return { position: add(pose.position, pose.up, -SINKING.depth * t * t), forward, up };
}
