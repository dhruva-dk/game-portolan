// A harness worker: runs each spec it is sent (run.ts runMatch) and posts back
// its result, or the error it met. Its planet is made once and kept.
//
// Node only (tools/).

import { parentPort } from 'node:worker_threads';
import { runMatch, type Spec } from './run.ts';

parentPort!.on('message', (spec: Spec) => {
  try {
    parentPort!.postMessage({ ok: runMatch(spec) });
  } catch (e) {
    parentPort!.postMessage({ error: String((e as Error).stack ?? e), spec });
  }
});
