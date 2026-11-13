// Loot on the water: guns and things to mend with, strewn over the whole planet at the start of a match and spilled
// from every ship that sinks; a ship sailing over a piece picks it up. 0117's (src/sim/items.ts, tables.ts LOOT) with
// its numbers, for one gun and three item slots:
// - strewn: LOOT.spots spots over the planet (0117 had about five a ship, by its regions; here five a ship for a
//   match of 80, laid evenly, each moved off land and shallows to the nearest open water, which gathers some round
//   every island's coast), each with a piece and LOOT.second of them a second 4 m off; and a gun laid near any berth
//   with none in reach (berthed). A piece is a gun LOOT.gun of the time, its rarity drawn by LOOT.weights (0117's
//   rollItem), else a consumable by 0117's shares, in its counts;
// - picked up: a ship takes every piece within LOOT.reach that fits: a gun if she has none, things to mend with that
//   go on a stack or into an empty slot. What doesn't fit is offered: the nearest gun while she has one, the nearest
//   other piece with her slots full. Asked to (a take: her gun's slot, or a slot of items), she swaps it for what she
//   has there, which goes over the side where she is (0117's take for a full hotbar);
// - spilled: a ship sinking puts her gun and her slots over the side, kicked out a few m/s and drifting to a stop
//   (0117's spill and driftLoot); what a ship put over the side she can't pick up again until it has lain LOOT.settle
//   s and she has sailed clear of it.
//
// Pure arithmetic: no three, so it runs in node for the tests; deterministic for the same inputs.

import { random, hash } from '../world/random.ts';
import { R, add, along, cross, dot, normalize, scale, type Vec3 } from '../world/sphere.ts';
import type { Crew } from './battle.ts';
import type { Vessel } from './contact.ts';
import { gunOf } from './gun.ts';
import { GUN, SHIP } from './handling.ts';
import { roomFor, stowed, USES, type Use } from './hold.ts';
import type { Depth } from './shoal.ts';

/** 0117's loot table (tables.ts LOOT), and its spots. */
export const LOOT = {
  /** Spots strewn over the planet, and the share with a second piece. */
  spots: 400, second: 0.4,
  /** The share of pieces that are guns, and their rarities' weights, common to legendary. */
  gun: 0.62, weights: [42, 30, 17, 8, 3],
  /** The share of the rest of each consumable (0117's rollItem: 0.36, 0.22, 0.28, 0.14), how many come together, and
   *  the rarity each reads as. */
  shares: { smallShield: 0.36, repairKit: 0.22, bigShield: 0.28, fullRepair: 0.14 } as Record<Use, number>,
  counts: { smallShield: 3, bigShield: 1, repairKit: 4, fullRepair: 1 } as Record<Use, number>,
  rarity: { smallShield: 1, bigShield: 2, repairKit: 1, fullRepair: 3 } as Record<Use, number>,
  /** Metres from her centre she picks a piece up within; seconds a piece put over the side lies before its ship may
   *  take it back; how fast a kicked piece's way dies, per second; and the kick a spilled piece is given, m/s, more for
   *  each slot down. */
  reach: 9.5, settle: 0.6, drift: 2.2, kick: 3,
  /** A spot lies over this much water past her draught; one on land or the shallows is moved to the nearest such water
   *  in rings `ring` m apart, out to `shore` m. */
  open: 1, ring: 8, shore: 240,
  /** Every berth has a gun within `berth` m at the start: one is laid `near` m to `far` m off any that has none. */
  berth: 60, near: 18, far: 40,
} as const;

/** A piece: a gun of a rarity, or a count of one consumable. */
export type Goods = { kind: 'gun'; rarity: number } | { kind: Use; count: number };

/** A piece on the water: its id, where it lies (a unit vector), what it is, the ship that put it over the side (-1:
 *  none), seconds it has lain while hers to leave (counted only then: swept reads it for nothing else), and its way
 *  (m/s, a tangent), dying away. */
export interface Loot { id: number; at: Vec3; goods: Goods; from: number; age: number; way: Vec3 }

/** All the loot on the water, and the next piece's id. */
export interface Flotsam { pieces: readonly Loot[]; next: number }

const STILL: Vec3 = [0, 0, 0];
const KINDS = Object.keys(LOOT.shares) as Use[];

/** The rarity a piece reads as (its colour): a gun's own, a consumable's by kind. */
export const rarityOf = (g: Goods) => (g.kind === 'gun' ? g.rarity : LOOT.rarity[g.kind]);

/** A gun of the rarity LOOT.weights give a uniform draw `u`. */
function gunned(u: number): Goods {
  let r = u * LOOT.weights.reduce((a, b) => a + b, 0), k = 0;
  while (k < LOOT.weights.length - 1 && r >= LOOT.weights[k]) r -= LOOT.weights[k++];
  return { kind: 'gun', rarity: Math.min(k, GUN.rarities.length - 1) };
}

/** A piece drawn at random (0117's rollItem). */
export function rolled(draw: () => number): Goods {
  if (draw() < LOOT.gun) return gunned(draw());
  let r = draw();
  for (const kind of KINDS) {
    if (r < LOOT.shares[kind]) return { kind, count: LOOT.counts[kind] };
    r -= LOOT.shares[kind];
  }
  return { kind: 'fullRepair', count: LOOT.counts.fullRepair };
}

/** A unit tangent at p at angle a from a fixed reference. */
function tangent(p: Vec3, a: number): Vec3 {
  const ref: Vec3 = Math.abs(p[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  const e1 = normalize(cross(ref, p)), e2 = cross(p, e1);
  return add(scale(e1, Math.cos(a)), e2, Math.sin(a));
}

/** Whether a piece at p lies where a ship can come to it. */
const open = (depth: Depth, p: Vec3) => depth(p) >= SHIP.draught + LOOT.open;

/** p, or the open water nearest it, or null if there is none within LOOT.shore. */
function opened(depth: Depth, p: Vec3): Vec3 | null {
  if (open(depth, p)) return p;
  for (let d = LOOT.ring; d <= LOOT.shore; d += LOOT.ring) {
    const n = Math.max(8, Math.round((2 * Math.PI * d) / (2 * LOOT.ring)));
    for (let k = 0; k < n; k++) {
      const q = along(p, tangent(p, (2 * Math.PI * k) / n), d).p;
      if (open(depth, q)) return q;
    }
  }
  return null;
}

/** The loot a match of `seed` opens with, over the sea floor `depth`: LOOT.spots spots on a lattice spread evenly over
 *  the planet (turned and each spot jittered by the seed), on open water, each with a piece or two. */
export function strewn(seed: number, depth: Depth, spots: number = LOOT.spots): Flotsam {
  const draw = random(hash(seed, 0x100f));
  const pieces: Loot[] = [];
  // the lattice turned at random: a random axis-angle applied to each point
  const axis = normalize([draw() - 0.5, draw() - 0.5, draw() - 0.5]), turn = draw() * 2 * Math.PI;
  const spin = (v: Vec3): Vec3 => add(add(scale(v, Math.cos(turn)), cross(axis, v), Math.sin(turn)), axis, dot(axis, v) * (1 - Math.cos(turn)));
  const cell = Math.sqrt((4 * Math.PI * R * R) / spots), golden = Math.PI * (3 - Math.sqrt(5));
  for (let k = 0; k < spots; k++) {
    const y = 1 - (2 * (k + 0.5)) / spots, r = Math.sqrt(1 - y * y), phi = k * golden;
    const p = along(spin([r * Math.cos(phi), y, r * Math.sin(phi)]), tangent(spin([r * Math.cos(phi), y, r * Math.sin(phi)]), draw() * 2 * Math.PI), draw() * cell * 0.4).p;
    const at = opened(depth, p);
    const goods = rolled(draw), twice = draw() < LOOT.second, side = draw() * 2 * Math.PI;
    if (!at) continue;
    pieces.push({ id: pieces.length, at, goods, from: -1, age: 0, way: STILL });
    if (twice) {
      const q = along(at, tangent(at, side), 4).p;
      pieces.push({ id: pieces.length, at: open(depth, q) ? q : at, goods: rolled(draw), from: -1, age: 0, way: STILL });
    }
  }
  return { pieces, next: pieces.length };
}

/** The loot `f` with a gun within LOOT.berth of each of `berths` (where the ships lie at the start): for a berth with
 *  none, one of a rarity drawn by LOOT.weights laid LOOT.near to LOOT.far m off on open water, its bearing drawn from
 *  `seed`. So no ship opens the match with no gun in reach. */
export function berthed(f: Flotsam, berths: readonly Vec3[], seed: number, depth: Depth): Flotsam {
  const draw = random(hash(seed, 0xbe27)), within = Math.cos(LOOT.berth / R);
  const pieces = [...f.pieces];
  for (const b of berths) {
    const a = draw() * 2 * Math.PI, d = LOOT.near + draw() * (LOOT.far - LOOT.near), r = draw();
    if (pieces.some((l) => l.goods.kind === 'gun' && dot(l.at, b) > within)) continue;
    // the first of eight bearings round from the one drawn that lies on open water, else the open water nearest it
    const round = Array.from({ length: 8 }, (_, k) => along(b, tangent(b, a + (k * Math.PI) / 4), d).p);
    const at = round.find((q) => open(depth, q)) ?? opened(depth, round[0]) ?? b;
    pieces.push({ id: f.next + pieces.length - f.pieces.length, at, goods: gunned(r), from: -1, age: 0, way: STILL });
  }
  return { pieces, next: f.next + pieces.length - f.pieces.length };
}

/** Pieces put over the side at `at` by ship `from`, the k-th kicked out at LOOT.kick + k m/s on a bearing drawn from
 *  `seed`. */
export function overboard(f: Flotsam, at: Vec3, goods: readonly Goods[], from: number, seed: number): Flotsam {
  const draw = random(hash(seed, f.next));
  const thrown = goods.map((g, k): Loot => ({ id: f.next + k, at, goods: g, from, age: 0, way: scale(tangent(at, draw() * 2 * Math.PI), LOOT.kick + k) }));
  return { pieces: [...f.pieces, ...thrown], next: f.next + goods.length };
}

/** dt seconds of the pieces lying: older (while some ship's to leave), and those with way on carried along it as it
 *  dies, stopped by shoal water (0117's driftLoot). A piece lying still and no ship's is left as it is. */
export function drifted(f: Flotsam, dt: number, depth: Depth): Flotsam {
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

/** The cosine of LOOT.reach along the surface: a piece within reach of p has dot(p, at) above it. */
const REACH = Math.cos(LOOT.reach / R);

/** What she would take now from where she is: whether `l` fits her (a gun with none, things that go in her slots). */
const fits = (c: Crew, g: Goods) => (g.kind === 'gun' ? !c.gun : roomFor(c.hold, g.kind) >= 0);

/** Whether ship `id` at p may pick `l` up: it lies within reach, and she didn't put it over the side (until it has
 *  settled and she has sailed clear of it: swept). */
const reachable = (id: number, p: Vec3, l: Loot) => dot(p, l.at) > REACH && l.from !== id;

/** What is offered her where she lies (what doesn't fit, within reach): the nearest gun while she has one, and the
 *  nearest other piece with no room for it; each null if none. */
export function offered(c: Crew, at: Vec3, f: Flotsam): { gun: Loot | null; item: Loot | null } {
  let gun: Loot | null = null, item: Loot | null = null, gd = REACH, id = REACH;
  for (const l of f.pieces) {
    if (!reachable(c.id, at, l) || fits(c, l.goods)) continue;
    const d = dot(at, l.at);
    if (l.goods.kind === 'gun' && d > gd) [gun, gd] = [l, d];
    else if (l.goods.kind !== 'gun' && d > id) [item, id] = [l, d];
  }
  return { gun, item };
}

/**
 * The fleet sweeping up loot, in order of their ids: every ship afloat takes what fits within her reach; one asked to
 * take (`takes`: her id to the slot she offers, 0 her gun's or 1–3 an item slot's) swaps what is offered there for what
 * she has in it, which goes over the side. A piece put over the side lies under its ship until she has sailed clear.
 * The flotsam and the crews after.
 */
export function swept(f: Flotsam, crews: readonly Crew[], fleet: readonly Vessel[], takes: ReadonlyMap<number, number>, seed: number): { flotsam: Flotsam; crews: Crew[] } {
  let pieces = f.pieces.map((l) => l), next = f.next;
  const by = new Map(crews.map((c) => [c.id, c]));
  for (const v of [...fleet].sort((a, b) => a.id - b.id)) {
    let c = by.get(v.id);
    if (!c || c.health.hull <= 0) continue;
    const p = v.ship.at;
    const kept: Loot[] = [];
    for (const l of pieces) {
      // a piece she put over the side is hers to leave until it has settled and she is clear of it
      if (l.from === v.id) {
        kept.push(l.age >= LOOT.settle && dot(p, l.at) <= REACH ? { ...l, from: -1 } : l);
        continue;
      }
      if (!reachable(v.id, p, l)) {
        kept.push(l);
        continue;
      }
      const g = l.goods;
      if (g.kind === 'gun') {
        if (c.gun) kept.push(l);
        else c = { ...c, gun: gunOf(g.rarity) };
        continue;
      }
      const s = stowed(c.hold, g.kind, g.count);
      c = { ...c, hold: s.hold };
      if (s.left > 0) kept.push(s.left === g.count ? l : { ...l, goods: { kind: g.kind, count: s.left } });
    }
    pieces = kept;
    // a swap asked for: what is offered there for what she has in it, which goes over the side where she is
    const slot = takes.get(v.id);
    if (slot !== undefined) {
      const o = offered(c, p, { pieces, next });
      const swap = slot === 0 ? o.gun : o.item;
      if (swap) {
        const goods = swap.goods, old: Goods | null = slot === 0 ? (c.gun && { kind: 'gun', rarity: c.gun.rarity })
          : (c.hold.items[slot - 1] && { kind: c.hold.items[slot - 1]!.kind, count: c.hold.items[slot - 1]!.count });
        pieces = pieces.filter((l) => l.id !== swap.id);
        if (goods.kind === 'gun') c = { ...c, gun: gunOf(goods.rarity) };
        else if (slot >= 1 && slot <= c.hold.items.length) {
          const items = [...c.hold.items];
          items[slot - 1] = { kind: goods.kind, count: Math.min(goods.count, USES[goods.kind].stack) };
          c = { ...c, hold: { ...c.hold, items, using: c.hold.using?.slot === slot ? null : c.hold.using } };
        }
        if (old) {
          const thrown = overboard({ pieces, next }, p, [old], v.id, seed);
          [pieces, next] = [[...thrown.pieces.slice(0, -1), { ...thrown.pieces[thrown.pieces.length - 1], way: STILL }], thrown.next];
        }
      }
    }
    by.set(v.id, c);
  }
  return { flotsam: { pieces, next }, crews: crews.map((c) => by.get(c.id)!) };
}

/** What a ship sinking puts over the side: her gun and every stack in her slots. */
export function cargo(c: Crew): Goods[] {
  const goods: Goods[] = c.gun ? [{ kind: 'gun', rarity: c.gun.rarity }] : [];
  for (const s of c.hold.items) if (s) goods.push({ kind: s.kind, count: s.count });
  return goods;
}
