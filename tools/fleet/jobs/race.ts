// The fleet's job of one carded race (jobs.ts JOBS race): spec ships on the
// planet of the race's seed, as tools/race.ts sails it. Its result is the
// race's whole result; the time it took is the machine's.
//
// Node only (tools/).

import { runRace, specField } from '../../../src/play/race.ts';
import { TEAMS } from '../../../src/race.ts';
import { worldOf } from '../../harness/world.ts';
import type { Ran } from '../jobs.ts';

/** A race's shard read: `<seed>` or `<seed>-<teams>`. */
export function raceShard(shard: string): { seed: number; teams: number } {
  const m = /^(\d+)(?:-(\d+))?$/.exec(shard);
  const seed = Number(m?.[1]),
    teams = Number(m?.[2] ?? TEAMS);
  if (!m || !Number.isSafeInteger(seed) || teams < 1 || teams > TEAMS)
    throw new Error(`not a race's shard: ${shard}`);
  return { seed, teams };
}

export async function race(shard: string): Promise<Ran> {
  const { seed, teams } = raceShard(shard);
  const world = worldOf(seed),
    began = performance.now(),
    result = runRace(specField(seed, teams), world.planet, world.waters);
  return {
    result,
    aside: { planetMs: world.ms, raceMs: performance.now() - began },
  };
}
