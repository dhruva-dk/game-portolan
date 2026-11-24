import { smoothstep } from '../world/scalar.ts';
import { R, distance, dot, type Vec3 } from '../world/sphere.ts';
import { armed, type Crew } from './battle.ts';
import { ready } from './gust.ts';
import type { Gun } from './gun.ts';
import type { GunKind } from '../kinds.ts';
import { roomFor, useful, type Use } from './hold.ts';
import { isArms, type Loot } from './loot.ts';
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
  bare: 2,
  other: 0.7,
} as const;

const WORTH: Record<Use, (c: Crew) => number> = {
  fullRepair: (c) => (c.health.hull < 45 ? 4 : 0),
  repairKit: (c) => (c.health.hull < 75 ? 3 : 0),
  bigShield: (c) => (c.health.shield < 50 ? 2.5 : 0),
  smallShield: (c) => (c.health.shield < 50 ? 2 : 0),
};

export function healSlot(c: Crew): number {
  let best = -1,
    bv = 0;
  c.hold.items.forEach((s, i) => {
    if (!s || s.count <= 0 || !useful(c.health, s.kind)) return;
    const v = WORTH[s.kind](c);
    if (v > bv) [bv, best] = [v, i + 1];
  });
  return best;
}

function mendNeed(c: Ctx, crew: Crew): number {
  const hull = c.t.mend + 20 * c.t.skill,
    shield = 25 + 25 * c.t.skill;
  return Math.max(
    ramp(crew.health.hull, hull + 8, hull - 8),
    ramp(crew.health.shield, shield + 8, shield - 8)
  );
}

export const healUrge = (c: Ctx) => {
  const crew = c.own.crew;
  if (!crew) return 0;
  const clear = ramp(c.foeD, 55, 90);
  return healSlot(crew) < 0 ? 0 : utility(mendNeed(c, crew), clear);
};

function pairWorth(
  guns: readonly (Pick<Gun, 'kind' | 'rarity'> | null)[],
  other: number
): number {
  const [a, b] = guns
    .filter((g) => g !== null)
    .map((g) => ({ kind: g.kind, v: 1 + 0.2 * g.rarity }))
    .sort((x, y) => y.v - x.v);
  return !a ? 0 : a.v + (b ? (b.kind === a.kind ? 0.1 : other) * b.v : 0);
}

export function weaponWorth(
  guns: readonly (Gun | null)[],
  kind: GunKind,
  rarity: number,
  other: number
): { worth: number; slot: number } {
  const now = pairWorth(guns, other);
  let best = { worth: 0, slot: -1 };
  guns.forEach((_, i) => {
    const w =
      pairWorth(
        guns.map((g, k) => (k === i ? { kind, rarity } : g)),
        other
      ) - now;
    if (
      w > best.worth + 1e-9 &&
      (guns[i] === null || guns.every((g) => g !== null))
    )
      best = { worth: w, slot: i };
  });
  return best;
}

function worth(c: Ctx, crew: Crew, l: Loot): number {
  const g = l.goods;
  if (isArms(g))
    return (
      weaponWorth(crew.guns, g.kind, g.rarity, c.b.purser.other).worth *
      (armed(crew) ? 1 : c.b.purser.bare)
    );
  return roomFor(crew.hold, g.kind) >= 0 ? 0.5 : 0;
}

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
    const w = worth(c, crew, l);
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
  let tap: number | null = null,
    take: number | null = null,
    arm: number | null = null,
    gust = false;
  if (m.mode === 'heal' && !crew.hold.using) {
    const s = healSlot(crew);
    if (s >= 0) tap = s;
  }
  if (
    m.mode === 'loot' &&
    m.target >= 0 &&
    crew.guns.every((g) => g !== null)
  ) {
    const l = c.sea.loot?.find((k) => k.id === m.target);
    const w =
      l && isArms(l.goods)
        ? weaponWorth(crew.guns, l.goods.kind, l.goods.rarity, c.b.purser.other)
        : null;
    if (
      l &&
      w &&
      w.worth > 0 &&
      distance(c.own.ship.at, l.at) < c.b.purser.take
    )
      [take, arm] = [0, w.slot === crew.hand ? null : w.slot];
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
  return tap === null && take === null && !gust
    ? NOTHING
    : { tap, arm, take, gust };
}
