import type { Rise } from '../world/planet.ts';
import {
  R,
  add,
  cross,
  dot,
  length,
  normalize,
  scale,
  type Vec3,
} from '../world/sphere.ts';
import { SHIP } from './handling.ts';
import type { ShipState } from './ship.ts';
import type { Depth } from './shoal.ts';

export interface Sight {
  from: Vec3;
  dir: Vec3;
}

const FAR = 600,
  STEP = 2;

export const pointOn = (s: Sight, t: number): Vec3 => add(s.from, s.dir, t);

export function seaAlong(s: Sight): number | null {
  const b = dot(s.from, s.dir),
    c = dot(s.from, s.from) - R * R,
    disc = b * b - c;
  if (disc < 0) return null;
  const t = -b - Math.sqrt(disc);
  return t > 0 ? t : null;
}

const spans: [number, number][] = [];
function lookAlong(
  s: Sight,
  end: number,
  rises: readonly Rise[] | undefined
): number {
  spans.length = 0;
  if (!rises || length(s.from) <= R) {
    spans.push([0, end]);
    return 1;
  }
  const [fx, fy, fz] = s.from,
    [dx, dy, dz] = s.dir;
  for (const r of rises) {
    const ox = fx - r.at[0] * R,
      oy = fy - r.at[1] * R,
      oz = fz - r.at[2] * R,
      round = r.reach + r.top;
    const b = ox * dx + oy * dy + oz * dz,
      disc = b * b - (ox * ox + oy * oy + oz * oz - round * round);
    if (disc < 0) continue;
    const q = Math.sqrt(disc),
      a = Math.max(0, -b - q),
      z = Math.min(end, -b + q);
    if (a < z) spans.push([a, z]);
  }
  spans.sort((x, y) => x[0] - y[0]);
  let n = 0;
  for (const sp of spans) {
    if (n > 0 && sp[0] <= spans[n - 1][1])
      spans[n - 1][1] = Math.max(spans[n - 1][1], sp[1]);
    else spans[n++] = sp;
  }
  return n;
}

export function meets(
  s: Sight,
  depth: Depth,
  rises?: readonly Rise[]
): number | null {
  const sea = seaAlong(s),
    end = Math.min(sea ?? FAR, FAR);
  const under = (t: number) => {
    const p = pointOn(s, t);
    return length(p) - R <= -depth(normalize(p));
  };
  const n = lookAlong(s, end, rises);
  for (let i = 0; i < n; i++) {
    const [a, z] = spans[i];
    for (
      let t = Math.max(STEP, Math.ceil(a / STEP) * STEP);
      t < end && t <= z;
      t += STEP
    ) {
      if (!under(t)) continue;
      let lo = t - STEP,
        hi = t;
      for (let k = 0; k < 12; k++) {
        const mid = (lo + hi) / 2;
        if (under(mid)) hi = mid;
        else lo = mid;
      }
      return hi;
    }
  }
  return sea !== null && sea <= FAR ? sea : null;
}

export function offSight(
  s: Sight,
  ship: ShipState
): { angle: number; along: number } | null {
  const up = ship.at,
    ahead = ship.heading,
    side = cross(ahead, up),
    base = scale(up, R);
  const local = (v: Vec3): Vec3 => [dot(v, ahead), dot(v, side), dot(v, up)];
  const o = local(add(s.from, base, -1)),
    d = local(s.dir);
  const half: Vec3 = [SHIP.length / 2, SHIP.beam / 2, SHIP.rig / 2],
    centre: Vec3 = [0, 0, SHIP.rig / 2];
  const gap = (t: number) => {
    let g = 0;
    for (let k = 0; k < 3; k++) {
      const x = Math.abs(o[k] + d[k] * t - centre[k]) - half[k];
      if (x > 0) g += x * x;
    }
    return Math.sqrt(g);
  };
  const near = -dot(add(o, centre, -1), d),
    span = length(half) + 1;
  let lo = Math.max(0, near - span),
    hi = Math.max(0, near + span);
  if (hi <= 0) return null;
  const k = (Math.sqrt(5) - 1) / 2;
  for (let i = 0; i < 40; i++) {
    const a = hi - k * (hi - lo),
      b = lo + k * (hi - lo);
    if (gap(a) <= gap(b)) hi = b;
    else lo = a;
  }
  const t = (lo + hi) / 2;
  if (t <= 1e-6) return null;
  return { angle: Math.atan2(gap(t), t), along: t };
}
