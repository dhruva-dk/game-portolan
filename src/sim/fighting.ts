import { along, distance, dot, toward, type Vec3 } from '../world/sphere.ts';
import { toEdge } from './storm.ts';
import { logistic, ramp, utility } from './utility.ts';
import { aggroOf, mate, open, rotate, type Ctx, type Seen } from './captain.ts';
import { ranFromShip } from './logbook.ts';
import { hidden } from './lookout.ts';
import { keptInside } from './storming.ts';

export const MIND = {
  grudge: 5,
  roused: 0.4,
  cool: 3,
  fresh: 3,
  crowd: 150,
  crowding: 0.25,
  beaten: 0.25,
  will: 0.35,
  willWidth: 0.1,
  closeFrom: 50,
  closeAt: 35,
  letGo: 90,
  outrun: [0.75, 0.95] as const,
  outran: [0.55, 0.75] as const,
  run: 120,
  cover: 180,
  rings: 3,
  wide: Math.PI / 3,
  gain: 0.6,
  restraint: [0.5, 0.5, 0.45, 0.35, 0.25, 0.1, 0, 0] as const,
  lastFew: 3,
  more: 0.4,
  shotFresh: 5,
  won: 0.2,
  hurt: 0.45,
  settle: 45,
  band: 0.5,
} as const;

export interface MoodMemory {
  heat: number;
  hurt: number;
  won: number;
}
export const moodMemory = (): MoodMemory => ({ heat: 0, hurt: 0, won: 0 });

export const wounded = <M extends MoodMemory>(m: M, damage: number): M => ({
  ...m,
  hurt: m.hurt + damage,
});

export const sank = <M extends MoodMemory>(m: M): M => ({
  ...m,
  won: m.won + 1,
});

export function mood(c: Ctx, dt: number): void {
  const { m } = c,
    k = c.b.mind;
  if (m.heat === 0 && m.hurt === 0 && m.won === 0) return;
  const heat =
    m.heat * Math.pow(0.5, dt / k.settle) +
    k.won * m.won -
    (k.hurt * m.hurt) / 100;
  m.heat = Math.max(-k.band, Math.min(k.band, heat));
  m.hurt = 0;
  m.won = 0;
}

export function fightUrge(c: Ctx): number {
  const { m, t, foe, own } = c;
  if (!foe) return 0;
  const d = c.foeD;
  let will = t.fight * (0.6 + 0.4 * aggroOf(c));
  const strength = (s: Seen) => s.hull + s.shield;
  will += ((0.1 + 0.5 * t.skill) * (strength(own) - strength(foe))) / 100;
  if (m.hitBy === foe.id)
    will +=
      c.b.mind.roused *
      ramp(m.clock - m.hitT, c.b.mind.grudge + c.b.mind.cool, c.b.mind.cool);
  for (const o of c.others)
    if (
      o.id !== foe.id &&
      !mate(c, o) &&
      distance(own.ship.at, o.ship.at) < c.b.mind.crowd
    )
      will -= c.b.mind.crowding * t.skill;
  if (strength(foe) >= strength(own) && ranFromShip(c, foe.id))
    will -= c.b.mind.beaten;
  const restraint = holdBack(c);
  will -= restraint;
  const close = ramp(
    d,
    c.b.mind.closeFrom - 50 * restraint,
    c.b.mind.closeAt - 50 * restraint
  );
  if (close >= 1) return 1;
  const from = toward(foe.ship.at, own.ship.at),
    off = from ? -dot(foe.ship.heading, from) : 0;
  const past = ramp(d, c.b.mind.letGo - 10, c.b.mind.letGo + 15);
  const go = !own.armed
    ? 1 -
      past *
        ramp(
          (off * foe.ship.speed) / own.crew.values.topSpeed,
          ...(m.mode === 'fight' ? c.b.mind.outrun : c.b.mind.outran)
        )
    : restraint > 0
      ? 1 -
        past *
          (m.mode === 'fight' ? ramp(off, 0, 0.35) : ramp(off, -0.45, -0.15))
      : 1;
  return Math.max(
    close,
    utility(logistic(will, c.b.mind.will, c.b.mind.willWidth), go)
  );
}

function holdBack(c: Ctx): number {
  const s = c.sea.storm;
  const by = s
    ? c.b.mind.restraint[Math.min(s.phase, c.b.mind.restraint.length - 1)]
    : 0;
  if (by <= 0) return 0;
  return c.others.length + 1 <= c.b.mind.lastFew ? by + c.b.mind.more : by;
}

export const holdsFire = (c: Ctx) =>
  c.m.mode !== 'fight' &&
  holdBack(c) > 0 &&
  !(
    c.foe &&
    c.m.shotBy === c.foe.id &&
    c.m.clock - c.m.shotT < c.b.mind.shotFresh &&
    c.foeD < c.b.mind.letGo
  );

const losing = (c: Ctx) =>
  c.foe
    ? utility(
        ramp(c.own.hull, c.t.run + 8, c.t.run - 4),
        ramp(c.foeD, 160, 130)
      )
    : 0;

function evading(c: Ctx): number {
  const { m } = c;
  if (
    !c.foe ||
    c.foeD >= 140 ||
    m.hitBy !== c.foe.id ||
    m.clock - m.hitT > c.b.mind.fresh
  )
    return 0;
  return utility(1 - fightUrge(c), 0.3 + 0.7 * c.t.helm);
}

export const fleeUrge = (c: Ctx) => Math.max(losing(c), evading(c));

export const fleeGoal = (c: Ctx): Vec3 =>
  keptInside(c, cover(c, c.m.last) ?? away(c, c.m.last, c.b.mind.run));

export function away(c: Ctx, from: Vec3, d: number): Vec3 {
  const p = c.own.ship.at,
    t = toward(from, p) ?? c.own.ship.heading;
  const out =
    toward(p, along(from, t, distance(from, p) + 1).p) ?? c.own.ship.heading;
  for (let k = 0; k <= 8; k++) {
    const q = along(
      p,
      rotate(p, out, (k % 2 ? 1 : -1) * Math.ceil(k / 2) * (Math.PI / 8)),
      d
    ).p;
    if (open(c, q)) return q;
  }
  return along(p, out, d).p;
}

function cover(c: Ctx, from: Vec3): Vec3 | null {
  const { m } = c,
    p = c.own.ship.at,
    s = c.sea.storm,
    most = c.b.mind.cover,
    rings = c.b.mind.rings,
    now = distance(from, p);
  if (most <= 0) return null;
  const good = (q: Vec3, gain: number) =>
    distance(from, q) > now + gain &&
    open(c, q) &&
    (!s || toEdge(q, s) > c.t.margin) &&
    hidden(c, from, q);
  if (m.mode === 'flee' && good(m.goal, 0)) return m.goal;
  const out = toward(from, p) ?? c.own.ship.heading,
    off = toward(p, along(from, out, now + 1).p) ?? c.own.ship.heading;
  for (let r = 1; r <= rings; r++) {
    const d = (r * most) / rings;
    for (let k = 0; k < 12; k++) {
      const a = (k % 2 ? 1 : -1) * Math.ceil(k / 2) * (Math.PI / 6);
      if (Math.abs(a) > c.b.mind.wide + 1e-9) break;
      const q = along(p, rotate(p, off, a), d).p;
      if (good(q, d * c.b.mind.gain)) return q;
    }
  }
  return null;
}
