import { availableParallelism } from 'node:os';
import { Worker } from 'node:worker_threads';
import type { MatchScenario, Summary } from './match.ts';

export const CORES = Math.max(1, availableParallelism() - 1);

export interface Job {
  scenario: MatchScenario;
  dir: string;
}

interface Options {
  workers?: number;
  timeout?: number;
  done?: (s: Summary, job: Job, n: number) => void;
}

export function runPool(
  jobs: readonly Job[],
  { workers = CORES, timeout = 1_800_000, done = () => {} }: Options = {}
): Promise<Summary[]> {
  const out: Summary[] = new Array(jobs.length);
  let next = 0,
    finished = 0;
  return new Promise((resolve, reject) => {
    if (jobs.length === 0) return resolve(out);
    const pool: Worker[] = [];
    const fail = (e: Error) => {
      for (const w of pool) void w.terminate();
      reject(e);
    };
    for (let i = 0; i < Math.min(workers, jobs.length); i++) {
      const w = new Worker(new URL('./worker.ts', import.meta.url));
      pool.push(w);
      let at = -1,
        timer: ReturnType<typeof setTimeout> | undefined;
      const feed = () => {
        if (next >= jobs.length) return void w.terminate();
        at = next++;
        timer = setTimeout(
          () => fail(new Error(`${jobs[at].dir} ran past ${timeout} ms`)),
          timeout
        );
        w.postMessage(jobs[at]);
      };
      w.on('message', (m: { ok?: Summary; error?: string }) => {
        clearTimeout(timer);
        if (m.error || m.ok === undefined)
          return fail(new Error(`${jobs[at].dir}: ${m.error ?? 'no result'}`));
        out[at] = m.ok;
        done(m.ok, jobs[at], ++finished);
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
