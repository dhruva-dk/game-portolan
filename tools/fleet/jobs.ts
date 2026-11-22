// The kinds of job the fleet runs. A job is one process on one host that makes
// one shard's result: plain data that must come out the same, to the bit,
// wherever it is run (job.ts hashes it, and that hash is what two hosts are
// compared by), and beside it what is the machine's own (its times), never
// hashed. A new kind is an entry here (what a shard of it is, how long one may
// take, and how it is run) and the function that runs it, in jobs/. A kind's
// code is loaded only when a job of it runs.
//
// Node only (tools/).

/** What a job made: its result (hashed), and what is only this machine's (not). */
export interface Ran {
  result: unknown;
  aside?: unknown;
}

export interface JobKind {
  /** What a shard of it names. */
  shard: string;
  /** Seconds one may take on a lab host before it is killed. */
  seconds: number;
  /** A shard run. */
  run(shard: string): Promise<Ran>;
}

/** A job whose result is all it made. */
const only = async (result: unknown | Promise<unknown>): Promise<Ran> => ({
  result: await result,
});

export const JOBS: Record<string, JobKind> = {
  // Today's 80-ship match of bots, as the harness runs it (tools/harness/run.ts).
  match: {
    shard:
      'the match dealt (1 the first) on the game’s planet, or <planet seed>-<match>',
    seconds: 300,
    run: async (shard) => only((await import('./jobs/match.ts')).match(shard)),
  },

  // The repository's goldens (tests/golden/run.ts), as its tests pin them.
  golden: {
    shard:
      '`dealt` (the match the seed deals), or a match type’s name with dashes for spaces',
    seconds: 300,
    run: async (shard) => only((await import('./jobs/match.ts')).pinned(shard)),
  },

  // Every function of Math on a draw of numbers: which, if any, differ by machine.
  math: {
    shard: 'the seed the numbers are drawn by',
    seconds: 120,
    run: async (shard) => only((await import('./jobs/math.ts')).math(shard)),
  },

  // Which call of Math first differs in a real match: to find a fault.
  calls: {
    shard:
      'a match on the game’s planet (the chunks’ hashes), or <match>.<chunk> (that chunk’s calls)',
    seconds: 900,
    run: async (shard) => only((await import('./jobs/calls.ts')).calls(shard)),
  },

  // One carded race of spec ships on its seed's planet, as tools/race.ts sails it.
  race: {
    shard: '<seed>, or <seed>-<teams> (20 teams if not given)',
    seconds: 300,
    run: async (shard) => (await import('./jobs/race.ts')).race(shard),
  },

  // One whole career on real races, as tools/career/run.ts sails it (sail.ts).
  career: {
    shard: '<idle|sensible|shrewd>-<seed>-<seasons>',
    // a season is about five minutes of a lab thread: ten seasons' room, and half again
    seconds: 4800,
    run: async (shard) => (await import('./jobs/career.ts')).career(shard),
  },
};
