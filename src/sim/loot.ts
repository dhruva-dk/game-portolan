// Loot on the water: guns and things to mend with, strewn over the whole planet
// at the start of a match and spilled from every ship that sinks; a ship
// sailing over a piece picks it up. For two gun slots and three item slots:
// - strewn: LOOT.spots spots over the planet (two and a half a ship for a match
// of 80, half what it was, laid evenly,
//   each moved off land and shallows to the nearest open water, which gathers some along the coast), each with a piece
//   and LOOT.second of them a second 4 m off; and a gun laid near any berth with none in reach (berthed), so the match
//   opens on a scramble for the nearest. A piece is a gun LOOT.gun of the time, its kind drawn by LOOT.kinds (the cannon
//   commonest, the harpoon and the mortar rarest) and its rarity by LOOT.weights, else a consumable by LOOT.shares, in
//   its counts;
// - picked up: a ship takes every piece within LOOT.reach that fits: a gun into
// an empty gun slot (the one in hand
//   first), things to mend with that go on a stack or into an empty slot. What doesn't fit is offered: the nearest gun
//   with both gun slots full, the nearest other piece with her slots full. Asked to (a take: her gun in hand, or a slot
//   of items), she swaps it for what she has there, which goes over the side where she is;
// - spilled: a ship sinking puts both her guns and her slots over the side,
// kicked out a few m/s each a different way
//   and drifting to a stop; what a ship put over the side she can't pick up again until it has lain LOOT.settle s and
//   she has sailed clear of it.
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

/** The loot table, and its spots. */
export const LOOT = {
  /**
   * Spots strewn over the planet, and the share with a second piece: some 280
   * pieces (it was 400 spots, some 570).
   */
  spots: 200,
  second: 0.4,
  /**
   * The share of pieces that are guns (brought down from 0.62 so the first is a
   * scramble, most ships armed by 20–30 s: tools/matches.ts), their kinds'
   * weights (in kinds.ts KINDS' order: cannon, scatter, repeater, harpoon,
   * mortar), and their rarities' weights, common to legendary.
   */
  gun: 0.5,
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
  /**
   * Every berth has a gun within `berth` m at the start (some 12 s at her top
   * speed): one is laid `near` m to `far` m off any that has none.
   */
  berth: 160,
  near: 90,
  far: 150,
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
  isArms(g) ? g.rarity : LOOT.rarity[g.kind];

/** The index `weights` give a uniform draw `u`. */
function weighed(weights: readonly number[], u: number): number {
  let r = u * weights.reduce((a, b) => a + b, 0),
    k = 0;
  while (k < weights.length - 1 && r >= weights[k]) r -= weights[k++];
  return k;
}

/**
 * A gun of the kind and rarity LOOT.kinds and LOOT.weights give uniform draws
 * `u` and `v`.
 */
const gunned = (u: number, v: number): Arms => ({
  kind: GUN_KINDS[weighed(LOOT.kinds, u)],
  rarity: Math.min(weighed(LOOT.weights, v), GUN.rarities.length - 1),
});

/** A piece drawn at random. */
export function rolled(draw: () => number): Goods {
  if (draw() < LOOT.gun) return gunned(draw(), draw());
  let r = draw();
  for (const kind of STORES) {
    if (r < LOOT.shares[kind]) return { kind, count: LOOT.counts[kind] };
    r -= LOOT.shares[kind];
  }
  return { kind: 'fullRepair', count: LOOT.counts.fullRepair };
}

/** Whether a piece at p lies where a ship can come to it. */
const open = (depth: Depth, p: Vec3) => depth(p) >= SHIP.draught + LOOT.open;

/**
 * Whether a piece laid at p lies where a ship can come to it and come about
 * after: open water there and LOOT.room m round it every way. (Laid at the
 * head of a cove narrower than her turning circle, a piece draws a ship on to
 * the shore, where she wedges: the bots' harness found most of them stuck so.)
 */
function roomy(depth: Depth, p: Vec3): boolean {
  if (!open(depth, p)) return false;
  for (let k = 0; k < 8; k++)
    if (!open(depth, along(p, tangentAt(p, (k * Math.PI) / 4), LOOT.room).p))
      return false;
  return true;
}

/**
 * p, or the roomy water nearest it, or null if there is none within
 * LOOT.shore.
 */
function opened(depth: Depth, p: Vec3): Vec3 | null {
  if (roomy(depth, p)) return p;
  for (let d = LOOT.ring; d <= LOOT.shore; d += LOOT.ring) {
    const n = Math.max(8, Math.round((2 * Math.PI * d) / (2 * LOOT.ring)));
    for (let k = 0; k < n; k++) {
      const q = along(p, tangentAt(p, (2 * Math.PI * k) / n), d).p;
      if (roomy(depth, q)) return q;
    }
  }
  return null;
}

/**
 * The loot a match of `seed` opens with, over the sea floor `depth`: LOOT.spots
 * spots on a lattice spread evenly over the planet (turned and each spot
 * jittered by the seed), on open water, each with a piece or two.
 */
export function strewn(
  seed: number,
  depth: Depth,
  spots: number = LOOT.spots
): Flotsam {
  const draw = random(hash(seed, 0x100f));
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
    const goods = rolled(draw),
      twice = draw() < LOOT.second,
      side = draw() * 2 * Math.PI;
    if (!at) continue;
    pieces.push({ id: pieces.length, at, goods, from: -1, age: 0, way: STILL });
    if (twice) {
      const q = along(at, tangentAt(at, side), 4).p;
      pieces.push({
        id: pieces.length,
        at: open(depth, q) ? q : at,
        goods: rolled(draw),
        from: -1,
        age: 0,
        way: STILL,
      });
    }
  }
  return { pieces, next: pieces.length };
}

/**
 * The loot `f` with a gun within LOOT.berth of each of `berths` (where the
 * ships lie at the start): for a berth with none, one of a rarity drawn by
 * LOOT.weights laid LOOT.near to LOOT.far m off on open water, its bearing
 * drawn from `seed`. So no ship opens the match with no gun in reach.
 */
export function berthed(
  f: Flotsam,
  berths: readonly Vec3[],
  seed: number,
  depth: Depth
): Flotsam {
  const draw = random(hash(seed, 0xbe27)),
    within = Math.cos(LOOT.berth / R);
  const pieces = [...f.pieces];
  for (const b of berths) {
    const a = draw() * 2 * Math.PI,
      d = LOOT.near + draw() * (LOOT.far - LOOT.near),
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
      goods: gunned(k, r),
      from: -1,
      age: 0,
      way: STILL,
    });
  }
  return { pieces, next: f.next + pieces.length - f.pieces.length };
}

/**
 * Pieces put over the side at `at` by ship `from`, the k-th kicked out at
 * LOOT.kick + k m/s on a bearing drawn from `seed`.
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
      way: scale(tangentAt(at, draw() * 2 * Math.PI), LOOT.kick + k),
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
  const k = Math.max(0, 1 - dt * LOOT.drift);
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
 * The cosine of LOOT.reach along the surface: a piece within reach of p has
 * dot(p, at) above it.
 */
const REACH = Math.cos(LOOT.reach / R);

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
 * A piece taken up: by which ship, what of it (a stack taken only in part, the
 * part), where it lay, and the slot it went to (a gun's: her gun slot, 0 or 1;
 * else an item slot, 1–3).
 */
export interface Taken {
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
            l.age >= LOOT.settle && dot(p, l.at) <= REACH
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
            took.push({ ship: v.id, goods: g, at: l.at, slot });
          }
          continue;
        }
        const s = stowed(c.hold, g.kind, g.count);
        c = { ...c, hold: s.hold };
        if (s.left < g.count) {
          const slot = 1 + s.hold.items.findIndex((k) => k?.kind === g.kind);
          took.push({
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
