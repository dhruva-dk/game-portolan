// Where things stand on a ship, from her pose to the world: the ship's own frame (+x to port, +y up, +z forward;
// metres, the waterline amidships at the origin) carried to the pose's place on the planet. And the one mount point
// on her deck that a gun will stand on.

import type { ShipPose } from '../world/pose.ts';
import { add, cross, type Vec3 } from '../world/sphere.ts';
import { LEVELS, MOUNT_S, PLINTH, SCALE, levelDeck, zAt } from './lines.ts';

/** The gun mount's point, in the ship's frame: the top of the plinth on the waist's centreline, metres. */
export const GUN_MOUNT: Vec3 = [0, (levelDeck(LEVELS[2], MOUNT_S) + PLINTH.height) * SCALE, zAt(MOUNT_S) * SCALE];

/** Her port side's direction: up × forward. */
export const port = (pose: ShipPose): Vec3 => cross(pose.up, pose.forward);

/** A point in the ship's frame, in the world. */
export function toWorld(pose: ShipPose, local: Vec3): Vec3 {
  return add(add(add(pose.position, port(pose), local[0]), pose.up, local[1]), pose.forward, local[2]);
}

/** The gun mount's place in the world: at GUN_MOUNT, facing her bow, up her up. */
export const gunMount = (pose: ShipPose): ShipPose => ({ position: toWorld(pose, GUN_MOUNT), forward: pose.forward, up: pose.up });
