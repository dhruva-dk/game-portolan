// A hull riding the sea: heaved, pitched and rolled by the water under her, and leaning into her turns.
//
// The sea is read at four points under her, bow and stern, port and starboard rails: their mean is the level she
// floats at, their differences the slope she lies along. Each of heave, pitch and roll follows its own with a
// damped spring, as a hull of her weight does. Heave and pitch are damped against the water's own motion, which
// carries her with it: she rides a long swell without lagging it (tests/swell.test.ts), and only its quick changes
// are smoothed away. Roll is damped against nothing: her rails are only a beam apart, so the short chop tilts the
// water under them back and forth, and she answers it slowly. Her lean into a turn follows the turn; a blow from
// another hull (contact.ts) sets her rolling.
//
// Pure arithmetic: no three, so it runs in node for the tests.

import type { ShipPose } from '../world/pose.ts';
import { R, add, along, cross, dot, scale, type Vec3 } from '../world/sphere.ts';
import { GUST, SHIP } from './handling.ts';
import type { ShipState } from './ship.ts';

/** The sea's surface over a point (a vector from the centre), metres above sea level, at a time on the world's clock. */
export type Sea = (p: Vec3, time: number) => number;

/**
 * Each motion's spring: its natural frequency (rad/s), its damping (1 is critical), and whether it is damped against
 * the water's own motion (carried along by it) or against nothing.
 */
export const RIDE = {
  heave: { frequency: 2.2, damping: 0.8, carried: true },
  pitch: { frequency: 2, damping: 0.7, carried: true },
  roll: { frequency: 1.6, damping: 0.7, carried: false },
  /** Where the sea is read: metres ahead of and behind amidships, and out to either rail. */
  reach: 0.4 * SHIP.length,
  rail: 0.45 * SHIP.beam,
  /** Her lean into a turn at top speed, radians per rad/s of turn; and how fast she takes it up. */
  heel: 0.35,
  lean: 2.5,
  /** A blow sets her rolling at this many rad/s for each m/s it shoves her across her deck: some 7° over at its most
   * for a ram square into her side at full speed, the rammer pressing on. */
  knock: 0.07,
} as const;

/** Her motion on the sea: metres above sea level, radians (bow up; starboard down), and how fast each changes. */
export interface Ride {
  heave: number; heaveRate: number;
  pitch: number; pitchRate: number;
  roll: number; rollRate: number;
  /** Her lean into the turn, radians, starboard down; on top of the roll. */
  heel: number;
  /** What the water under her asked of each at the last step. */
  water: Water;
}

interface Water { heave: number; pitch: number; roll: number }

/** What the water under her asks of each motion. */
function water(s: ShipState, sea: Sea, time: number): Water {
  const port = cross(s.at, s.heading);
  const at = (t: Vec3, metres: number) => sea(along(s.at, t, metres).p, time);
  const bow = at(s.heading, RIDE.reach), stern = at(s.heading, -RIDE.reach);
  const left = at(port, RIDE.rail), right = at(port, -RIDE.rail);
  return {
    heave: (bow + stern + left + right) / 4,
    pitch: Math.atan2(bow - stern, 2 * RIDE.reach),
    roll: Math.atan2(left - right, 2 * RIDE.rail),
  };
}

/** The lean a turn asks for, starboard down: into the turn, more the faster she goes. */
const lean = (s: ShipState) => -RIDE.heel * s.turn * Math.min(1, s.speed / SHIP.top);

/** At rest on the water as it is: each motion where the water puts it. */
export function settled(s: ShipState, sea: Sea, time: number): Ride {
  const w = water(s, sea, time);
  return { heave: w.heave, heaveRate: 0, pitch: w.pitch, pitchRate: 0, roll: w.roll, rollRate: 0, heel: lean(s), water: w };
}

/** One step of dt seconds for the ship as she now is, on the sea at `time`. */
export function ride(r: Ride, s: ShipState, sea: Sea, time: number, dt: number): Ride {
  const w = water(s, sea, time);
  // semi-implicit Euler: stable for these springs at any step under a tenth of a second
  type Spring = { frequency: number; damping: number; carried: boolean };
  const spring = (x: number, v: number, to: number, from: number, { frequency: f, damping: z, carried }: Spring) => {
    const water = carried ? (to - from) / dt : 0;
    const rate = v + (f * f * (to - x) + 2 * z * f * (water - v)) * dt;
    return [x + rate * dt, rate];
  };
  const [heave, heaveRate] = spring(r.heave, r.heaveRate, w.heave, r.water.heave, RIDE.heave);
  const [pitch, pitchRate] = spring(r.pitch, r.pitchRate, w.pitch, r.water.pitch, RIDE.pitch);
  const [roll, rollRate] = spring(r.roll, r.rollRate, w.roll, r.water.roll, RIDE.roll);
  const heel = r.heel + (lean(s) - r.heel) * (1 - Math.exp(-RIDE.lean * dt));
  return { heave, heaveRate, pitch, pitchRate, roll, rollRate, heel, water: w };
}

/** Her ride as a blow leaves it: `jolt` (m/s, a tangent at her place), the change of velocity another hull gave her,
 * sets her rolling away from it, as a push above her keel does. */
export function knocked(r: Ride, s: ShipState, jolt: Vec3): Ride {
  return { ...r, rollRate: r.rollRate - RIDE.knock * dot(jolt, cross(s.at, s.heading)) };
}

/** Her ride as a gust lifts her off the water (gust.ts; 0117's hop): heaving up at GUST.hop m/s. */
export const hopped = (r: Ride): Ride => ({ ...r, heaveRate: r.heaveRate + GUST.hop });

/** Where she lies: on her ride's level over where she is, pitched, then rolled and heeled. */
export function pose(s: ShipState, r: Ride): ShipPose {
  const port = cross(s.at, s.heading);
  const cp = Math.cos(r.pitch), sp = Math.sin(r.pitch), lean = r.roll + r.heel;
  const forward = add(scale(s.heading, cp), s.at, sp);
  const pitched = add(scale(s.at, cp), s.heading, -sp);
  return { position: scale(s.at, R + r.heave), forward, up: add(scale(pitched, Math.cos(lean)), port, -Math.sin(lean)) };
}
