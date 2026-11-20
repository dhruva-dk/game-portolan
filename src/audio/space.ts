// Where a sound is heard from: how long it takes to come (the speed of sound: a
// far gun's flash, then its report), how loud it is for its distance (heard
// whole within NEAR, falling as the distance after, faded out toward its reach
// and not played past it or once too quiet to matter), how dull (the air takes
// the highs first: a lowpass coming down with distance), and from which side
// (its bearing from the way the eye looks, as a stereo pan, a little duller
// behind). Pure: plain numbers in, plain numbers out, written into one object
// kept for it (no allocation a frame).

import { bearingFrom, type Eye } from '../snapshot.ts';
import type { Vec3 } from '../world/sphere.ts';

export { bearingFrom } from '../snapshot.ts';

/** Metres a second. */
export const SPEED = 340;
/**
 * Within this many metres a sound is heard whole; past it, it falls as
 * (NEAR/d)^FALL: a little gentler than the air's own inverse distance, so a gun
 * a few hundred metres off is still heard over the sea about her.
 */
export const NEAR = 14,
  FALL = 0.8;
/** Quieter than this (a factor; −46 dB) a sound is not played. */
const QUIET = 0.005;
/**
 * The air's lowpass: OPEN Hz at hand, coming down as the distance grows (half
 * at DULL m), never under FLOOR.
 */
const OPEN = 16000,
  DULL = 90,
  FLOOR = 550;

/**
 * How a sound is heard: whether at all, its delay (s), gain (factor), lowpass
 * (Hz) and pan (−1 left … 1 right).
 */
export interface Heard {
  audible: boolean;
  delay: number;
  gain: number;
  cutoff: number;
  pan: number;
}

export const heard = (): Heard => ({
  audible: false,
  delay: 0,
  gain: 0,
  cutoff: OPEN,
  pan: 0,
});

/**
 * The gain for `metres` off, for a sound that carries `reach` m: whole within
 * NEAR, then (NEAR/d)^FALL, faded to nothing over the last fifth of its reach.
 */
export function rolloff(metres: number, reach: number): number {
  if (metres >= reach) return 0;
  const edge = Math.min(1, (reach - metres) / (reach * 0.2));
  return (
    Math.min(1, NEAR / Math.max(NEAR, metres)) ** FALL *
    edge *
    edge *
    (3 - 2 * edge)
  );
}

/** The air's lowpass for `metres` off, Hz. */
export const cutoffAt = (metres: number) =>
  Math.max(FLOOR, OPEN / (1 + metres / DULL));

/**
 * The pan for a bearing (radians clockwise from ahead): full right at π/2,
 * never quite all in one ear.
 */
export const panOf = (bearing: number) => 0.85 * Math.sin(bearing);

/**
 * How a sound at `p` (world metres) carrying `reach` m is heard from `eye`,
 * written into `out`.
 */
export function hear(eye: Eye, p: Vec3, reach: number, out: Heard): Heard {
  const dx = p[0] - eye.position[0],
    dy = p[1] - eye.position[1],
    dz = p[2] - eye.position[2];
  const metres = Math.sqrt(dx * dx + dy * dy + dz * dz),
    gain = rolloff(metres, reach);
  out.audible = gain >= QUIET;
  out.delay = metres / SPEED;
  out.gain = gain;
  const bearing = bearingFrom(eye, p),
    behind = Math.max(0, -Math.cos(bearing));
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
