// How a match is set up on the world: where her ship lies in the lobby's quiet sea (and a match at sea about her, for
// debugging), the planet's water sounded for the bots' chart and the ships' berths, and the matches dealt one after
// another, each with its storm, its berths and its bots' minds.

import { charted } from '../sim/route.ts';
import { createStorm, type Storm } from '../sim/storm.ts';
import type { Planet } from '../world/planet.ts';
import { along, frameAt, scale, toChart, type Vec3 } from '../world/sphere.ts';
import type { Match, Waters } from './state.ts';

/** Metres off the coast she lies at the start. */
const START = 80;

/** Where her ship lies at the start: on the water south of the largest island, START metres off its coast, heading
 *  north toward it (bearing 0). */
export function startOf(planet: Planet): { at: Vec3; bearing: number } {
  const largest = planet.islands[0], southward = scale(frameAt(largest.chart.at).north, -1);
  const [cx, cz] = toChart(largest.chart, along(largest.chart.at, southward, 1).p);
  return { at: along(largest.chart.at, southward, largest.coast(Math.atan2(cz, cx)) + START).p, bearing: 0 };
}

/** The water of a planet of this seed as the match reads it (state.ts Waters), sounded in a worker (sounding.ts)
 *  while the ground's bakes in its own (land/bake.ts); and the milliseconds the sounding took. */
export function watersOf(seed: number): Promise<{ waters: Waters; ms: number }> {
  const worker = new Worker(new URL('./sounding.ts', import.meta.url), { type: 'module' });
  return new Promise((resolve, reject) => {
    worker.onmessage = (e: MessageEvent<{ open: Uint8Array; clear: Uint8Array; berths: Float64Array; ms: number }>) => {
      worker.terminate();
      const b = e.data.berths, points = Array.from({ length: b.length / 3 }, (_, i): Vec3 => [b[3 * i], b[3 * i + 1], b[3 * i + 2]]);
      resolve({ waters: { chart: charted(e.data), water: { points } }, ms: e.data.ms });
    };
    worker.onerror = (e) => reject(new Error(e.message));
    worker.postMessage({ seed });
  });
}

/**
 * The matches on a planet of this seed: the first on the planet's own seed, each next one dealt a seed of its own (its
 * storm and its bots' minds come from it). hold: seconds the storm is held at, or null to let it run; gun: the rarity
 * every ship is armed with, or null for none.
 */
export function createMatches(seed: number, planet: Planet, hold: number | null, gun: number | null) {
  const depth = (p: Vec3) => -planet.height(p);
  const match = (s: number): Match => {
    const closing = createStorm(s, depth);
    return { seed: s, storm: (t) => closing(hold ?? t), gun };
  };
  let played = 0;
  const first = match(seed);
  return {
    first,
    /** The storm of the first match, by its clock (s). */
    storm: (t: number): Storm => first.storm(t),
    /** The next match, for PLAY. */
    deal: (): Match => match(seed + 7919 * ++played),
  };
}

export type Matches = ReturnType<typeof createMatches>;
