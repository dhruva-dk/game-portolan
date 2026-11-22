// What is running of ours, and the one command that stops it all: on every
// host the lab lists (and the gate), and on this machine. A host is asked for
// its processes of ours by their mark (limits.ts MARK: every one runs the Node
// under our folder, or names a path in it); stopping kills them outright, then
// asks again.
//
// Node only (tools/).

import { FLEET, MARKED } from './limits.ts';
import { discover, each, listed, on, run } from './remote.ts';

/** This machine's processes of ours: the runner, its jobs, a dispatcher at work. */
const LOCAL = 'tools/(fleet/(host|job)|fleet/cli|fairness/cli)\\.ts';

const SEEN = `pgrep -u "$USER" -fa '${MARKED}' | cut -c1-200\ntrue\n`,
  STOP = `pkill -KILL -u "$USER" -f '${MARKED}'\nsleep 1\n${SEEN}`;

/** What a host answered: its processes of ours (a line each), or null if it did not answer. */
export interface Seen {
  host: string;
  ours: string[] | null;
}

/** Every host there is to ask: those listed now (or, the gate silent, last), and the gate. */
async function everywhere(): Promise<string[]> {
  const hosts = await discover().catch(() => listed());
  return [...new Set([FLEET.gate, ...hosts])];
}

const ask = async (script: string): Promise<Seen[]> =>
  each(await everywhere(), async (host) => {
    const r = await on(host, script);
    return {
      host,
      ours: r.code === 0 ? r.out.split('\n').filter((l) => l.trim()) : null,
    };
  });

/** This machine's processes of ours, but this one. */
async function here(): Promise<string[]> {
  const r = await run('pgrep', ['-fl', LOCAL]);
  return r.out
    .split('\n')
    .filter((l) => l.trim() && Number(l.split(' ')[0]) !== process.pid);
}

/** What is running of ours: on each host, and here. */
export const status = async () => ({
  hosts: await ask(SEEN),
  here: await here(),
});

/** Everything of ours killed, everywhere; back, what is still running after. */
export async function stop() {
  for (const line of await here())
    process.kill(Number(line.split(' ')[0]), 'SIGKILL');
  const hosts = await ask(STOP);
  return { hosts, here: await here() };
}

/** A status put in words: a line a host with something running, and the count of the rest. */
export function told({ hosts, here }: Awaited<ReturnType<typeof status>>) {
  const busy = hosts.filter((h) => h.ours?.length),
    silent = hosts.filter((h) => h.ours === null);
  return [
    ...busy.flatMap((h) => [
      `${h.host}: ${h.ours?.length} of ours`,
      ...(h.ours ?? []).map((l) => `    ${l}`),
    ]),
    ...(here.length ? ['here:', ...here.map((l) => `    ${l}`)] : []),
    `${hosts.length - silent.length} hosts answered; ${busy.length} with processes of ours` +
      `; ${here.length} here` +
      (silent.length
        ? `; no answer from ${silent.map((h) => h.host).join(', ')}`
        : ''),
  ].join('\n');
}
