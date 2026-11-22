// A module Worker: sails races by their cards off the main thread (race.ts
// runRace), each to its end on the planet of a seed, while the page's own race
// is sailed by hand: a career's other championships race the same day.
//   in:  { seed, land, cards }   out: the cards' results, in the cards' order

import type { RaceCard } from '../race.ts';
import { chart } from '../sim/route.ts';
import { berthing } from '../sim/spawn.ts';
import { planetOf, type Land } from '../world/land.ts';
import type { Vec3 } from '../world/sphere.ts';
import { runRace } from './race.ts';

self.onmessage = (
  e: MessageEvent<{ seed: number; land: Land; cards: readonly RaceCard[] }>
) => {
  const planet = planetOf(e.data.seed, e.data.land);
  const depth = (p: Vec3) => -planet.height(p);
  const waters = { chart: chart(depth), water: berthing(depth) };
  self.postMessage(e.data.cards.map((card) => runRace(card, planet, waters)));
};
