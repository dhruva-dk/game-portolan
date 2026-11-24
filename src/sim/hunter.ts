import {
  R,
  along,
  distance,
  dot,
  normalize,
  toward,
  type Vec3,
} from '../world/sphere.ts';
import type { Shot } from './battle.ts';
import { toEdge } from './storm.ts';
import { ramp, utility } from './utility.ts';
import { aggroOf, type Ctx } from './captain.ts';
import { hurtNear, prey, shunned } from './logbook.ts';

const RINGS = 6;

export interface Report {
  at: Vec3;
  by: number;
  t: number;
}

export function heard(
  was: readonly Report[],
  shots: readonly Shot[],
  now: number
): Report[] {
  const out = was.filter(
    (r) => now - r.t < RINGS && !shots.some((s) => s.shooter === r.by)
  );
  for (const s of shots) {
    if (out.some((r) => r.by === s.shooter)) continue;
    out.push({ at: normalize(s.from), by: s.shooter, t: now });
  }
  return out;
}

export const HUNTING = {
  earshot: 500,
  far: 450,
  near: 150,
  weak: 70,
  whole: 140,
  keep: 20,
  arrive: 45,
  rest: 15,
  edge: 20,
  standoff: 0,
  stand: 250,
  wait: 25,
  by: 150,
} as const;

export interface HuntMemory {
  hunt: Vec3 | null;
  huntT: number;
  waitT: number;
  restT: number;
}

export const huntMemory = (): HuntMemory => ({
  hunt: null,
  huntT: -Infinity,
  waitT: -Infinity,
  restT: -Infinity,
});

function nearest(c: Ctx): Report | null {
  const p = c.own.ship.at,
    reports = c.sea.gunfire,
    s = c.sea.storm,
    within = Math.cos(c.b.hunting.earshot / R);
  if (!reports) return null;
  let best: Report | null = null,
    bd = -Infinity;
  for (const r of reports) {
    if (r.by === c.own.id) continue;
    const d = dot(p, r.at);
    if (d < within || d <= bd) continue;
    if (s && toEdge(r.at, s) < c.b.hunting.edge) continue;
    if (shunned(c, r.at)) continue;
    [best, bd] = [r, d];
  }
  return best;
}

const giveUp = (c: Ctx) => {
  c.m.hunt = null;
  c.m.restT = c.m.clock;
};

export function huntUrge(c: Ctx): number {
  const { m, own, t } = c,
    h = c.b.hunting;
  if (c.foe || m.clock - m.restT < h.rest) return 0;
  const r = nearest(c);
  if (r) {
    if (!m.hunt) m.waitT = m.clock;
    [m.hunt, m.huntT] = [r.at, m.clock];
  } else if (
    m.hunt &&
    (m.clock - m.huntT > h.keep || distance(own.ship.at, m.hunt) < h.arrive)
  )
    giveUp(c);
  if (!m.hunt && !r) {
    const w = prey(c);
    if (w) [m.hunt, m.huntT, m.waitT] = [w.at, m.clock, -Infinity];
  }
  if (!m.hunt) return 0;
  const strength = own.hull + own.shield;
  return utility(
    t.fight * (0.6 + 0.4 * aggroOf(c)),
    ramp(strength, h.weak, h.whole),
    ramp(distance(own.ship.at, m.hunt), h.far, h.near)
  );
}

export function huntAct(c: Ctx): Vec3 {
  const { m } = c,
    h = c.b.hunting,
    p = c.own.ship.at;
  if (!m.hunt) return m.goal;
  const waiting =
    h.standoff > 0 &&
    m.huntT === m.clock &&
    m.clock - m.waitT < h.wait &&
    !hurtNear(c, m.hunt, h.by);
  if (!waiting) return m.hunt;
  const from = toward(m.hunt, p);
  return from ? along(m.hunt, from, h.stand).p : m.hunt;
}
