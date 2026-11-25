import { random } from '../world/random.ts';
import { R, along, bearingAt, scale, type Vec3 } from '../world/sphere.ts';
import { SHIP } from './handling.ts';
import type { ShipSpec } from './setup.ts';
import type { Depth } from './shoal.ts';

export const SPAWN = {
  lattice: 32,
  depth: 1.5,
  clear: 45,
  ring: 15,
  round: 16,
  shake: 0.08,
  rounds: 6,
  bearings: 16,
  ahead: 160,
  step: 8,
} as const;

export interface Spawn {
  at: Vec3;
  heading: Vec3;
}

export interface Berthing {
  readonly points: readonly Vec3[];
}

function lattice(count: number): Vec3[] {
  const golden = Math.PI * (3 - Math.sqrt(5));
  return Array.from({ length: count }, (_, i): Vec3 => {
    const y = 1 - (2 * (i + 0.5)) / count,
      s = Math.sqrt(1 - y * y),
      a = i * golden;
    return [Math.cos(a) * s, y, Math.sin(a) * s];
  });
}

function open(p: Vec3, depth: Depth): boolean {
  const deep = SHIP.draft + SPAWN.depth;
  if (depth(p) < deep) return false;
  for (let r = SPAWN.ring; r <= SPAWN.clear; r += SPAWN.ring) {
    const n = Math.max(6, Math.round((SPAWN.round * r) / SPAWN.clear));
    for (let k = 0; k < n; k++)
      if (depth(along(p, bearingAt(p, (2 * Math.PI * k) / n), r).p) < deep)
        return false;
  }
  return true;
}

export function berthing(depth: Depth): Berthing {
  const area = 4 * Math.PI * R * R,
    count = Math.round(area / (SPAWN.lattice * SPAWN.lattice));
  return { points: lattice(count).filter((p) => open(p, depth)) };
}

function run(p: Vec3, t: Vec3, depth: Depth): number {
  const deep = SHIP.draft + SPAWN.depth;
  for (let d = SPAWN.step; d <= SPAWN.ahead; d += SPAWN.step)
    if (depth(along(p, t, d).p) < deep) return d - SPAWN.step;
  return SPAWN.ahead;
}

const apart = (a: Vec3, b: Vec3) =>
  (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;

export function pathOf(at: readonly Spawn[], seed: number): Spawn[] {
  const rand = random(seed * 40503 + 7),
    left = [...at],
    out: Spawn[] = [];
  let next = Math.floor(rand() * left.length);
  while (left.length > 0) {
    const [here] = left.splice(next, 1);
    out.push(here);
    let near = Infinity;
    for (let k = 0; k < left.length; k++) {
      const d = apart(left[k].at, here.at);
      if (d < near) [next, near] = [k, d];
    }
  }
  return out;
}

type Seat = Pick<ShipSpec, 'team' | 'slot' | 'standing'>;

export function byStanding(ships: readonly Seat[]): number[] {
  const standing = new Map<number, number>();
  for (const s of ships)
    standing.set(
      s.team,
      Math.min(standing.get(s.team) ?? s.standing, s.standing)
    );
  const of = (id: number) => standing.get(ships[id].team) ?? 0;
  return ships
    .map((_, id) => id)
    .sort(
      (a, b) =>
        of(a) - of(b) ||
        ships[a].team - ships[b].team ||
        ships[a].slot - ships[b].slot
    );
}

export function assigned(
  at: readonly Spawn[],
  seed: number,
  ships: readonly Seat[]
): Spawn[] {
  const path = pathOf(at, seed),
    out: Spawn[] = new Array<Spawn>(ships.length);
  byStanding(ships).forEach((id, k) => {
    out[id] = path[k];
  });
  return out;
}

export function berths(
  water: Berthing,
  seed: number,
  count: number,
  depth: Depth
): Spawn[] {
  const rand = random(seed * 69069 + 11),
    points = water.points,
    n = points.length;
  if (n === 0) return [];
  const shake = Float64Array.from(points, () => 1 - SPAWN.shake * rand());
  const near1 = new Float64Array(n).fill(Infinity),
    near2 = new Float64Array(n).fill(Infinity);
  const of1 = new Int32Array(n).fill(-1),
    of2 = new Int32Array(n).fill(-1);
  const taken: number[] = [];
  const meet = (b: number, q: Vec3) => {
    for (let i = 0; i < n; i++) {
      const d = apart(points[i], q) * shake[i];
      if (d < near1[i])
        [near2[i], of2[i], near1[i], of1[i]] = [near1[i], of1[i], d, b];
      else if (d < near2[i]) [near2[i], of2[i]] = [d, b];
    }
  };
  const again = (i: number) => {
    near1[i] = near2[i] = Infinity;
    of1[i] = of2[i] = -1;
    taken.forEach((t, b) => {
      const d = apart(points[i], points[t]) * shake[i];
      if (d < near1[i])
        [near2[i], of2[i], near1[i], of1[i]] = [near1[i], of1[i], d, b];
      else if (d < near2[i]) [near2[i], of2[i]] = [d, b];
    });
  };
  const farthest = (b: number) => {
    let best = 0,
      far = -1;
    for (let i = 0; i < n; i++) {
      const s = of1[i] === b ? near2[i] : near1[i];
      if (s > far) [best, far] = [i, s];
    }
    return best;
  };
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
        if (d < near1[k])
          [near2[k], of2[k], near1[k], of1[k]] = [near1[k], of1[k], d, b];
        else if (d < near2[k]) [near2[k], of2[k]] = [d, b];
      }
    }
  }
  return taken.map((i) => {
    const at = points[i],
      turn = rand() * 2 * Math.PI;
    let heading = bearingAt(at, turn),
      most = -1;
    for (let k = 0; k < SPAWN.bearings; k++) {
      const t = bearingAt(at, turn + (2 * Math.PI * k) / SPAWN.bearings),
        m = run(at, t, depth);
      if (m > most) [heading, most] = [t, m];
    }
    return { at, heading: scale(heading, 1 / Math.hypot(...heading)) };
  });
}
