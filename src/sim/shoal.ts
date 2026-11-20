// The shallows: a ship can't sail where the water is shallower than her draught.
//
// Her hull's whole length must clear the floor: her forefoot, amidships, her quarters and her sternpost. Sailing
// ahead, her stern follows the water her bow found; but she turns about amidships, and her stern swings out the other
// way, so a ship coming about close to the shore would set her stern on it were only the bow watched. Within WARNING
// metres of grounding, the part of her way heading into shallower water is taken off, all of it at her draught, so
// she slows softly and then slides along the shore, losing way in proportion to how squarely she meets it; and the
// part of her turn that would swing any of those points into shallower water is made about that point instead of
// amidships, the same way — her stern bears against the bank and she pivots on it, her bow swinging away. Close to
// grounding the slope eases her back off it, so she can always come about, even with no reverse.
//
// Each step is then checked: the new place must leave every point of her hull clear of the floor, or at least no
// worse off than before (so a ship set down in the shallows can always work her way out). Failing that she keeps her
// heading, then gives up her way, then stays put. A step moves her at most a third of a metre and swings her stern
// less, far less than any shore's slope, so nothing is tunnelled through.
//
// Pure arithmetic: no three, so it runs in node for the tests.

import { smoothstep } from '../world/scalar.ts';
import {
  add, along, cross, dot, frameAt, length, normalize, put, scale, transport, type CourseOut, type Out3, type Vec3,
} from '../world/sphere.ts';
import { SHIP } from './handling.ts';
import type { ShipState } from './ship.ts';

/** Metres of water over the floor at a point (a vector from the centre): negative on land. */
export type Depth = (p: Vec3) => number;

/** Within this many metres of grounding she is slowed. */
const WARNING = 2;
/** Within this many she is eased off, at up to EASE m/s. */
const NEAR = 0.3;
const EASE = 0.6;
/** How fast she loses the way she can't make, per second, when she meets the shallows head on. */
const GRIND = 1.5;
/** Her hull's points that must clear the floor, metres ahead of amidships and to port: her forefoot, amidships, her
 * quarters and her sternpost. */
const HULL: readonly (readonly [number, number])[] = [
  [0.4 * SHIP.length, 0], [0, 0],
  [-0.3 * SHIP.length, 0.3 * SHIP.beam], [-0.3 * SHIP.length, -0.3 * SHIP.beam], [-0.4 * SHIP.length, 0],
];
/** Metres either side at which the floor's slope is measured. */
const PROBE = 1.5;

/** hullAt's working vectors. */
const toPort: Out3 = [0, 0, 0], off: Out3 = [0, 0, 0], reached: CourseOut = { p: [0, 0, 0], t: [0, 0, 0] };

/** Where a point of her hull (metres ahead of amidships and to port) lies, with her amidships at `at` (into `out`;
 *  without one, amidships is `at` itself). */
export function hullAt(at: Vec3, heading: Vec3, point: readonly [number, number], out?: Out3): Vec3 {
  const ahead = point[0], across = point[1];
  if (ahead === 0 && across === 0) return out ? put(out, at[0], at[1], at[2]) : at;
  const d = add(scale(heading, ahead, off), cross(at, heading, toPort), across, off), metres = length(d);
  const p = along(at, scale(d, 1 / metres, off), metres, reached).p;
  return put(out, p[0], p[1], p[2]);
}

/** under's sounding; and the point of HULL (its index) the last it made found shallowest, −1 for none. */
const sounded: Out3 = [0, 0, 0];
let shoalest = -1;

/** How much water she has under her hull at its shallowest point, metres. */
export function under(at: Vec3, heading: Vec3, depth: Depth): number {
  let least = Infinity;
  shoalest = -1;
  for (let i = 0; i < HULL.length; i++) {
    const c = depth(hullAt(at, heading, HULL[i], sounded)) - SHIP.draught;
    if (c < least) {
      least = c;
      shoalest = i;
    }
  }
  return least;
}

/** How much water she has under her hull at its shallowest point, metres, and where that is. */
export function clearance(at: Vec3, heading: Vec3, depth: Depth): { least: number; where: Vec3 } {
  const least = under(at, heading, depth);
  return { least, where: shoalest < 0 ? at : hullAt(at, heading, HULL[shoalest]) };
}

/** The way into deeper water at p: a unit tangent there, or null where the floor is level. */
function deeper(p: Vec3, depth: Depth): Vec3 | null {
  const f = frameAt(p);
  const slope = (t: Vec3) => (depth(along(p, t, PROBE).p) - depth(along(p, t, -PROBE).p)) / (2 * PROBE);
  const g = add(scale(f.east, slope(f.east)), f.north, slope(f.north));
  const size = length(g);
  return size > 1e-6 ? scale(g, 1 / size) : null;
}

/**
 * How far her turn this step (`angle`, radians to port) moves her amidships when a point of her hull near grounding
 * would swing into shallower water: the share of the turn that point can't make is made about it instead, so it stays
 * put and she swings round it. A tangent at s.at.
 */
function swing(s: ShipState, angle: number, depth: Depth): Vec3 {
  let share = 1, kick: Vec3 = [0, 0, 0];
  const port = cross(s.at, s.heading);
  for (const [ahead, across] of HULL) {
    if (ahead === 0 && across === 0) continue;
    const p = hullAt(s.at, s.heading, [ahead, across]), c = depth(p) - SHIP.draught;
    if (c >= WARNING) continue;
    const n = deeper(p, depth);
    if (!n) continue;
    // the point's way as she turns about amidships, against the slope there brought to amidships
    const way = add(scale(port, ahead * angle), s.heading, -across * angle);
    const can = smoothstep(0, WARNING, c);
    if (can < share && dot(way, normalize(add(n, s.at, -dot(n, s.at)))) < 0) [share, kick] = [can, scale(way, can - 1)];
  }
  return kick;
}

/** From `at`, the place `move` (a tangent there) takes her, her heading carried along. */
export function moved(at: Vec3, heading: Vec3, move: Vec3): { at: Vec3; heading: Vec3 } {
  const metres = length(move);
  if (metres === 0) return { at, heading };
  const to = along(at, scale(move, 1 / metres), metres).p;
  return { at: to, heading: normalize(transport(heading, at, to)) };
}

/**
 * The ship `s` (her speed and turn already this step's) sailing dt seconds on `heading` (a unit tangent at s.at, her
 * heading after this step's turn), kept out of the shallows.
 */
export function navigate(s: ShipState, heading: Vec3, dt: number, depth: Depth): ShipState {
  const before = clearance(s.at, s.heading, depth);
  let move = scale(heading, s.speed * dt), push: Vec3 = [0, 0, 0], speed = s.speed;
  if (before.least < WARNING) {
    push = swing(s, Math.atan2(dot(cross(s.heading, heading), s.at), dot(s.heading, heading)), depth);
    const n0 = deeper(before.where, depth);
    if (n0) {
      // the slope at the keel point, brought to amidships, along the surface there
      const n = normalize(add(n0, s.at, -dot(n0, s.at)));
      const into = -dot(move, n);
      if (into > 0) {
        const taken = into * (1 - smoothstep(0, WARNING, before.least));
        move = add(move, n, taken);
        speed *= Math.exp((-GRIND * taken) / s.speed);
      }
      if (before.least < NEAR) push = add(push, n, EASE * dt * (1 - Math.max(before.least, 0) / NEAR));
    }
  }
  const fine = (to: { at: Vec3; heading: Vec3 }) => {
    const c = under(to.at, to.heading, depth);
    return c >= 0 || c >= before.least;
  };
  const turning = moved(s.at, heading, add(move, push));
  if (fine(turning)) return { ...turning, speed, turn: s.turn };
  const straight = moved(s.at, s.heading, add(move, push));
  if (fine(straight)) return { ...straight, speed, turn: 0 };
  const stopped = Math.min(speed, s.speed) * Math.exp(-GRIND * dt);
  const eased = moved(s.at, s.heading, push);
  if (fine(eased)) return { ...eased, speed: stopped, turn: 0 };
  return { at: s.at, heading: s.heading, speed: stopped, turn: 0 };
}
