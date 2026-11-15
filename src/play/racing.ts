// A module Worker: the league's races run off the main thread (league.ts), one at a time, each whole (race.ts
// runRace) on the planet of the seed it was made for, its water sounded once.
//   in:  { seed }               the planet's (once, first)
//   in:  { race, card }         out: { race, result } (race.ts RaceResult), or { race, error }

import type { RaceCard } from '../race';
import { chart } from '../sim/route';
import { berthing } from '../sim/spawn';
import { createPlanet, type Planet } from '../world/planet';
import type { Vec3 } from '../world/sphere';
import { runRace } from './race';
import type { Waters } from './match';

let world: { planet: Planet; waters: Waters } | null = null;

self.onmessage = (e: MessageEvent<{ seed: number } | { race: number; card: RaceCard }>) => {
  if ('seed' in e.data) {
    const planet = createPlanet(e.data.seed), depth = (p: Vec3) => -planet.height(p);
    world = { planet, waters: { chart: chart(depth), water: berthing(depth) } };
    return;
  }
  const { race, card } = e.data;
  try {
    if (!world) throw new Error('no planet');
    self.postMessage({ race, result: runRace(card, world.planet, world.waters) });
  } catch (err) {
    self.postMessage({ race, error: String(err) });
  }
};
