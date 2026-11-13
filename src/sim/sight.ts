// A line of sight, as a gun is aimed along it (gun.ts): from an eye (the player's camera, or a bot's masthead), a
// straight line through the world. Where it first meets the sea or the land, and how far off it a ship stands.
//
// A ship, for the eye, is her whole body: her hull's length and beam standing from the water to her rig's top
// (SHIP.rig), so the line passing through her sails counts as on her. How far off it she stands is the angle, seen from
// the eye, between the line and the nearest point of that body (0 on it); the gun's assist takes a ship within its cone.
//
// Pure arithmetic: no three, so it runs in node for the tests; deterministic for the same inputs.

import { R, add, cross, dot, length, normalize, scale, type Vec3 } from '../world/sphere.ts';
import { SHIP } from './handling.ts';
import type { ShipState } from './ship.ts';
import type { Depth } from './shoal.ts';

/** A line of sight: where it is sighted from (metres, from the planet's centre) and the way it looks (a unit vector). */
export interface Sight {
  from: Vec3;
  dir: Vec3;
}

/** How far along a line of sight the land and sea are looked for, metres; and the steps the land is looked along. */
const FAR = 600, STEP = 2;

/** The point `t` metres along the sight. */
export const pointOn = (s: Sight, t: number): Vec3 => add(s.from, s.dir, t);

/** Metres along the sight to where it meets the sea's level (the sphere R), or null if it never does. */
export function seaAlong(s: Sight): number | null {
  // |from + t dir|² = R²
  const b = dot(s.from, s.dir), c = dot(s.from, s.from) - R * R, disc = b * b - c;
  if (disc < 0) return null;
  const t = -b - Math.sqrt(disc);
  return t > 0 ? t : null;
}

/** Metres along the sight to where it first meets the sea or the land (`depth`, negative on land), within FAR; null if
 *  it meets neither (it looks over the horizon or into the sky). */
export function meets(s: Sight, depth: Depth): number | null {
  const sea = seaAlong(s), end = Math.min(sea ?? FAR, FAR);
  const under = (t: number) => {
    const p = pointOn(s, t);
    return length(p) - R <= -depth(normalize(p));
  };
  for (let t = STEP; t < end; t += STEP) {
    if (!under(t)) continue;
    // the land met between the last step and this one: closed in on by halves
    let lo = t - STEP, hi = t;
    for (let i = 0; i < 12; i++) {
      const mid = (lo + hi) / 2;
      if (under(mid)) hi = mid;
      else lo = mid;
    }
    return hi;
  }
  return sea !== null && sea <= FAR ? sea : null;
}

/** How far off the sight her body stands: the angle (radians) seen from the eye between the line and her body's
 *  nearest point, and how far along the line that is (metres); null behind the eye. */
export function offSight(s: Sight, ship: ShipState): { angle: number; along: number } | null {
  // in her own frame, flat about her (a few millimetres off the sphere over her length): ahead, across, up
  const up = ship.at, ahead = ship.heading, side = cross(ahead, up), base = scale(up, R);
  const local = (v: Vec3): Vec3 => [dot(v, ahead), dot(v, side), dot(v, up)];
  const o = local(add(s.from, base, -1)), d = local(s.dir);
  const half: Vec3 = [SHIP.length / 2, SHIP.beam / 2, SHIP.rig / 2], centre: Vec3 = [0, 0, SHIP.rig / 2];
  /** The point t metres along the line, and how far it is from her body. */
  const gap = (t: number) => {
    let g = 0;
    for (let k = 0; k < 3; k++) {
      const x = Math.abs(o[k] + d[k] * t - centre[k]) - half[k];
      if (x > 0) g += x * x;
    }
    return Math.sqrt(g);
  };
  // the gap is convex along the line: its least found by golden sections about her nearest approach to her middle
  const near = -dot(add(o, centre, -1), d), span = length(half) + 1;
  let lo = Math.max(0, near - span), hi = Math.max(0, near + span);
  if (hi <= 0) return null;
  const k = (Math.sqrt(5) - 1) / 2;
  for (let i = 0; i < 40; i++) {
    const a = hi - k * (hi - lo), b = lo + k * (hi - lo);
    if (gap(a) <= gap(b)) hi = b;
    else lo = a;
  }
  const t = (lo + hi) / 2;
  if (t <= 1e-6) return null;
  return { angle: Math.atan2(gap(t), t), along: t };
}
