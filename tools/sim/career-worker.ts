import { parentPort } from 'node:worker_threads';
import { runCareer, type CareerRun } from './career.ts';

parentPort!.on('message', (run: CareerRun) => {
  try {
    const state = runCareer(run, (told) => parentPort!.postMessage({ told }));
    parentPort!.postMessage({ state });
  } catch (e) {
    parentPort!.postMessage({
      error: e instanceof Error ? (e.stack ?? e.message) : String(e),
    });
  }
});
