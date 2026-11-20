// Where things stand on a ship, from her pose to the world: the ship's own frame (+x to port, +y up, +z forward;
// metres, the waterline amidships at the origin) carried to the pose's place on the planet. And the one mount point
// on her deck that a gun will stand on.

import type { ShipPose } from '../world/pose.ts';
import { add, cross, type Out3, type Vec3 } from '../world/sphere.ts';
import { LEVELS, MOUNT_S, PLINTH, SCALE, levelDeck, zAt } from './lines.ts';

/** The gun mount's point, in the ship's frame: the top of the plinth on the waist's centreline, metres. */
export const GUN_MOUNT: Vec3 = [0, (levelDeck(LEVELS[2], MOUNT_S) + PLINTH.height) * SCALE, zAt(MOUNT_S) * SCALE];

/** The gun on the plinth as drawn (arms.ts): 1.7 times its size (real, a gun is some ten pixels from the chase's eye,
 *  lost behind her bulwark; larger, the harpoon's bolt and the cannon's muzzle would pass through the mainmast,
 *  2.07 m ahead), its trunnions lifted this many metres over the plinth's top on its post to the bore the balls leave
 *  from (sim/handling.ts GUN.up, kept low for the balls' sake; tests/battle.test.ts holds the two together), the
 *  post's foot still in the plinth. Swung right aft, its mouth meets the quarterdeck's face, 0.6 m astern of it. */
export const GUN_DRAWN = { scale: 1.7, lift: 0.3 } as const;

/** Her port side's direction: up × forward (into `out`). */
export const port = (pose: ShipPose, out?: Out3): Vec3 => cross(pose.up, pose.forward, out);

/** toWorld's port. */
const side: Out3 = [0, 0, 0];

/** A point in the ship's frame, in the world (into `out`, which may be `local` but not her pose's). */
export function toWorld(pose: ShipPose, local: Vec3, out?: Out3): Vec3 {
  const x = local[0], y = local[1], z = local[2];
  return add(add(add(pose.position, port(pose, side), x, out), pose.up, y, out), pose.forward, z, out);
}

/** The gun mount's place in the world: at GUN_MOUNT, facing her bow, up her up. */
export const gunMount = (pose: ShipPose): ShipPose => ({ position: toWorld(pose, GUN_MOUNT), forward: pose.forward, up: pose.up });
