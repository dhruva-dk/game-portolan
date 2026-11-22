// A planet as the harness sails it: its land, its depth, and its water sounded
// for the bots' chart and the ships' berths (play/state.ts Waters), made once
// per planet seed in each process and kept (a worker runs many matches on it):
// the few last asked for, not all, since a career sails a planet a round.
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

/** Planets kept made, the last asked for first to stay. */
export const KEPT = 4;

/** The planets made, in the order last asked for (a Map keeps its order of setting). */
const made = new Map<number, World>();

/** The planets kept now, the longest unasked first. */
export const keptWorlds = (): number[] => [...made.keys()];

/** The planet of this seed (the game's own if not given), made once while it is kept. */
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
  const waters = { chart: chart(depth), water: berthing(depth) };
  const w = { seed, planet, depth, waters, ms: performance.now() - t };
  made.set(seed, w);
  return w;
}
