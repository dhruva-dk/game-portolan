// One job: one shard of one kind (jobs.ts JOBS) run, and its result written as
// one file of JSON, whole or not at all (written beside and renamed):
//   node tools/fleet/job.ts <kind> <shard> <out> [--worker]
// The file: the kind, the shard, the result, its hash (SHA-256 of the result as
// JSON: what two machines' runs are compared by), and beside them what is the
// machine's own and never hashed (its name, its processor, the time it took).
// --worker: the shard is run in a Worker thread, not the main one.
//
// Node only (tools/).

import { createHash } from 'node:crypto';
import { renameSync, writeFileSync } from 'node:fs';
import { cpus, hostname } from 'node:os';
import {
  isMainThread,
  parentPort,
  Worker,
  workerData,
} from 'node:worker_threads';
import { JOBS } from './jobs.ts';

/** A job's file. */
export interface Written {
  kind: string;
  shard: string;
  hash: string;
  result: unknown;
  machine: {
    host: string;
    arch: string;
    cpu: string;
    node: string;
    worker: boolean;
    ms: number;
  };
}

interface Asked {
  kind: string;
  shard: string;
}

function run({ kind, shard }: Asked): Promise<unknown> {
  const job = JOBS[kind];
  if (!job) throw new Error(`no kind of job "${kind}"`);
  return job.run(shard);
}

const inWorker = (asked: Asked) =>
  new Promise<unknown>((done, fail) => {
    const w = new Worker(new URL(import.meta.url), { workerData: asked });
    w.once('message', done);
    w.once('error', fail);
  });

if (!isMainThread) parentPort!.postMessage(await run(workerData as Asked));
else {
  const [kind, shard, out, flag] = process.argv.slice(2),
    worker = flag === '--worker';
  if (!kind || !shard || !out || (flag && !worker))
    throw new Error('node tools/fleet/job.ts <kind> <shard> <out> [--worker]');
  const t = performance.now(),
    result = await (worker ? inWorker : run)({ kind, shard });
  const written: Written = {
    kind,
    shard,
    hash: createHash('sha256').update(JSON.stringify(result)).digest('hex'),
    result,
    machine: {
      host: hostname().split('.')[0],
      arch: process.arch,
      cpu: cpus()[0]?.model ?? '',
      node: process.version,
      worker,
      ms: Math.round(performance.now() - t),
    },
  };
  writeFileSync(`${out}.part`, JSON.stringify(written));
  renameSync(`${out}.part`, out);
}
