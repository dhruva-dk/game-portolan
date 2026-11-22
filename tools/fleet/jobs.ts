// The kinds of job the fleet runs. A job is one process on one host that makes
// one shard's result: plain data that must come out the same, to the bit,
// wherever it is run (job.ts hashes it, and that hash is what two hosts are
// compared by). A new kind is an entry here (what a shard of it is, how long
// one may take, and how it is run) and the function that runs it, in jobs/.
// A kind's code is loaded only when a job of it runs.
//
// Node only (tools/).

export interface JobKind {
  /** What a shard of it names. */
  shard: string;
  /** Seconds one may take on a lab host before it is killed. */
  seconds: number;
  /** A shard's result: the same on every machine. */
  run(shard: string): Promise<unknown>;
}

export const JOBS: Record<string, JobKind> = {
  // Today's 80-ship match of bots, as the harness runs it (tools/harness/run.ts).
  match: {
    shard:
      'the match dealt (1 the first) on the game’s planet, or <planet seed>-<match>',
    seconds: 300,
    run: async (shard) => (await import('./jobs/match.ts')).match(shard),
  },

  // The repository's goldens (tests/golden/run.ts), as its tests pin them.
  golden: {
    shard:
      '`dealt` (the match the seed deals), or a match type’s name with dashes for spaces',
    seconds: 300,
    run: async (shard) => (await import('./jobs/match.ts')).pinned(shard),
  },

  // Every function of Math on a draw of numbers: which, if any, differ by machine.
  math: {
    shard: 'the seed the numbers are drawn by',
    seconds: 120,
    run: async (shard) => (await import('./jobs/math.ts')).math(shard),
  },

  // Which call of Math first differs in a real match: to find a fault.
  calls: {
    shard:
      'a match on the game’s planet (the chunks’ hashes), or <match>.<chunk> (that chunk’s calls)',
    seconds: 900,
    run: async (shard) => (await import('./jobs/calls.ts')).calls(shard),
  },
};
