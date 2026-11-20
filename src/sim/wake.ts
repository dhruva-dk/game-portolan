// A ship's wake as the water remembers it: the path her bow has cut, as points
// along it, newest first, each with when she passed and how fast she was going.
// The water draws her wake from it (water/wake.ts): it follows her real path
// through her turns, and each piece of it spreads and fades by its own age, so
// the wake she left at speed lives on behind her after she has slowed or
// stopped.
//
// A point is laid down each time the bow has gone a stretch past the last one:
// a short stretch slow, a longer one fast (a quarter second's run, at least
// SPACING), so a wake of the same number of points reaches back about the same
// time at any speed, and a turn at her quickest is still a smooth curve (some
// 6° a stretch at top speed). Points older than LIFE are let go, and past MOST
// the oldest. A ship at rest lays down none, and her wake fades where it lies.
// A jump further than JUMP (a ship placed anew) starts a fresh wake.
//
// It is laid in place each frame, making nothing once warm: the points let go
// are kept to be laid again.
//
// Pure arithmetic: no three, so it runs in node for the tests.

import { distance, put, type Out3, type Vec3 } from '../world/sphere.ts';

/**
 * Where the bow passed (a unit vector, the point's own), when (seconds on the
 * world's clock) and how fast she went, metres a second.
 */
export interface WakePoint {
  at: Out3;
  time: number;
  speed: number;
}

export const WAKE = {
  /**
   * The shortest stretch between points, metres; and the seconds' run between
   * them at speed.
   */
  spacing: 1.5,
  every: 0.25,
  /** Seconds a point is kept: by then the wake has faded into the sea. */
  life: 24,
  /** The most points a wake keeps. */
  most: 64,
  /**
   * A move further than this in one go is a ship placed anew, not sailed,
   * metres.
   */
  jump: 40,
} as const;

/** The points let go by every wake, to be laid again. */
const spare: WakePoint[] = [];

/**
 * Lays the wake `points` (newest first) on, in place, once her bow is at `at`
 * at `time`, going `speed`: a new point laid first if she has gone far enough
 * past the last (where she is copied into it), and the points too old or too
 * many let go. Returns whether it goes on from the wake it was: false if that
 * was empty or its newest point is let go (a jump, or her wake faded while she
 * lay still).
 */
export function lay(
  points: WakePoint[],
  at: Vec3,
  time: number,
  speed: number
): boolean {
  const last = points[0];
  const gone = last ? distance(last.at, at) : Infinity;
  let kept = 0;
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    if (gone <= WAKE.jump && time - p.time < WAKE.life) points[kept++] = p;
    else spare.push(p);
  }
  points.length = kept;
  const on = kept > 0 && points[0] === last;
  if (
    !last ||
    gone > WAKE.jump ||
    gone >= Math.max(WAKE.spacing, speed * WAKE.every)
  ) {
    const p = spare.pop() ?? { at: [0, 0, 0], time, speed };
    put(p.at, at[0], at[1], at[2]);
    p.time = time;
    p.speed = speed;
    points.push(p);
    for (let i = points.length - 1; i > 0; i--) points[i] = points[i - 1];
    points[0] = p;
  }
  while (points.length > WAKE.most) spare.push(points.pop()!);
  return on;
}
