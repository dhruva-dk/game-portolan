// A batch's runner on one host: started by the dispatcher (dispatch.ts) over
// ssh, or on this machine, it runs the jobs it is sent on its stdin, a line of
// JSON each, and answers each with a line on its stdout. It is no daemon: it
// ends, and kills every job it started, when its stdin closes (the dispatcher
// is done, or gone), when it has heard nothing for TIMES.silence, or when its
// batch's time is up.
//
// The owner's limits hold here too, whatever it is asked: it lowers itself to
// LIMITS.nice before anything (its jobs inherit that), and never runs more at
// once than the host's threads less LIMITS.spare. Each job is killed past its
// own seconds, here and (where there is one) by timeout(1), so a job cannot
// outlive a runner that was killed.
//
//   node tools/fleet/host.ts --name <host> --slots <n> --seconds <batch's>
// in:  {"id","argv":[…],"out":"<file>","seconds":n}   or   {"beat":1}
// out: {"ready":{…}}, then {"id","ok":true,"hash","ms"} or
//      {"id","ok":false,"why":"exit|timeout|unreadable","note"}
//
// Node only (tools/).

import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { availableParallelism, cpus, setPriority } from 'node:os';
import { dirname } from 'node:path';
import { createInterface } from 'node:readline';
import { parseArgs } from 'node:util';
import { LIMITS, TIMES } from './limits.ts';

/** A job as the dispatcher sends it. */
export interface Order {
  id: string;
  argv: string[];
  out: string;
  seconds: number;
}

/** What the runner answers of a job. */
export type Answer =
  | { id: string; ok: true; hash: string; ms: number }
  | {
      id: string;
      ok: false;
      why: 'exit' | 'timeout' | 'unreadable';
      note: string;
    };

const { values: a } = parseArgs({
  options: {
    name: { type: 'string', default: 'host' },
    slots: { type: 'string', default: '1' },
    seconds: { type: 'string', default: String(TIMES.batch) },
  },
});

setPriority(LIMITS.nice);
const slots = Math.max(
  1,
  Math.min(Number(a.slots), availableParallelism() - LIMITS.spare)
);
const TIMEOUT = '/usr/bin/timeout',
  limiter = existsSync(TIMEOUT);

const running = new Map<string, ChildProcess>(),
  waiting: Order[] = [];
const say = (line: object) => process.stdout.write(JSON.stringify(line) + '\n');

/** A job and all it started, killed (each job leads its own process group). */
const kill = (child: ChildProcess) => {
  try {
    if (child.pid) process.kill(-child.pid, 'SIGKILL');
  } catch {
    // (already gone)
  }
};

function quit(code: number): never {
  for (const child of running.values()) kill(child);
  process.exit(code);
}

function start(order: Order) {
  const t = performance.now();
  mkdirSync(dirname(order.out), { recursive: true });
  const [first, ...rest] = order.argv,
    command = first === 'node' ? process.execPath : first,
    argv = limiter
      ? [TIMEOUT, '-k', '5', String(order.seconds), command, ...rest]
      : [command, ...rest];
  const child = spawn(argv[0], argv.slice(1), {
    detached: true,
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  running.set(order.id, child);
  let err = '',
    late = false;
  child.stderr?.on('data', (d) => (err = (err + d).slice(-2000)));
  const timer = setTimeout(
    () => {
      late = true;
      kill(child);
    },
    (order.seconds + 10) * 1000
  );
  const fail = (why: 'exit' | 'timeout' | 'unreadable', note: string) =>
    say({ id: order.id, ok: false, why, note: note.slice(-2000) });
  child.on('error', (e) => (err += String(e)));
  child.on('close', (code) => {
    clearTimeout(timer);
    running.delete(order.id);
    if (late || code === 124 || code === 137) fail('timeout', err);
    else if (code !== 0) fail('exit', `exit ${code}: ${err}`);
    else {
      let hash: unknown;
      try {
        hash = JSON.parse(readFileSync(order.out, 'utf8')).hash;
      } catch (e) {
        err = String(e);
      }
      if (typeof hash === 'string')
        say({ id: order.id, ok: true, hash, ms: performance.now() - t });
      else fail('unreadable', `no hash in ${order.out}: ${err}`);
    }
    feed();
  });
}

function feed() {
  while (running.size < slots && waiting.length) start(waiting.shift()!);
}

let heard = performance.now();
setInterval(() => {
  if (performance.now() - heard > TIMES.silence * 1000) quit(3);
}, 5000).unref();
setTimeout(() => quit(4), Number(a.seconds) * 1000).unref();
for (const signal of ['SIGTERM', 'SIGINT', 'SIGHUP'] as const)
  process.on(signal, () => quit(5));

const lines = createInterface({ input: process.stdin });
lines.on('line', (line) => {
  heard = performance.now();
  const order = JSON.parse(line) as Order | { beat: number };
  if ('beat' in order) return;
  waiting.push(order);
  feed();
});
lines.on('close', () => quit(0));

say({
  ready: {
    name: a.name,
    slots,
    threads: availableParallelism(),
    cpu: cpus()[0]?.model ?? '',
    arch: process.arch,
    node: process.version,
    nice: LIMITS.nice,
  },
});
