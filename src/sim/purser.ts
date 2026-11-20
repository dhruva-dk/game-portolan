// A bot's stores: what loot she goes for, when she mends, and what she asks of
// her hold and her gust, for two guns and three item slots:
// - mending (heal, 3.5): with something in her slots that would mend her as she
// is, and her hull or shield under what
//   her temperament (and, sharper, sooner) tops up at, while no foe is close; she uses the slot worth most;
// - loot (1.8): the piece within her temperament's reach worth most to her,
// falling off with distance; a gun that
//   betters what she carries (a first gun most, then a second of another kind, then a better of either), things to
//   mend with that go in her slots. With both gun slots full, a gun she reaches she swaps the one it betters most for;
// - gust: running, or making in from the storm, with both charges or her hull
// low; fighting, to close a foe far off. As 80 ships share the sea, a piece a
// ship she can see lies well nearer is left to her, and one gone for longer
// than PURSER.patience s without reaching it is given up and left be, so ships
// don't pile on one piece for ever. And unarmed she wants a gun the more
// (PURSER.bare), as the match ends no other way.
//
// Pure arithmetic: no three, so it runs in node for the tests; deterministic
// for the same inputs, to the bit.

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

/** Everything a bot's stores are tuned by. */
export const PURSER = {
  /**
   * Loot worth less than this isn't gone for; loot nearer the storm's edge than
   * `edge` m isn't either.
   */
  least: 0.04,
  edge: 10,
  /** Mending with a foe about, she makes for open water this far from her. */
  clear: 60,
  /**
   * Within this many m of a better gun she is going for, she swaps hers for it.
   */
  take: 9,
  /**
   * Gust: running with both charges, or her hull under `low`; fighting, with
   * her goal further than `far` m.
   */
  low: 40,
  far: 120,
  /**
   * A piece a ship she sees lies nearer than this share of her distance to it
   * is left to her; one gone for this many s is given up; unarmed, a gun is
   * worth this many times as much.
   */
  ceded: 0.7,
  patience: 30,
  bare: 2,
  /**
   * A second gun of another kind is worth this share of a first (one for each
   * range).
   */
  other: 0.7,
} as const;

/**
 * What each consumable is worth spending now: a full repair on a hull under 45,
 * a kit under 75, a shield under 50.
 */
const WORTH: Record<Use, (c: Crew) => number> = {
  fullRepair: (c) => (c.health.hull < 45 ? 4 : 0),
  repairKit: (c) => (c.health.hull < 75 ? 3 : 0),
  bigShield: (c) => (c.health.shield < 50 ? 2.5 : 0),
  smallShield: (c) => (c.health.shield < 50 ? 2 : 0),
};

/** The item slot (1–3) she should use now, or -1. */
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

/**
 * How much she needs mending: her hull or shield under where she tops it up, by
 * her temperament and skill.
 */
function mendNeed(c: Ctx, crew: Crew): number {
  const hull = c.t.mend + 20 * c.t.skill,
    shield = 25 + 25 * c.t.skill;
  return Math.max(
    ramp(crew.health.hull, hull + 8, hull - 8),
    ramp(crew.health.shield, shield + 8, shield - 8)
  );
}

/**
 * The heal option's score: something to mend with, need of it, and no foe
 * close.
 */
export const healUrge = (c: Ctx) => {
  const crew = c.own.crew;
  return !crew || healSlot(crew) < 0
    ? 0
    : utility(mendNeed(c, crew), ramp(c.foeD, 55, 90));
};

/**
 * What a pair of guns is worth to her: the better, and PURSER.other of the
 * other if it is of another kind (one for each range; 0.1 if not), each 1 and
 * 0.2 a tier.
 */
function pairWorth(
  guns: readonly (Pick<Gun, 'kind' | 'rarity'> | null)[]
): number {
  const [a, b] = guns
    .filter((g) => g !== null)
    .map((g) => ({ kind: g.kind, v: 1 + 0.2 * g.rarity }))
    .sort((x, y) => y.v - x.v);
  return !a
    ? 0
    : a.v + (b ? (b.kind === a.kind ? 0.1 : PURSER.other) * b.v : 0);
}

/**
 * How much a gun of `kind` and `rarity` would better what she carries, and the
 * gun slot it would go in (an empty one, else the one it betters most): worth 0
 * if it wouldn't.
 */
export function weaponWorth(
  guns: readonly (Gun | null)[],
  kind: GunKind,
  rarity: number
): { worth: number; slot: number } {
  const now = pairWorth(guns);
  let best = { worth: 0, slot: -1 };
  guns.forEach((_, i) => {
    const w =
      pairWorth(guns.map((g, k) => (k === i ? { kind, rarity } : g))) - now;
    if (
      w > best.worth + 1e-9 &&
      (guns[i] === null || guns.every((g) => g !== null))
    )
      best = { worth: w, slot: i };
  });
  return best;
}

/**
 * What a piece is worth to her: a gun by weaponWorth (unarmed, PURSER.bare
 * times as much), things to mend with that go in her slots 0.5.
 */
function worth(crew: Crew, l: Loot): number {
  const g = l.goods;
  if (isArms(g))
    return (
      weaponWorth(crew.guns, g.kind, g.rarity).worth *
      (armed(crew) ? 1 : PURSER.bare)
    );
  return roomFor(crew.hold, g.kind) >= 0 ? 0.5 : 0;
}

/**
 * Whether any of `others` lies nearer `at` than the angle whose cosine is
 * `cos`.
 */
function nearerTo(others: Ctx['others'], at: Vec3, cos: number): boolean {
  for (let i = 0; i < others.length; i++)
    if (dot(others[i].ship.at, at) > cos) return true;
  return false;
}

/**
 * The piece she would go for, and its worth by her temperament and its
 * distance; the one she is already going for kept while it is in reach. Notes
 * it in her memory (`loot`).
 */
export function lootUrge(c: Ctx): number {
  const { m, own, t } = c,
    crew = own.crew,
    pieces = c.sea.loot;
  m.loot = -1;
  if (!crew || !pieces) return 0;
  // gone for too long, she gives it up
  if (m.mode === 'loot' && m.target >= 0 && m.lootT > PURSER.patience)
    [m.shun, m.target] = [m.target, -1];
  const p = own.ship.at,
    within = Math.cos(t.lootReach / R),
    s = c.sea.storm;
  let best: Loot | null = null,
    bs = 0,
    kept: Loot | null = null;
  for (const l of pieces) {
    if (dot(p, l.at) < within || l.id === m.shun) continue;
    if (s && toEdge(l.at, s) < PURSER.edge) continue;
    const w = worth(crew, l);
    if (w <= 0) continue;
    const d = distance(p, l.at);
    // a ship well nearer to it is left to take it
    if (
      d > PURSER.take &&
      nearerTo(c.others, l.at, Math.cos((PURSER.ceded * d) / R))
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
  if (bs <= PURSER.least || !best) return 0;
  m.loot = best.id;
  return ease(bs);
}

/** The loot response: smoothly from 0.05 to 0.3 of worth. */
const ease = (x: number) => smoothstep(0.05, 0.3, x);

/** Going for the piece lootUrge chose: it becomes her target, and her goal. */
export function lootAct(c: Ctx): void {
  const { m } = c,
    l = c.sea.loot?.find((k) => k.id === m.loot);
  if (!l) return;
  if (l.id !== m.target) [m.target, m.lootT] = [l.id, 0];
  m.goal = l.at;
}

/**
 * What she asks of her stores this step: mending, the slot worth most; going
 * for a better gun within reach, a swap; a gust to run, to make in from the
 * storm, or to close a foe far off.
 */
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
    // both slots full: the gun it betters most taken in hand, and swapped for
    // it
    const l = c.sea.loot?.find((k) => k.id === m.target);
    const w =
      l && isArms(l.goods)
        ? weaponWorth(crew.guns, l.goods.kind, l.goods.rarity)
        : null;
    if (l && w && w.worth > 0 && distance(c.own.ship.at, l.at) < PURSER.take)
      [take, arm] = [0, w.slot === crew.hand ? null : w.slot];
  }
  if (ready(crew.gust) && !crew.hold.using) {
    const fleeing = m.mode === 'flee' || m.mode === 'storm';
    const run =
      fleeing && (crew.gust.charges >= 2 || crew.health.hull < PURSER.low);
    if (
      run ||
      (m.mode === 'fight' && distance(c.own.ship.at, m.goal) > PURSER.far)
    )
      gust = true;
  }
  return tap === null && take === null && !gust
    ? NOTHING
    : { tap, arm, take, gust };
}
