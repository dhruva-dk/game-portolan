import { R, apart, distance, dot, type Vec3 } from '../world/sphere.ts';
import type { GunKind } from './kinds.ts';
import { eye, hidden } from './lookout.ts';
import { mate, type Ctx } from './captain.ts';

export const LOGBOOK = {
  fade: 60,
  most: 8,
  wounded: 0.5,
  prey: 350,
  shun: 150,
} as const;

interface Sighting {
  readonly id: number;
  readonly at: Vec3;
  readonly strength: number;
  readonly gun: GunKind | null;
  readonly t: number;
  readonly fled: number;
}

export interface LogMemory {
  log: Sighting[];
}

export const logMemory = (): LogMemory => ({ log: [] });

const strengthOf = (c: Ctx) => c.own.hull + c.own.shield;

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
    if (mate(c, o)) continue;
    if (apart(own.ship.at, o.ship.at, far)) continue;
    if (distance(own.ship.at, o.ship.at) > far) continue;
    if (hidden(c, own.ship.at, o.ship.at)) continue;
    seen.push({
      id: o.id,
      at: o.ship.at,
      strength: o.hull + o.shield,
      gun: o.crew ? o.crew.gun.kind : null,
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

const ranFrom = (s: Sighting) => s.fled > -Infinity;

export const ranFromShip = (c: Ctx, id: number) =>
  c.m.log.some((s) => s.id === id && ranFrom(s));

export function prey(c: Ctx): Sighting | null {
  const lb = c.b.logbook,
    p = c.own.ship.at,
    mine = strengthOf(c);
  let best: Sighting | null = null,
    bd = lb.prey;
  for (const s of c.m.log) {
    if (s.t === c.m.clock || s.t <= c.m.restT || ranFrom(s)) continue;
    if (s.strength > lb.wounded * mine) continue;
    const d = distance(p, s.at);
    if (d < bd) [best, bd] = [s, d];
  }
  return best;
}

export function shunned(c: Ctx, q: Vec3): boolean {
  const within = Math.cos(c.b.logbook.shun / R);
  return c.m.log.some((s) => ranFrom(s) && dot(q, s.at) > within);
}

export function hurtNear(c: Ctx, q: Vec3, meters: number): boolean {
  const within = Math.cos(meters / R),
    weak = c.b.logbook.wounded * strengthOf(c);
  return c.m.log.some((s) => s.strength <= weak && dot(q, s.at) > within);
}

export function knownNear(c: Ctx, q: Vec3, meters: number): number {
  const within = Math.cos(meters / R);
  return c.m.log.filter((s) => dot(q, s.at) > within).length;
}
