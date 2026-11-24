// A sim worker: sails each match it is sent (match.ts runMatch) into its
// folder and posts back the summary, or the error it met. Its planets are made
// once and kept (world.ts).
//
// Node only (tools/).

import { parentPort } from 'node:worker_threads';
import type { Job } from './pool.ts';
import { runMatch } from './match.ts';

parentPort!.on('message', (job: Job) => {
  try {
    parentPort!.postMessage({ ok: runMatch(job.scenario, job.dir) });
  } catch (e) {
    parentPort!.postMessage({
      error: e instanceof Error ? (e.stack ?? e.message) : String(e),
      job,
    });
  }
});
