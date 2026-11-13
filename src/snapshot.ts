// What the frame draws, as plain data: the seam between what runs the world (the game, or the debug flyer) and what
// draws it (frame.ts). Each frame the one hands the other a Snapshot; nothing else passes between them, and nothing
// outside the frame touches what it draws with.

import type { Cap } from './sim/storm';
import type { ReadCells } from './world/cells';
import type { ShipPose } from './world/pose';
import type { Vec3 } from './world/sphere';
import { lookAt, type Turn } from './world/turn.ts';

/** A unit quaternion (x, y, z, w). */
export type Orientation = Turn;

/**
 * Where the world is seen from. In the air (the game's camera, the debug flyer) the eye is among the clouds and under
 * the sky; from space (the full map, ui/globe.ts; the start of a match, play/arrival.ts) it is past the air, looking
 * at the planet: the sky and its clouds are then not seen from inside, and the frame draws it as such.
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
export const AIR_FOV = 50;

/** A captain's colours (linear rgb, 0…1): her hull's paint, her sails' canvas, and whether a band of the paint
 *  crosses her sails. */
export interface Look { paint: Vec3; sail: Vec3; band: boolean }

/** A ship drawn: her slot, her pose and colours, her velocity (m/s, world: for the marks she leaves on the sea), and
 *  whether she floats (one going down neither fits the sea round her nor marks it). */
export interface ShipDraw { id: number; pose: ShipPose; look: Look; velocity: Vec3; afloat: boolean }

/** What the guns did, at a moment on the world's clock (s): a gun fired from `from` along `dir`; a ball come down at
 *  `at` (unit vector) in the sea or on land; a ball home in a hull at `at`, or a ram. */
export type Blast =
  | { kind: 'shot'; time: number; from: Vec3; dir: Vec3 }
  | { kind: 'splash'; time: number; at: Vec3; land: boolean }
  | { kind: 'strike'; time: number; at: Vec3; ram: boolean };

/** A ball in flight: where it is (world metres) and its velocity (m/s). */
export interface BallDraw { at: Vec3; way: Vec3 }

/** A piece of loot on the water (sim/loot.ts): its id (for its own bob and turn), where it floats (world metres, on the
 *  sea's surface), whether it is a gun (a crate; else a cask of stores), and the rarity it reads as (0–4: RARITY). */
export interface LootDraw { id: number; at: Vec3; gun: boolean; rarity: number }

/** The rarities' inks, worst to best (0117's LOOT_INKS: silver, verdigris, azurite, rubric, gold), 0xrrggbb: the HUD's
 *  and the world's alike. */
export const RARITY = [0x969aa0, 0x3a683e, 0x264c8c, 0xb8301a, 0xbe8a2c] as const;

/**
 * A change in who holds the sea (sim/territory.ts Change), numbered in order (seq), at a moment on the world's clock (s):
 * a loop closed (its first `loop` cells the trail's, the flood coming from them), a home patch laid round `at`, water
 * drained back to open sea (a sunk ship's, or the storm's: ship null), or an open trail cut.
 */
export type SeaChange =
  | { seq: number; time: number; kind: 'claim'; ship: number; cells: ReadCells; loop: number }
  | { seq: number; time: number; kind: 'home'; ship: number; cells: ReadCells; at: Vec3 }
  | { seq: number; time: number; kind: 'drain'; ship: number | null; cells: ReadCells }
  | { seq: number; time: number; kind: 'cut'; ship: number; by: number | null };

/** An open trail drawn: whose, which one (a new number each time she leaves her water), its points (unit vectors, a
 *  couple of metres apart, oldest first; the ribbon runs on from the last to her stern). While its serial holds, its
 *  points only ever grow at the end: a reader keeping a copy need only add the new ones. */
export interface TrailDraw { id: number; serial: number; points: readonly Vec3[] }

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
 *   trails      the open trails
 *   colours     each ship's colour on the sea, by id (linear rgb)
 *   clock       the moment, on the changes' clock (the world's), at which they are drawn
 */
export interface Sea {
  generation: number;
  owner: ReadCells;
  seq: number;
  changes: readonly SeaChange[];
  trails: readonly TrailDraw[];
  colours: readonly Vec3[];
  clock: number;
}

/** Everything the frame draws, for one frame. */
export interface Snapshot {
  eye: Eye;
  /** Seconds on the world's clock at the moment drawn: what the weather, the sea's waves, the gunfire's smoke and the
   *  storm's rain and billows run on. */
  clock: number;
  /** The storm's safe cap at the moment drawn (sim/storm.ts), worked out on the match's own clock: the frame never
   *  works it out from `clock`. */
  storm: Cap;
  /** Every ship drawn (at most the frame's fleet, frame.ts FrameOptions, each id below it); a ship not listed is not
   *  drawn. */
  ships: readonly ShipDraw[];
  /** The ship always drawn whole (the player's, which the chase camera holds close), or null. */
  own: number | null;
  /** Every ball in flight. */
  balls: readonly BallDraw[];
  /** The loot on the water near the eye. */
  loot: readonly LootDraw[];
  /** What the guns did in the last few seconds, oldest first: each is drawn once, from the first snapshot it is in. */
  blasts: readonly Blast[];
  /** Who holds the sea, if anyone does (none before a match). */
  sea?: Sea;
}

/** The orientation of an eye at `eye` looking at `at`, `up` up the screen (as three turns a camera to look at a point). */
export const lookingAt = (eye: Vec3, at: Vec3, up: Vec3): Orientation => lookAt(eye, at, up);
