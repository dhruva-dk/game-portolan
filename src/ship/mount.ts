import type { ShipPose } from '../world/pose.ts';
import { add, cross, type Out3, type Vec3 } from '../world/sphere.ts';
import { LEVELS, MOUNT_S, PLINTH, SCALE, levelDeck, zAt } from './lines.ts';

export const GUN_MOUNT: Vec3 = [
  0,
  (levelDeck(LEVELS[2], MOUNT_S) + PLINTH.height) * SCALE,
  zAt(MOUNT_S) * SCALE,
];

export const GUN_DRAWN = { scale: 1.7, lift: 0.3 } as const;

export const port = (pose: ShipPose, out?: Out3): Vec3 =>
  cross(pose.up, pose.forward, out);

const side: Out3 = [0, 0, 0];

export function toWorld(pose: ShipPose, local: Vec3, out?: Out3): Vec3 {
  const x = local[0],
    y = local[1],
    z = local[2];
  return add(
    add(add(pose.position, port(pose, side), x, out), pose.up, y, out),
    pose.forward,
    z,
    out
  );
}
