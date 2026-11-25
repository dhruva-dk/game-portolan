import {
  R,
  add,
  along,
  cross,
  distance,
  length,
  normalize,
  place,
  scale,
  toward,
  type Vec3,
} from '../world/sphere.ts';
import type { Order } from './battle.ts';
import { roll, type Ctx } from './captain.ts';
import type { GunKind } from './kinds.ts';
import { GUNS } from './handling.ts';
import type { ShipState } from './ship.ts';
import { thrown } from './shot.ts';
import type { Sight } from './sight.ts';

const GUNNER = {
  error: 0.2,
  wander: [0.6, 1.4] as const,
  unsteady: 6,
  shake: {
    cannon: 1,
    scatter: 1 / 3,
    repeater: 1,
    harpoon: 1,
    mortar: 1,
  } satisfies Record<GunKind, number>,
  aloft: 20,
} as const;

export const GUNNERY = {
  pref: {
    cannon: 95,
    scatter: 35,
    repeater: 70,
    harpoon: 170,
    mortar: 140,
  } satisfies Record<GunKind, number>,
  inside: 0.6,
  out: 1.2,
  swing: 0.5,
  rush: {
    cannon: 0,
    scatter: 0,
    repeater: 0,
    harpoon: 0,
    mortar: 0,
  } satisfies Record<GunKind, number>,
  weave: [4, 9] as const,
  reach: {
    cannon: 0.95,
    scatter: 0.95,
    repeater: 0.95,
    harpoon: 0.95,
    mortar: 0.95,
  } satisfies Record<GunKind, number>,
  burst: [1.5, 4] as const,
  pause: [0.8, 2.2] as const,
  pauses: {
    cannon: true,
    scatter: false,
    repeater: true,
    harpoon: true,
    mortar: true,
  } satisfies Record<GunKind, boolean>,
} as const;

export interface Gunner {
  react: number;
  err: Vec3;
  errTo: Vec3;
  errT: number;
  burst: number;
  circle: number;
  circleT: number;
}

export const gunner = (): Gunner => ({
  react: 0,
  err: [0, 0, 0],
  errTo: [0, 0, 0],
  errT: 0,
  burst: 0,
  circle: 1,
  circleT: 0,
});

interface Mark {
  ship: ShipState;
  shove?: Vec3;
}

const between = (draw: () => number, [lo, hi]: readonly [number, number]) =>
  lo + (hi - lo) * draw();

export const spreadBy = (skill: number, kind: GunKind = 'cannon') =>
  1 + GUNNER.unsteady * GUNNER.shake[kind] * (1 - skill) ** 2;

export const sighted = (g: Gunner, clock: number, react: number) => {
  g.react = clock + react;
};

const loaded = (c: Ctx) => {
  const g = c.own.crew.gun;
  return g.reload <= 0 && g.rounds > 0;
};

export const rushing = (c: Ctx, kind: GunKind) =>
  c.b.gunnery.rush[kind] > 0 && loaded(c);

export function ring(c: Ctx, foe: Mark, kind: GunKind, dt: number): Vec3 {
  const g = c.m,
    t = c.b.gunnery,
    at = c.own.ship.at;
  g.circleT -= dt;
  if (g.circleT <= 0) {
    g.circle = -g.circle;
    g.circleT = between(() => roll(c.m), t.weave) * (1 - 0.6 * c.t.gunnery);
  }
  const rush = t.rush[kind],
    pref = t.pref[kind] * c.t.standoff * (rush > 0 && !loaded(c) ? rush : 1),
    f = foe.ship.at;
  const out = toward(f, at) ?? scale(foe.ship.heading, -1);
  const round = add(
    scale(out, Math.cos(t.swing)),
    cross(f, out),
    g.circle * Math.sin(t.swing)
  );
  return along(
    f,
    round,
    distance(at, f) < pref * t.inside ? pref * t.out : pref
  ).p;
}

export function aimAndFire(
  c: Ctx,
  foe: Mark | null,
  kind: GunKind,
  hold: boolean,
  dt: number
): Order {
  const g = c.m,
    t = c.b.gunnery,
    own = c.own.ship,
    skill = c.t.gunnery,
    clock = c.m.clock,
    draw = () => roll(c.m);
  const eye = place(own.at, GUNNER.aloft),
    bore = GUNS[kind];
  const sight = (p: Vec3): Sight => ({
    from: eye,
    dir: normalize(add(scale(p, R), eye, -1)),
  });
  const leads = c.t.tricks.lead;
  if (!foe)
    return { aim: { from: eye, dir: own.heading }, fire: false, lead: leads };
  const d = distance(own.at, foe.ship.at);
  const time =
    thrown(kind, Math.max(bore.least, Math.min(d, bore.range)))?.time ?? 0;
  const way = add(
      scale(foe.ship.heading, foe.ship.speed),
      foe.shove ?? [0, 0, 0]
    ),
    speed = length(way);
  const lead =
    c.t.tricks.lead && speed > 1e-9
      ? along(foe.ship.at, scale(way, 1 / speed), speed * time).p
      : foe.ship.at;
  g.errT -= dt;
  if (g.errT <= 0) {
    g.errT = between(draw, GUNNER.wander);
    const a = 2 * Math.PI * draw(),
      k = draw(),
      t = toward(lead, own.at) ?? own.heading;
    g.errTo = scale(add(scale(t, Math.cos(a)), cross(lead, t), Math.sin(a)), k);
  }
  g.err = add(g.err, add(g.errTo, g.err, -1), Math.min(1, 2 * dt));
  const miss = GUNNER.error * (1 - 0.85 * skill) * d;
  const mark = normalize(add(lead, g.err, miss / R));
  const aim = sight(mark);
  if (
    d > bore.range * t.reach[kind] ||
    d < bore.least ||
    clock < g.react ||
    hold
  )
    return { aim, fire: false, lead: leads };
  if (!t.pauses[kind])
    return { aim, fire: true, spread: spreadBy(skill, kind), lead: leads };
  if (g.burst > 0) {
    g.burst -= dt;
    if (g.burst <= 0) g.burst = -between(draw, t.pause);
  } else if (g.burst < 0) {
    g.burst += dt;
    if (g.burst >= 0) g.burst = between(draw, t.burst);
    return { aim, fire: false, lead: leads };
  } else g.burst = between(draw, t.burst);
  return { aim, fire: true, spread: spreadBy(skill, kind), lead: leads };
}
