import { smoothstep } from '../world/scalar.ts';
import {
  add,
  along,
  cross,
  dot,
  frameAt,
  length,
  normalize,
  put,
  scale,
  transport,
  type CourseOut,
  type Out3,
  type Vec3,
} from '../world/sphere.ts';
import { SHIP } from './handling.ts';
import type { ShipState } from './ship.ts';

export type Depth = (p: Vec3) => number;

const WARNING = 2;
const NEAR = 0.3;
export const EASE = 0.6;
const GRIND = 1.5;
const HULL: readonly (readonly [number, number])[] = [
  [0.4 * SHIP.length, 0],
  [0, 0],
  [-0.3 * SHIP.length, 0.3 * SHIP.beam],
  [-0.3 * SHIP.length, -0.3 * SHIP.beam],
  [-0.4 * SHIP.length, 0],
];
const PROBE = 1.5;

const toPort: Out3 = [0, 0, 0],
  off: Out3 = [0, 0, 0],
  reached: CourseOut = { p: [0, 0, 0], t: [0, 0, 0] };

export function hullAt(
  at: Vec3,
  heading: Vec3,
  point: readonly [number, number],
  out?: Out3
): Vec3 {
  const ahead = point[0],
    across = point[1];
  if (ahead === 0 && across === 0)
    return out ? put(out, at[0], at[1], at[2]) : at;
  const d = add(
      scale(heading, ahead, off),
      cross(at, heading, toPort),
      across,
      off
    ),
    meters = length(d);
  const p = along(at, scale(d, 1 / meters, off), meters, reached).p;
  return put(out, p[0], p[1], p[2]);
}

const sounded: Out3 = [0, 0, 0];
let shoalest = -1;

export function under(at: Vec3, heading: Vec3, depth: Depth): number {
  let least = Infinity;
  shoalest = -1;
  for (let i = 0; i < HULL.length; i++) {
    const c = depth(hullAt(at, heading, HULL[i], sounded)) - SHIP.draft;
    if (c < least) {
      least = c;
      shoalest = i;
    }
  }
  return least;
}

export function clearance(
  at: Vec3,
  heading: Vec3,
  depth: Depth
): { least: number; where: Vec3 } {
  const least = under(at, heading, depth);
  return {
    least,
    where: shoalest < 0 ? at : hullAt(at, heading, HULL[shoalest]),
  };
}

function deeper(p: Vec3, depth: Depth): Vec3 | null {
  const f = frameAt(p);
  const slope = (t: Vec3) =>
    (depth(along(p, t, PROBE).p) - depth(along(p, t, -PROBE).p)) / (2 * PROBE);
  const g = add(scale(f.east, slope(f.east)), f.north, slope(f.north));
  const size = length(g);
  return size > 1e-6 ? scale(g, 1 / size) : null;
}

function swing(s: ShipState, angle: number, depth: Depth): Vec3 {
  let share = 1,
    kick: Vec3 = [0, 0, 0];
  const port = cross(s.at, s.heading);
  for (const [ahead, across] of HULL) {
    if (ahead === 0 && across === 0) continue;
    const p = hullAt(s.at, s.heading, [ahead, across]),
      c = depth(p) - SHIP.draft;
    if (c >= WARNING) continue;
    const n = deeper(p, depth);
    if (!n) continue;
    const way = add(scale(port, ahead * angle), s.heading, -across * angle);
    const can = smoothstep(0, WARNING, c);
    if (can < share && dot(way, normalize(add(n, s.at, -dot(n, s.at)))) < 0)
      [share, kick] = [can, scale(way, can - 1)];
  }
  return kick;
}

function ease(s: ShipState, dt: number, depth: Depth): Vec3 {
  let off: Vec3 = [0, 0, 0],
    most = 0;
  for (const point of HULL) {
    const p = hullAt(s.at, s.heading, point),
      c = depth(p) - SHIP.draft;
    if (c >= NEAR) continue;
    const n = deeper(p, depth);
    if (!n) continue;
    const w = 1 - Math.max(c, 0) / NEAR;
    off = add(off, normalize(add(n, s.at, -dot(n, s.at))), w);
    most = Math.max(most, w);
  }
  const size = length(off);
  return size > 1e-9 ? scale(off, (EASE * dt * most) / size) : off;
}

export function moved(
  at: Vec3,
  heading: Vec3,
  move: Vec3
): { at: Vec3; heading: Vec3 } {
  const meters = length(move);
  if (meters === 0) return { at, heading };
  const to = along(at, scale(move, 1 / meters), meters).p;
  return { at: to, heading: normalize(transport(heading, at, to)) };
}

export function navigate(
  s: ShipState,
  heading: Vec3,
  dt: number,
  depth: Depth
): ShipState {
  const before = clearance(s.at, s.heading, depth);
  let move = scale(heading, s.speed * dt),
    kick: Vec3 = [0, 0, 0],
    off: Vec3 = [0, 0, 0],
    speed = s.speed;
  if (before.least < WARNING) {
    kick = swing(
      s,
      Math.atan2(dot(cross(s.heading, heading), s.at), dot(s.heading, heading)),
      depth
    );
    const n0 = deeper(before.where, depth);
    if (n0) {
      const n = normalize(add(n0, s.at, -dot(n0, s.at)));
      const into = -dot(move, n);
      if (into > 0) {
        const taken = into * (1 - smoothstep(0, WARNING, before.least));
        move = add(move, n, taken);
        speed *= Math.exp((-GRIND * taken) / s.speed);
      }
    }
    off = ease(s, dt, depth);
  }
  const fine = (to: { at: Vec3; heading: Vec3 }) => {
    const c = under(to.at, to.heading, depth);
    return c >= 0 || c >= before.least;
  };
  const swung = add(kick, off);
  const turning = moved(s.at, heading, add(move, swung));
  if (fine(turning)) return { ...turning, speed, turn: s.turn };
  const straight = moved(s.at, s.heading, add(move, swung));
  if (fine(straight)) return { ...straight, speed, turn: 0 };
  const pivoted = moved(s.at, heading, swung);
  if (fine(pivoted)) return { ...pivoted, speed: 0, turn: s.turn };
  const eased = moved(s.at, s.heading, off);
  if (fine(eased)) return { ...eased, speed: 0, turn: 0 };
  const swiveled = moved(s.at, heading, kick);
  if (fine(swiveled)) return { ...swiveled, speed: 0, turn: s.turn };
  return { at: s.at, heading: s.heading, speed: 0, turn: 0 };
}
