// A bot's tactician, every step: where she makes for this step, for what she means
// (captain.ts Intent). With no foe in sight, her goal. With one:
// - unarmed, the ship she would ram, struck on her side, led for where she will
//   be, not only in passing; once her hull touches her foe's, bearing away a
//   while (a ram's blow lands once until they are RAM.rearm clear);
// - armed, a mark on the ring round her foe at her gun's range (gunner.ts).
// What she makes for is handed on as a Mark: the place a route round land is
// found to (pilot.ts), the way she would steer were the water clear, how
// far it is, and the pace she makes it at (helmsman.ts).
//
// Pure arithmetic: no three, so it runs in node for the tests; deterministic
// for the same inputs, to the bit.

import {
  add,
  cross,
  distance,
  dot,
  length,
  scale,
  toward,
  transport,
  type Vec3,
} from '../world/sphere.ts';
import { inHand } from './battle.ts';
import { gap } from './contact.ts';
import { SHIP } from './handling.ts';
import { ring } from './gunner.ts';
import {
  inSight,
  velocity,
  type Ctx,
  type Intent,
  type Seen,
} from './captain.ts';

/** What her tactician carries: seconds left bearing away from a ram. */
export interface TacticMemory {
  recoil: number;
}

/** A tactician's memory as she puts to sea. */
export const tacticMemory = (): TacticMemory => ({ recoil: 0 });

/**
 * Ramming: the lead is at most `lead` s; from further than `commit` m, a ship
 * she lies more than `abeam` (cosine) ahead or astern of is come at by way of a
 * point off her beam, half the way out, `offMin`–`offMax` m; once her hull
 * touches her foe's, she bears away for `recoil` s.
 */
export const RAMMING = {
  lead: 8,
  commit: 25,
  abeam: 0.5,
  offMin: 15,
  offMax: 50,
  recoil: 3,
} as const;

/**
 * How she makes what she makes for: `ram`, flat out whatever the turn; `turn`,
 * slowed to make a mark inside her turning circle; `gently`, and easing up
 * near it as well.
 */
export type Pace = 'ram' | 'turn' | 'gently';

/**
 * What she makes for this step: the place a route round land is found to (null:
 * none, she steers `aim` whatever lies there); the way she steers were the
 * water to it clear (a tangent at her place; null: none); metres to it; her
 * pace.
 */
export interface Mark {
  at: Vec3 | null;
  aim: Vec3 | null;
  distance: number;
  pace: Pace;
}

/**
 * Where to steer to ram `foe` on her side: led for where she will be, by way of
 * her beam when she is end on. A tangent at her place.
 */
function ramCourse(c: Ctx, foe: Seen): Vec3 {
  const p = c.own.ship.at,
    d = c.foeD,
    t = toward(p, foe.ship.at);
  if (!t) return c.own.ship.heading;
  const r = scale(t, d),
    v = transport(velocity(foe), foe.ship.at, p),
    s = SHIP.top;
  // the soonest she can be where the foe is: |r + v·τ| = s·τ
  const a = dot(v, v) - s * s,
    b = 2 * dot(r, v),
    disc = b * b - 4 * a * d * d;
  let tau = d / s;
  if (disc >= 0 && Math.abs(a) > 1e-9) {
    const roots = [
      (-b - Math.sqrt(disc)) / (2 * a),
      (-b + Math.sqrt(disc)) / (2 * a),
    ].filter((x) => x > 0);
    if (roots.length) tau = Math.min(...roots);
  }
  let aim = add(r, v, Math.min(tau, c.b.ramming.lead));
  const reach = length(aim);
  if (reach > c.b.ramming.commit) {
    const h = transport(foe.ship.heading, foe.ship.at, p),
      port = cross(p, h),
      back = scale(aim, -1 / reach);
    const aside = Math.min(
      c.b.ramming.offMax,
      Math.max(c.b.ramming.offMin, reach / 2)
    );
    if (Math.abs(dot(back, h)) > c.b.ramming.abeam)
      aim = add(aim, port, Math.sign(dot(back, port) || 1) * aside);
  }
  return aim;
}

/**
 * What she makes for this step of dt seconds, for what she means. Updates her
 * memory (her recoil, and her gun's ring).
 */
export function mark(c: Ctx, intent: Intent, dt: number): Mark {
  const { m, own } = c,
    ship = own.ship;
  const foe = intent.foe >= 0 && inSight(c) ? c.foe : null;
  if (foe && gap(ship, foe.ship) < 1) m.recoil = c.b.ramming.recoil;
  m.recoil = Math.max(0, m.recoil - dt);
  if (foe && m.recoil > 0) {
    const at = toward(ship.at, foe.ship.at);
    return {
      at: null,
      aim: at && scale(at, -1),
      distance: c.foeD,
      pace: 'ram',
    };
  }
  const held = own.crew ? inHand(own.crew) : null;
  const ringed = foe && held ? ring(c, foe, held.kind, dt) : null;
  if (ringed)
    return {
      at: ringed,
      aim: toward(ship.at, ringed),
      distance: distance(ship.at, ringed),
      pace: 'turn',
    };
  if (foe)
    return {
      at: foe.ship.at,
      aim: ramCourse(c, foe),
      distance: c.foeD,
      pace: 'ram',
    };
  return {
    at: intent.goal,
    aim: toward(ship.at, intent.goal),
    distance: distance(ship.at, intent.goal),
    pace: intent.arrive === 'gently' ? 'gently' : 'turn',
  };
}
