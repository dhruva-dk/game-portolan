// A bot's guns (bot.ts): which of the two she carries she takes in hand, the
// ring she holds round her foe, and how she lays and fires it.
//
// She takes in hand the gun that does most at the range she lies from her foe
// (armFor): its balls a second over its magazine and reload, less with its
// fall-off and with its spread past the hull's width there, nothing out of its
// reach; one reloading counted at half, so she swaps to a loaded one rather
// than wait; and only for one doing a good deal more than the one in hand, so
// she doesn't swap back and forth.
//
// In a gun fight she holds the range her gun in hand is best at rather than
// ramming: she makes for a point on a ring that far round her foe, a little
// round from where she lies, and swings the other way round it now and then, a
// sharp captain more often, so she is hard to lead. (She doesn't work round to
// windward: the wind here doesn't drive a ship.)
//
// She lays her gun on where her foe will be when the ball comes down, with a
// wandering error that a sharp captain keeps to a sixth of a green one's, and
// fires when her foe is in range, past the moment's surprise of first seeing
// her, and in a burst, not in the pause between two. She sights it from aloft
// (her eye `aloft` m up her mast) on the sea at that mark, and the gun's aim
// assist (gun.ts) takes her line of sight as it takes a player's, so her error
// mostly shows past the edge of its cone; and her hand is unsteadier than she
// thinks, a green captain's balls spreading wider than a sharp one's.
//
// Pure arithmetic: no three, so it runs in node for the tests; deterministic
// for the same inputs.

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
import { inHand, type Order } from './battle.ts';
import { roll, type Ctx } from './captain.ts';
import { damageOf, falloff, reloadOf, spreadOf } from './gun.ts';
import type { GunKind } from '../kinds.ts';
import { GUNS, SHIP } from './handling.ts';
import type { ShipState } from './ship.ts';
import { thrown } from './shot.ts';
import type { Sight } from './sight.ts';

/**
 * Her aim's feel: the same for every bot, whatever her brain (a fairness to
 * the player, not a choice of hers: BOTS.md decision 4). Seconds and metres.
 */
const GUNNER = {
  /**
   * Seconds before a green, and a sharp, captain first fires on a ship she has
   * just seen.
   */
  react: [2.2, 0.3] as const,
  /**
   * Her error, as a share of the distance, for a green captain; a sharp one's a
   * sixth of it. It wanders to a new mark every `wander` s, and follows it at 2
   * a second.
   */
  error: 0.2,
  wander: [0.6, 1.4] as const,
  /**
   * Her hand is less steady than she thinks: her balls spread 1 + `unsteady` ×
   * (1 − skill)² times the gun's own: a green captain's (0.3) 3.9 times, a
   * fair one's (0.6) 2, a sharp one's (0.85) 1.1, the best's the gun's own as
   * a player's is. (It was 1 + 4.5 (1 − skill), and left the best bots short
   * of a player at mid range by up to 13 points, the same ships set beside
   * each other: PLAN A3, tools/harness/aim.ts --against.)
   */
  unsteady: 6,
  /**
   * The share of that unsteadiness each gun's spread takes: a scatter's a
   * third, its charge already wide whatever her hand (a shotgun forgives a
   * shaky one; with all of it a green captain's grape went off within half a
   * radian, 15 m either side at 30 m, most of it past the hull).
   */
  shake: {
    cannon: 1,
    scatter: 1 / 3,
    repeater: 1,
    harpoon: 1,
    mortar: 1,
  } satisfies Record<GunKind, number>,
  /**
   * Her eye aloft, metres over the sea, from which she sights the gun on her
   * mark.
   */
  aloft: 20,
} as const;

/**
 * How she fights her guns: her brain's to choose (brain.ts gunnery), as an
 * aggressive captain holds closer and fires longer bursts. Seconds and metres.
 */
export const GUNNERY = {
  /**
   * The range she holds with each gun in hand, m (the cannon's 95, the rest
   * where each does most), by her temperament's standoff; closer than `inside`
   * of it, she opens out to `out` of it. Round the ring she makes for a point
   * `swing` rad on from where she lies.
   */
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
  /**
   * Her stance with each gun (PLAN W3): 0, she makes for her ring at a turn's
   * pace whatever her gun; else, with that gun loaded she closes on her ring
   * flat out, and reloading she stands off at this many times it (the scatter
   * is a gun to rush in with and get out again).
   */
  rush: {
    cannon: 0,
    scatter: 0,
    repeater: 0,
    harpoon: 0,
    mortar: 0,
  } satisfies Record<GunKind, number>,
  /**
   * Choosing her gun: another is taken in hand when it would do `swap` times
   * what the one in hand does; a gun reloading counts for `reloading` of
   * itself; with no foe she weighs them at `idle` m.
   */
  swap: 1.3,
  reloading: 0.5,
  idle: 100,
  /**
   * She swings the other way round every `weave` s, a sharp captain sooner by
   * up to 0.6 of it.
   */
  weave: [4, 9] as const,
  /**
   * She fires within this share of each gun's range (holding a gun that sprays
   * till she is nearer: PLAN W3), in bursts of `burst` s with pauses of `pause`
   * s (`pauses`).
   */
  reach: {
    cannon: 0.95,
    scatter: 0.95,
    repeater: 0.95,
    harpoon: 0.95,
    mortar: 0.95,
  } satisfies Record<GunKind, number>,
  burst: [1.5, 4] as const,
  pause: [0.8, 2.2] as const,
  /**
   * Whether she pauses between bursts with each gun: not with a scatter, a
   * gun fired once a second that does all it does close, where a pause is a
   * volley lost and her foe gone out of reach.
   */
  pauses: {
    cannon: true,
    scatter: false,
    repeater: true,
    harpoon: true,
    mortar: true,
  } satisfies Record<GunKind, boolean>,
} as const;

/** What her gunnery carries from one step to the next. */
export interface Gunner {
  /** When (her clock, s) she may first fire on the foe she has. */
  react: number;
  /**
   * Her error: where it is and where it wanders to (tangents, up to 1), and
   * seconds till it wanders on.
   */
  err: Vec3;
  errTo: Vec3;
  errT: number;
  /** Seconds left in a burst (> 0) or in a pause (< 0); 0 before the first. */
  burst: number;
  /**
   * The way she circles her foe (+1 to port, seen from her foe) and seconds
   * till she turns it.
   */
  circle: number;
  circleT: number;
}

/** A gunner who has fired at nothing. */
export const gunner = (): Gunner => ({
  react: 0,
  err: [0, 0, 0],
  errTo: [0, 0, 0],
  errT: 0,
  burst: 0,
  circle: 1,
  circleT: 0,
});

/** A ship as her gunner sees her: her place, heading, way and shove. */
interface Mark {
  ship: ShipState;
  shove?: Vec3;
}

const between = (draw: () => number, [lo, hi]: readonly [number, number]) =>
  lo + (hi - lo) * draw();

/**
 * How many times the gun's own spread her balls go off within, by her skill,
 * with a gun of `kind`.
 */
export const spreadBy = (skill: number, kind: GunKind = 'cannon') =>
  1 + GUNNER.unsteady * GUNNER.shake[kind] * (1 - skill) ** 2;

/** The seconds before she fires on a ship she has just seen, by her skill. */
export const reactTime = (skill: number) =>
  GUNNER.react[0] + (GUNNER.react[1] - GUNNER.react[0]) * skill;

/**
 * Her gunner told of a new ship in her sight at `clock` s: she holds her fire
 * her reaction's time, by her skill.
 */
export const sighted = (g: Gunner, clock: number, skill: number) => {
  g.react = clock + reactTime(skill);
};

/**
 * What a gun of `kind` and `rarity` does to a ship `metres` off, hit points a
 * second: its balls a second over a magazine and its reload (a wind-up's wait
 * in it), less with its fall-off, and with its spread wider than her beam
 * there; none out of its reach.
 */
function suits(g: { kind: GunKind; rarity: number }, metres: number): number {
  const b = GUNS[g.kind];
  if (metres > b.range || metres < b.least) return 0;
  const cycle = b.mag * (b.interval + b.windup) + reloadOf(g),
    across = spreadOf(g) * metres;
  return (
    ((damageOf(g) * b.pellets * b.mag) / cycle) *
    falloff(g.kind, metres) *
    Math.min(1, SHIP.beam / Math.max(1e-9, across))
  );
}

/**
 * The gun slot she would take in hand at `metres` from her foe (null: none, or
 * her gunnery's `idle` with no foe), or null to keep the one she has. Nothing
 * without a crew.
 */
export function armFor(x: Ctx, metres: number | null): number | null {
  const c = x.own.crew,
    t = x.b.gunnery;
  if (!c) return null;
  const d = metres ?? t.idle;
  const score = (i: number) => {
    const g = c.guns[i];
    return g
      ? suits(g, d) * (g.reload > 0 || g.rounds <= 0 ? t.reloading : 1)
      : 0;
  };
  const mine = c.guns[c.hand];
  if (mine && mine.windup > 0) return null;
  let best = c.hand,
    bs = score(c.hand);
  c.guns.forEach((g, i) => {
    if (g && i !== c.hand && score(i) > Math.max(bs * t.swap, mine ? 1e-9 : 0))
      [best, bs] = [i, score(i)];
  });
  // with nothing in hand, any gun she has
  if (!mine && best === c.hand) best = c.guns.findIndex((g) => g !== null);
  return best >= 0 && best !== c.hand ? best : null;
}

/** Whether the gun in her hand is loaded: rounds in it, and not reloading. */
const loaded = (c: Ctx) => {
  const g = c.own.crew ? inHand(c.own.crew) : null;
  return !!g && g.reload <= 0 && g.rounds > 0;
};

/**
 * Whether she rushes her ring with the gun of `kind` in hand: her stance with
 * it (GUNNERY rush), and it loaded.
 */
export const rushing = (c: Ctx, kind: GunKind) =>
  c.b.gunnery.rush[kind] > 0 && loaded(c);

/**
 * Where she makes for in a gun fight with `foe`: a point on the ring of her
 * preferred range with the gun of `kind` round her foe (by her temperament's
 * standoff, and her stance: GUNNERY rush), a little round from where she lies.
 * Turns the way she circles when it is time. Updates her gunner's memory.
 */
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

/**
 * Her gun's orders this step, her gun of `kind` in hand: sighted on where `foe`
 * will be when the ball comes down, with her wandering error, and fired when
 * she is in its range, has got over first seeing her, is in a burst, and isn't
 * told to `hold` it; her balls spread by her skill. With no foe in sight she
 * looks along her heading and holds her fire. Updates her gunner's memory.
 */
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
  /** Her line of sight from aloft onto the sea at `p`. */
  const sight = (p: Vec3): Sight => ({
    from: eye,
    dir: normalize(add(scale(p, R), eye, -1)),
  });
  if (!foe) return { aim: { from: eye, dir: own.heading }, fire: false };
  const d = distance(own.at, foe.ship.at);
  // where she will be: sailing on as she sails now, over the ball's flight
  // there
  const time =
    thrown(kind, Math.max(bore.least, Math.min(d, bore.range)))?.time ?? 0;
  const way = add(
      scale(foe.ship.heading, foe.ship.speed),
      foe.shove ?? [0, 0, 0]
    ),
    speed = length(way);
  const lead =
    speed > 1e-9
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
    return { aim, fire: false };
  // bursts: firing whenever loaded through one, holding fire through the pause
  // after it (with a gun she doesn't pause with, firing whenever loaded)
  if (!t.pauses[kind])
    return { aim, fire: true, spread: spreadBy(skill, kind) };
  if (g.burst > 0) {
    g.burst -= dt;
    if (g.burst <= 0) g.burst = -between(draw, t.pause);
  } else if (g.burst < 0) {
    g.burst += dt;
    if (g.burst >= 0) g.burst = between(draw, t.burst);
    return { aim, fire: false };
  } else g.burst = between(draw, t.burst);
  return { aim, fire: true, spread: spreadBy(skill, kind) };
}
