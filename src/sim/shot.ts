// A cannonball in flight: one fixed step of it, and where it ends, in a hull, in the sea or on the land.
//
// It flies a true orbit about the planet's centre, pulled by MU / r², from the muzzle at GUN.speed. On a planet this
// small a ball fired flat at that speed would go round it, so the pull is the one that makes GUN.range its furthest
// carry (some 11 g at the sea). Its flight is stepped by velocity Verlet on the fixed step; how far it carries and how
// long it takes are also had in closed form, from the orbit itself, for laying the gun (gun.ts): a ball fired at an
// elevation comes back down to the muzzle's height at the same angle, the range angle ψ across the centre given by
// tan(ψ/2) = ν sin φ cos φ / (1 − ν cos² φ), ν its speed squared against the speed of a circular orbit there.
// The balls take nothing of the ship's own way: laid on a point, a ball goes to it, whatever she is making.
//
// Each step its path is looked along every GUN.probe metres: a hull there (the capsule of contact.ts standing to
// GUN.freeboard) is struck, the first along the path; or it is in the sea, or the land is in the way (Depth, negative
// on land) and it falls there. It never strikes the ship that fired it.
//
// Pure arithmetic: no three, so it runs in node for the tests; deterministic for the same inputs.

import { R, add, dot, length, normalize, scale, type Vec3 } from '../world/sphere.ts';
import { KEEL, RADIUS } from './contact.ts';
import { GUN, SHIP } from './handling.ts';
import type { ShipState } from './ship.ts';
import type { Depth } from './shoal.ts';

/** A ball in flight: who fired it, where it is (metres, from the planet's centre), its velocity (m/s), the hit points
 * it takes off, and how long it has flown (s). */
export interface Ball {
  shooter: number;
  p: Vec3;
  v: Vec3;
  damage: number;
  age: number;
}

/** Where a ball ended: the ship it struck (or null), where (a unit vector), and whether on the land. */
export interface Fall {
  ball: Ball;
  struck: number | null;
  at: Vec3;
  land: boolean;
}

/** The muzzle's distance from the centre. */
const MUZZLE = R + GUN.up;
/** The ball's speed squared against a circular orbit's at the muzzle, for the pull that makes GUN.range its furthest
 * carry: sin(ψ/2) = ν / (2 − ν) at the best elevation. */
const NU = (() => {
  const s = Math.sin(GUN.range / R / 2);
  return (2 * s) / (1 + s);
})();
/** The planet's pull, m³/s²: MU / r² at r. */
export const MU = (GUN.speed * GUN.speed * MUZZLE) / NU;

/** Metres along the sea at which a ball fired at `elevation` (radians above the level) comes back to the muzzle's
 * height; GUN.range at the best elevation. */
export function reach(elevation: number): number {
  const c = Math.cos(elevation);
  return 2 * R * Math.atan2(NU * Math.sin(elevation) * c, 1 - NU * c * c);
}

/** The low elevation that carries a ball `metres` along the sea back to the muzzle's height, or null beyond range. */
export function elevationFor(metres: number): number | null {
  if (metres > GUN.range) return null;
  if (metres <= 0) return 0;
  const t = Math.tan(metres / R / 2);
  const root = NU * NU - 4 * t * t * (1 - NU);
  return Math.atan((NU - Math.sqrt(Math.max(0, root))) / (2 * t));
}

/** Seconds a ball fired at `elevation` flies before it is back at the muzzle's height: twice the time from the muzzle
 * to the top of its orbit, by Kepler's equation. */
export function flightTime(elevation: number): number {
  const c = Math.cos(elevation);
  const e = Math.sqrt(1 + NU * (NU - 2) * c * c);
  const theta = Math.acos(Math.max(-1, Math.min(1, (NU * c * c - 1) / e)));
  const big = 2 * Math.atan2(Math.sqrt(1 - e) * Math.sin(theta / 2), Math.sqrt(1 + e) * Math.cos(theta / 2));
  const mean = big - e * Math.sin(big);
  const a = MUZZLE / (2 - NU);
  return (2 * (Math.PI - mean)) / Math.sqrt(MU / (a * a * a));
}

/** A ball fired from `from` (metres, from the centre) along `dir` (a unit vector) at the muzzle speed. */
export const loosed = (shooter: number, from: Vec3, dir: Vec3, damage: number): Ball => ({
  shooter, p: from, v: scale(dir, GUN.speed), damage, age: 0,
});

const pull = (p: Vec3): Vec3 => {
  const r = length(p);
  return scale(p, -MU / (r * r * r));
};

/** A ball's flight dt seconds on, nothing in its way (velocity Verlet). */
export function flown(b: Ball, dt: number): Ball {
  const a0 = pull(b.p);
  const p = add(add(b.p, b.v, dt), a0, 0.5 * dt * dt);
  const v = add(b.v, add(a0, pull(p)), 0.5 * dt);
  return { ...b, p, v, age: b.age + dt };
}

/** Whether the point q (metres, from the centre) is inside her hull: within the capsule along her keel, from the
 * waterline up to her freeboard. On her own flat chart: a few millimetres off the sphere along her length. */
function inHull(s: ShipState, q: Vec3): boolean {
  const r = length(q), height = r - R;
  if (height < 0 || height > GUN.freeboard) return false;
  const d = add(scale(q, R / r), s.at, -R);
  const ahead = dot(d, s.heading), across = length(add(d, s.heading, -ahead));
  const off = Math.max(0, Math.abs(ahead) - KEEL);
  return off * off + across * across <= RADIUS * RADIUS;
}

/** A ship a ball may strike: who she is and how she lies. */
export interface Mark {
  id: number;
  ship: ShipState;
}

/**
 * Every ball one step of dt seconds on, among `marks` (each listed once; sunk ships left out) over water `depth` deep:
 * the balls still flying and those that came down, in the order they are listed.
 */
export function fly(balls: readonly Ball[], marks: readonly Mark[], dt: number, depth: Depth): { balls: Ball[]; falls: Fall[] } {
  const flying: Ball[] = [], falls: Fall[] = [];
  const order = [...marks].sort((a, b) => a.id - b.id);
  for (const b of balls) {
    const next = flown(b, dt);
    const span = length(add(next.p, b.p, -1));
    // the ships near enough to the path to be struck by it
    const near = order.filter((m) => m.id !== b.shooter && length(add(scale(normalize(b.p), R), m.ship.at, -R)) < span + SHIP.length / 2 + GUN.freeboard + 1);
    const n = Math.max(1, Math.ceil(span / GUN.probe));
    let fall: Fall | null = null;
    for (let i = 1; i <= n && !fall; i++) {
      const q = add(b.p, add(next.p, b.p, -1), i / n);
      const hit = near.find((m) => inHull(m.ship, q));
      const up = normalize(q);
      if (hit) fall = { ball: b, struck: hit.id, at: up, land: false };
      else {
        const height = length(q) - R, ground = -depth(up);
        if (height <= Math.max(0, ground)) fall = { ball: b, struck: null, at: up, land: ground > 0 };
      }
    }
    if (fall) falls.push(fall);
    else if (next.age < GUN.life) flying.push(next);
  }
  return { balls: flying, falls };
}
