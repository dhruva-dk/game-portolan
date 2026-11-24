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

export const LOOT = {
  spots: 640,
  second: 0.4,
  gun: 0.36,
  kinds: [36, 22, 22, 10, 10],
  weights: [42, 30, 17, 8, 3],
  shares: {
    smallShield: 0.26,
    repairKit: 0.32,
    bigShield: 0.2,
    fullRepair: 0.22,
  } satisfies Record<Use, number>,
  counts: {
    smallShield: 4,
    bigShield: 1,
    repairKit: 5,
    fullRepair: 1,
  } satisfies Record<Use, number>,
  berth: 160,
  near: 90,
  far: 150,
  cache: {
    pieces: 8,
    more: 0,
    within: 0.5,
    gun: 0.4,
    weights: [0, 0, 50, 35, 15],
  },
} as const;

export type LootTable = Widen<typeof LOOT>;

export const PIECE = {
  rarity: {
    smallShield: 1,
    bigShield: 2,
    repairKit: 1,
    fullRepair: 3,
  } satisfies Record<Use, number>,
  reach: 9.5,
  settle: 0.6,
  drift: 2.2,
  kick: 3,
  open: 1,
  room: 14,
  ring: 8,
  shore: 240,
} as const;

export type Goods =
  | { kind: GunKind; rarity: number }
  | { kind: Use; count: number };
export type Arms = Extract<Goods, { rarity: number }>;

export const isArms = (g: Goods): g is Arms => isGun(g.kind);

export interface Loot {
  id: number;
  at: Vec3;
  goods: Goods;
  from: number;
  age: number;
  way: Vec3;
}

export interface Flotsam {
  pieces: readonly Loot[];
  next: number;
}

const STILL: Vec3 = [0, 0, 0];

export const rarityOf = (g: Goods) =>
  isArms(g) ? g.rarity : PIECE.rarity[g.kind];

const gunned = (
  t: LootTable,
  u: number,
  v: number,
  weights: readonly number[] = t.weights
): Arms => ({
  kind: GUN_KINDS[weighed(t.kinds, u)],
  rarity: Math.min(weighed(weights, v), GUN.rarities.length - 1),
});

export function rolled(draw: () => number, t: LootTable = LOOT): Goods {
  if (draw() < t.gun) return gunned(t, draw(), draw());
  let r = draw();
  for (const kind of STORES) {
    if (r < t.shares[kind]) return { kind, count: t.counts[kind] };
    r -= t.shares[kind];
  }
  return { kind: 'fullRepair', count: t.counts.fullRepair };
}

const open = (depth: Depth, p: Vec3) => depth(p) >= SHIP.draft + PIECE.open;

function roomy(depth: Depth, p: Vec3): boolean {
  if (!open(depth, p)) return false;
  for (let k = 0; k < 8; k++)
    if (!open(depth, along(p, tangentAt(p, (k * Math.PI) / 4), PIECE.room).p))
      return false;
  return true;
}

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

export function laying(seed: number, depth: Depth, table: LootTable = LOOT) {
  return {
    strewn: () => strewn(seed, depth, table),
    cached: (f: Flotsam, cap: Cap, phase: number) =>
      cached(f, cap, phase, seed, depth, table),
    berthed: (f: Flotsam, berths: readonly Vec3[]) =>
      berthed(f, berths, seed, depth, table),
  };
}

function strewn(seed: number, depth: Depth, t: LootTable): Flotsam {
  const spots = t.spots,
    draw = random(hash(seed, 0x100f));
  const pieces: Loot[] = [];
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
  const count = k.pieces + k.more * Math.max(0, phase - 1);
  for (let i = 0; i < count; i++) {
    const p = along(
      cap.center,
      tangentAt(cap.center, draw() * 2 * Math.PI),
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

export function drifted(f: Flotsam, dt: number, depth: Depth): Flotsam {
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

const REACH = Math.cos(PIECE.reach / R);

const emptySlot = (c: Crew) =>
  c.guns[c.hand] === null ? c.hand : c.guns.findIndex((g) => g === null);

const armedWith = (c: Crew, slot: number, g: Arms): Crew => ({
  ...c,
  guns: c.guns.map((k, i) => (i === slot ? gunOf(g.kind, g.rarity) : k)),
  equip: slot === c.hand ? EQUIP : c.equip,
});

const fits = (c: Crew, g: Goods) =>
  isArms(g) ? emptySlot(c) >= 0 : roomFor(c.hold, g.kind) >= 0;

const reachable = (id: number, p: Vec3, l: Loot) =>
  dot(p, l.at) > REACH && l.from !== id;

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

export interface Taken {
  id: number;
  ship: number;
  goods: Goods;
  at: Vec3;
  slot: number;
}

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
    let near = false;
    for (let i = 0; i < pieces.length && !near; i++) {
      const l = pieces[i];
      near =
        l.from === v.id
          ? l.age >= PIECE.settle && dot(p, l.at) <= REACH
          : dot(p, l.at) > REACH && fits(c, l.goods);
    }
    if (near) {
      const kept: Loot[] = [];
      for (const l of pieces) {
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

export function cargo(c: Crew): Goods[] {
  const goods: Goods[] = c.guns.flatMap((g) =>
    g ? [{ kind: g.kind, rarity: g.rarity }] : []
  );
  for (const s of c.hold.items)
    if (s) goods.push({ kind: s.kind, count: s.count });
  return goods;
}
