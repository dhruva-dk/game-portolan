import { smoothstep } from '../world/scalar.ts';
import { R, distance, dot, type Vec3 } from '../world/sphere.ts';
import type { Crew } from './battle.ts';
import { ready } from './gust.ts';
import { restored, stowing, useful } from './hold.ts';
import { RARITIES, rankOf } from './kinds.ts';
import type { Loot } from './loot.ts';
import { NOTHING, type Ask } from './stores.ts';
import { toEdge } from './storm.ts';
import { ramp, utility } from './utility.ts';
import type { Ctx } from './captain.ts';
import { clearAt } from './route.ts';

export const PURSER = {
  least: 0.04,
  edge: 10,
  room: 2,
  clear: 60,
  take: 9,
  low: 40,
  far: 120,
  ceded: 0.7,
  patience: 30,
} as const;

export function healSlot(c: Crew): number {
  if (!useful(c.health)) return -1;
  const missing = c.health.most - c.health.hull;
  let best = -1,
    most = -Infinity;
  c.hold.items.forEach((k, i) => {
    if (!k) return;
    const worth =
      restored(k, c.values) >= missing
        ? 2 * RARITIES.length - rankOf(k)
        : rankOf(k);
    if (worth > most) [best, most] = [i, worth];
  });
  return best;
}

function mendNeed(c: Ctx, crew: Crew): number {
  const hull = c.t.mend + 20 * c.t.skill,
    share = (100 * crew.health.hull) / crew.health.most;
  return ramp(share, hull + 8, hull - 8);
}

export const healUrge = (c: Ctx) => {
  const crew = c.own.crew;
  if (!crew) return 0;
  const clear = ramp(c.foeD, 55, 90);
  return healSlot(crew) < 0 ? 0 : utility(mendNeed(c, crew), clear);
};

const worth = (crew: Crew, l: Loot) =>
  stowing(crew.hold, l.heal) >= 0 ? 0.5 : 0;

function nearerTo(others: Ctx['others'], at: Vec3, cos: number): boolean {
  for (let i = 0; i < others.length; i++)
    if (dot(others[i].ship.at, at) > cos) return true;
  return false;
}

export function lootUrge(c: Ctx): number {
  const { m, own, t } = c,
    crew = own.crew,
    pieces = c.sea.loot;
  m.loot = -1;
  if (!crew || !pieces) return 0;
  if (m.mode === 'loot' && m.target >= 0 && m.lootT > c.b.purser.patience)
    [m.shun, m.target] = [m.target, -1];
  const p = own.ship.at,
    within = Math.cos(t.lootReach / R),
    s = c.sea.storm,
    ch = c.sea.chart;
  let best: Loot | null = null,
    bs = 0,
    kept: Loot | null = null;
  for (const l of pieces) {
    if (dot(p, l.at) < within || l.id === m.shun) continue;
    if (s && toEdge(l.at, s) < c.b.purser.edge) continue;
    if (ch && clearAt(ch, l.at) < c.b.purser.room) continue;
    const w = worth(crew, l);
    if (w <= 0) continue;
    const d = distance(p, l.at);
    if (
      d > c.b.purser.take &&
      nearerTo(c.others, l.at, Math.cos((c.b.purser.ceded * d) / R))
    )
      continue;
    if (l.id === m.target) kept = l;
    const score = (w * t.loot) / (1 + d / 60);
    if (score > bs) {
      bs = score;
      best = l;
    }
  }
  if (kept && m.mode === 'loot') {
    m.loot = kept.id;
    return ease(Math.max(bs, 0.1));
  }
  if (bs <= c.b.purser.least || !best) return 0;
  m.loot = best.id;
  return ease(bs);
}

const ease = (x: number) => smoothstep(0.05, 0.3, x);

export function lootAct(c: Ctx): Vec3 {
  const { m } = c,
    l = c.sea.loot?.find((k) => k.id === m.loot);
  if (!l) return m.goal;
  if (l.id !== m.target) [m.target, m.lootT] = [l.id, 0];
  return l.at;
}

export const healAct = (c: Ctx, clearOf: (meters: number) => Vec3): Vec3 =>
  (c.own.crew && healSlot(c.own.crew) < 0) || !c.foe
    ? c.own.ship.at
    : clearOf(c.b.purser.clear);

export interface PurseMemory {
  loot: number;
  target: number;
  lootT: number;
  shun: number;
}

export const purseMemory = (): PurseMemory => ({
  loot: -1,
  target: -1,
  lootT: 0,
  shun: -1,
});

export const lootTime = (c: Ctx, dt: number) => {
  if (c.m.mode === 'loot') c.m.lootT += dt;
};

export function purse(c: Ctx): Ask {
  const { m } = c,
    crew = c.own.crew;
  if (!crew) return NOTHING;
  let heal: number | null = null,
    gust = false;
  if (m.mode === 'heal' && !crew.hold.using) {
    const s = healSlot(crew);
    if (s >= 0) heal = s;
  }
  if (ready(crew.gust) && !crew.hold.using) {
    const fleeing = m.mode === 'flee' || m.mode === 'storm';
    const run =
      fleeing && (crew.gust.charges >= 2 || crew.health.hull < c.b.purser.low);
    if (
      run ||
      (m.mode === 'fight' && distance(c.own.ship.at, m.goal) > c.b.purser.far)
    )
      gust = true;
  }
  return heal === null && !gust ? NOTHING : { heal, gust };
}
