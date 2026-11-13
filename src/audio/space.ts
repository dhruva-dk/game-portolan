// Where a sound is heard from: how long it takes to come (the speed of sound: a far gun's flash, then its report), how
// loud it is for its distance (heard whole within NEAR, falling as the distance after, faded out toward its reach and
// not played past it or once too quiet to matter), how dull (the air takes the highs first: a lowpass coming down with
// distance), and from which side (its bearing from the way the eye looks, as a stereo pan, a little duller behind).
// Pure: plain numbers in, plain numbers out, written into one object kept for it (no allocation a frame).

import type { Eye } from '../snapshot';
import type { Vec3 } from '../world/sphere';

/** Metres a second. */
export const SPEED = 340;
/** Within this many metres a sound is heard whole. */
export const NEAR = 14;
/** Quieter than this (a factor; −46 dB) a sound is not played. */
export const QUIET = 0.005;
/** The air's lowpass: OPEN Hz at hand, coming down as the distance grows (half at DULL m), never under FLOOR. */
export const OPEN = 16000, DULL = 90, FLOOR = 550;

/** How a sound is heard: whether at all, its delay (s), gain (factor), lowpass (Hz) and pan (−1 left … 1 right). */
export interface Heard { audible: boolean; delay: number; gain: number; cutoff: number; pan: number }

export const heard = (): Heard => ({ audible: false, delay: 0, gain: 0, cutoff: OPEN, pan: 0 });

/** The gain for `metres` off, for a sound that carries `reach` m: whole within NEAR, then NEAR/d, faded to nothing over
 *  the last fifth of its reach. */
export function rolloff(metres: number, reach: number): number {
  if (metres >= reach) return 0;
  const edge = Math.min(1, (reach - metres) / (reach * 0.2));
  return Math.min(1, NEAR / Math.max(NEAR, metres)) * edge * edge * (3 - 2 * edge);
}

/** The air's lowpass for `metres` off, Hz. */
export const cutoffAt = (metres: number) => Math.max(FLOOR, OPEN / (1 + metres / DULL));

/** The pan for a bearing (radians clockwise from ahead): full right at π/2, never quite all in one ear. */
export const panOf = (bearing: number) => 0.85 * Math.sin(bearing);

/** The bearing of `p` (world metres) from the way `eye` looks: radians clockwise, 0 ahead, ±π behind. The eye looks
 *  down its −z with x to its right (snapshot.ts Eye), so `p` is turned into the eye's frame by the inverse turn. */
export function bearingFrom(eye: Eye, p: Vec3): number {
  const [qx, qy, qz, qw] = eye.orientation;
  const vx = p[0] - eye.position[0], vy = p[1] - eye.position[1], vz = p[2] - eye.position[2];
  // v' = q⁻¹ v q, with q⁻¹ = (−x, −y, −z, w): t = 2 (−q × v), v' = v + w t + (−q) × t
  const tx = 2 * -(qy * vz - qz * vy), ty = 2 * -(qz * vx - qx * vz), tz = 2 * -(qx * vy - qy * vx);
  const x = vx + qw * tx + -(qy * tz - qz * ty), z = vz + qw * tz + -(qx * ty - qy * tx);
  return Math.atan2(x, -z);
}

/** How a sound at `p` (world metres) carrying `reach` m is heard from `eye`, written into `out`. */
export function hear(eye: Eye, p: Vec3, reach: number, out: Heard): Heard {
  const dx = p[0] - eye.position[0], dy = p[1] - eye.position[1], dz = p[2] - eye.position[2];
  const metres = Math.sqrt(dx * dx + dy * dy + dz * dz), gain = rolloff(metres, reach);
  out.audible = gain >= QUIET;
  out.delay = metres / SPEED;
  out.gain = gain;
  const bearing = bearingFrom(eye, p), behind = Math.max(0, -Math.cos(bearing));
  out.cutoff = cutoffAt(metres) * (1 - 0.35 * behind);
  out.pan = panOf(bearing);
  return out;
}

/** A sound heard as hers: at once, whole, open and centred. */
export function close(out: Heard, gain = 1): Heard {
  out.audible = true;
  out.delay = 0;
  out.gain = gain;
  out.cutoff = OPEN;
  out.pan = 0;
  return out;
}
