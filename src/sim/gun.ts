// Her gun: one at most, on the plinth in her waist, firing one ball at a time, then reloading. A ship puts to sea
// without one. It turns on its plinth all the way round: it fires on any bearing, whatever her heading.
//
// It is aimed along a line of sight (sight.ts): the player's camera, through the middle of the screen, or a bot's eye
// aloft. Laying it is made easy for a thumb: of the ships within range whose body stands within the assist cone of
// that line (seen from the eye), the gun takes the one nearest the line (the nearer of two counting a little), and
// leads her: where she will be when the ball comes down, sailing on as she sails now, the ball's flight being had in
// closed form (shot.ts), and that found again from there until it settles. A ship behind the land the line meets is
// not taken. With no ship in the cone it is laid on the point the line meets the sea or the land, or at full range on
// that bearing if the point is out of range or the line meets neither (over the horizon, into the sky). Either way it
// is laid at the low elevation that carries a ball there: the ball comes down through what the line looks at.
// Then the ball goes off somewhere within the spread cone of where it was laid, drawn from the gun's own seeded
// numbers: the same seed and the same shot give the same ball, every time. Rarity closes up the spread a little and
// widens the cone.
//
// Pure arithmetic: no three, so it runs in node for the tests; deterministic for the same inputs.

import { random } from '../world/random.ts';
import { R, add, along, cross, distance, dot, length, normalize, scale, type Vec3 } from '../world/sphere.ts';
import type { Vessel } from './contact.ts';
import { GUN } from './handling.ts';
import { hullAt, type Depth } from './shoal.ts';
import { elevationFor, flightTime } from './shot.ts';
import { meets, offSight, pointOn, type Sight } from './sight.ts';

/** A gun: its rarity (0, common, to 4, legendary; GUN.rarities), seconds till it is loaded, and balls fired so far. */
export interface Gun {
  rarity: number;
  loading: number;
  fired: number;
}

/** A gun as it is found: loaded. */
export const gunOf = (rarity: number): Gun => ({ rarity: Math.max(0, Math.min(GUN.rarities.length - 1, Math.round(rarity))), loading: 0, fired: 0 });

/** How a gun is laid: the muzzle's place (metres, from the centre), the way the ball goes off (a unit vector), the
 * ship it is laid on, if any, where it is laid to come down (a unit vector; at the muzzle's height there), and whether
 * that is what the sight is on (false: past range, or the sight meets nothing). */
export interface Laying {
  from: Vec3;
  dir: Vec3;
  target: number | null;
  fall: Vec3;
  reached: boolean;
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

/** The ship whose body stands within `cone` radians of `sight` and in range of the muzzle at `from`, and nearer along
 * the sight than `hidden` metres (the land it meets): the one nearest the line, the nearer counting by GUN.nearer;
 * null if none. */
export function chosen(sight: Sight, from: Vec3, cone: number, others: readonly Vessel[], hidden = Infinity): Vessel | null {
  const up = normalize(from);
  let best: Vessel | null = null, score = Infinity;
  for (const o of [...others].sort((a, b) => a.id - b.id)) {
    const metres = distance(up, o.ship.at);
    if (metres > GUN.range) continue;
    const seen = offSight(sight, o.ship);
    if (!seen || seen.angle > cone || seen.along > hidden) continue;
    const s = seen.angle / cone + (GUN.nearer * metres) / GUN.range;
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

/** How far along a sight that meets nothing its point is taken, metres: past any range. */
const BEYOND = 1000;

/**
 * How `gun` aboard `shooter` is laid, aimed along `sight`, among `others` (the ships it may be laid on, not sunk), over
 * water `depth` deep, with its balls spread over `spread` radians (half-angle) by the gun's seeded numbers from `seed`.
 * With no sight, along her heading at full range.
 */
export function laid(shooter: Vessel, gun: Gun, sight: Sight | null, others: readonly Vessel[], seed: number, depth: Depth, spread: number = GUN.spread[gun.rarity]): Laying {
  const from = muzzle(shooter), up = normalize(from);
  const s = sight ?? { from, dir: shooter.ship.heading };
  const meet = meets(s, depth), land = meet !== null && length(pointOn(s, meet)) - R > 0.01;
  const mark = chosen(s, from, GUN.assist[gun.rarity], others.filter((o) => o.id !== shooter.id), land ? meet! : Infinity);
  const at = mark && lead(from, mark);
  // with no ship: the point the sight meets, or one far along it
  const point = at ?? normalize(pointOn(s, meet ?? BEYOND));
  const t = toward(up, point) ?? toward(up, s.dir) ?? shooter.ship.heading;
  const metres = Math.min(distance(up, point), GUN.range), reached = !!at || (meet !== null && distance(up, point) <= GUN.range);
  const fall = along(up, t, metres).p;
  const dir = off(up, t, elevationFor(metres)!);
  // the spread: a point in the disc of the cone, uniform over it
  const draw = random((seed ^ Math.imul(shooter.id + 1, 0x9e3779b1) ^ Math.imul(gun.fired + 1, 0x85ebca77)) >>> 0);
  const r = spread * Math.sqrt(draw()), a = 2 * Math.PI * draw();
  const side = normalize(cross(up, t)), lift = cross(dir, side);
  const spreadDir = normalize(add(add(dir, side, r * Math.cos(a)), lift, r * Math.sin(a)));
  return { from, dir: spreadDir, target: at && mark ? mark.id : null, fall, reached };
}
