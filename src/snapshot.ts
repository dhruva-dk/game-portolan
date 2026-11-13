// What the frame draws, as plain data: the seam between what runs the world (the game, or the debug flyer) and what
// draws it (frame.ts). Each frame the one hands the other a Snapshot; nothing else passes between them, and nothing
// outside the frame touches what it draws with.

import { Matrix4, Quaternion, Vector3 } from 'three/webgpu';
import type { Look } from './ship/fleet';
import type { Cap } from './sim/storm';
import type { ShipPose } from './world/pose';
import type { Vec3 } from './world/sphere';

/** A unit quaternion (x, y, z, w). */
export type Orientation = readonly [number, number, number, number];

/**
 * Where the world is seen from. In the air (the game's camera, the debug flyer) the eye is among the clouds and under
 * the sky; from space (the full map, ui/globe.ts) it is past the air, looking at the planet: the sky and its clouds are
 * then not seen from inside, and the frame draws it as such.
 */
export interface Eye {
  kind: 'air' | 'space';
  /** World metres (the planet's centre at the origin). */
  position: Vec3;
  /** Its turn: it looks down its −z, its y up the screen. */
  orientation: Orientation;
  /** Its vertical field of view, degrees. */
  fov: number;
}

/** The vertical field of view of an eye in the air, degrees. */
export const AIR_FOV = 60;

/** A ship drawn: her slot, her pose and colours, her velocity (m/s, world: for the marks she leaves on the sea), and
 *  whether she floats (one going down or in the air neither fits the sea round her nor marks it). */
export interface ShipDraw { id: number; pose: ShipPose; look: Look; velocity: Vec3; afloat: boolean }

/** What the guns did, at a moment on the world's clock (s): a gun fired from `from` along `dir`; a ball come down at
 *  `at` (unit vector) in the sea or on land; a ball home in a hull at `at`, or a ram. */
export type Blast =
  | { kind: 'shot'; time: number; from: Vec3; dir: Vec3 }
  | { kind: 'splash'; time: number; at: Vec3; land: boolean }
  | { kind: 'strike'; time: number; at: Vec3; ram: boolean };

/** Everything the frame draws, for one frame. */
export interface Snapshot {
  eye: Eye;
  /** Seconds on the world's clock at the moment drawn: what the weather, the sea's waves, the gunfire's smoke and the
   *  storm's rain and billows run on. */
  clock: number;
  /** The storm's safe cap at the moment drawn (sim/storm.ts), worked out on the match's own clock (which stands still
   *  through the drop): the frame never works it out from `clock`. */
  storm: Cap;
  /** Every ship drawn; a ship not listed is not drawn. */
  ships: readonly ShipDraw[];
  /** The ship always drawn whole (the player's, which the chase camera holds close), or null. */
  own: number | null;
  /** Every ball in flight (world metres). */
  balls: readonly Vec3[];
  /** What the guns did in the last few seconds, oldest first: each is drawn once, from the first snapshot it is in. */
  blasts: readonly Blast[];
}

const m = new Matrix4(), q = new Quaternion();

/** The orientation of an eye at `eye` looking at `at`, `up` up the screen (as three turns a camera to look at a point). */
export function lookingAt(eye: Vec3, at: Vec3, up: Vec3): Orientation {
  q.setFromRotationMatrix(m.lookAt(new Vector3(...eye), new Vector3(...at), new Vector3(...up)));
  return [q.x, q.y, q.z, q.w];
}
