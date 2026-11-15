// How a match is set up on the world: where her ship lies in the lobby's quiet sea (and a match at sea about her, for
// debugging), the planet's water sounded for the bots' chart and the ships' berths, and the matches dealt one after
// another, each with its storm, its berths and its bots' minds.

import { SHIPS } from '../sim/match.ts';
import { charted } from '../sim/route.ts';
import type { Spawn } from '../sim/spawn.ts';
import { createStorm, type Storm } from '../sim/storm.ts';
import type { Planet } from '../world/planet.ts';
import { along, frameAt, scale, toChart, type Vec3 } from '../world/sphere.ts';
import { deal } from './deal.ts';
import { fleetOf, type Match, type Waters } from './match.ts';

/** Metres off the coast she lies at the start. */
const START = 80;

/** Where her ship lies at the start: on the water south of the largest island, START metres off its coast, heading
 *  north toward it (bearing 0). */
export function startOf(planet: Planet): { at: Vec3; bearing: number } {
  const largest = planet.islands[0], southward = scale(frameAt(largest.chart.at).north, -1);
  const [cx, cz] = toChart(largest.chart, along(largest.chart.at, southward, 1).p);
  return { at: along(largest.chart.at, southward, largest.coast(Math.atan2(cz, cx)) + START).p, bearing: 0 };
}

/** A match's berths worked out off the main thread, by its seed and how many ships it puts to sea. */
export type Berther = (match: number, count: number) => Promise<Spawn[]>;

/** The water of a planet of this seed as the match reads it (state.ts Waters), sounded in a worker (sounding.ts)
 *  while the ground's bakes in its own (land/bake.ts); the milliseconds the sounding took; and the worker kept to berth
 *  each match on it. */
export function watersOf(seed: number): Promise<{ waters: Waters; ms: number; berth: Berther }> {
  const worker = new Worker(new URL('./sounding.ts', import.meta.url), { type: 'module' });
  const asked = new Map<number, (spawns: Spawn[]) => void>();
  const berth: Berther = (match, count) => new Promise((resolve) => {
    asked.set(match, resolve);
    worker.postMessage({ match, count });
  });
  const vec = (b: Float64Array, i: number): Vec3 => [b[i], b[i + 1], b[i + 2]];
  return new Promise((resolve, reject) => {
    worker.onmessage = (e: MessageEvent<{ open: Uint8Array; clear: Uint8Array; berths: Float64Array; ms: number } | { match: number; spawns: Float64Array }>) => {
      if ('match' in e.data) {
        const { match, spawns: b } = e.data;
        asked.get(match)?.(Array.from({ length: b.length / 6 }, (_, i): Spawn => ({ at: vec(b, 6 * i), heading: vec(b, 6 * i + 3) })));
        asked.delete(match);
        return;
      }
      const b = e.data.berths, points = Array.from({ length: b.length / 3 }, (_, i) => vec(b, 3 * i));
      resolve({ waters: { chart: charted(e.data), water: { points } }, ms: e.data.ms, berth });
    };
    worker.onerror = (e) => reject(new Error(e.message));
    worker.postMessage({ seed });
  });
}

/**
 * The matches on a planet of this seed: the first on the planet's own seed, each next one dealt a seed of its own (its
 * storm and its bots' minds come from it). hold: seconds the storm is held at, or null to let it run; gun: the gun
 * every ship is armed with, or null for none. Each is a race dealt from its seed (play/deal.ts) of `count` ships.
 */
export function createMatches(seed: number, planet: Planet, hold: number | null, gun: Match['gun'], count: number = SHIPS) {
  const depth = (p: Vec3) => -planet.height(p);
  const match = (s: number): Match => {
    const closing = createStorm(s, depth);
    return { seed: s, storm: (t) => closing(hold ?? t), gun, card: deal(s, count) };
  };
  let played = 0, berth: Berther | null = null;
  /** The next match's seed, and its berths once worked out ahead of its deal. */
  const next = () => seed + 7919 * (played + 1);
  let ahead: { seed: number; berths: Spawn[] } | null = null;
  const prepare = () => {
    const s = next();
    void berth?.(s, fleetOf(match(s))).then((berths) => {
      if (s === next()) ahead = { seed: s, berths };
    });
  };
  const first = match(seed);
  return {
    first,
    /** The storm of the first match, by its clock (s). */
    storm: (t: number): Storm => first.storm(t),
    /** Each next match's berths worked out by `by` (watersOf's) while the one before is in hand. */
    berthBy(by: Berther) {
      berth = by;
      prepare();
    },
    /** The next match, for PLAY: its berths with it if they were worked out in time. */
    deal(): Match {
      const s = seed + 7919 * ++played, berths = ahead?.seed === s ? ahead.berths : undefined;
      ahead = null;
      prepare();
      return { ...match(s), berths };
    },
  };
}

export type Matches = ReturnType<typeof createMatches>;
