// A bot's stores: what loot she goes for, when she mends, and what she asks of
// her hold and her gust, for two guns and three item slots:
// - mending (heal, 3.5): with something in her slots that would mend her as she
// is, and her hull or shield under what
//   her temperament (and, sharper, sooner) tops up at, or faulted (faults.ts), while no foe is close; she uses the
//   slot worth most. With nothing to mend with and her hull low enough for her water to mend, her own water;
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
import { R, along, distance, dot, type Vec3 } from '../world/sphere.ts';
import { armed, type Crew } from './battle.ts';
import { faultsIn, MEND } from './faults.ts';
import { ready } from './gust.ts';
import type { Gun } from './gun.ts';
import type { GunKind } from '../kinds.ts';
import { roomFor, useful, type Use } from './hold.ts';
import { isArms, type Loot } from './loot.ts';
import { NOTHING, type Ask } from './stores.ts';
import { toEdge } from './storm.ts';
import { ramp, utility } from './utility.ts';
import { open, rotate, type Ctx } from './captain.ts';
import { clearAt } from './route.ts';

/** Everything a bot's stores are tuned by. */
export const PURSER = {
  /**
   * Loot worth less than this isn't gone for; loot nearer the storm's edge than
   * `edge` m isn't either.
   */
  least: 0.04,
  edge: 10,
  /**
   * A piece whose water lies fewer than `room` chart cells from the shore
   * (route.ts clearAt, 6.8 m a cell) isn't gone for: she comes on it at speed,
   * and in a cove narrower than her turning circle she would run on to its
   * head and wedge there (shoal.ts lets no hull swing into worse water).
   */
  room: 2,
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
  /**
   * Faulted (faults.ts), her need of mending is at least this by her worst
   * fault (none, minor, major).
   */
  faulted: [0, 0.6, 1] as const,
  /**
   * Under MEND.cap hull, her own water mends her: she makes for it, within
   * `reach` m of her, as much as this (her stores' mending weighs up to 1).
   */
  water: 0.9,
  reach: 150,
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
    ramp(crew.health.shield, shield + 8, shield - 8),
    c.b.purser.faulted[Math.max(...faultsIn(crew))]
  );
}

/** The bearings round her she looks along for her own water, and how many rings out. */
const LOOKS = 8,
  RINGS = 3;
/**
 * The nearest of her own water (territory.ts) within PURSER.reach of her, on
 * LOOKS bearings and RINGS rings: where she is, if she lies in it; null with
 * none.
 */
function ownWater(c: Ctx): Vec3 | null {
  const h = c.sea.holdings,
    { id, ship } = c.own;
  if (!h) return null;
  if (h.ownerAt(ship.at) === id) return ship.at;
  for (let r = 1; r <= RINGS; r++)
    for (let k = 0; k < LOOKS; k++) {
      const way = rotate(ship.at, ship.heading, (2 * Math.PI * k) / LOOKS),
        p = along(ship.at, way, (r * c.b.purser.reach) / RINGS).p;
      if (h.ownerAt(p) === id && open(c, p)) return p;
    }
  return null;
}

/**
 * The heal option's score: something to mend with, need of it, and no foe
 * close; or, her hull under MEND.cap, her own water near (faults.ts tended).
 */
export const healUrge = (c: Ctx) => {
  const crew = c.own.crew;
  if (!crew) return 0;
  const clear = ramp(c.foeD, 55, 90),
    stores = healSlot(crew) < 0 ? 0 : utility(mendNeed(c, crew), clear);
  if (crew.health.hull >= MEND.cap || !ownWater(c)) return stores;
  return Math.max(
    stores,
    c.b.purser.water *
      utility(ramp(crew.health.hull, MEND.cap, MEND.cap - 10), clear)
  );
};

/**
 * What a pair of guns is worth to her: the better, and PURSER.other of the
 * other if it is of another kind (one for each range; 0.1 if not), each 1 and
 * 0.2 a tier.
 */
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

/**
 * How much a gun of `kind` and `rarity` would better what she carries, and the
 * gun slot it would go in (an empty one, else the one it betters most): worth 0
 * if it wouldn't.
 */
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

/**
 * What a piece is worth to her: a gun by weaponWorth (unarmed, PURSER.bare
 * times as much), things to mend with that go in her slots 0.5.
 */
function worth(c: Ctx, crew: Crew, l: Loot): number {
  const g = l.goods;
  if (isArms(g))
    return (
      weaponWorth(crew.guns, g.kind, g.rarity, c.b.purser.other).worth *
      (armed(crew) ? 1 : c.b.purser.bare)
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
    // a ship well nearer to it is left to take it
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

/** The loot response: smoothly from 0.05 to 0.3 of worth. */
const ease = (x: number) => smoothstep(0.05, 0.3, x);

/**
 * Going for the piece lootUrge chose: it becomes her target, and where it lies
 * her goal (her goal as it was, if it is gone).
 */
export function lootAct(c: Ctx): Vec3 {
  const { m } = c,
    l = c.sea.loot?.find((k) => k.id === m.loot);
  if (!l) return m.goal;
  if (l.id !== m.target) [m.target, m.lootT] = [l.id, 0];
  return l.at;
}

/**
 * Mending: by her stores, where she is, or with a foe about, open water
 * PURSER.clear m from her (found by her mind, `clearOf`); with nothing to mend
 * with, in her own water.
 */
export const healAct = (c: Ctx, clearOf: (metres: number) => Vec3): Vec3 =>
  c.own.crew && healSlot(c.own.crew) < 0
    ? (ownWater(c) ?? c.own.ship.at)
    : c.foe
      ? clearOf(c.b.purser.clear)
      : c.own.ship.at;

/**
 * What her purser carries: the piece she would go for as she last weighed it,
 * the one she is going for and for how many seconds, and the one she gave up
 * (ids; -1 none).
 */
export interface PurseMemory {
  loot: number;
  target: number;
  lootT: number;
  shun: number;
}

/** A purser's memory as she puts to sea. */
export const purseMemory = (): PurseMemory => ({
  loot: -1,
  target: -1,
  lootT: 0,
  shun: -1,
});

/** Her time going for loot kept, a step of dt seconds on while she does. */
export const lootTime = (c: Ctx, dt: number) => {
  if (c.m.mode === 'loot') c.m.lootT += dt;
};

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
