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
import { STORES } from './kinds.ts';
import { SHIP } from './handling.ts';
import { roomFor, stowed, USES, type Use } from './hold.ts';
import type { Depth } from './shoal.ts';
import { toEdge, type Cap } from './storm.ts';
import type { Widen } from './tables.ts';

export const LOOT = {
  spots: 640,
  second: 0.4,
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
  cache: { pieces: 8, more: 0, within: 0.5 },
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

export type Goods = { kind: Use; count: number };

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

export const rarityOf = (g: Goods) => PIECE.rarity[g.kind];

export function rolled(draw: () => number, t: LootTable = LOOT): Goods {
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
      draw() < 0.5
        ? { kind: 'bigShield', count: t.counts.bigShield }
        : { kind: 'fullRepair', count: t.counts.fullRepair };
    const at = opened(depth, p);
    if (!at || toEdge(at, cap) < 0) continue;
    pieces.push({ id: next++, at, goods, from: -1, age: 0, way: STILL });
  }
  return { pieces, next };
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

const fits = (c: Crew, g: Goods) => roomFor(c.hold, g.kind) >= 0;

const reachable = (id: number, p: Vec3, l: Loot) =>
  dot(p, l.at) > REACH && l.from !== id;

export function offered(c: Crew, at: Vec3, f: Flotsam): Loot | null {
  let item: Loot | null = null,
    near = REACH;
  for (const l of f.pieces) {
    if (!reachable(c.id, at, l) || fits(c, l.goods)) continue;
    const d = dot(at, l.at);
    if (d > near) [item, near] = [l, d];
  }
  return item;
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
    if (slot !== undefined && slot >= 1 && slot <= c.hold.items.length) {
      const swap = offered(c, p, { pieces, next });
      if (swap) {
        const goods = swap.goods,
          had = c.hold.items[slot - 1],
          old: Goods | null = had && { kind: had.kind, count: had.count };
        pieces = pieces.filter((l) => l.id !== swap.id);
        took.push({ id: swap.id, ship: v.id, goods, at: swap.at, slot });
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
  const goods: Goods[] = [];
  for (const s of c.hold.items)
    if (s) goods.push({ kind: s.kind, count: s.count });
  return goods;
}
