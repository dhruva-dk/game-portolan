// A ball in flight: one fixed step of it, and where it ends, in a hull, in the
// sea or on the land.
//
// It flies a true orbit about the planet's centre, pulled by MU / r², from the
// muzzle. On a planet this small a ball fired flat at these speeds would go
// round it, so each kind of gun (handling.ts GUNS) has its own pull, the one
// that makes its `carry` the furthest its ball goes at the best elevation: the
// cannon's some 14 g at the sea, its carry its range; the harpoon's far less
// for its speed, so its bolt flies flat. Its flight is stepped by velocity
// Verlet on the fixed step; how far it carries and how long it takes are also
// had in closed form, from the orbit itself, for laying the gun (gun.ts): a
// ball fired at an elevation comes back down to the muzzle's height at the same
// angle, the range angle ψ across the centre given by tan(ψ/2) = ν sin φ cos φ
// / (1 − ν cos² φ), ν its speed squared against the speed of a circular orbit
// there. A gun laid low takes the low elevation for the distance at its muzzle
// speed; a lobbed one (the mortar) its fixed elevation, with the charge (ν, so
// the muzzle speed) the distance needs. The balls take nothing of the ship's
// own way: laid on a point, a ball goes to it, whatever she is making.
//
// Each step its path is looked along every GUN.probe metres: a hull there (the
// capsule of contact.ts standing to GUN.freeboard) is struck, the first along
// the path; or it is in the sea, or the land is in the way (Depth, negative on
// land) and it falls there. It never strikes the ship that fired it.
//
// Pure arithmetic: no three, so it runs in node for the tests; deterministic
// for the same inputs.

import {
  R,
  add,
  dot,
  length,
  normalize,
  scale,
  type Vec3,
} from '../world/sphere.ts';
import { KEEL, RADIUS } from './contact.ts';
import { perKind, type GunKind } from '../kinds.ts';
import { GUN, GUNS, SHIP } from './handling.ts';
import type { ShipState } from './ship.ts';
import type { Depth } from './shoal.ts';

/**
 * A ball in flight: who fired it and from what kind of gun, where it is
 * (metres, from the planet's centre), its velocity (m/s), the hit points it
 * takes off (before its fall-off), where it was fired from and where it was
 * laid to come down (unit vectors), and how long it has flown (s).
 */
export interface Ball {
  shooter: number;
  kind: GunKind;
  p: Vec3;
  v: Vec3;
  damage: number;
  from: Vec3;
  to: Vec3;
  age: number;
}

/**
 * Where a ball ended: the ship it struck (or null), where (a unit vector), and
 * whether on the land.
 */
interface Fall {
  ball: Ball;
  struck: number | null;
  at: Vec3;
  land: boolean;
}

/** The muzzle's distance from the centre. */
const MUZZLE = R + GUN.up;
/**
 * ν for a carry of `metres` at the best elevation: sin(ψ/2) = ν / (2 − ν)
 * there.
 */
const nuFor = (metres: number) => {
  const s = Math.sin(metres / R / 2);
  return (2 * s) / (1 + s);
};
/** Each kind's ν at its muzzle speed, and its pull, m³/s² (MU / r² at r). */
const PULL = perKind((k) => {
  const nu = nuFor(GUNS[k].carry);
  return { nu, mu: (GUNS[k].speed * GUNS[k].speed * MUZZLE) / nu };
});

/**
 * Metres along the sea at which a ball with speed ratio ν fired at `elevation`
 * comes back to the muzzle's height.
 */
const carried = (nu: number, elevation: number) => {
  const c = Math.cos(elevation);
  return 2 * R * Math.atan2(nu * Math.sin(elevation) * c, 1 - nu * c * c);
};

/**
 * Metres along the sea at which a ball of `kind`, at its muzzle speed, fired at
 * `elevation` (radians above the level), comes back to the muzzle's height; its
 * carry at the best elevation.
 */
export const reach = (kind: GunKind, elevation: number) =>
  carried(PULL[kind].nu, elevation);

/**
 * Seconds a ball with speed ratio ν fired at `elevation` flies before it is
 * back at the muzzle's height: twice the time from the muzzle to the top of its
 * orbit, by Kepler's equation.
 */
function flight(nu: number, mu: number, elevation: number): number {
  const c = Math.cos(elevation);
  const e = Math.sqrt(1 + nu * (nu - 2) * c * c);
  const theta = Math.acos(Math.max(-1, Math.min(1, (nu * c * c - 1) / e)));
  const big =
    2 *
    Math.atan2(
      Math.sqrt(1 - e) * Math.sin(theta / 2),
      Math.sqrt(1 + e) * Math.cos(theta / 2)
    );
  const mean = big - e * Math.sin(big);
  const a = MUZZLE / (2 - nu);
  return (2 * (Math.PI - mean)) / Math.sqrt(mu / (a * a * a));
}

/**
 * How a ball is thrown to come back down to the muzzle's height `metres` along
 * the sea: its elevation (radians), its muzzle speed (m/s) and its time in the
 * air (s).
 */
interface Throw {
  elevation: number;
  speed: number;
  time: number;
}

/**
 * How a gun of `kind` throws a ball `metres` along the sea: low at its muzzle
 * speed, or lobbed at its elevation with the charge the distance needs; null
 * past its range (or, lobbed, nearer than its least).
 */
export function thrown(kind: GunKind, metres: number): Throw | null {
  const g = GUNS[kind],
    { nu, mu } = PULL[kind];
  if (metres > g.range + 1e-9 || metres < g.least - 1e-9) return null;
  const t = Math.tan(Math.max(metres, 1e-3) / R / 2);
  if (g.lob > 0) {
    const c = Math.cos(g.lob),
      n = t / (c * (Math.sin(g.lob) + t * c));
    return {
      elevation: g.lob,
      speed: Math.sqrt((n * mu) / MUZZLE),
      time: flight(n, mu, g.lob),
    };
  }
  const root = nu * nu - 4 * t * t * (1 - nu);
  const elevation =
    metres <= 0 ? 0 : Math.atan((nu - Math.sqrt(Math.max(0, root))) / (2 * t));
  return { elevation, speed: g.speed, time: flight(nu, mu, elevation) };
}

/**
 * A ball of `kind` fired from `from` (metres, from the centre) along `dir` (a
 * unit vector) at `speed`, laid to come down at `to` (a unit vector; where it
 * was fired from if not given).
 */
export const loosed = (
  shooter: number,
  kind: GunKind,
  from: Vec3,
  dir: Vec3,
  speed: number,
  damage: number,
  to?: Vec3
): Ball => ({
  shooter,
  kind,
  p: from,
  v: scale(dir, speed),
  damage,
  from: normalize(from),
  to: to ?? normalize(from),
  age: 0,
});

const pull = (p: Vec3, mu: number): Vec3 => {
  const r = length(p);
  return scale(p, -mu / (r * r * r));
};

/** A ball's flight dt seconds on, nothing in its way (velocity Verlet). */
export function flown(b: Ball, dt: number): Ball {
  const mu = PULL[b.kind].mu,
    a0 = pull(b.p, mu);
  const p = add(add(b.p, b.v, dt), a0, 0.5 * dt * dt);
  const v = add(b.v, add(a0, pull(p, mu)), 0.5 * dt);
  return { ...b, p, v, age: b.age + dt };
}

/**
 * How far the point q (a unit vector) lies outside her hull's capsule along the
 * sea, metres (0 inside its plan).
 */
export function offHull(s: ShipState, q: Vec3): number {
  const d = add(scale(q, R), s.at, -R);
  const ahead = dot(d, s.heading),
    across = length(add(d, s.heading, -ahead));
  const off = Math.max(0, Math.abs(ahead) - KEEL);
  return Math.max(0, Math.hypot(off, across) - RADIUS);
}

/**
 * Whether the point q (metres, from the centre) is inside her hull: within the
 * capsule along her keel, from the waterline up to her freeboard. On her own
 * flat chart: a few millimetres off the sphere along her length.
 */
function inHull(s: ShipState, q: Vec3): boolean {
  const r = length(q),
    height = r - R;
  if (height < 0 || height > GUN.freeboard) return false;
  return offHull(s, scale(q, 1 / r)) <= 0;
}

/** A ship a ball may strike: who she is and how she lies. */
interface Mark {
  id: number;
  ship: ShipState;
}

/**
 * Every ball one step of dt seconds on, among `marks` (each listed once; sunk
 * ships left out) over water `depth` deep: the balls still flying and those
 * that came down, in the order they are listed.
 */
export function fly(
  balls: readonly Ball[],
  marks: readonly Mark[],
  dt: number,
  depth: Depth
): { balls: Ball[]; falls: Fall[] } {
  const flying: Ball[] = [],
    falls: Fall[] = [];
  const order = [...marks].sort((a, b) => a.id - b.id);
  for (const b of balls) {
    const next = flown(b, dt);
    const span = length(add(next.p, b.p, -1));
    // the ships near enough to the path to be struck by it
    const reach = span + SHIP.length / 2 + GUN.freeboard + 1;
    const near = order.filter(
      (m) =>
        m.id !== b.shooter &&
        length(add(scale(normalize(b.p), R), m.ship.at, -R)) < reach
    );
    const n = Math.max(1, Math.ceil(span / GUN.probe));
    let fall: Fall | null = null;
    for (let i = 1; i <= n && !fall; i++) {
      const q = add(b.p, add(next.p, b.p, -1), i / n);
      const hit = near.find((m) => inHull(m.ship, q));
      const up = normalize(q);
      if (hit) fall = { ball: b, struck: hit.id, at: up, land: false };
      else {
        const height = length(q) - R,
          ground = -depth(up);
        if (height <= Math.max(0, ground))
          fall = { ball: b, struck: null, at: up, land: ground > 0 };
      }
    }
    if (fall) falls.push(fall);
    else if (next.age < GUN.life) flying.push(next);
  }
  return { balls: flying, falls };
}
