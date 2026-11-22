// The fleet's job of one whole career (jobs.ts JOBS career): one manager, one
// seed, so many seasons, sailed as tools/career/run.ts sails it (sail.ts). Its
// result is the career's report less its wall times, which are the machine's
// own and go aside: two hosts' runs of a shard are the same to the bit.
//
// Node only (tools/).

import { MANAGERS, type Manager } from '../../career/managers.ts';
import { sail, type Report } from '../../career/sail.ts';
import type { Season } from '../../career/tally.ts';
import type { Ran } from '../jobs.ts';

/** A career's shard read: `<manager>-<seed>-<seasons>`. */
export function careerShard(shard: string): {
  manager: Manager;
  seed: number;
  seasons: number;
} {
  const m = /^([a-z]+)-(\d+)-(\d+)$/.exec(shard);
  const manager = MANAGERS.find((x) => x === m?.[1]),
    seed = Number(m?.[2]),
    seasons = Number(m?.[3]);
  if (!manager || !Number.isSafeInteger(seed) || !(seasons >= 1))
    throw new Error(
      `not a career's shard (<${MANAGERS.join('|')}>-<seed>-<seasons>): ${shard}`
    );
  return { manager, seed, seasons };
}

/** A season's record with its times taken out (its races' count kept: that is the career's). */
type Timeless<S> = Omit<S, 'wall'> & { wall: { races: number } };

/** A report parted: what is the career's (hashed), and its wall times (aside). */
export function parted<S extends Pick<Season, 'wall'>>(
  report: Omit<Report, 'records'> & { records: S[] }
): {
  result: Omit<Report, 'wall' | 'records'> & { records: Timeless<S>[] };
  aside: { ms: number; perSeason: number[]; seasons: Season['wall'][] };
} {
  const { wall, records, ...rest } = report;
  return {
    result: {
      ...rest,
      records: records.map((r) => ({ ...r, wall: { races: r.wall.races } })),
    },
    aside: { ...wall, seasons: records.map((r) => r.wall) },
  };
}

export async function career(shard: string): Promise<Ran> {
  const { manager, seed, seasons } = careerShard(shard);
  return parted(await sail(manager, seed, seasons));
}
