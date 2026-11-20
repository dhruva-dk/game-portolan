// A planet as the harness sails it: its land, its depth, and its water sounded
// for the bots' chart and the ships' berths (play/state.ts Waters), made once
// per planet seed in each process and kept (a worker runs many matches on it).
//
// Node only (tools/): no three, no browser.

import { SEED } from '../../src/environment.ts';
import type { Waters } from '../../src/play/state.ts';
import { chart } from '../../src/sim/route.ts';
import { berthing } from '../../src/sim/spawn.ts';
import { landOf, planetOf } from '../../src/world/land.ts';
import type { Planet } from '../../src/world/planet.ts';
import type { Vec3 } from '../../src/world/sphere.ts';

/** A planet made for the harness, and how long it took (ms). */
export interface World {
  seed: number;
  planet: Planet;
  depth: (p: Vec3) => number;
  waters: Waters;
  ms: number;
}

const made = new Map<number, World>();

/** The planet of this seed (the game's own if not given), made once. */
export function worldOf(seed: number = SEED): World {
  const kept = made.get(seed);
  if (kept) return kept;
  const t = performance.now();
  const planet = planetOf(seed, landOf(seed));
  const depth = (p: Vec3) => -planet.height(p);
  const waters = { chart: chart(depth), water: berthing(depth) };
  const w = { seed, planet, depth, waters, ms: performance.now() - t };
  made.set(seed, w);
  return w;
}
