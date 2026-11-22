// The dispatcher: a batch of shards run over the hosts chosen for it. A runner
// (host.ts) is started on each host, over ssh or, for this machine's seats,
// here; each is fed jobs as its slots come free, by the batch's plan (plan.ts:
// who runs what, the retries, the two hosts of a verified shard); every job
// writes its result as one file of JSON in the batch's folder (the lab's is in
// the NFS home, and is copied back here at the end). Nothing outlives the
// batch: the runners end when this ends or is killed, and every one is niced
// and bounded (limits.ts).
//
// Node only (tools/).

import { spawn, type ChildProcess } from 'node:child_process';
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import { resolve } from 'node:path';
import { createInterface } from 'node:readline';
import type { Seat } from './hosts.ts';
import type { Answer, Order } from './host.ts';
import type { Written } from './job.ts';
import { FLEET, LIMITS, TIMES } from './limits.ts';
import { createPlan, type Job, type Outcome } from './plan.ts';
import { BATCH, SYNCED, type Berth } from './provision.ts';
import { address, CACHE, ROOT, RSH, run, SSH } from './remote.ts';

/** A batch to run. */
export interface Batch {
  /** Its name, and its results' folder's (batchName). */
  name: string;
  /**
   * The job's command, words apart by spaces: `{shard}` and `{out}` are filled
   * in for each job, and a first word `node` is the host's own Node.
   */
  command: string;
  shards: readonly string[];
  /** The hosts: a seat of kind `mac` is run here, any other on the lab. */
  seats: readonly Seat[];
  /** Every shard on two different hosts, their hashes compared. */
  verify?: boolean;
  /** Seconds a job may take. */
  seconds?: number;
  /** The lab's copy of the tree (provision.ts); null if every seat is here. */
  berth: Berth | null;
}

/** What a batch came to: the plan's outcome, and how it went. */
export interface Done extends Outcome {
  name: string;
  command: string;
  shards: number;
  seats: Seat[];
  verify: boolean;
  /** Its wall time (s), and the runs come back a minute over it. */
  seconds: number;
  perMinute: number;
  /** The folder its results are in, here. */
  dir: string;
}

/** What a batch came to, in words. */
export function summed(d: Done): string {
  const kinds = new Map<string, number>();
  for (const s of d.seats) kinds.set(s.kind, (kinds.get(s.kind) ?? 0) + 1);
  return [
    `${d.name}: ${d.runs.length} runs of ${d.shards} shards back in ${d.seconds.toFixed(0)} s ` +
      `(${d.perMinute.toFixed(0)} a minute) on ${d.seats.length} hosts ` +
      `(${[...kinds].map(([k, n]) => `${n} ${k}`).join(', ')}; ` +
      `${d.seats.reduce((n, s) => n + s.slots, 0)} jobs at once)`,
    ...(d.verify
      ? [
          `verified: ${d.verified} of ${d.shards} shards the same on two hosts; ${d.differing.length} differ`,
        ]
      : []),
    ...d.differing.map(
      ({ shard, runs: [x, y] }) =>
        `  DIFFERS ${shard}: ${x.host} (${x.kind}) ${x.hash.slice(0, 12)}, ${y.host} (${y.kind}) ${y.hash.slice(0, 12)}`
    ),
    ...d.lost.map(
      (l) =>
        `  LOST ${l.shard}#${l.copy}: ${l.failures.map((f) => `${f.host} ${f.why}`).join(', ')}`
    ),
    ...(d.retired.length ? [`  dropped: ${d.retired.join(', ')}`] : []),
    `results in ${d.dir}`,
  ].join('\n');
}

/** A batch's name: when, and what of. */
export function batchName(of: string, at: Date): string {
  const stamp = at.toISOString().replace(/[-:]/g, '').replace('T', '-'),
    name = `${stamp.slice(0, 15)}-${of}`;
  if (!BATCH.test(name)) throw new Error(`not a batch's name: ${name}`);
  return name;
}

/** Shards from how they are asked for: names apart by commas, `a..b` every whole number from a to b. */
export const shardsOf = (asked: string): string[] =>
  asked
    .split(',')
    .filter(Boolean)
    .flatMap((part) => {
      const range = /^(\d+)\.\.(\d+)$/.exec(part);
      if (!range) return [part];
      const from = Number(range[1]),
        to = Number(range[2]);
      return Array.from({ length: Math.max(0, to - from + 1) }, (_, i) =>
        String(from + i)
      );
    });

/**
 * This machine's seats: `runners` of them (two, to run every shard twice
 * here), its threads less those left free shared among them.
 */
export function hereSeats(runners = 1): Seat[] {
  const slots = Math.floor((availableParallelism() - LIMITS.spare) / runners);
  if (slots < 1) throw new Error(`this machine has no room for ${runners}`);
  return Array.from({ length: runners }, (_, i) => ({
    host: `mac-${i + 1}`,
    kind: 'mac' as const,
    slots,
  }));
}

/** A job's words, from its batch's command. */
export const argvOf = (command: string, shard: string, out: string): string[] =>
  command
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.replaceAll('{shard}', shard).replaceAll('{out}', out));

/** The file a job's result is written to, in its batch's folder. */
export const fileOf = (job: Job, host: string) =>
  `${job.shard}.${job.copy}.${host}.json`;

/**
 * The command line that starts a runner on a lab host: it waits for the tree
 * to show there (NFS), then becomes the runner, niced, on the Node under our
 * folder (so every process of the batch bears our mark).
 */
export function runnerCommand(seat: Seat, berth: Berth, seconds: number) {
  const code = `"$HOME/${berth.code}"`;
  return (
    `for i in $(seq ${TIMES.nfs}); do [ -f ${code}/${SYNCED} ] && break; sleep 1; done; ` +
    `cd ${code} && exec nice -n ${LIMITS.nice} "$HOME/${berth.node}" tools/fleet/host.ts ` +
    `--name ${seat.host} --slots ${seat.slots} --seconds ${seconds}`
  );
}

const local = (seat: Seat) => seat.kind === 'mac';

/** The results of a batch, read from its folder here. */
export const resultsOf = (dir: string): Written[] =>
  readdirSync(dir)
    .filter((f) => f.endsWith('.json') && f !== 'batch.json')
    .map((f) => JSON.parse(readFileSync(resolve(dir, f), 'utf8')) as Written);

interface Live {
  seat: Seat;
  child: ChildProcess;
  ready: boolean;
  gone: boolean;
  err: string;
}

/** A batch run to its end. `say`: told how it goes, a line at a time. */
export async function dispatch(
  batch: Batch,
  say: (line: string) => void = () => {}
): Promise<Done> {
  const { berth } = batch,
    perJob = batch.seconds ?? TIMES.job,
    plan = createPlan(batch.shards, batch.seats, { verify: batch.verify }),
    dir = resolve(CACHE, 'results', batch.name),
    remote = `../results/${batch.name}`,
    started = performance.now();
  if (!BATCH.test(batch.name)) throw new Error(`not a batch's name`);
  mkdirSync(dir, { recursive: true });
  const jobs = new Map<string, Job>(),
    hosts = new Map<string, Live>();
  let over = false,
    finish = () => {};
  const finished = new Promise<void>((r) => (finish = r));

  const launch = (seat: Seat): ChildProcess => {
    const runner = ['--name', seat.host, '--slots', String(seat.slots)];
    if (local(seat))
      return spawn(
        process.execPath,
        ['tools/fleet/host.ts', ...runner, '--seconds', String(TIMES.batch)],
        { cwd: ROOT, stdio: 'pipe' }
      );
    if (!berth)
      throw new Error(`${seat.host}: the lab has no copy of the tree`);
    return spawn(
      'ssh',
      [...SSH, address(seat.host), runnerCommand(seat, berth, TIMES.batch)],
      { stdio: 'pipe' }
    );
  };

  const drop = (h: Live, note: string) => {
    if (h.gone) return;
    h.gone = true;
    plan.drop(h.seat.host, note);
    h.child.stdin?.end();
    if (!over) say(`  ${h.seat.host} dropped: ${note}`);
  };

  const pump = () => {
    if (over) return;
    for (const h of hosts.values()) {
      if (!h.ready || h.gone) continue;
      for (
        let job = plan.next(h.seat.host);
        job;
        job = plan.next(h.seat.host)
      ) {
        jobs.set(job.id, job);
        const file = fileOf(job, h.seat.host),
          out = local(h.seat) ? resolve(dir, file) : `${remote}/${file}`;
        const order: Order = {
          id: job.id,
          argv: argvOf(batch.command, job.shard, out),
          out,
          seconds: perJob,
        };
        h.child.stdin?.write(JSON.stringify(order) + '\n');
      }
    }
    const waitingOn = [...hosts.values()].some((h) => !h.gone && !h.ready);
    if (plan.left() > 0 && plan.running() === 0 && !waitingOn) plan.strand();
    if (plan.left() === 0) {
      over = true;
      finish();
    }
  };

  for (const seat of batch.seats) {
    const h: Live = {
      seat,
      child: launch(seat),
      ready: false,
      gone: false,
      err: '',
    };
    hosts.set(seat.host, h);
    h.child.stdin?.on('error', () => {});
    h.child.stderr?.on('data', (d) => (h.err = (h.err + d).slice(-500)));
    createInterface({ input: h.child.stdout! }).on('line', (line) => {
      let said: Answer | { ready: object };
      try {
        said = JSON.parse(line);
      } catch {
        return;
      }
      if ('ready' in said) h.ready = true;
      else if (h.gone) return;
      else if (said.ok) plan.done(said.id, said.hash, said.ms);
      else {
        const job = jobs.get(said.id);
        say(
          `  ${job?.shard} failed on ${seat.host} (${said.why}): ${said.note.trim().split('\n').pop() ?? ''}`
        );
        if (plan.failed(said.id, said.why, said.note))
          drop(h, 'retired: too many failures in a row');
      }
      pump();
    });
    h.child.on('error', (e) => {
      drop(h, String(e));
      pump();
    });
    h.child.on('close', (code) => {
      drop(h, `runner ended (${code}): ${h.err.trim()}`);
      pump();
    });
  }

  const total = batch.shards.length * (batch.verify ? 2 : 1);
  const beat = setInterval(() => {
    for (const h of hosts.values())
      if (!h.gone) h.child.stdin?.write('{"beat":1}\n');
  }, TIMES.beat * 1000);
  const tell = setInterval(
    () =>
      say(
        `  ${total - plan.left()}/${total} back, ${plan.running()} running on ` +
          `${[...hosts.values()].filter((h) => !h.gone).length} hosts, ` +
          `${((performance.now() - started) / 1000).toFixed(0)} s`
      ),
    10_000
  );
  const late = setTimeout(() => {
    say(`  the batch ran past ${TIMES.batch} s: ended`);
    over = true;
    finish();
  }, TIMES.batch * 1000);
  const killAll = () => {
    for (const h of hosts.values()) h.child.kill('SIGKILL');
  };
  const interrupted = () => {
    killAll();
    process.exit(130);
  };
  process.once('SIGINT', interrupted);
  process.once('SIGTERM', interrupted);

  pump();
  await finished;
  clearInterval(beat);
  clearInterval(tell);
  clearTimeout(late);
  // the runners end as their stdin closes; one that does not is killed
  await Promise.all(
    [...hosts.values()].map(
      (h) =>
        new Promise<void>((closed) => {
          if (h.child.exitCode !== null || h.child.signalCode) return closed();
          const timer = setTimeout(() => h.child.kill('SIGKILL'), 15_000);
          h.child.once('close', () => {
            clearTimeout(timer);
            closed();
          });
          h.gone = true;
          h.child.stdin?.end();
        })
    )
  );
  process.off('SIGINT', interrupted);
  process.off('SIGTERM', interrupted);

  const outcome = plan.outcome(),
    seconds = (performance.now() - started) / 1000;
  if (berth && batch.seats.some((s) => !local(s)))
    await collect(batch.name, dir, outcome.runs.length, say);
  const done: Done = {
    name: batch.name,
    command: batch.command,
    shards: batch.shards.length,
    seats: [...batch.seats],
    verify: batch.verify ?? false,
    seconds,
    perMinute: (outcome.runs.length / seconds) * 60,
    dir,
    ...outcome,
  };
  writeFileSync(resolve(dir, 'batch.json'), JSON.stringify(done, null, 1));
  return done;
}

/**
 * A batch's results copied back from the lab's folder to `dir`, until every
 * run's file is here (a file written on one host shows on the gate a little
 * later, over NFS).
 */
async function collect(
  name: string,
  dir: string,
  runs: number,
  say: (line: string) => void
) {
  const from = `${address(FLEET.gate)}:${FLEET.root}/results/${name}/`;
  for (let tries = 0; tries < 8; tries++) {
    const r = await run(
      'rsync',
      ['-az', '--exclude=*.part', '-e', RSH, from, `${dir}/`],
      { seconds: 600 }
    );
    const here = readdirSync(dir).filter(
      (f) => f.endsWith('.json') && f !== 'batch.json'
    ).length;
    if (r.code === 0 && here >= runs) return;
    say(`  ${here}/${runs} results here (${r.err.trim() || 'waiting on NFS'})`);
    await new Promise((wait) => setTimeout(wait, 10_000));
  }
  throw new Error(`the results of ${name} did not all come back`);
}
