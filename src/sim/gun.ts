// Her guns: two carried at most, one in hand on the plinth in her waist
// (battle.ts fires it), of the five kinds (handling.ts GUNS). A ship puts to
// sea without one. It turns on its plinth all the way round: it fires on any
// bearing, whatever her heading.
//
// Each is aimed along a line of sight (sight.ts): the player's camera, through
// the middle of the screen, or a bot's eye aloft. Laying it is made easy for a
// thumb: of the ships within its range whose body stands within the assist cone
// of that line (seen from the eye), the gun takes the one nearest the line (the
// nearer of two counting a little), and leads her: where she will be when the
// ball comes down, sailing on as she sails now, the ball's flight being had in
// closed form (shot.ts), and that found again from there until it settles. A
// ship behind the land the line meets is not taken. With no ship in the cone it
// is laid on the point the line meets the sea or the land, or at full range on
// that bearing if the point is out of range or the line meets neither (over the
// horizon, into the sky); a lobbed gun no nearer than its least. Either way it
// is laid as its kind throws a ball there (shot.ts thrown): the ball comes down
// through what the line looks at. Then each ball (each of a scatter's pellets)
// goes off somewhere within the spread cone of where it was laid, drawn from
// the gun's own seeded numbers: the same seed and the same shot give the same
// balls, every time. Rarity closes up the spread a little and widens the cone.
//
// Pure arithmetic: no three, so it runs in node for the tests; deterministic
// for the same inputs.

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

/**
 * A gun: its kind and rarity (0, common, to 4, legendary; GUN.rarities); the
 * balls in its magazine; seconds till it may fire again (its interval since the
 * last), left reloading (0: not), and left winding up (0: not); and shots
 * fired.
 */
export interface Gun {
  kind: GunKind;
  rarity: number;
  rounds: number;
  cool: number;
  reload: number;
  windup: number;
  fired: number;
}

/** A gun as it is found: its magazine full. */
export const gunOf = (kind: GunKind, rarity: number): Gun => ({
  kind,
  rarity: Math.max(0, Math.min(GUN.rarities.length - 1, Math.round(rarity))),
  rounds: GUNS[kind].mag,
  cool: 0,
  reload: 0,
  windup: 0,
  fired: 0,
});

/**
 * Hit points a ball of `gun` takes off, before its fall-off; seconds its reload
 * takes; its spread (half-angle).
 */
export const damageOf = (g: Pick<Gun, 'kind' | 'rarity'>) =>
  GUNS[g.kind].damage * GUN.damageBy[g.rarity];
export const reloadOf = (g: Pick<Gun, 'kind' | 'rarity'>) =>
  GUNS[g.kind].reload * GUN.reloadBy[g.rarity];
export const spreadOf = (g: Pick<Gun, 'kind' | 'rarity'>) =>
  GUNS[g.kind].spread * GUN.spreadBy[g.rarity];

/**
 * The share of its damage a ball of `kind` keeps, struck `metres` from where it
 * was fired (FALLOFF; 1 for a kind whose bite holds).
 */
export function falloff(kind: GunKind, metres: number): number {
  const g = GUNS[kind];
  if (!g.falls) return 1;
  const k = metres / g.range;
  return k <= FALLOFF.hold
    ? 1
    : Math.max(
        FALLOFF.floor,
        1 - ((k - FALLOFF.hold) * (1 - FALLOFF.floor)) / (1 - FALLOFF.hold)
      );
}

/**
 * How a gun is laid: the muzzle's place (metres, from the centre), the ways its
 * balls go off (unit vectors, one a pellet) and their muzzle speed, the ship it
 * is laid on, if any, where it is laid to come down (a unit vector; at the
 * muzzle's height there), and whether that is what the sight is on (false: past
 * range, or the sight meets nothing).
 */
export interface Laying {
  from: Vec3;
  dirs: Vec3[];
  speed: number;
  target: number | null;
  fall: Vec3;
  reached: boolean;
}

/** The muzzle's place on a ship (metres, from the centre). */
export const muzzle = (v: Vessel): Vec3 =>
  scale(hullAt(v.ship.at, v.ship.heading, [GUN.ahead, 0]), R + GUN.up);

/**
 * Her way over the sea: through the water and on her shove (m/s, a tangent at
 * her place).
 */
const way = (v: Vessel): Vec3 =>
  add(scale(v.ship.heading, v.ship.speed), v.shove);

/** The way off along tangent `t` at `up`, at `elevation` above the level. */
const off = (up: Vec3, t: Vec3, elevation: number) =>
  add(scale(t, Math.cos(elevation)), up, Math.sin(elevation));

/**
 * Where `v` will be `seconds` on, sailing on as she sails now (a unit vector).
 */
function ahead(v: Vessel, seconds: number): Vec3 {
  const w = way(v),
    speed = length(w);
  return speed > 1e-9
    ? along(v.ship.at, scale(w, 1 / speed), speed * seconds).p
    : v.ship.at;
}

/**
 * The ship whose body stands within `cone` radians of `sight` and within
 * `range` of the muzzle at `from`, and nearer along the sight than `hidden`
 * metres (the land it meets): the one nearest the line, the nearer counting by
 * GUN.nearer; null if none.
 */
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
    const metres = distance(up, o.ship.at);
    if (metres > range) continue;
    const seen = offSight(sight, o.ship);
    if (!seen || seen.angle > cone || seen.along > hidden) continue;
    const s = seen.angle / cone + (GUN.nearer * metres) / range;
    if (s < score) [best, score] = [o, s];
  }
  return best;
}

/**
 * Where a gun of `kind` lays on `target` from `from` so that its ball meets
 * her: the point she will have reached when it comes down, or null if that is
 * out of its reach.
 */
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

/**
 * How far along a sight that meets nothing its point is taken, metres: past any
 * range.
 */
const BEYOND = 1000;

/**
 * What a gun is laid over: water `depth` deep (the land looked for only near
 * its `rises`, if given: sight.ts meets); its balls spread over `spread`
 * radians (half-angle; the gun's own if not given) by the gun's seeded numbers
 * from `seed`; its assist's cone `cone` radians (the match's rules', rules.ts;
 * the game's own for the gun's rarity if not given).
 */
interface Lay {
  seed: number;
  depth: Depth;
  spread?: number;
  cone?: number;
  rises?: readonly Rise[];
}

/**
 * How `gun` aboard `shooter` is laid, aimed along `sight`, among `others` (the
 * ships it may be laid on, not sunk), over what `lay` gives. With no sight,
 * along her heading at full range.
 */
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
  // with no ship: the point the sight meets, or one far along it
  const point = at ?? normalize(pointOn(s, meet ?? BEYOND));
  const t = toward(up, point) ?? toward(up, s.dir) ?? shooter.ship.heading;
  const d = distance(up, point),
    metres = Math.max(g.least, Math.min(d, g.range));
  const reached = !!at || (meet !== null && d <= g.range && d >= g.least);
  const fall = along(up, t, metres).p;
  const how = thrown(gun.kind, metres)!;
  const dir = off(up, t, how.elevation);
  // the spread: for each ball a point in the disc of the cone, uniform over it
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
