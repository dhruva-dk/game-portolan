// How a match is set up on the world: the planet's water sounded for the bots'
// chart and the ships' berths, and the matches dealt one after another, each
// with its storm, its berths and its bots' minds.

import { SHIPS } from '../sim/match.ts';
import { charted } from '../sim/route.ts';
import type { Spawn } from '../sim/spawn.ts';
import { createStorm, type Storm } from '../sim/storm.ts';
import type { Land } from '../world/land.ts';
import type { Planet } from '../world/planet.ts';
import { STRIDE } from '../world/random.ts';
import type { Vec3 } from '../world/sphere.ts';
import type { Match, Waters } from './state.ts';

/** A match's berths worked out off the main thread, by its seed. */
type Berther = (match: number) => Promise<Spawn[]>;
/**
 * What the sounding worker answers: the water sounded (once), or a match's
 * berths (sounding.ts).
 */
type Sounded =
  | { open: Uint8Array; clear: Uint8Array; berths: Float64Array; ms: number }
  | { match: number; spawns: Float64Array };

/**
 * The water of a planet of this seed and land as the match reads it (state.ts
 * Waters), sounded in a worker (sounding.ts) while the ground's bakes in its
 * own (land/bake.ts); the milliseconds the sounding took; and the worker kept
 * to berth each match on it. The worker lives as long as the page: every match
 * dealt asks it for its berths ahead of its start (createMatches berthBy), and
 * it holds the water it sounded to work them out on.
 */
export function watersOf(
  seed: number,
  land: Land
): Promise<{ waters: Waters; ms: number; berth: Berther }> {
  const worker = new Worker(new URL('./sounding.ts', import.meta.url), {
    type: 'module',
  });
  const asked = new Map<number, (spawns: Spawn[]) => void>();
  const berth: Berther = (match) =>
    new Promise((resolve) => {
      asked.set(match, resolve);
      worker.postMessage({ match, count: SHIPS });
    });
  const vec = (b: Float64Array, i: number): Vec3 => [b[i], b[i + 1], b[i + 2]];
  return new Promise((resolve, reject) => {
    worker.onmessage = (e: MessageEvent<Sounded>) => {
      if ('match' in e.data) {
        const { match, spawns: b } = e.data;
        const spawn = (_: unknown, i: number): Spawn => ({
          at: vec(b, 6 * i),
          heading: vec(b, 6 * i + 3),
        });
        asked.get(match)?.(Array.from({ length: b.length / 6 }, spawn));
        asked.delete(match);
        return;
      }
      const b = e.data.berths,
        points = Array.from({ length: b.length / 3 }, (_, i) => vec(b, 3 * i));
      resolve({
        waters: { chart: charted(e.data), water: { points } },
        ms: e.data.ms,
        berth,
      });
    };
    worker.onerror = (e) => reject(new Error(e.message));
    worker.postMessage({ seed, land });
  });
}

/**
 * The matches on a planet of this seed: the first on the planet's own seed,
 * each next one dealt a seed of its own (its storm and its bots' minds come
 * from it). hold: seconds the storm is held at, or null to let it run; gun: the
 * gun every ship is armed with, or null for none.
 */
export function createMatches(
  seed: number,
  planet: Planet,
  hold: number | null,
  gun: Match['gun']
) {
  const depth = (p: Vec3) => -planet.height(p);
  const match = (s: number): Match => {
    const closing = createStorm(s, depth);
    return { seed: s, storm: (t) => closing(hold ?? t), gun };
  };
  let played = 0,
    berth: Berther | null = null;
  /**
   * The next match's seed, and its berths once worked out ahead of its deal.
   */
  const next = () => seed + STRIDE * (played + 1);
  let ahead: { seed: number; berths: Spawn[] } | null = null;
  const prepare = () => {
    const s = next();
    void berth?.(s).then((berths) => {
      if (s === next()) ahead = { seed: s, berths };
    });
  };
  const first = match(seed);
  return {
    first,
    /** The storm of the first match, by its clock (s). */
    storm: (t: number): Storm => first.storm(t),
    /**
     * Each next match's berths worked out by `by` (watersOf's) while the one
     * before is in hand.
     */
    berthBy(by: Berther) {
      berth = by;
      prepare();
    },
    /**
     * The next match, for PLAY: its berths with it if they were worked out in
     * time.
     */
    deal(): Match {
      const s = seed + STRIDE * ++played,
        berths = ahead?.seed === s ? ahead.berths : undefined;
      ahead = null;
      prepare();
      return { ...match(s), berths };
    },
  };
}

export type Matches = ReturnType<typeof createMatches>;
