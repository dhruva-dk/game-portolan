import type { Rise } from '../world/planet.ts';
import { random } from '../world/random.ts';
import {
  R,
  add,
  along,
  cross,
  distance,
  length,
  normalize,
  scale,
  toward,
  type Vec3,
} from '../world/sphere.ts';
import type { Vessel } from './contact.ts';
import type { GunKind } from '../kinds.ts';
import { FALLOFF, GUN, GUNS } from './handling.ts';
import { hullAt, type Depth } from './shoal.ts';
import { thrown } from './shot.ts';
import { meets, offSight, pointOn, type Sight } from './sight.ts';

export interface Gun {
  kind: GunKind;
  rarity: number;
  rounds: number;
  cool: number;
  reload: number;
  windup: number;
  fired: number;
}

export const gunOf = (kind: GunKind, rarity: number): Gun => ({
  kind,
  rarity: Math.max(0, Math.min(GUN.rarities.length - 1, Math.round(rarity))),
  rounds: GUNS[kind].mag,
  cool: 0,
  reload: 0,
  windup: 0,
  fired: 0,
});

export const damageOf = (g: Pick<Gun, 'kind' | 'rarity'>) =>
  GUNS[g.kind].damage * GUN.damageBy[g.rarity];
export const reloadOf = (g: Pick<Gun, 'kind' | 'rarity'>, by = 1) =>
  GUNS[g.kind].reload * GUN.reloadBy[g.rarity] * by;
export const spreadOf = (g: Pick<Gun, 'kind' | 'rarity'>) =>
  GUNS[g.kind].spread * GUN.spreadBy[g.rarity];

export function falloff(kind: GunKind, meters: number): number {
  const g = GUNS[kind];
  if (!g.falls) return 1;
  const k = meters / g.range;
  return k <= FALLOFF.hold
    ? 1
    : Math.max(
        FALLOFF.floor,
        1 - ((k - FALLOFF.hold) * (1 - FALLOFF.floor)) / (1 - FALLOFF.hold)
      );
}

export interface Laying {
  from: Vec3;
  dirs: Vec3[];
  speed: number;
  target: number | null;
  fall: Vec3;
  reached: boolean;
}

export const muzzle = (v: Vessel): Vec3 =>
  scale(hullAt(v.ship.at, v.ship.heading, [GUN.ahead, 0]), R + GUN.up);

const way = (v: Vessel): Vec3 =>
  add(scale(v.ship.heading, v.ship.speed), v.shove);

const off = (up: Vec3, t: Vec3, elevation: number) =>
  add(scale(t, Math.cos(elevation)), up, Math.sin(elevation));

function ahead(v: Vessel, seconds: number): Vec3 {
  const w = way(v),
    speed = length(w);
  return speed > 1e-9
    ? along(v.ship.at, scale(w, 1 / speed), speed * seconds).p
    : v.ship.at;
}

export function chosen(
  sight: Sight,
  from: Vec3,
  cone: number,
  others: readonly Vessel[],
  range: number,
  hidden = Infinity
): Vessel | null {
  const up = normalize(from);
  let best: Vessel | null = null,
    score = Infinity;
  for (const o of [...others].sort((a, b) => a.id - b.id)) {
    const meters = distance(up, o.ship.at);
    if (meters > range) continue;
    const seen = offSight(sight, o.ship);
    if (!seen || seen.angle > cone || seen.along > hidden) continue;
    const s = seen.angle / cone + (GUN.nearer * meters) / range;
    if (s < score) [best, score] = [o, s];
  }
  return best;
}

function lead(kind: GunKind, from: Vec3, target: Vessel): Vec3 | null {
  const up = normalize(from);
  let at = target.ship.at;
  for (let i = 0; i < 8; i++) {
    const t = thrown(kind, distance(up, at));
    if (t === null) return null;
    at = ahead(target, t.time);
  }
  return thrown(kind, distance(up, at)) === null ? null : at;
}

const BEYOND = 1000;

interface Lay {
  seed: number;
  depth: Depth;
  spread?: number;
  cone?: number;
  rises?: readonly Rise[];
}

export function laid(
  shooter: Vessel,
  gun: Gun,
  sight: Sight | null,
  others: readonly Vessel[],
  lay: Lay
): Laying {
  const {
    seed,
    depth,
    spread = spreadOf(gun),
    cone = GUN.assist[gun.rarity],
    rises,
  } = lay;
  const g = GUNS[gun.kind],
    from = muzzle(shooter),
    up = normalize(from);
  const s = sight ?? { from, dir: shooter.ship.heading };
  const meet = meets(s, depth, rises),
    land = meet !== null && length(pointOn(s, meet)) - R > 0.01;
  const mark = chosen(
    s,
    from,
    cone,
    others.filter((o) => o.id !== shooter.id),
    g.range,
    land ? meet! : Infinity
  );
  const at = mark && lead(gun.kind, from, mark);
  const point = at ?? normalize(pointOn(s, meet ?? BEYOND));
  const t = toward(up, point) ?? toward(up, s.dir) ?? shooter.ship.heading;
  const d = distance(up, point),
    meters = Math.max(g.least, Math.min(d, g.range));
  const reached = !!at || (meet !== null && d <= g.range && d >= g.least);
  const fall = along(up, t, meters).p;
  const how = thrown(gun.kind, meters)!;
  const dir = off(up, t, how.elevation);
  const draw = random(
    (seed ^
      Math.imul(shooter.id + 1, 0x9e3779b1) ^
      Math.imul(gun.fired + 1, 0x85ebca77)) >>>
      0
  );
  const side = normalize(cross(up, t)),
    lift = cross(dir, side);
  const dirs = Array.from({ length: g.pellets }, () => {
    const r = spread * Math.sqrt(draw()),
      a = 2 * Math.PI * draw();
    return normalize(
      add(add(dir, side, r * Math.cos(a)), lift, r * Math.sin(a))
    );
  });
  return {
    from,
    dirs,
    speed: how.speed,
    target: at && mark ? mark.id : null,
    fall,
    reached,
  };
}
