// A bot's gun (bot.ts): 0117's aimAndFire and fightCourse (src/sim/captains/brain.ts), for the one gun this sea has.
//
// In a gun fight she holds the gun's preferred range rather than ramming: she makes for a point on a ring that far
// round her foe, a little round from where she lies, and swings the other way round it now and then, a sharp captain
// more often, so she is hard to lead. (0117's working round to windward is left: the wind here doesn't drive a ship.)
//
// She lays her gun on where her foe will be when the ball comes down, with a wandering error that a sharp captain
// keeps to a sixth of a green one's, and fires when her foe is in range, past the moment's surprise of first seeing
// her, and in a burst, not in the pause between two. She sights it from aloft (her eye `aloft` m up her mast) on the
// sea at that mark, and the gun's aim assist (gun.ts) takes her line of sight as it takes a player's, so her error
// mostly shows past the edge of its cone; and her hand is unsteadier than she thinks, a green captain's balls
// spreading wider than a sharp one's (0117's combat.ts fire).
//
// Pure arithmetic: no three, so it runs in node for the tests; deterministic for the same inputs.

import { R, add, along, cross, distance, dot, length, normalize, place, scale, type Vec3 } from '../world/sphere.ts';
import type { Order } from './battle.ts';
import { GUN } from './handling.ts';
import type { ShipState } from './ship.ts';
import { flightTime, elevationFor } from './shot.ts';
import type { Sight } from './sight.ts';

/** Everything a bot's gunnery is tuned by: 0117's (BRAIN), seconds and metres. */
export const GUNNER = {
  /** Seconds before a green, and a sharp, captain first fires on a ship she has just seen. */
  react: [2.2, 0.3] as const,
  /** The range she holds, m (0117's cannon's), by her temperament's standoff; closer than `inside` of it, she opens out
   *  to `out` of it. Round the ring she makes for a point `swing` rad on from where she lies. */
  pref: 95, inside: 0.6, out: 1.2, swing: 0.5,
  /** She swings the other way round every `weave` s, a sharp captain sooner by up to 0.6 of it. */
  weave: [4, 9] as const,
  /** Her error, as a share of the distance, for a green captain; a sharp one's a sixth of it. It wanders to a new mark
   *  every `wander` s, and follows it at 2 a second. */
  error: 0.2, wander: [0.6, 1.4] as const,
  /** She fires within this share of the gun's range, in bursts of `burst` s with pauses of `pause` s. */
  reach: 0.95, burst: [1.5, 4] as const, pause: [0.8, 2.2] as const,
  /** Her hand is less steady than she thinks (0117's combat.ts fire): her balls spread 1 + `unsteady` × (1 − skill)
   *  times the gun's own. (2.5 when a common gun spread 0.05; with it 0.03, 4.5 keeps the bots' balls striking home
   *  as often over a match, some 85 in 100, tools/matches.ts.) */
  unsteady: 4.5,
  /** Her eye aloft, metres over the sea, from which she sights the gun on her mark. */
  aloft: 20,
} as const;

/** What her gunnery carries from one step to the next. */
export interface Gunner {
  /** When (her clock, s) she may first fire on the foe she has. */
  react: number;
  /** Her error: where it is and where it wanders to (tangents, up to 1), and seconds till it wanders on. */
  err: Vec3;
  errTo: Vec3;
  errT: number;
  /** Seconds left in a burst (> 0) or in a pause (< 0); 0 before the first. */
  burst: number;
  /** The way she circles her foe (+1 to port, seen from her foe) and seconds till she turns it. */
  circle: number;
  circleT: number;
}

/** A gunner who has fired at nothing. */
export const gunner = (): Gunner => ({ react: 0, err: [0, 0, 0], errTo: [0, 0, 0], errT: 0, burst: 0, circle: 1, circleT: 0 });

/** A ship as her gunner sees her: her place, heading, way and shove. */
interface Mark { ship: ShipState; shove?: Vec3 }

/** The unit tangent at p toward q, or null at q. */
const toward = (p: Vec3, q: Vec3): Vec3 | null => {
  const t = add(q, p, -dot(p, q)), l = length(t);
  return l > 1e-12 ? scale(t, 1 / l) : null;
};
const between = (draw: () => number, [lo, hi]: readonly [number, number]) => lo + (hi - lo) * draw();

/** How many times the gun's own spread her balls go off within, by her skill (0117's). */
export const spreadBy = (skill: number) => 1 + GUNNER.unsteady * (1 - skill);

/** The seconds before she fires on a ship she has just seen, by her skill (0117's reactTime). */
export const reactTime = (skill: number) => GUNNER.react[0] + (GUNNER.react[1] - GUNNER.react[0]) * skill;

/**
 * Where she makes for in a gun fight with `foe` (0117's fightCourse): a point on the ring of her preferred range
 * round her foe, a little round from where she lies. Turns the way she circles when it is time. Updates `g`.
 */
export function ring(g: Gunner, at: Vec3, foe: Mark, standoff: number, skill: number, draw: () => number, dt: number): Vec3 {
  g.circleT -= dt;
  if (g.circleT <= 0) {
    g.circle = -g.circle;
    g.circleT = between(draw, GUNNER.weave) * (1 - 0.6 * skill);
  }
  const pref = GUNNER.pref * standoff, f = foe.ship.at;
  const out = toward(f, at) ?? scale(foe.ship.heading, -1);
  const round = add(scale(out, Math.cos(GUNNER.swing)), cross(f, out), g.circle * Math.sin(GUNNER.swing));
  return along(f, round, distance(at, f) < pref * GUNNER.inside ? pref * GUNNER.out : pref).p;
}

/**
 * Her gun's orders this step (0117's aimAndFire): sighted on where `foe` will be when the ball comes down, with her
 * wandering error, and fired when she is in range, has got over first seeing her, is in a burst, and isn't told to
 * `hold` it; her balls spread by her skill. With no foe in sight she looks along her heading and holds her fire. `clock` is hers (s). Updates `g`.
 */
export function aimAndFire(g: Gunner, own: ShipState, foe: Mark | null, clock: number, skill: number, draw: () => number, dt: number, hold = false): Order {
  const eye = place(own.at, GUNNER.aloft);
  /** Her line of sight from aloft onto the sea at `p`. */
  const sight = (p: Vec3): Sight => ({ from: eye, dir: normalize(add(scale(p, R), eye, -1)) });
  if (!foe) return { aim: { from: eye, dir: own.heading }, fire: false };
  const d = distance(own.at, foe.ship.at);
  // where she will be: sailing on as she sails now, over the ball's flight there
  const e = elevationFor(Math.min(d, GUN.range)) ?? 0;
  const way = add(scale(foe.ship.heading, foe.ship.speed), foe.shove ?? [0, 0, 0]), speed = length(way);
  const lead = speed > 1e-9 ? along(foe.ship.at, scale(way, 1 / speed), speed * flightTime(e)).p : foe.ship.at;
  g.errT -= dt;
  if (g.errT <= 0) {
    g.errT = between(draw, GUNNER.wander);
    const a = 2 * Math.PI * draw(), k = draw(), t = toward(lead, own.at) ?? own.heading;
    g.errTo = scale(add(scale(t, Math.cos(a)), cross(lead, t), Math.sin(a)), k);
  }
  g.err = add(g.err, add(g.errTo, g.err, -1), Math.min(1, 2 * dt));
  const miss = GUNNER.error * (1 - 0.85 * skill) * d;
  const mark = normalize(add(lead, g.err, miss / R));
  const aim = sight(mark);
  if (d > GUN.range * GUNNER.reach || clock < g.react || hold) return { aim, fire: false };
  // bursts: firing whenever loaded through one, holding fire through the pause after it
  if (g.burst > 0) {
    g.burst -= dt;
    if (g.burst <= 0) g.burst = -between(draw, GUNNER.pause);
  } else if (g.burst < 0) {
    g.burst += dt;
    if (g.burst >= 0) g.burst = between(draw, GUNNER.burst);
    return { aim, fire: false };
  } else g.burst = between(draw, GUNNER.burst);
  return { aim, fire: true, spread: spreadBy(skill) };
}
