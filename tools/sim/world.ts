import { SEED } from '../../src/world/environment.ts';
import { watersAt, type Waters } from '../../src/sim/waters.ts';
import { landOf, planetOf } from '../../src/world/land.ts';
import type { Planet } from '../../src/world/planet.ts';
import type { Vec3 } from '../../src/world/sphere.ts';

export interface World {
  seed: number;
  planet: Planet;
  depth: (p: Vec3) => number;
  waters: Waters;
  ms: number;
}

export const KEPT = 4;

const made = new Map<number, World>();

export const keptWorlds = (): number[] => [...made.keys()];

export function worldOf(seed: number = SEED): World {
  const kept = made.get(seed);
  if (kept) {
    made.delete(seed);
    made.set(seed, kept);
    return kept;
  }
  for (const old of made.keys()) {
    if (made.size < KEPT) break;
    made.delete(old);
  }
  const t = performance.now();
  const planet = planetOf(seed, landOf(seed));
  const depth = (p: Vec3) => -planet.height(p);
  const waters = watersAt(depth);
  const w = { seed, planet, depth, waters, ms: performance.now() - t };
  made.set(seed, w);
  return w;
}
