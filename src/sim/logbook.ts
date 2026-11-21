// A bot's log (PLAN layer 3): the ships she has seen, for a while. Every think
// she notes each ship she can see within her notice (land between hides one,
// as for her lookout): where, how strong (hull and shield), the gun in her
// hand, and when; and a ship she ran from, when. Only what she saw: a ship out
// of sight she knows where she was last, not where she is. A note fades after
// `fade` s. She reads it:
// - to go back for a wounded ship (the hunt: hunter.ts), one weaker than she by
//   far, last seen not far off, not one she ran from;
// - to keep from a ship she ran from: her place for the phase is not where
//   that ship was last seen (placing.ts), nor her hunt;
// - and her place weighs the ships she knows about it (placing.ts foes);
// - and a fight she waits on she falls on once she knows a ship in it is
//   hurt (hunter.ts).
//
// Pure arithmetic: no three, so it runs in node for the tests; deterministic
// for the same inputs, to the bit.

import { R, apart, distance, dot, type Vec3 } from '../world/sphere.ts';
import type { GunKind } from '../kinds.ts';
import { inHand } from './battle.ts';
import { eye, hidden } from './lookout.ts';
import type { Ctx } from './captain.ts';

/** Everything her log is tuned by. Metres and seconds. */
export const LOGBOOK = {
  /** A note kept `fade` s; at most `most` ships. */
  fade: 60,
  most: 8,
  /**
   * A ship she goes back for: no stronger than `wounded` of her own strength,
   * last seen within `prey` m.
   */
  wounded: 0.5,
  prey: 350,
  /** A place or a fight within `shun` m of a ship she ran from she keeps from. */
  shun: 150,
} as const;

/** A ship as she last saw her. */
interface Sighting {
  readonly id: number;
  readonly at: Vec3;
  /** Hull and shield, when seen. */
  readonly strength: number;
  readonly gun: GunKind | null;
  /** When seen; when she ran from her (−∞ never), her clock, s. */
  readonly t: number;
  readonly fled: number;
}

/** What her log carries: the ships she has seen, the latest first. */
export interface LogMemory {
  log: Sighting[];
}

/** A log as she puts to sea: empty. */
export const logMemory = (): LogMemory => ({ log: [] });

/** Her own strength: hull and shield. */
const strengthOf = (c: Ctx) => (c.own.hull ?? 100) + (c.own.shield ?? 0);

/**
 * Notes the ships she sees, and the one she runs from; lets faded notes go.
 */
export function note(c: Ctx): void {
  const { m, own } = c,
    lb = c.b.logbook,
    far = eye(c.t);
  const fresh = m.log.filter(
    (s) => m.clock - s.t <= lb.fade && c.others.some((o) => o.id === s.id)
  );
  const was = (id: number) => fresh.find((s) => s.id === id);
  const seen: Sighting[] = [];
  for (const o of c.others) {
    if (apart(own.ship.at, o.ship.at, far)) continue;
    if (distance(own.ship.at, o.ship.at) > far) continue;
    if (hidden(c, own.ship.at, o.ship.at)) continue;
    const g = o.crew ? inHand(o.crew) : null;
    seen.push({
      id: o.id,
      at: o.ship.at,
      strength: (o.hull ?? 100) + (o.shield ?? 0),
      gun: g ? g.kind : null,
      t: m.clock,
      fled:
        m.mode === 'flee' && m.foe === o.id
          ? m.clock
          : (was(o.id)?.fled ?? -Infinity),
    });
  }
  const rest = fresh.filter((s) => !seen.some((n) => n.id === s.id));
  m.log = [...seen, ...rest].slice(0, lb.most);
}

/** Whether she ran from this ship (her note of it not faded). */
const ranFrom = (s: Sighting) => s.fled > -Infinity;

/** Whether she ran from the ship `id` (her note of it not faded). */
export const ranFromShip = (c: Ctx, id: number) =>
  c.m.log.some((s) => s.id === id && ranFrom(s));

/**
 * A ship she would go back for: weaker than she by far, last seen within her
 * reach, not one she ran from, not in sight now, and seen since she last gave
 * a hunt up (hunter.ts: she looked, and found nothing); the nearest, or null.
 */
export function prey(c: Ctx): Sighting | null {
  const lb = c.b.logbook,
    p = c.own.ship.at,
    mine = strengthOf(c);
  let best: Sighting | null = null,
    bd = lb.prey;
  for (const s of c.m.log) {
    // not in sight now (her lookout has her), nor looked for since last seen
    if (s.t === c.m.clock || s.t <= c.m.restT || ranFrom(s)) continue;
    if (s.strength > lb.wounded * mine) continue;
    const d = distance(p, s.at);
    if (d < bd) [best, bd] = [s, d];
  }
  return best;
}

/** Whether q is near where a ship she ran from was last seen. */
export function shunned(c: Ctx, q: Vec3): boolean {
  const within = Math.cos(c.b.logbook.shun / R);
  return c.m.log.some((s) => ranFrom(s) && dot(q, s.at) > within);
}

/**
 * Whether she knows a ship within `metres` of q at no more than `wounded` of
 * her own strength (hunter.ts: a fight she waits on, worn down).
 */
export function hurtNear(c: Ctx, q: Vec3, metres: number): boolean {
  const within = Math.cos(metres / R),
    weak = c.b.logbook.wounded * strengthOf(c);
  return c.m.log.some((s) => s.strength <= weak && dot(q, s.at) > within);
}

/** How many ships she knows of within `m` metres of q. */
export function knownNear(c: Ctx, q: Vec3, metres: number): number {
  const within = Math.cos(metres / R);
  return c.m.log.filter((s) => dot(q, s.at) > within).length;
}
