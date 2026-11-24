import {
  R,
  add,
  along,
  cross,
  dot,
  normalize,
  scale,
  tangentAt,
  type Vec3,
} from '../world/sphere.ts';
import { random } from '../world/random.ts';
import type { Depth } from './shoal.ts';
import type { Widen } from './tables.ts';

interface Phase {
  readonly wait: number;
  readonly close: number;
  readonly radius: number;
  readonly damage: number;
}

export type StormTable = Omit<Widen<typeof STORM>, 'phases'> & {
  readonly phases: readonly Phase[];
};

export const STORM = {
  phases: [
    { wait: 60, close: 70, radius: 800, damage: 0.01 },
    { wait: 45, close: 40, radius: 480, damage: 0.02 },
    { wait: 40, close: 32, radius: 320, damage: 0.03 },
    { wait: 35, close: 26, radius: 220, damage: 0.05 },
    { wait: 25, close: 20, radius: 150, damage: 0.07 },
    { wait: 20, close: 16, radius: 110, damage: 0.09 },
    { wait: 15, close: 14, radius: 75, damage: 0.12 },
  ] satisfies readonly Phase[],
  rise: 0.04,
  every: 10,
  open: 4,
  wander: 0.9,
  tries: 400,
} as const;

export const CLOUD = { base: 58, lowest: 40, out: 50 } as const;

export interface Cap {
  centre: Vec3;
  radius: number;
}

export interface Storm extends Cap {
  next: Cap;
  closing: boolean;
  secondsToNext: number;
  phase: number;
  final: boolean;
  damage: number;
}

const WHOLE = Math.PI;
const angle = (metres: number) => metres / R;

export const calm = (centre: Vec3): Storm => ({
  centre,
  radius: WHOLE,
  next: { centre, radius: WHOLE },
  closing: false,
  secondsToNext: Infinity,
  phase: 0,
  final: false,
  damage: 0,
});

const between = (a: Vec3, b: Vec3) =>
  Math.atan2(Math.hypot(...cross(a, b)), dot(a, b));

function slerp(a: Vec3, b: Vec3, f: number): Vec3 {
  const d = between(a, b);
  if (d < 1e-9) return a;
  const w = normalize(add(b, a, -dot(a, b)));
  return add(scale(a, Math.cos(d * f)), w, Math.sin(d * f));
}

export function planStorm(
  seed: number,
  depth: Depth,
  table: StormTable = STORM
): Vec3[] {
  const rand = random(seed * 48271 + 7),
    phases = table.phases;
  const n = phases.length;
  const unit = (): Vec3 => {
    const z = 2 * rand() - 1,
      a = 2 * Math.PI * rand(),
      s = Math.sqrt(1 - z * z);
    return [s * Math.cos(a), z, s * Math.sin(a)];
  };
  const wet = (u: Vec3) => depth(scale(u, R));
  const final = phases[n - 1].radius;
  const rim = (u: Vec3) =>
    Math.min(
      ...Array.from({ length: 8 }, (_, k) =>
        wet(along(scale(u, R), tangentAt(u, (k * Math.PI) / 4), final).p)
      )
    );
  let best: Vec3 = [0, 1, 0],
    score = -Infinity;
  for (let i = 0; i < table.tries; i++) {
    const u = unit();
    const s = Math.min(wet(u) - table.open, rim(u));
    if (s > score) [best, score] = [u, s];
    if (s >= 0) break;
  }
  const centres: Vec3[] = new Array(n);
  centres[n - 1] = best;
  for (let k = n - 2; k >= 0; k--) {
    const inner = centres[k + 1],
      room = angle(phases[k].radius - phases[k + 1].radius) * table.wander;
    centres[k] = inner;
    for (let i = 0; i < table.tries; i++) {
      const c = normalize(
        along(
          inner,
          tangentAt(inner, 2 * Math.PI * rand()),
          room * R * Math.sqrt(rand())
        ).p
      );
      if (wet(c) > 0) {
        centres[k] = c;
        break;
      }
    }
  }
  return centres;
}

export function createStorm(
  seed: number,
  depth: Depth,
  table: StormTable = STORM
) {
  const centres = planStorm(seed, depth, table),
    phases = table.phases,
    n = phases.length;
  const held = (k: number): Cap =>
    k === 0
      ? { centre: centres[0], radius: WHOLE }
      : { centre: centres[k - 1], radius: angle(phases[k - 1].radius) };
  const target = (k: number): Cap => ({
    centre: centres[k],
    radius: angle(phases[k].radius),
  });
  return (seconds: number): Storm => {
    let t = Math.max(seconds, 0);
    for (let k = 0; k < n; k++) {
      const p = phases[k],
        from = held(k),
        to = target(k);
      if (t < p.wait)
        return {
          ...from,
          next: to,
          closing: false,
          secondsToNext: p.wait - t,
          phase: k,
          final: false,
          damage: p.damage,
        };
      t -= p.wait;
      if (t < p.close) {
        const f = t / p.close;
        const centre = slerp(from.centre, to.centre, f),
          radius = from.radius + (to.radius - from.radius) * f;
        return {
          centre,
          radius,
          next: to,
          closing: true,
          secondsToNext: p.close - t,
          phase: k,
          final: false,
          damage: p.damage,
        };
      }
      t -= p.close;
    }
    const last = target(n - 1);
    const damage =
      phases[n - 1].damage + table.rise * Math.floor(t / table.every + 1);
    return {
      ...last,
      next: last,
      closing: false,
      secondsToNext: Infinity,
      phase: n,
      final: true,
      damage,
    };
  };
}

export const closedBy = (table: StormTable): number =>
  table.phases.reduce((t, p) => t + p.wait + p.close, 0);

export const toEdge = (p: Vec3, cap: Cap) =>
  (cap.radius - between(normalize(p), cap.centre)) * R;

export const outside = (p: Vec3, cap: Cap) => toEdge(p, cap) < 0;
