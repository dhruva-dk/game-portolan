// The lab fleet, by hand:
//   node tools/fleet/cli.ts probe [--machines n] [--cereals n]
//   node tools/fleet/cli.ts provision [--modules]
//   node tools/fleet/cli.ts run <kind> --shards 1..200 [--machines n] [--cereals n]
//   node tools/fleet/cli.ts verify <kind> --shards 1..200 [--machines n]
//   node tools/fleet/cli.ts status
//   node tools/fleet/cli.ts stop
// probe: every host the lab lists, asked at once (its threads, load, CPU), and
// the batch that would be chosen of them under the owner's limits (limits.ts).
// provision: this machine's Node and this working tree put in the lab's home
// (provision.ts). run: a batch of jobs of a kind (jobs.ts JOBS) over the hosts
// chosen now, a shard a job, its results copied back to
// .cache/fleet/results/<batch>/; verify: the same with every shard run on two
// different hosts (half the batch cereals, so one is a gem and one a cereal)
// and the hashes compared. status: what is running of ours, on every host and
// here; stop: all of it killed, everywhere, and what is left told.
//
// run and verify also take: --here n (on this machine, in n runners, not the
// lab), --worker (each shard in a Worker thread), --seconds s (a job's limit),
// and, for a job that is not of a kind, --command "node <script> {shard}
// {out}" --name <name>: any command that writes {out} as JSON with a `hash`.
//
// Node only (tools/).

import { parseArgs } from 'node:util';
import { status, stop, told } from './control.ts';
import {
  batchName,
  dispatch,
  hereSeats,
  shardsOf,
  summed,
} from './dispatch.ts';
import { choose, free, slotsOf, type Probe } from './hosts.ts';
import { JOBS } from './jobs.ts';
import { provision } from './provision.ts';
import { discover, probe, seatsNow } from './remote.ts';

const { values: a, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    machines: { type: 'string' },
    cereals: { type: 'string' },
    shards: { type: 'string' },
    here: { type: 'string' },
    worker: { type: 'boolean', default: false },
    seconds: { type: 'string' },
    command: { type: 'string' },
    name: { type: 'string' },
    modules: { type: 'boolean', default: false },
  },
});

/** Machines a batch run by hand takes unless told (the limits are the most it may). */
const MACHINES = 10;

/** A probe as a line of a table. */
const row = (p: Probe) =>
  `${p.host.padEnd(30)} ${p.kind.padEnd(7)} ${String(p.threads).padStart(3)} threads` +
  `  load ${p.load[0].toFixed(2).padStart(6)} ${p.load[1].toFixed(2).padStart(6)}` +
  `  ${String(Math.round(p.freeMB / 1024)).padStart(3)} GB free  ${p.users} at it` +
  `  ${free(p) ? `${slotsOf(p)} slots` : 'not used'}`;

async function batch(verify: boolean) {
  const kind = positionals[1] ?? a.name;
  if (!a.shards || !kind || (!a.command && !JOBS[kind]))
    throw new Error(
      `a kind (${Object.keys(JOBS).join(', ')}) or --command and --name, and --shards`
    );
  const machines = Number(a.machines ?? MACHINES),
    cereals = Number(a.cereals ?? (verify ? Math.ceil(machines / 2) : 0));
  const berth = a.here ? null : await provision({ say: console.log }),
    seats = a.here
      ? hereSeats(Number(a.here))
      : await seatsNow({ machines, cereals });
  console.log(
    `${seats.length} hosts: ${seats.map((s) => `${s.host} (${s.kind}, ${s.slots})`).join(', ')}`
  );
  const done = await dispatch(
    {
      name: batchName(kind, new Date()),
      command:
        a.command ??
        `node tools/fleet/job.ts ${kind} {shard} {out}${a.worker ? ' --worker' : ''}`,
      shards: shardsOf(a.shards),
      seats,
      verify,
      seconds: Number(a.seconds ?? JOBS[kind]?.seconds),
      berth,
    },
    console.log
  );
  console.log(summed(done));
  if (done.lost.length || done.differing.length) process.exitCode = 1;
}

const COMMANDS: Record<string, () => Promise<void>> = {
  async probe() {
    const hosts = await discover(),
      { probes, silent } = await probe(hosts);
    for (const p of probes) console.log(row(p));
    const seats = choose(probes, {
      ...(a.machines ? { machines: Number(a.machines) } : {}),
      ...(a.cereals ? { cereals: Number(a.cereals) } : {}),
    });
    console.log(
      `${hosts.length} hosts listed, ${probes.length} answered, ${probes.filter(free).length} free` +
        (silent.length ? `; no answer from ${silent.join(', ')}` : '')
    );
    console.log(
      `a batch now: ${seats.length} machines, ${seats.reduce((n, s) => n + s.slots, 0)} jobs at once: ` +
        seats.map((s) => `${s.host} (${s.kind}, ${s.slots})`).join(', ')
    );
  },
  async provision() {
    await provision({ modules: a.modules, say: console.log });
  },
  run: () => batch(false),
  verify: () => batch(true),
  async status() {
    console.log(told(await status()));
  },
  async stop() {
    const left = await stop();
    console.log(told(left));
    if (left.here.length || left.hosts.some((h) => h.ours?.length))
      process.exitCode = 1;
  },
};

const command = COMMANDS[positionals[0]];
if (!command) throw new Error(`a command: ${Object.keys(COMMANDS).join(', ')}`);
await command();
