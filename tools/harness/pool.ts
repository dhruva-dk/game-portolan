// Runs specs on a pool of workers (worker.ts), each its own thread with its own
// planet, and hands back every result in the specs' order. A spec that fails
// fails the whole run, with its error; one that runs past `timeout` ms too.
// Replays (replay.ts) are rendered on the same pool: each is a match run again
// in full, and a report wants one a planet.
//
// Node only (tools/).

import { availableParallelism } from 'node:os';
import { Worker } from 'node:worker_threads';
import type { Spec as Replay } from './replay.ts';
import type { Result, Spec } from './run.ts';

/** As many workers as the machine has cores, less one for everything else. */
export const CORES = Math.max(1, availableParallelism() - 1);

/** A replay to render, and the file to write it to. */
export interface ReplayJob {
  replay: Replay;
  out: string;
}

interface Options<R> {
  workers?: number;
  timeout?: number;
  done?: (r: R, n: number) => void;
}

/** Each job sent to a worker, what it posts back in the jobs' order. */
function work<J, R>(
  jobs: readonly J[],
  { workers = CORES, timeout = 600_000, done = () => {} }: Options<R> = {}
): Promise<R[]> {
  const out: R[] = new Array(jobs.length);
  let next = 0,
    finished = 0;
  const n = Math.min(workers, jobs.length);
  return new Promise((resolve, reject) => {
    if (jobs.length === 0) return resolve(out);
    const pool: Worker[] = [];
    const fail = (e: Error) => {
      for (const w of pool) void w.terminate();
      reject(e);
    };
    for (let i = 0; i < n; i++) {
      const w = new Worker(new URL('./worker.ts', import.meta.url));
      pool.push(w);
      let at = -1,
        timer: ReturnType<typeof setTimeout> | undefined;
      const feed = () => {
        if (next >= jobs.length) return void w.terminate();
        at = next++;
        timer = setTimeout(
          () =>
            fail(
              new Error(
                `job ${JSON.stringify(jobs[at])} ran past ${timeout} ms`
              )
            ),
          timeout
        );
        w.postMessage(jobs[at]);
      };
      w.on('message', (m: { ok?: R; error?: string }) => {
        clearTimeout(timer);
        if (m.error || m.ok === undefined)
          return fail(new Error(m.error ?? 'no result'));
        out[at] = m.ok;
        done(m.ok, ++finished);
        if (finished === jobs.length) {
          for (const k of pool) void k.terminate();
          resolve(out);
        } else feed();
      });
      w.on('error', fail);
      feed();
    }
  });
}

export const runPool = (specs: readonly Spec[], options?: Options<Result>) =>
  work<Spec, Result>(specs, options);

/** Each replay rendered to its file; back, a line on each. */
export const runReplays = (
  jobs: readonly ReplayJob[],
  options?: Options<string>
) => work<ReplayJob, string>(jobs, options);
