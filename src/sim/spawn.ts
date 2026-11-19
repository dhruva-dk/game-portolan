// Where the ships put to sea at a match's start: every one already afloat, spread over the whole planet.
//
// The planet's open water is sounded once (berthing): points spread evenly over the sphere (a Fibonacci lattice, about
// LATTICE m apart), each kept if the water there is deep enough to sail with room to spare, and stays so `clear` m all
// round, so no ship starts on a bank or under a coast. A match then picks its berths from those (berths): the first
// where its seed says, each next the one farthest from every berth taken so far (its distance a little shaken by the
// seed, so matches differ), then each moved in turn to the berth farthest from its nearest two, which spreads them as
// far apart as the water allows: on SEED's planet (a tenth of its lattice open) the nearest two some 345 m apart for 20
// ships, 145 m for 50, 80 m for 80 and 70 m for 100, all outside a ram. Each heads the way the water is open longest
// ahead of her, so none starts bows-on to a shore.
//
// Pure and deterministic: the same planet and seed give the same berths, to the bit.

import { random } from '../world/random.ts';
import { R, add, along, distance, frameAt, scale, type Vec3 } from '../world/sphere.ts';
import { SHIP } from './handling.ts';
import type { Depth } from './shoal.ts';

export const SPAWN = {
  /** Metres between the lattice's points (about). */
  lattice: 32,
  /** Water this much deeper than her draught at her berth and all round it, out to `clear` metres in rings `ring` m
   *  apart, `round` soundings on the outermost. */
  depth: 1.5, clear: 45, ring: 15, round: 16,
  /** How much a candidate's distance is shaken by the seed: up to this share. */
  shake: 0.08,
  /** Rounds of moving each berth in turn to the open point farthest from the rest. */
  rounds: 6,
  /** The bearings looked along for her heading, and how far, metres, sounded every `step`. */
  bearings: 16, ahead: 160, step: 8,
} as const;

/** A ship's berth at the start: where she lies (a unit vector) and the way she heads (a unit tangent there). */
export interface Spawn { at: Vec3; heading: Vec3 }

/** The planet's open water, as a match's berths are picked from it. */
export interface Berthing { readonly points: readonly Vec3[] }

/** Points spread evenly over the sphere, `count` of them (a Fibonacci lattice). */
function lattice(count: number): Vec3[] {
  const golden = Math.PI * (3 - Math.sqrt(5));
  return Array.from({ length: count }, (_, i) => {
    const y = 1 - (2 * (i + 0.5)) / count, s = Math.sqrt(1 - y * y), a = i * golden;
    return [Math.cos(a) * s, y, Math.sin(a) * s] as Vec3;
  });
}

/** The tangent at `at` on bearing b (radians clockwise from north). */
const bearing = (at: Vec3, b: number): Vec3 => {
  const f = frameAt(at);
  return add(scale(f.north, Math.cos(b)), f.east, Math.sin(b));
};

/** Whether a ship may lie at p with water to spare all round her. */
function open(p: Vec3, depth: Depth): boolean {
  const deep = SHIP.draught + SPAWN.depth;
  if (depth(p) < deep) return false;
  for (let r = SPAWN.ring; r <= SPAWN.clear; r += SPAWN.ring) {
    const n = Math.max(6, Math.round((SPAWN.round * r) / SPAWN.clear));
    for (let k = 0; k < n; k++) if (depth(along(p, bearing(p, (2 * Math.PI * k) / n), r).p) < deep) return false;
  }
  return true;
}

/** Sounds the planet's open water for berths (once a planet: some tens of thousands of soundings). */
export function berthing(depth: Depth): Berthing {
  const area = 4 * Math.PI * R * R, count = Math.round(area / (SPAWN.lattice * SPAWN.lattice));
  return { points: lattice(count).filter((p) => open(p, depth)) };
}

/** Metres of open water ahead of a ship at p on tangent t, up to SPAWN.ahead. */
function run(p: Vec3, t: Vec3, depth: Depth): number {
  const deep = SHIP.draught + SPAWN.depth;
  for (let d = SPAWN.step; d <= SPAWN.ahead; d += SPAWN.step) if (depth(along(p, t, d).p) < deep) return d - SPAWN.step;
  return SPAWN.ahead;
}

/** Chord length between unit vectors, squared: orders like the distance along the surface. */
const apart = (a: Vec3, b: Vec3) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;

/**
 * The berths of `count` ships for the match of `seed`, from the open water: as far apart as it allows, each heading
 * the way the water is open longest. The first is the player's.
 */
export function berths(water: Berthing, seed: number, count: number, depth: Depth): Spawn[] {
  const rand = random(seed * 69069 + 11), points = water.points, n = points.length;
  if (n === 0) return [];
  const shake = Float64Array.from(points, () => 1 - SPAWN.shake * rand());
  // for each point, its nearest berth and the next nearest: how far (chord², shaken) and which
  const near1 = new Float64Array(n).fill(Infinity), near2 = new Float64Array(n).fill(Infinity);
  const of1 = new Int32Array(n).fill(-1), of2 = new Int32Array(n).fill(-1);
  const taken: number[] = [];
  /** Berth b now at point q: each point's two nearest kept. */
  const meet = (b: number, q: Vec3) => {
    for (let i = 0; i < n; i++) {
      const d = apart(points[i], q) * shake[i];
      if (d < near1[i]) [near2[i], of2[i], near1[i], of1[i]] = [near1[i], of1[i], d, b];
      else if (d < near2[i]) [near2[i], of2[i]] = [d, b];
    }
  };
  /** Point i's two nearest worked out afresh from every berth. */
  const again = (i: number) => {
    near1[i] = near2[i] = Infinity;
    of1[i] = of2[i] = -1;
    taken.forEach((t, b) => {
      const d = apart(points[i], points[t]) * shake[i];
      if (d < near1[i]) [near2[i], of2[i], near1[i], of1[i]] = [near1[i], of1[i], d, b];
      else if (d < near2[i]) [near2[i], of2[i]] = [d, b];
    });
  };
  /** The point farthest from every berth but b's (b = -1: from every berth). */
  const farthest = (b: number) => {
    let best = 0, far = -1;
    for (let i = 0; i < n; i++) {
      const s = of1[i] === b ? near2[i] : near1[i];
      if (s > far) [best, far] = [i, s];
    }
    return best;
  };
  // first each berth the farthest from those before it; then each moved in turn to the point farthest from the rest
  // (fewer open points than ships, which only a planet of land would ask: the rest share the farthest again)
  for (let b = 0; b < count; b++) {
    const i = b === 0 ? Math.floor(rand() * n) : farthest(-1);
    taken.push(i);
    meet(b, points[i]);
  }
  for (let round = 0; round < SPAWN.rounds; round++) {
    for (let b = 0; b < count; b++) {
      const i = farthest(b);
      if (i === taken[b]) continue;
      taken[b] = i;
      for (let k = 0; k < n; k++) if (of1[k] === b || of2[k] === b) again(k);
      for (let k = 0; k < n; k++) {
        if (of1[k] === b || of2[k] === b) continue;
        const d = apart(points[k], points[i]) * shake[k];
        if (d < near1[k]) [near2[k], of2[k], near1[k], of1[k]] = [near1[k], of1[k], d, b];
        else if (d < near2[k]) [near2[k], of2[k]] = [d, b];
      }
    }
  }
  return taken.map((i) => {
    const at = points[i], turn = rand() * 2 * Math.PI;
    let heading = bearing(at, turn), most = -1;
    for (let k = 0; k < SPAWN.bearings; k++) {
      const t = bearing(at, turn + (2 * Math.PI * k) / SPAWN.bearings), m = run(at, t, depth);
      if (m > most) [heading, most] = [t, m];
    }
    return { at, heading: scale(heading, 1 / Math.hypot(...heading)) };
  });
}

/** The least distance between any two berths, metres along the surface. */
export function closest(spawns: readonly Spawn[]): number {
  let least = Infinity;
  for (let i = 0; i < spawns.length; i++) for (let j = i + 1; j < spawns.length; j++) {
    const a = spawns[i].at, b = spawns[j].at;
    least = Math.min(least, distance(a, b));
  }
  return least;
}
