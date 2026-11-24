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
import { RARITIES, type Rarity } from './kinds.ts';
import { SHIP } from './handling.ts';
import { stowed } from './hold.ts';
import type { Depth } from './shoal.ts';
import type { MatchSetup } from './setup.ts';
import { toEdge, type Cap } from './storm.ts';
import { weighed } from './tables.ts';
import { HEAL, HEAL_COUNT } from './tuning.ts';

export const PIECE = {
  second: 0.4,
  within: 0.5,
  reach: 9.5,
  drift: 2.2,
  kick: 3,
  open: 1,
  room: 14,
  ring: 8,
  shore: 240,
} as const;

export interface Loot {
  id: number;
  at: Vec3;
  heal: Rarity;
  age: number;
  way: Vec3;
}

export interface Flotsam {
  pieces: readonly Loot[];
  next: number;
}

const STILL: Vec3 = [0, 0, 0];

export const healSpots = (rating: MatchSetup['heals']): number =>
  Math.round(HEAL.spots * HEAL_COUNT[rating]);

export const rolled = (
  draw: () => number,
  shares: Readonly<Record<Rarity, number>> = HEAL.found
): Rarity =>
  RARITIES[
    weighed(
      RARITIES.map((r) => shares[r]),
      draw()
    )
  ];

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

export function laying(
  seed: number,
  depth: Depth,
  rating: MatchSetup['heals']
) {
  return {
    strewn: () => strewn(seed, depth, healSpots(rating)),
    cached: (f: Flotsam, cap: Cap, phase: number) =>
      cached(f, cap, phase, seed, depth),
  };
}

const lying = (id: number, at: Vec3, heal: Rarity): Loot => ({
  id,
  at,
  heal,
  age: 0,
  way: STILL,
});

function strewn(seed: number, depth: Depth, spots: number): Flotsam {
  const draw = random(hash(seed, 0x100f));
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
    const heal = rolled(draw),
      twice = draw() < PIECE.second,
      side = draw() * 2 * Math.PI;
    if (!at) continue;
    pieces.push(lying(pieces.length, at, heal));
    if (twice) {
      const q = along(at, tangentAt(at, side), 4).p;
      pieces.push(lying(pieces.length, open(depth, q) ? q : at, rolled(draw)));
    }
  }
  return { pieces, next: pieces.length };
}

function cached(
  f: Flotsam,
  cap: Cap,
  phase: number,
  seed: number,
  depth: Depth
): Flotsam {
  const draw = random(hash(seed, 0xcac0 + phase));
  const pieces = [...f.pieces];
  let next = f.next;
  for (let i = 0; i < HEAL.cache.count; i++) {
    const p = along(
      cap.center,
      tangentAt(cap.center, draw() * 2 * Math.PI),
      R * cap.radius * PIECE.within * Math.sqrt(draw())
    ).p;
    const heal = rolled(draw, HEAL.cache.found);
    const at = opened(depth, p);
    if (!at || toEdge(at, cap) < 0) continue;
    pieces.push(lying(next++, at, heal));
  }
  return { pieces, next };
}

export function overboard(
  f: Flotsam,
  at: Vec3,
  heals: readonly Rarity[],
  seed: number
): Flotsam {
  const draw = random(hash(seed, f.next));
  const thrown = heals.map(
    (heal, k): Loot => ({
      ...lying(f.next + k, at, heal),
      way: scale(tangentAt(at, draw() * 2 * Math.PI), PIECE.kick + k),
    })
  );
  return { pieces: [...f.pieces, ...thrown], next: f.next + heals.length };
}

export function drifted(f: Flotsam, dt: number, depth: Depth): Flotsam {
  if (f.pieces.every((l) => l.way === STILL)) return f;
  const k = Math.max(0, 1 - dt * PIECE.drift);
  const pieces = f.pieces.map((l): Loot => {
    if (l.way === STILL) return l;
    const speed = Math.hypot(...l.way);
    if (speed < 1e-3) return { ...l, age: l.age + dt, way: STILL };
    const moved = along(l.at, scale(l.way, 1 / speed), speed * dt);
    return open(depth, moved.p)
      ? { ...l, age: l.age + dt, at: moved.p, way: scale(moved.t, speed * k) }
      : { ...l, age: l.age + dt, way: STILL };
  });
  return { ...f, pieces };
}

export const REACH = Math.cos(PIECE.reach / R);

export const within = (p: Vec3, l: Loot) => dot(p, l.at) > REACH;

export interface Taken {
  id: number;
  ship: number;
  heal: Rarity;
  at: Vec3;
  slot: number;
}

export function swept(
  f: Flotsam,
  crews: readonly Crew[],
  fleet: readonly Vessel[]
): { flotsam: Flotsam; crews: Crew[]; took: Taken[] } {
  let pieces = f.pieces,
    next = f.next;
  const took: Taken[] = [];
  const by = new Map(crews.map((c) => [c.id, c]));
  for (const v of [...fleet].sort((a, b) => a.id - b.id)) {
    let c = by.get(v.id);
    if (!c || c.health.hull <= 0) continue;
    const p = v.ship.at;
    if (!pieces.some((l) => within(p, l))) continue;
    const kept: Loot[] = [],
      thrown: Loot[] = [];
    for (const l of pieces) {
      const s: ReturnType<typeof stowed> = within(p, l)
        ? stowed(c.hold, l.heal)
        : null;
      if (!s) {
        kept.push(l);
        continue;
      }
      c = { ...c, hold: s.hold };
      took.push({ id: l.id, ship: v.id, heal: l.heal, at: l.at, slot: s.slot });
      if (s.dropped) thrown.push(lying(next++, p, s.dropped));
    }
    pieces = [...kept, ...thrown];
    by.set(v.id, c);
  }
  return {
    flotsam: { pieces, next },
    crews: crews.map((c) => by.get(c.id)!),
    took,
  };
}

export function cargo(c: Crew): Rarity[] {
  const heals: Rarity[] = [];
  for (const k of c.hold.items) if (k) heals.push(k);
  return heals;
}
