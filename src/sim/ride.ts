import type { ShipPose } from '../world/pose.ts';
import {
  R,
  add,
  along,
  cross,
  dot,
  scale,
  type Vec3,
} from '../world/sphere.ts';
import type { Hull } from '../world/swell.ts';
import { STEP } from './fixed.ts';
import { GUST, SHIP } from './handling.ts';
import type { ShipState } from './ship.ts';

type Sea = Hull;

export const RIDE = {
  heave: { frequency: 2.2, damping: 0.8, carried: true },
  pitch: { frequency: 2, damping: 0.7, carried: true },
  roll: { frequency: 1.6, damping: 0.7, carried: false },
  reach: 0.4 * SHIP.length,
  rail: 0.45 * SHIP.beam,
  shortest: 0.25 * SHIP.length,
  every: Math.round(0.2 / STEP),
  heel: 0.274,
  lean: 2.5,
  knock: 0.045,
} as const;

export interface Ride {
  heave: number;
  heaveRate: number;
  pitch: number;
  pitchRate: number;
  roll: number;
  rollRate: number;
  heel: number;
  water: Water;
  read: { from: Water; to: Water; left: number; span: number; every: number };
}

interface Water {
  heave: number;
  pitch: number;
  roll: number;
}

function water(at: Vec3, heading: Vec3, sea: Sea, time: number): Water {
  const { bow, stern, port, starboard } = sea(
    at,
    heading,
    RIDE.reach,
    RIDE.rail,
    time
  );
  return {
    heave: (bow + stern + port + starboard) / 4,
    pitch: Math.atan2(bow - stern, 2 * RIDE.reach),
    roll: Math.atan2(port - starboard, 2 * RIDE.rail),
  };
}

const lean = (s: ShipState, top: number) =>
  -RIDE.heel * s.turn * Math.min(1, Math.abs(s.speed) / top);

export function settled(
  s: ShipState,
  top: number,
  sea: Sea,
  time: number,
  slot = 0,
  every: number = RIDE.every,
  dt = STEP
): Ride {
  const w = water(s.at, s.heading, sea, time),
    left = slot % every;
  return {
    heave: w.heave,
    heaveRate: 0,
    pitch: w.pitch,
    pitchRate: 0,
    roll: w.roll,
    rollRate: 0,
    heel: lean(s, top),
    water: w,
    read: {
      from: w,
      to: left ? ahead(s, sea, time, left, dt) : w,
      left,
      span: left,
      every,
    },
  };
}

function ahead(
  s: ShipState,
  sea: Sea,
  time: number,
  steps: number,
  dt: number
): Water {
  const on = along(s.at, s.heading, s.speed * steps * dt);
  return water(on.p, on.t, sea, time + steps * dt);
}

export function ride(
  r: Ride,
  s: ShipState,
  top: number,
  sea: Sea,
  time: number,
  dt: number
): Ride {
  let { from, to, left, span } = r.read;
  const every = r.read.every;
  if (left <= 0)
    [from, to, left, span] = [to, ahead(s, sea, time, every, dt), every, every];
  const f = 1 - left / span;
  const w = {
    heave: from.heave + (to.heave - from.heave) * f,
    pitch: from.pitch + (to.pitch - from.pitch) * f,
    roll: from.roll + (to.roll - from.roll) * f,
  };
  type Spring = { frequency: number; damping: number; carried: boolean };
  const spring = (
    x: number,
    v: number,
    to: number,
    from: number,
    { frequency: f, damping: z, carried }: Spring
  ) => {
    const water = carried ? (to - from) / dt : 0;
    const rate = v + (f * f * (to - x) + 2 * z * f * (water - v)) * dt;
    return [x + rate * dt, rate];
  };
  const [heave, heaveRate] = spring(
    r.heave,
    r.heaveRate,
    w.heave,
    r.water.heave,
    RIDE.heave
  );
  const [pitch, pitchRate] = spring(
    r.pitch,
    r.pitchRate,
    w.pitch,
    r.water.pitch,
    RIDE.pitch
  );
  const [roll, rollRate] = spring(
    r.roll,
    r.rollRate,
    w.roll,
    r.water.roll,
    RIDE.roll
  );
  const heel =
    r.heel + (lean(s, top) - r.heel) * (1 - Math.exp(-RIDE.lean * dt));
  return {
    heave,
    heaveRate,
    pitch,
    pitchRate,
    roll,
    rollRate,
    heel,
    water: w,
    read: { from, to, left: left - 1, span, every },
  };
}

export function knocked(r: Ride, s: ShipState, jolt: Vec3): Ride {
  return {
    ...r,
    rollRate: r.rollRate - RIDE.knock * dot(jolt, cross(s.at, s.heading)),
  };
}

export const hopped = (r: Ride): Ride => ({
  ...r,
  heaveRate: r.heaveRate + GUST.hop,
});

export function pose(s: ShipState, r: Ride): ShipPose {
  const port = cross(s.at, s.heading);
  const cp = Math.cos(r.pitch),
    sp = Math.sin(r.pitch),
    lean = r.roll + r.heel;
  const forward = add(scale(s.heading, cp), s.at, sp);
  const pitched = add(scale(s.at, cp), s.heading, -sp);
  return {
    position: scale(s.at, R + r.heave),
    forward,
    up: add(scale(pitched, Math.cos(lean)), port, -Math.sin(lean)),
  };
}
