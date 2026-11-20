// Loot on the water: guns and things to mend with, strewn over the whole planet
// at the start of a match and spilled from every ship that sinks; a ship
// sailing over a piece picks it up. For two gun slots and three item slots:
// - strewn: LOOT.spots spots laid evenly over the planet (four a ship for a
//   match of 80), each moved off land and shallows to the nearest water open
//   all round it, each with a piece and LOOT.second of them a second 4 m off;
//   and a gun laid near any berth with none in reach (berthed), so the match
//   opens on a scramble for the nearest. A piece is a gun LOOT.gun of the
//   time, its kind drawn by LOOT.kinds (the cannon commonest, the harpoon and
//   the mortar rarest) and its rarity by LOOT.weights, else a consumable by
//   LOOT.shares, in its counts;
// - picked up: a ship takes every piece within PIECE.reach that fits: a gun
//   into an empty gun slot (the one in hand first), things to mend with that
//   go on a stack or into an empty slot. What doesn't fit is offered: the
//   nearest gun with both gun slots full, the nearest other piece with her
//   slots full. Asked to (a take: her gun in hand, or a slot of items), she
//   swaps it for what she has there, which goes over the side where she is;
// - spilled: a ship sinking puts both her guns and her slots over the side,
//   kicked out a few m/s each a different way and drifting to a stop; what a
//   ship put over the side she can't pick up again until it has lain
//   PIECE.settle s and she has sailed clear of it;
// - cached: as each phase of the storm after the first begins, a few of the
//   rarer pieces dropped round the heart of the cap it closes to (LOOT.cache).
//
// What is laid is the match's (its rules' loot table: laying); how a piece
// lies and is taken up is the same in every match (PIECE).
//
// Pure arithmetic: no three, so it runs in node for the tests; deterministic
// for the same inputs.

import { random, hash } from '../world/random.ts';
import {
  R,
  along,
  dot,
  normalize,
  rotateAbout,
  scale,
  tangentAt,
  type Vec3,
} from '../world/sphere.ts';
import type { Crew } from './battle.ts';
import type { Vessel } from './contact.ts';
import { gunOf } from './gun.ts';
import { KINDS as GUN_KINDS, STORES, isGun, type GunKind } from '../kinds.ts';
import { EQUIP, GUN, SHIP } from './handling.ts';
import { roomFor, stowed, USES, type Use } from './hold.ts';
import type { Depth } from './shoal.ts';
import { toEdge, type Cap } from './storm.ts';
import { weighed, type Widen } from './tables.ts';

/**
 * The loot table: what a match lays, and where (a match's rules may lay other:
 * rules.ts). How a piece lies on the water and is taken up is PIECE's, the
 * same in every match.
 */
export const LOOT = {
  /**
   * Spots strewn over the planet, and the share with a second piece: some 440
   * pieces (it was 200 spots, some 280; and before that 400, some 570).
   */
  spots: 320,
  second: 0.4,
  /**
   * The share of pieces that are guns (brought down from 0.62, then from 0.5 as
   * the spots grew, so the first is still a scramble, most ships armed by
   * 20–30 s: tools/harness), their kinds' weights (in kinds.ts KINDS' order:
   * cannon, scatter, repeater, harpoon, mortar), and their rarities' weights,
   * common to legendary.
   */
  gun: 0.42,
  kinds: [36, 22, 22, 10, 10],
  weights: [42, 30, 17, 8, 3],
  /**
   * The share of the rest of each consumable, how many come together, and the
   * rarity each reads as.
   */
  shares: {
    smallShield: 0.36,
    repairKit: 0.22,
    bigShield: 0.28,
    fullRepair: 0.14,
  } satisfies Record<Use, number>,
  counts: {
    smallShield: 3,
    bigShield: 1,
    repairKit: 4,
    fullRepair: 1,
  } satisfies Record<Use, number>,
  /**
   * Every berth has a gun within `berth` m at the start (some 12 s at her top
   * speed): one is laid `near` m to `far` m off any that has none.
   */
  berth: 160,
  near: 90,
  far: 150,
  /**
   * A cache dropped as each phase of the storm after the first begins: `pieces`
   * pieces within `within` of the next cap's radius of its centre, on roomy
   * water inside it, `gun` of them guns of the rarer tiers (`weights`, common to
   * legendary), the rest a big shield or a full repair. The calm's heart is
   * where the fleet is making anyway, and something worth fighting over there
   * meets them.
   */
  cache: { pieces: 5, within: 0.5, gun: 0.4, weights: [0, 0, 50, 35, 15] },
} as const;

/** The loot table as a match holds it (rules.ts). */
export type LootTable = Widen<typeof LOOT>;

/** A piece on the water, in every match. */
export const PIECE = {
  /** The rarity each consumable reads as (its colour). */
  rarity: {
    smallShield: 1,
    bigShield: 2,
    repairKit: 1,
    fullRepair: 3,
  } satisfies Record<Use, number>,
  /**
   * Metres from her centre she picks a piece up within; seconds a piece put
   * over the side lies before its ship may take it back; how fast a kicked
   * piece's way dies, per second; and the kick a spilled piece is given, m/s,
   * more for each slot down.
   */
  reach: 9.5,
  settle: 0.6,
  drift: 2.2,
  kick: 3,
  /**
   * A spot lies over this much water past her draught, and so does the water
   * `room` m round it every way; one that doesn't is moved to the nearest that
   * does in rings `ring` m apart, out to `shore` m.
   */
  open: 1,
  room: 14,
  ring: 8,
  shore: 240,
} as const;

/** A piece: a gun of a kind and a rarity, or a count of one consumable. */
export type Goods =
  | { kind: GunKind; rarity: number }
  | { kind: Use; count: number };
/** A gun lying on the water, as goods. */
export type Arms = Extract<Goods, { rarity: number }>;

/** Whether a piece is a gun. */
export const isArms = (g: Goods): g is Arms => isGun(g.kind);

/**
 * A piece on the water: its id, where it lies (a unit vector), what it is, the
 * ship that put it over the side (-1: none), seconds it has lain while hers to
 * leave (counted only then: swept reads it for nothing else), and its way (m/s,
 * a tangent), dying away.
 */
export interface Loot {
  id: number;
  at: Vec3;
  goods: Goods;
  from: number;
  age: number;
  way: Vec3;
}

/** All the loot on the water, and the next piece's id. */
export interface Flotsam {
  pieces: readonly Loot[];
  next: number;
}

const STILL: Vec3 = [0, 0, 0];

/**
 * The rarity a piece reads as (its colour): a gun's own, a consumable's by
 * kind.
 */
export const rarityOf = (g: Goods) =>
  isArms(g) ? g.rarity : PIECE.rarity[g.kind];

/**
 * A gun of the kind and rarity a loot table's kinds and `weights` (its own, or
 * its cache's) give uniform draws `u` and `v`.
 */
const gunned = (
  t: LootTable,
  u: number,
  v: number,
  weights: readonly number[] = t.weights
): Arms => ({
  kind: GUN_KINDS[weighed(t.kinds, u)],
  rarity: Math.min(weighed(weights, v), GUN.rarities.length - 1),
});

/** A piece drawn at random, by the loot table `t`. */
export function rolled(draw: () => number, t: LootTable = LOOT): Goods {
  if (draw() < t.gun) return gunned(t, draw(), draw());
  let r = draw();
  for (const kind of STORES) {
    if (r < t.shares[kind]) return { kind, count: t.counts[kind] };
    r -= t.shares[kind];
  }
  return { kind: 'fullRepair', count: t.counts.fullRepair };
}

/** Whether a piece at p lies where a ship can come to it. */
const open = (depth: Depth, p: Vec3) => depth(p) >= SHIP.draught + PIECE.open;

/**
 * Whether a piece laid at p lies where a ship can come to it and come about
 * after: open water there and PIECE.room m round it every way. (Laid at the
 * head of a cove narrower than her turning circle, a piece draws a ship on to
 * the shore, where she wedges: the bots' harness found most of them stuck so.)
 */
function roomy(depth: Depth, p: Vec3): boolean {
  if (!open(depth, p)) return false;
  for (let k = 0; k < 8; k++)
    if (!open(depth, along(p, tangentAt(p, (k * Math.PI) / 4), PIECE.room).p))
      return false;
  return true;
}

/**
 * p, or the roomy water nearest it, or null if there is none within
 * PIECE.shore.
 */
function opened(depth: Depth, p: Vec3): Vec3 | null {
  if (roomy(depth, p)) return p;
  for (let d = PIECE.ring; d <= PIECE.shore; d += PIECE.ring) {
    const n = Math.max(8, Math.round((2 * Math.PI * d) / (2 * PIECE.ring)));
    for (let k = 0; k < n; k++) {
      const q = along(p, tangentAt(p, (2 * Math.PI * k) / n), d).p;
      if (roomy(depth, q)) return q;
    }
  }
  return null;
}

/**
 * The loot a match lays by its loot table `table` (its rules': rules.ts), drawn
 * from its `seed`, over the sea floor `depth`: what it opens with (strewn), the
 * cache each phase of its storm drops (cached), and a gun near every berth with
 * none (berthed). Each draws from the seed on its own, so the order they are
 * asked in changes nothing.
 */
export function laying(seed: number, depth: Depth, table: LootTable = LOOT) {
  return {
    strewn: () => strewn(seed, depth, table),
    cached: (f: Flotsam, cap: Cap, phase: number) =>
      cached(f, cap, phase, seed, depth, table),
    berthed: (f: Flotsam, berths: readonly Vec3[]) =>
      berthed(f, berths, seed, depth, table),
  };
}

/**
 * The loot a match of `seed` opens with, over the sea floor `depth`: t.spots
 * spots on a lattice spread evenly over the planet (turned and each spot
 * jittered by the seed), on open water, each with a piece or two.
 */
function strewn(seed: number, depth: Depth, t: LootTable): Flotsam {
  const spots = t.spots,
    draw = random(hash(seed, 0x100f));
  const pieces: Loot[] = [];
  // the lattice turned at random: a random axis-angle applied to each point
  const axis = normalize([draw() - 0.5, draw() - 0.5, draw() - 0.5]),
    turn = draw() * 2 * Math.PI;
  const spin = (v: Vec3): Vec3 => rotateAbout(v, axis, turn);
  const cell = Math.sqrt((4 * Math.PI * R * R) / spots),
    golden = Math.PI * (3 - Math.sqrt(5));
  for (let k = 0; k < spots; k++) {
    const y = 1 - (2 * (k + 0.5)) / spots,
      r = Math.sqrt(1 - y * y),
      phi = k * golden;
    const spot = spin([r * Math.cos(phi), y, r * Math.sin(phi)]);
    const p = along(
      spot,
      tangentAt(spot, draw() * 2 * Math.PI),
      draw() * cell * 0.4
    ).p;
    const at = opened(depth, p);
    const goods = rolled(draw, t),
      twice = draw() < t.second,
      side = draw() * 2 * Math.PI;
    if (!at) continue;
    pieces.push({ id: pieces.length, at, goods, from: -1, age: 0, way: STILL });
    if (twice) {
      const q = along(at, tangentAt(at, side), 4).p;
      pieces.push({
        id: pieces.length,
        at: open(depth, q) ? q : at,
        goods: rolled(draw, t),
        from: -1,
        age: 0,
        way: STILL,
      });
    }
  }
  return { pieces, next: pieces.length };
}

/**
 * The loot `f` with the cache of phase `phase` dropped in `cap` (the cap the
 * storm closes to next; t.cache), drawn from the match's `seed` and the phase.
 * A piece whose roomy water lies outside the cap isn't laid.
 */
function cached(
  f: Flotsam,
  cap: Cap,
  phase: number,
  seed: number,
  depth: Depth,
  t: LootTable
): Flotsam {
  const draw = random(hash(seed, 0xcac0 + phase)),
    k = t.cache;
  const pieces = [...f.pieces];
  let next = f.next;
  for (let i = 0; i < k.pieces; i++) {
    const p = along(
      cap.centre,
      tangentAt(cap.centre, draw() * 2 * Math.PI),
      R * cap.radius * k.within * Math.sqrt(draw())
    ).p;
    const goods: Goods =
      draw() < k.gun
        ? gunned(t, draw(), draw(), k.weights)
        : draw() < 0.5
          ? { kind: 'bigShield', count: t.counts.bigShield }
          : { kind: 'fullRepair', count: t.counts.fullRepair };
    const at = opened(depth, p);
    if (!at || toEdge(at, cap) < 0) continue;
    pieces.push({ id: next++, at, goods, from: -1, age: 0, way: STILL });
  }
  return { pieces, next };
}

/**
 * The loot `f` with a gun within t.berth of each of `berths` (where the ships
 * lie at the start): for a berth with none, one of a rarity drawn by t.weights
 * laid t.near to t.far m off on open water, its bearing drawn from `seed`. So
 * no ship opens the match with no gun in reach.
 */
function berthed(
  f: Flotsam,
  berths: readonly Vec3[],
  seed: number,
  depth: Depth,
  t: LootTable
): Flotsam {
  const draw = random(hash(seed, 0xbe27)),
    within = Math.cos(t.berth / R);
  const pieces = [...f.pieces];
  for (const b of berths) {
    const a = draw() * 2 * Math.PI,
      d = t.near + draw() * (t.far - t.near),
      r = draw(),
      k = draw();
    if (pieces.some((l) => isArms(l.goods) && dot(l.at, b) > within)) continue;
    // the first of eight bearings round from the one drawn that lies on open
    // water, else the open water nearest it
    const round = Array.from(
      { length: 8 },
      (_, k) => along(b, tangentAt(b, a + (k * Math.PI) / 4), d).p
    );
    const at =
      round.find((q) => roomy(depth, q)) ?? opened(depth, round[0]) ?? b;
    pieces.push({
      id: f.next + pieces.length - f.pieces.length,
      at,
      goods: gunned(t, k, r),
      from: -1,
      age: 0,
      way: STILL,
    });
  }
  return { pieces, next: f.next + pieces.length - f.pieces.length };
}

/**
 * Pieces put over the side at `at` by ship `from`, the k-th kicked out at
 * PIECE.kick + k m/s on a bearing drawn from `seed`.
 */
export function overboard(
  f: Flotsam,
  at: Vec3,
  goods: readonly Goods[],
  from: number,
  seed: number
): Flotsam {
  const draw = random(hash(seed, f.next));
  const thrown = goods.map(
    (g, k): Loot => ({
      id: f.next + k,
      at,
      goods: g,
      from,
      age: 0,
      way: scale(tangentAt(at, draw() * 2 * Math.PI), PIECE.kick + k),
    })
  );
  return { pieces: [...f.pieces, ...thrown], next: f.next + goods.length };
}

/**
 * dt seconds of the pieces lying: older (while some ship's to leave), and those
 * with way on carried along it as it dies, stopped by shoal water. A piece
 * lying still and no ship's is left as it is.
 */
export function drifted(f: Flotsam, dt: number, depth: Depth): Flotsam {
  // (most steps, every piece lies still and no ship's: the flotsam stands as it
  // is)
  if (f.pieces.every((l) => l.way === STILL && l.from < 0)) return f;
  const k = Math.max(0, 1 - dt * PIECE.drift);
  const pieces = f.pieces.map((l): Loot => {
    if (l.way === STILL && l.from < 0) return l;
    const speed = Math.hypot(...l.way);
    if (speed < 1e-3) return { ...l, age: l.age + dt, way: STILL };
    const moved = along(l.at, scale(l.way, 1 / speed), speed * dt);
    return open(depth, moved.p)
      ? { ...l, age: l.age + dt, at: moved.p, way: scale(moved.t, speed * k) }
      : { ...l, age: l.age + dt, way: STILL };
  });
  return { ...f, pieces };
}

/**
 * The cosine of PIECE.reach along the surface: a piece within reach of p has
 * dot(p, at) above it.
 */
const REACH = Math.cos(PIECE.reach / R);

/**
 * The empty gun slot a gun picked up goes to: the one in hand if it is empty,
 * else the other; -1 if both are full.
 */
const emptySlot = (c: Crew) =>
  c.guns[c.hand] === null ? c.hand : c.guns.findIndex((g) => g === null);

/**
 * Her crew with gun slot `slot` holding `g`, its magazine full; taken into her
 * hand, it fires only after EQUIP.
 */
const armedWith = (c: Crew, slot: number, g: Arms): Crew => ({
  ...c,
  guns: c.guns.map((k, i) => (i === slot ? gunOf(g.kind, g.rarity) : k)),
  equip: slot === c.hand ? EQUIP : c.equip,
});

/**
 * What she would take now from where she is: whether `l` fits her (a gun into
 * an empty gun slot, things that go in her item slots).
 */
const fits = (c: Crew, g: Goods) =>
  isArms(g) ? emptySlot(c) >= 0 : roomFor(c.hold, g.kind) >= 0;

/**
 * Whether ship `id` at p may pick `l` up: it lies within reach, and she didn't
 * put it over the side (until it has settled and she has sailed clear of it:
 * swept).
 */
const reachable = (id: number, p: Vec3, l: Loot) =>
  dot(p, l.at) > REACH && l.from !== id;

/**
 * What is offered her where she lies (what doesn't fit, within reach): the
 * nearest gun with both gun slots full, and the nearest other piece with no
 * room for it; each null if none.
 */
export function offered(
  c: Crew,
  at: Vec3,
  f: Flotsam
): { gun: Loot | null; item: Loot | null } {
  let gun: Loot | null = null,
    item: Loot | null = null,
    gd = REACH,
    id = REACH;
  for (const l of f.pieces) {
    if (!reachable(c.id, at, l) || fits(c, l.goods)) continue;
    const d = dot(at, l.at);
    if (isArms(l.goods) && d > gd) [gun, gd] = [l, d];
    else if (!isArms(l.goods) && d > id) [item, id] = [l, d];
  }
  return { gun, item };
}

/**
 * A piece taken up: which (its id), by which ship, what of it (a stack taken
 * only in part, the part), where it lay, and the slot it went to (a gun's: her
 * gun slot, 0 or 1; else an item slot, 1–3).
 */
export interface Taken {
  id: number;
  ship: number;
  goods: Goods;
  at: Vec3;
  slot: number;
}

/**
 * The fleet sweeping up loot, in order of their ids: every ship afloat takes
 * what fits within her reach; one asked to take (`takes`: her id to the slot
 * she offers, 0 her gun in hand or 1–3 an item slot) swaps what is offered
 * there for what she has in it, which goes over the side. A piece put over the
 * side lies under its ship until she has sailed clear. The flotsam and the
 * crews after, and what was taken.
 */
export function swept(
  f: Flotsam,
  crews: readonly Crew[],
  fleet: readonly Vessel[],
  takes: ReadonlyMap<number, number>,
  seed: number
): { flotsam: Flotsam; crews: Crew[]; took: Taken[] } {
  let pieces = f.pieces,
    next = f.next;
  const took: Taken[] = [];
  const by = new Map(crews.map((c) => [c.id, c]));
  for (const v of [...fleet].sort((a, b) => a.id - b.id)) {
    let c = by.get(v.id);
    if (!c || c.health.hull <= 0) continue;
    const p = v.ship.at;
    // (most ships, most steps, are near no piece and have none of their own
    // lying about: the pieces stand as they are)
    let near = false;
    for (let i = 0; i < pieces.length && !near; i++)
      near = pieces[i].from === v.id || dot(p, pieces[i].at) > REACH;
    if (near) {
      const kept: Loot[] = [];
      for (const l of pieces) {
        // a piece she put over the side is hers to leave until it has settled
        // and she is clear of it
        if (l.from === v.id) {
          kept.push(
            l.age >= PIECE.settle && dot(p, l.at) <= REACH
              ? { ...l, from: -1 }
              : l
          );
          continue;
        }
        if (!reachable(v.id, p, l)) {
          kept.push(l);
          continue;
        }
        const g = l.goods;
        if (isArms(g)) {
          const slot = emptySlot(c);
          if (slot < 0) kept.push(l);
          else {
            c = armedWith(c, slot, g);
            took.push({ id: l.id, ship: v.id, goods: g, at: l.at, slot });
          }
          continue;
        }
        const s = stowed(c.hold, g.kind, g.count);
        c = { ...c, hold: s.hold };
        if (s.left < g.count) {
          const slot = 1 + s.hold.items.findIndex((k) => k?.kind === g.kind);
          took.push({
            id: l.id,
            ship: v.id,
            goods: { kind: g.kind, count: g.count - s.left },
            at: l.at,
            slot,
          });
        }
        if (s.left > 0)
          kept.push(
            s.left === g.count
              ? l
              : { ...l, goods: { kind: g.kind, count: s.left } }
          );
      }
      pieces = kept;
    }
    // a swap asked for: what is offered there for what she has in it, which
    // goes over the side where she is
    const slot = takes.get(v.id);
    if (slot !== undefined) {
      const o = offered(c, p, { pieces, next });
      const swap = slot === 0 ? o.gun : o.item,
        held = c.guns[c.hand];
      if (swap) {
        const goods = swap.goods,
          old: Goods | null =
            slot === 0
              ? held && { kind: held.kind, rarity: held.rarity }
              : c.hold.items[slot - 1] && {
                  kind: c.hold.items[slot - 1]!.kind,
                  count: c.hold.items[slot - 1]!.count,
                };
        pieces = pieces.filter((l) => l.id !== swap.id);
        took.push({
          id: swap.id,
          ship: v.id,
          goods,
          at: swap.at,
          slot: isArms(goods) ? c.hand : slot,
        });
        if (isArms(goods)) c = armedWith(c, c.hand, goods);
        else if (slot >= 1 && slot <= c.hold.items.length) {
          const items = [...c.hold.items];
          items[slot - 1] = {
            kind: goods.kind,
            count: Math.min(goods.count, USES[goods.kind].stack),
          };
          c = {
            ...c,
            hold: {
              ...c.hold,
              items,
              using: c.hold.using?.slot === slot ? null : c.hold.using,
            },
          };
        }
        if (old) {
          const thrown = overboard({ pieces, next }, p, [old], v.id, seed);
          [pieces, next] = [
            [
              ...thrown.pieces.slice(0, -1),
              { ...thrown.pieces[thrown.pieces.length - 1], way: STILL },
            ],
            thrown.next,
          ];
        }
      }
    }
    by.set(v.id, c);
  }
  return {
    flotsam: { pieces, next },
    crews: crews.map((c) => by.get(c.id)!),
    took,
  };
}

/**
 * What a ship sinking puts over the side: her guns and every stack in her
 * slots.
 */
export function cargo(c: Crew): Goods[] {
  const goods: Goods[] = c.guns.flatMap((g) =>
    g ? [{ kind: g.kind, rarity: g.rarity }] : []
  );
  for (const s of c.hold.items)
    if (s) goods.push({ kind: s.kind, count: s.count });
  return goods;
}
