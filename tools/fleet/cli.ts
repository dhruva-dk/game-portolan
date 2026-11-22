// The lab fleet, by hand:
//   node tools/fleet/cli.ts probe [--machines n] [--cereals n]
//   node tools/fleet/cli.ts status
//   node tools/fleet/cli.ts stop
// probe: every host the lab lists, asked at once (its threads, load, CPU), and
// the batch that would be chosen of them under the owner's limits (limits.ts);
// status: what is running of ours, on every host and here; stop: all of it
// killed, everywhere, and what is left told.
//
// Node only (tools/).

import { parseArgs } from 'node:util';
import { status, stop, told } from './control.ts';
import { choose, free, slotsOf, type Probe } from './hosts.ts';
import { discover, probe } from './remote.ts';

const { values: a, positionals } = parseArgs({
  allowPositionals: true,
  options: { machines: { type: 'string' }, cereals: { type: 'string' } },
});

/** A probe as a line of a table. */
const row = (p: Probe) =>
  `${p.host.padEnd(30)} ${p.kind.padEnd(7)} ${String(p.threads).padStart(3)} threads` +
  `  load ${p.load[0].toFixed(2).padStart(6)} ${p.load[1].toFixed(2).padStart(6)}` +
  `  ${String(Math.round(p.freeMB / 1024)).padStart(3)} GB free  ${p.users} at it` +
  `  ${free(p) ? `${slotsOf(p)} slots` : 'not used'}`;

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
