import { Worker } from 'node:worker_threads';
import type { CareerState } from '../../src/career/state.ts';
import type { CareerRun, Told } from './career.ts';

type Message = { told?: Told; state?: CareerState; error?: string };

export function runCareers(
  runs: readonly CareerRun[],
  workers: number,
  tell: (run: number, told: Told) => void = () => {}
): Promise<CareerState[]> {
  const out: CareerState[] = new Array(runs.length);
  let next = 0,
    finished = 0;
  return new Promise((resolve, reject) => {
    if (runs.length === 0) return resolve(out);
    const pool: Worker[] = [];
    const fail = (e: Error) => {
      for (const w of pool) void w.terminate();
      reject(e);
    };
    for (let i = 0; i < Math.min(Math.max(1, workers), runs.length); i++) {
      const w = new Worker(new URL('./career-worker.ts', import.meta.url));
      pool.push(w);
      let at = -1;
      const feed = () => {
        if (next >= runs.length) return void w.terminate();
        at = next++;
        w.postMessage(runs[at]);
      };
      w.on('message', (m: Message) => {
        if (m.told) return tell(at, m.told);
        if (m.error || m.state === undefined)
          return fail(
            new Error(`career ${runs[at].seed}: ${m.error ?? 'no state'}`)
          );
        out[at] = m.state;
        if (++finished === runs.length) {
          for (const k of pool) void k.terminate();
          resolve(out);
        } else feed();
      });
      w.on('error', fail);
      feed();
    }
  });
}
