// What a ship's canvas feels of her motion, from her poses frame after frame (cloth.ts takes it): gravity less her
// own acceleration — a turn, gathering way or losing it, the heave — and her rate of turn about her waterline (her
// roll and pitch as well as her yaw) and how fast that changes, all in her own frame (x to port, y up, z forward).
//
// Velocities come from the change of her pose between frames, and accelerations from theirs, each eased over EASE
// seconds: her pose is the fixed steps' blended (sim/fixed.ts), whose speed changes only at each step, and a frame's
// second difference would kick the canvas thirty times a second. Her turn comes from how far her axes have turned:
// for a small turn θ about k, Σ eᵢ × eᵢ' = 2θk over her three axes.
//
// And how her crew trim her square yards to the wind she feels: hauled round to meet it, as far as they go.
//
// Pure arithmetic: no three, so it runs in node for the tests.

import type { ShipPose } from '../world/pose.ts';
import { add, cross, distance, dot, normalize, scale, type Vec3 } from '../world/sphere.ts';

/** Gravity, m/s². */
const G = 9.81;
/** Seconds over which each rate is eased. */
const EASE = 0.2;
/** The most she is taken to accelerate, m/s², and to change her turn, rad/s²: past them is a jolt, not sailing. */
const MOST_ACCEL = 20, MOST_SPINNING = 4;
/** A move further than this in one frame is a ship placed anew, metres. */
const JUMP = 20;

/** What has been seen of her motion so far, in the world. */
export interface Motion { pose: ShipPose; velocity: Vec3; accel: Vec3; spin: Vec3; spinning: Vec3 }

/** What she feels now, in her own frame. */
export interface Feeling { weight: Vec3; spin: Vec3; spinning: Vec3 }

const port = (p: ShipPose) => cross(p.up, p.forward);
const capped = (v: Vec3, most: number): Vec3 => { const l = Math.hypot(...v); return l > most ? scale(v, most / l) : v; };
const ease = (from: Vec3, to: Vec3, dt: number): Vec3 => add(from, add(to, from, -1), 1 - Math.exp(-dt / EASE));

/** Her motion once she lies at `pose`, dt seconds after `was` (null when first seen, or placed anew). */
export function moved(was: Motion | null, pose: ShipPose, dt: number): Motion {
  if (!was || dt <= 0 || distance(was.pose.position, pose.position) > JUMP) {
    return { pose, velocity: was && dt <= 0 ? was.velocity : [0, 0, 0], accel: [0, 0, 0], spin: [0, 0, 0], spinning: [0, 0, 0] };
  }
  const velocity = ease(was.velocity, scale(add(pose.position, was.pose.position, -1), 1 / dt), dt);
  const accel = ease(was.accel, capped(scale(add(velocity, was.velocity, -1), 1 / dt), MOST_ACCEL), dt);
  const a = was.pose, b = pose;
  const turned = add(add(cross(a.forward, b.forward), cross(a.up, b.up)), cross(port(a), port(b)));
  const spin = ease(was.spin, scale(turned, 1 / (2 * dt)), dt);
  const spinning = ease(was.spinning, capped(scale(add(spin, was.spin, -1), 1 / dt), MOST_SPINNING), dt);
  return { pose, velocity, accel, spin, spinning };
}

/** A world vector in her frame. */
export const inFrame = (pose: ShipPose, v: Vec3): Vec3 => [dot(v, port(pose)), dot(v, pose.up), dot(v, pose.forward)];

/** What her canvas feels of her motion, in her own frame. */
export function feeling(m: Motion): Feeling {
  const weight = add(scale(normalize(m.pose.position), -G), m.accel, -1);
  return { weight: inFrame(m.pose, weight), spin: inFrame(m.pose, m.spin), spinning: inFrame(m.pose, m.spinning) };
}

/** The most her square yards are braced round, radians (the shrouds stop them); and how fast they are hauled round,
 * radians a second. */
export const BRACED = 0.6;
const HAUL = 0.3;

/**
 * The brace that best fills her square sails in this wind (her frame, the way it blows), radians: the yards turned to
 * meet it square, as far as they go. With the wind forward of the beam the sails can't fill, and the yards lie hard
 * round on the side it comes from — kept on the side they were while it is near dead ahead, so they don't swing back
 * and forth across her.
 */
export function trim(wind: Vec3, brace: number): number {
  if (wind[2] >= 0) return Math.max(-BRACED, Math.min(BRACED, Math.atan2(wind[0], wind[2])));
  const side = Math.abs(wind[0]) < -0.3 * wind[2] && brace !== 0 ? Math.sign(brace) : Math.sign(wind[0]);
  return side * BRACED;
}

/** Her yards dt seconds on, hauled toward the trim for this wind. */
export const hauled = (brace: number, wind: Vec3, dt: number): number =>
  brace + Math.max(-HAUL * dt, Math.min(HAUL * dt, trim(wind, brace) - brace));
