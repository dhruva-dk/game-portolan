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
import { perKind, type GunKind } from './kinds.ts';
import { GUN, GUNS, SHIP } from './handling.ts';
import type { ShipState } from './ship.ts';
import type { Depth } from './shoal.ts';

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

interface Fall {
  ball: Ball;
  struck: number | null;
  at: Vec3;
  land: boolean;
}

const MUZZLE = R + GUN.up;
const nuFor = (meters: number) => {
  const s = Math.sin(meters / R / 2);
  return (2 * s) / (1 + s);
};
const PULL = perKind((k) => {
  const nu = nuFor(GUNS[k].carry);
  return { nu, mu: (GUNS[k].speed * GUNS[k].speed * MUZZLE) / nu };
});

const carried = (nu: number, elevation: number) => {
  const c = Math.cos(elevation);
  return 2 * R * Math.atan2(nu * Math.sin(elevation) * c, 1 - nu * c * c);
};

export const reach = (kind: GunKind, elevation: number) =>
  carried(PULL[kind].nu, elevation);

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

interface Throw {
  elevation: number;
  speed: number;
  time: number;
}

export function thrown(kind: GunKind, meters: number): Throw | null {
  const g = GUNS[kind],
    { nu, mu } = PULL[kind];
  if (meters > g.range + 1e-9 || meters < g.least - 1e-9) return null;
  const t = Math.tan(Math.max(meters, 1e-3) / R / 2);
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
    meters <= 0 ? 0 : Math.atan((nu - Math.sqrt(Math.max(0, root))) / (2 * t));
  return { elevation, speed: g.speed, time: flight(nu, mu, elevation) };
}

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

export function flown(b: Ball, dt: number): Ball {
  const mu = PULL[b.kind].mu,
    a0 = pull(b.p, mu);
  const p = add(add(b.p, b.v, dt), a0, 0.5 * dt * dt);
  const v = add(b.v, add(a0, pull(p, mu)), 0.5 * dt);
  return { ...b, p, v, age: b.age + dt };
}

export function offHull(s: ShipState, q: Vec3): number {
  const d = add(scale(q, R), s.at, -R);
  const ahead = dot(d, s.heading),
    across = length(add(d, s.heading, -ahead));
  const off = Math.max(0, Math.abs(ahead) - KEEL);
  return Math.max(0, Math.hypot(off, across) - RADIUS);
}

function inHull(s: ShipState, q: Vec3): boolean {
  const r = length(q),
    height = r - R;
  if (height < 0 || height > GUN.freeboard) return false;
  return offHull(s, scale(q, 1 / r)) <= 0;
}

interface Mark {
  id: number;
  ship: ShipState;
}

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
