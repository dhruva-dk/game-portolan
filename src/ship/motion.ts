// What a ship's canvas feels of her motion, from her poses frame after frame (cloth.ts takes it): gravity less her
// own acceleration — a turn, gathering way or losing it, the heave — and her rate of turn about her waterline (her
// roll and pitch as well as her yaw) and how fast that changes, all in her own frame (x to port, y up, z forward).
//
// Velocities come from the change of her pose between frames, and accelerations from theirs, each eased over EASE
// seconds: her pose is the fixed steps' blended (sim/fixed.ts), whose speed changes only at each step, and a frame's
// second difference would kick the canvas thirty times a second. Her turn comes from how far her axes have turned:
// for a small turn θ about k, Σ eᵢ × eᵢ' = 2θk over her three axes.
//
// And how her crew set her canvas. Her speed doesn't come from the wind (sim/handling.ts: the same on every heading),
// so the wind she feels through her own motion — from ahead, mostly, when she makes way — would hang her sails slack or
// lay them aback while she sails on. So her canvas isn't drawn by that wind but by the one that would drive her (the
// sails' wind, filling()): at rest, the true wind, weakened, which the slack canvas stirs in; under way, a wind from
// her quarter on the side the true wind blows to, about square to her braced yards and as strong as the true wind and
// her speed together, so her sails always draw. Her yards are hauled round toward it (trim()), and that wind comes
// round with them, so when the true wind crosses her bow or her stern the yards and the bags of her sails swing over
// together, in seconds. The cloth, the drawn canvas, the pennants and the sails' shadows all take it from here
// (fleet.ts).
//
// Pure arithmetic: no three, so it runs in node for the tests.

import type { ShipPose } from '../world/pose.ts';
import { add, cross, distance, dot, length, normalize, scale, type Vec3 } from '../world/sphere.ts';
import { clamp, smoothstep } from '../world/scalar.ts';
import { port } from './mount.ts';

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

const capped = (v: Vec3, most: number): Vec3 => { const l = length(v); return l > most ? scale(v, most / l) : v; };
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
/** The way she makes before her canvas is set to sail, m/s: below it, it slackens toward the true wind's stir. */
export const WAY = 1.5;
/** Under way, how far round from right astern the sails' wind comes when her yards are hard round, radians: on her
 * quarter, where the lateen draws as well as the squares (a lateen fills only from across it). */
const QUARTER = 0.8;
/** At rest, the share of the true wind her slack canvas stirs in. */
const STIR = 0.4;
/** Under way, the sails' wind is at least this many metres a second for each of hers. */
const FILLS = 1.3;

/** How far she is set to sail, at this speed (m/s): 0 at rest, 1 under way. */
const underWay = (speed: number): number => smoothstep(0, WAY, speed);

/** The side the wind blows to, her frame (+1: to port): while it is near her fore-and-aft line, the side her yards are
 * on, so they don't swing back and forth across her as she yaws. */
const side = (wind: Vec3, brace: number): number =>
  Math.abs(wind[0]) < 0.3 * Math.abs(wind[2]) && brace !== 0 ? Math.sign(brace) : Math.sign(wind[0]) || 1;

/**
 * The brace her crew haul her square yards toward (radians), for the true wind (her frame, the way it blows) at her
 * speed (m/s). At rest, turned to meet it square, as far as they go, and with it forward of the beam (where the sails
 * can't fill) hard round on the side it comes from. Under way, hard round on the side it blows to, where the sails'
 * wind (filling()) fills them.
 */
export function trim(wind: Vec3, speed: number, brace: number): number {
  const sailing = side(wind, brace) * BRACED;
  const rest = wind[2] >= 0 ? clamp(Math.atan2(wind[0], wind[2]), -BRACED, BRACED) : sailing;
  return rest + (sailing - rest) * underWay(speed);
}

/** Her yards dt seconds on, hauled toward the trim for this wind and speed. */
export const hauled = (brace: number, wind: Vec3, speed: number, dt: number): number =>
  brace + clamp(trim(wind, speed, brace) - brace, -HAUL * dt, HAUL * dt);

/**
 * The wind her sails feel (her frame, metres a second), for the true wind (her frame) at her speed (m/s), her yards
 * braced so: at rest a share of the true wind; under way, coming round from astern with her yards, QUARTER/BRACED as
 * far as they are braced, and as strong as the true wind and her speed (times FILLS) together.
 */
export function filling(wind: Vec3, speed: number, brace: number): Vec3 {
  const a = (brace / BRACED) * QUARTER, most = Math.hypot(length(wind), FILLS * speed);
  const sailing: Vec3 = [most * Math.sin(a), 0, most * Math.cos(a)];
  return add(scale(wind, STIR), add(sailing, wind, -STIR), underWay(speed));
}
