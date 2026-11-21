// What the frame draws, as plain data: the seam between what runs the world
// (the game, or the debug flyer) and what draws it (frame.ts). Each frame the
// one hands the other a Snapshot; nothing else passes between them, and nothing
// outside the frame touches what it draws with.

import type { Fault, Faults, GunKind, LootKind } from './kinds.ts';
import type { Cap } from './sim/storm.ts';
import type { ReadCells } from './world/cells.ts';
import type { ShipPose } from './world/pose.ts';
import type { Vec3 } from './world/sphere.ts';
import { lookAt, type Turn } from './world/turn.ts';

/**
 * Where the world is seen from. In the air (the game's camera, the debug flyer)
 * the eye is among the clouds and under the sky; from space (the full map,
 * ui/globe.ts; the start of a match, play/arrival.ts) it is past the air,
 * looking at the planet: the sky and its clouds are then not seen from inside,
 * and the frame draws it as such.
 */
export interface Eye {
  kind: 'air' | 'space';
  /** World metres (the planet's centre at the origin). */
  position: Vec3;
  /**
   * Its turn (a unit quaternion: world/turn.ts): it looks down its −z, its y up
   * the screen.
   */
  orientation: Turn;
  /** Its vertical field of view, degrees. */
  fov: number;
}

/** The vertical field of view of an eye in the air, degrees. */
export const AIR_FOV = 50;

/**
 * A captain's colours (linear rgb, 0…1): her hull's paint, her sails' canvas,
 * and what of the paint is on her sails besides the cross: nothing more, a band
 * across them, or upright stripes of it (the cross counterchanged over them).
 */
export interface Look {
  paint: Vec3;
  sail: Vec3;
  pattern: 'plain' | 'band' | 'stripes';
}

/**
 * Where a Look's marks fall on a square sail, in the sail's own measures: the
 * cross pattée's arms flaring from `arm` at its middle to `flare` at their
 * ends, reaching `reach` of the sail's half-width and half-height from its
 * middle; the band across it from `band[0]` to `band[1]` of its height; and
 * `stripes` upright stripes' worth across it (odd, so its edges match), the
 * middle one and every other marked, each parted from the cross by a border of
 * canvas `fringe` wide (of `reach`, as `arm` and `flare` are). One for the ship
 * drawn (ship/materials.ts) and the sails the livery folio shows (ui/livery.ts).
 */
export const SAIL_MARKS = {
  arm: 0.13,
  flare: 0.34,
  reach: 0.66,
  band: [0.36, 0.64],
  stripes: 5,
  fringe: 0.2,
} as const;

/**
 * A ship drawn: her slot, her pose and colours, her velocity (m/s, world: for
 * the marks she leaves on the sea), whether she floats (one going down neither
 * fits the sea round her nor marks it), and the gun in her hand (its kind:
 * kinds.ts GunKind, and rarity, 0 common to 4 legendary), mounted on her
 * plinth, with the way it is laid (a unit vector, world; it trains round to
 * it), or null with none. Her hull's wear (0 above 40, 1 down to 25, 2 under
 * it) and each zone's fault (kinds.ts ZONES' order: sim/faults.ts), for her
 * smoke and her zones' marks.
 */
export interface ShipDraw {
  id: number;
  pose: ShipPose;
  look: Look;
  velocity: Vec3;
  afloat: boolean;
  gun: { kind: GunKind; rarity: number; aim: Vec3 } | null;
  wear: Fault;
  faults: Faults;
}

/**
 * What the guns did, at a moment on the world's clock (s): a gun of a kind
 * fired from `from` along `dir`; a ball of a kind come down at `at` (unit
 * vector) in the sea or on land; a ball home in a hull at `at`, or a ram,
 * whether her shield took all of it and whether it broke her shield; a ship
 * sunk where she lay, at `at`.
 */
export type Blast =
  | { kind: 'shot'; time: number; from: Vec3; dir: Vec3; gun: GunKind }
  | { kind: 'splash'; time: number; at: Vec3; land: boolean; gun: GunKind }
  | {
      kind: 'strike';
      time: number;
      at: Vec3;
      ram: boolean;
      shield: boolean;
      broke: boolean;
    }
  | { kind: 'sink'; time: number; at: Vec3 };

/**
 * A ball in flight: where it is (world metres), its velocity (m/s), its gun's
 * kind, and where it was laid to come down (a unit vector: a mortar's shell is
 * marked there on the sea).
 */
export interface BallDraw {
  at: Vec3;
  way: Vec3;
  gun: GunKind;
  to: Vec3;
}

/**
 * A piece of loot on the water (sim/loot.ts): its id (for its own bob and
 * turn), where it floats (world metres, on the sea's surface), what it is, the
 * rarity it reads as (0–4: ui/ink.ts RARITY), and when it came onto the water
 * (the world's clock, s; long before the match for what was strewn at its
 * start), for it to bob up.
 */
export interface LootDraw {
  id: number;
  at: Vec3;
  kind: LootKind;
  rarity: number;
  born: number;
}

/**
 * A change in who holds the sea (sim/territory.ts Change), numbered in order
 * (seq), at a moment on the world's clock (s): her strip painted as she sailed,
 * a loop closed (its first `loop` cells her run's, the flood coming from them),
 * a home patch laid round `at`, or water drained back to open sea (a sunk
 * ship's, or the storm's: ship null).
 */
export type SeaChange =
  | { seq: number; time: number; kind: 'paint'; ship: number; cells: ReadCells }
  | {
      seq: number;
      time: number;
      kind: 'claim';
      ship: number;
      cells: ReadCells;
      loop: number;
    }
  | {
      seq: number;
      time: number;
      kind: 'home';
      ship: number;
      cells: ReadCells;
      at: Vec3;
    }
  | {
      seq: number;
      time: number;
      kind: 'drain';
      ship: number | null;
      cells: ReadCells;
    };

/**
 * Who holds the sea (sim/territory.ts), as the frame follows it:
 *   generation  which match's sea it is, a new number each match: a reader seeing a new one starts over
 *   owner       the cells (world/cells.ts), each its holder (0 open sea, else her id + 1): the sim's own, read by
 *               reference (copied whole only when a reader starts over), never written
 *   seq         the number of the last change made, kept in `changes` or not
 *   changes     what changed in the last few seconds, oldest first, numbered 1, 2, … within the match with none left
 *               out: `owner` is every change applied in order. A reader whose first change not yet read is past the
 *               one after its last (or, none kept, whose last is short of `seq`) has missed some: it starts over from
 *               `owner` (water/cursor.ts)
 *   colours     each ship's colour on the sea, by id (linear rgb)
 * Its changes' times are on the world's clock, the snapshot's own
 * (Snapshot.clock: the moment they are drawn at).
 */
export interface Sea {
  generation: number;
  owner: ReadCells;
  seq: number;
  changes: readonly SeaChange[];
  colours: readonly Vec3[];
}

/**
 * The storm as drawn: its safe cap, and whether it is closing while the match
 * is fought (a closing's beginning strikes its bolt at the edge:
 * sky/storm-bolt.ts; once she has won it is no news).
 */
export interface StormDraw extends Cap {
  closing: boolean;
}

/** Everything the frame draws, for one frame. */
export interface Snapshot {
  eye: Eye;
  /**
   * Seconds on the world's clock at the moment drawn: what the weather, the
   * sea's waves, the gunfire's smoke and the storm's rain and billows run on.
   */
  clock: number;
  /**
   * The storm's safe cap at the moment drawn (sim/storm.ts), worked out on the
   * match's own clock: the frame never works it out from `clock`; and whether
   * it is closing.
   */
  storm: StormDraw;
  /**
   * Every ship drawn (at most the frame's fleet, frame.ts FrameOptions, each id
   * below it); a ship not listed is not drawn.
   */
  ships: readonly ShipDraw[];
  /**
   * The ship always drawn whole (the player's, which the chase camera holds
   * close), or null.
   */
  own: number | null;
  /** Every ball in flight. */
  balls: readonly BallDraw[];
  /** The loot on the water near the eye. */
  loot: readonly LootDraw[];
  /**
   * What the guns did in the last few seconds, oldest first: each is drawn
   * once, from the first snapshot it is in.
   */
  blasts: readonly Blast[];
  /** Who holds the sea, if anyone does (none before a match). */
  sea?: Sea;
}

/**
 * The bearing of `p` (world metres) from the way `eye` looks: radians
 * clockwise, 0 ahead, ±π behind. The eye looks down its −z with x to its right,
 * so `p` is turned into the eye's frame by the inverse turn (world/turn.ts
 * rotate and inverse, written out on plain numbers so that hearing and seeing
 * each frame makes nothing).
 */
export function bearingFrom(eye: Eye, p: Vec3): number {
  const [qx, qy, qz, qw] = eye.orientation;
  const vx = p[0] - eye.position[0],
    vy = p[1] - eye.position[1],
    vz = p[2] - eye.position[2];
  // v' = q⁻¹ v q, with q⁻¹ = (−x, −y, −z, w): t = 2 (−q × v), v' = v + w t +
  // (−q) × t
  const tx = 2 * -(qy * vz - qz * vy),
    ty = 2 * -(qz * vx - qx * vz),
    tz = 2 * -(qx * vy - qy * vx);
  const x = vx + qw * tx + -(qy * tz - qz * ty),
    z = vz + qw * tz + -(qx * ty - qy * tx);
  return Math.atan2(x, -z);
}

/**
 * The orientation of an eye at `eye` looking at `at`, `up` up the screen (as
 * three turns a camera to look at a point).
 */
export const lookingAt = (eye: Vec3, at: Vec3, up: Vec3): Turn =>
  lookAt(eye, at, up);
