// A harness worker: runs each spec it is sent (run.ts runMatch) and posts back
// its result, or renders each replay it is sent (replay.ts) to its file and
// posts back a line on it; or the error it met. Its planets are made once and
// kept.
//
// Node only (tools/).

import { parentPort } from 'node:worker_threads';
import type { ReplayJob } from './pool.ts';
import { writeReplay } from './replay.ts';
import { runMatch, type Spec } from './run.ts';

parentPort!.on('message', (job: Spec | ReplayJob) => {
  try {
    parentPort!.postMessage({
      ok: 'replay' in job ? writeReplay(job.replay, job.out) : runMatch(job),
    });
  } catch (e) {
    parentPort!.postMessage({ error: String((e as Error).stack ?? e), job });
  }
});
