// Runs specs on a pool of workers (worker.ts), each its own thread with its own
// planet, and hands back every result in the specs' order. A spec that fails
// fails the whole run, with its error; one that runs past `timeout` ms too.
//
// Node only (tools/).

import { availableParallelism } from 'node:os';
import { Worker } from 'node:worker_threads';
import type { Result, Spec } from './run.ts';

/** As many workers as the machine has cores, less one for everything else. */
export const CORES = Math.max(1, availableParallelism() - 1);

export function runPool(
  specs: readonly Spec[],
  {
    workers = CORES,
    timeout = 600_000,
    done = (_r: Result, _n: number) => {},
  } = {}
): Promise<Result[]> {
  const out: Result[] = new Array(specs.length);
  let next = 0,
    finished = 0;
  const n = Math.min(workers, specs.length);
  return new Promise((resolve, reject) => {
    if (specs.length === 0) return resolve(out);
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
        if (next >= specs.length) return void w.terminate();
        at = next++;
        timer = setTimeout(
          () =>
            fail(
              new Error(
                `spec ${JSON.stringify(specs[at])} ran past ${timeout} ms`
              )
            ),
          timeout
        );
        w.postMessage(specs[at]);
      };
      w.on('message', (m: { ok?: Result; error?: string }) => {
        clearTimeout(timer);
        if (m.error || !m.ok) return fail(new Error(m.error ?? 'no result'));
        out[at] = m.ok;
        done(m.ok, ++finished);
        if (finished === specs.length) {
          for (const k of pool) void k.terminate();
          resolve(out);
        } else feed();
      });
      w.on('error', fail);
      feed();
    }
  });
}
