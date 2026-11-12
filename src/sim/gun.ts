// Her gun: one at most, on the plinth in her waist, firing one ball at a time, then reloading. A ship puts to sea
// without one.
//
// Laying it is made easy for a thumb. She is aimed roughly, on a bearing; of the ships within range and within the
// assist cone of that bearing, the gun takes the one nearest the bearing (the nearer of two counting a little), and
// leads her: where she will be when the ball comes down, sailing on as she sails now, the ball's flight being had in
// closed form (shot.ts), and that found again from there until it settles. It is laid at the low elevation that
// carries a ball there. With no ship in the cone it is laid along the bearing at its full range. Then the ball goes
// off somewhere within the spread cone of where it was laid, drawn from the gun's own seeded numbers: the same seed
// and the same shot give the same ball, every time. Rarity mostly closes up the spread and widens the cone.
//
// Pure arithmetic: no three, so it runs in node for the tests; deterministic for the same inputs.

import { random } from '../world/random.ts';
import { R, add, along, cross, distance, dot, length, normalize, scale, type Vec3 } from '../world/sphere.ts';
import type { Vessel } from './contact.ts';
import { GUN } from './handling.ts';
import { hullAt } from './shoal.ts';
import { elevationFor, flightTime } from './shot.ts';

/** A gun: its rarity (0, common, to 4, legendary; GUN.rarities), seconds till it is loaded, and balls fired so far. */
export interface Gun {
  rarity: number;
  loading: number;
  fired: number;
}

/** A gun as it is found: loaded. */
export const gunOf = (rarity: number): Gun => ({ rarity: Math.max(0, Math.min(GUN.rarities.length - 1, Math.round(rarity))), loading: 0, fired: 0 });

/** How a gun is laid: the muzzle's place (metres, from the centre), the way the ball goes off (a unit vector), and
 * the ship it is laid on, if any. */
export interface Laying {
  from: Vec3;
  dir: Vec3;
  target: number | null;
}

/** The muzzle's place on a ship (metres, from the centre). */
export const muzzle = (v: Vessel): Vec3 => scale(hullAt(v.ship.at, v.ship.heading, [GUN.ahead, 0]), R + GUN.up);

/** Her way over the sea: through the water and on her shove (m/s, a tangent at her place). */
const way = (v: Vessel): Vec3 => add(scale(v.ship.heading, v.ship.speed), v.shove);

/** The unit tangent at `up` toward `to`, or null right over it. */
const toward = (up: Vec3, to: Vec3): Vec3 | null => {
  const t = add(to, up, -dot(to, up));
  return length(t) > 1e-12 ? normalize(t) : null;
};

/** The way off along tangent `t` at `up`, at `elevation` above the level. */
const off = (up: Vec3, t: Vec3, elevation: number) => add(scale(t, Math.cos(elevation)), up, Math.sin(elevation));

/** Where `v` will be `seconds` on, sailing on as she sails now (a unit vector). */
export function ahead(v: Vessel, seconds: number): Vec3 {
  const w = way(v), speed = length(w);
  return speed > 1e-9 ? along(v.ship.at, scale(w, 1 / speed), speed * seconds).p : v.ship.at;
}

/** The ship in the assist cone of `bearing` from `from` (the muzzle), and in range: the one nearest the bearing, the
 * nearer counting by GUN.nearer; null if none. */
export function chosen(from: Vec3, bearing: Vec3, cone: number, others: readonly Vessel[]): Vessel | null {
  const up = normalize(from);
  let best: Vessel | null = null, score = Infinity;
  for (const o of [...others].sort((a, b) => a.id - b.id)) {
    const metres = distance(up, o.ship.at), t = toward(up, o.ship.at);
    if (metres > GUN.range || !t) continue;
    const angle = Math.acos(Math.max(-1, Math.min(1, dot(t, bearing))));
    if (angle > cone) continue;
    const s = angle / cone + (GUN.nearer * metres) / GUN.range;
    if (s < score) [best, score] = [o, s];
  }
  return best;
}

/** Where to lay on `target` from `from` so that a ball meets her: the point she will have reached when it comes down,
 * or null if that is out of range. */
export function lead(from: Vec3, target: Vessel): Vec3 | null {
  const up = normalize(from);
  let at = target.ship.at;
  for (let i = 0; i < 8; i++) {
    const e = elevationFor(distance(up, at));
    if (e === null) return null;
    at = ahead(target, flightTime(e));
  }
  return elevationFor(distance(up, at)) === null ? null : at;
}

/**
 * How `gun` aboard `shooter` is laid, aimed on `bearing` (any vector; its part along the surface counts), among
 * `others` (the ships it may be laid on, not sunk), with its balls spread over `spread` radians (half-angle) by the
 * gun's seeded numbers from `seed`. Without a bearing along the surface, along her heading.
 */
export function laid(shooter: Vessel, gun: Gun, bearing: Vec3, others: readonly Vessel[], seed: number, spread: number = GUN.spread[gun.rarity]): Laying {
  const from = muzzle(shooter), up = normalize(from);
  const b = toward(up, bearing) ?? toward(up, shooter.ship.heading)!;
  const mark = chosen(from, b, GUN.assist[gun.rarity], others.filter((o) => o.id !== shooter.id));
  const at = mark && lead(from, mark);
  const t = (at && toward(up, at)) ?? b;
  const dir = off(up, t, at ? elevationFor(distance(up, at))! : elevationFor(GUN.range)!);
  // the spread: a point in the disc of the cone, uniform over it
  const draw = random((seed ^ Math.imul(shooter.id + 1, 0x9e3779b1) ^ Math.imul(gun.fired + 1, 0x85ebca77)) >>> 0);
  const r = spread * Math.sqrt(draw()), a = 2 * Math.PI * draw();
  const side = normalize(cross(up, t)), lift = cross(dir, side);
  const spreadDir = normalize(add(add(dir, side, r * Math.cos(a)), lift, r * Math.sin(a)));
  return { from, dir: spreadDir, target: at && mark ? mark.id : null };
}
