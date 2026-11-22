// The lab's hosts, read and chosen: what a probe of one says (the script it
// runs, and its answer parsed), how many jobs it may be given, and which hosts
// a batch takes, all under the owner's limits (limits.ts LIMITS). Pure: the
// ssh is in remote.ts.
//
// Node only (tools/).

import { LIMITS, MARKED } from './limits.ts';

/** A host's make: a gem (20-thread i5-14600), a cereal (a Xeon), the Mac, or another. */
export type Kind = 'gem' | 'cereal' | 'mac' | 'other';

/** What a probe found of a host that answered. */
export interface Probe {
  host: string;
  kind: Kind;
  cpu: string;
  threads: number;
  /** Its load over the last minute and the last five. */
  load: readonly [number, number];
  /** Memory free for use (MB). */
  freeMB: number;
  /** Processes of ours running on it. */
  ours: number;
  /** Others logged in to it. */
  users: number;
}

/** A host a batch runs on, and the jobs it runs at once. */
export interface Seat {
  host: string;
  kind: Kind;
  slots: number;
}

/**
 * The script a probe runs on a host (bash, on its stdin): a line a fact. Light:
 * it reads /proc and the process table once.
 */
export const PROBE = [
  'echo threads=$(nproc)',
  'echo load=$(cut -d" " -f1,2 /proc/loadavg)',
  'echo cpu=$(grep -m1 "model name" /proc/cpuinfo | cut -d: -f2)',
  "echo free=$(awk '/MemAvailable/ {print int($2/1024)}' /proc/meminfo)",
  `echo ours=$(pgrep -u "$USER" -fc '${MARKED}')`,
  'echo users=$(who | cut -d" " -f1 | sort -u | grep -vc "^$USER$")',
].join('\n');

/** A CPU's make by its model's name. */
export const kindOf = (cpu: string): Kind =>
  /i5-14600/.test(cpu) ? 'gem' : /Xeon/i.test(cpu) ? 'cereal' : 'other';

/** The hosts a listing names: a name a line (or a word), no blanks, no repeats. */
export const hostsOf = (listing: string): string[] => [
  ...new Set(
    listing.split(/\s+/).filter((h) => /^[a-z0-9][a-z0-9-]*$/.test(h))
  ),
];

/** A probe's answer read; null if it is not whole (the host is then not used). */
export function probeOf(host: string, answer: string): Probe | null {
  const said = new Map<string, string>();
  for (const line of answer.split('\n')) {
    const at = line.indexOf('=');
    if (at > 0) said.set(line.slice(0, at), line.slice(at + 1).trim());
  }
  const number = (key: string) => (said.get(key) ? Number(said.get(key)) : NaN);
  const [one, five] = (said.get('load') ?? '').split(' ').map(Number);
  const p: Probe = {
    host,
    kind: kindOf(said.get('cpu') ?? ''),
    cpu: said.get('cpu') ?? '',
    threads: number('threads'),
    load: [one, five],
    freeMB: number('free'),
    ours: number('ours'),
    users: number('users'),
  };
  const whole = [p.threads, one, five, p.freeMB, p.ours, p.users].every(
    Number.isFinite
  );
  return whole && p.cpu ? p : null;
}

/**
 * The jobs a host may run at once: its threads, less those left free, less
 * those its load already uses; and no more than its free memory allows.
 */
export function slotsOf(p: Probe): number {
  const threads = p.threads - LIMITS.spare - Math.ceil(Math.max(...p.load)),
    memory = Math.floor((p.freeMB * LIMITS.memory) / LIMITS.jobMB);
  return Math.max(0, Math.min(threads, memory));
}

/** Whether a host may be used at all: idle, nothing of ours on it, room for a job. */
export const free = (p: Probe): boolean =>
  p.load[0] < LIMITS.load &&
  p.load[1] < LIMITS.load &&
  p.ours === 0 &&
  slotsOf(p) > 0;

/** The better host first: nobody at it, then the lighter load, then by name. */
const better = (a: Probe, b: Probe) =>
  a.users - b.users ||
  Math.max(...a.load) - Math.max(...b.load) ||
  a.host.localeCompare(b.host);

/**
 * How many machines a batch asking for `asked` may take, of `idle` free ones:
 * LIMITS.machines, or up to LIMITS.machinesWhileFree only while it leaves
 * LIMITS.leftFree of the idle untouched.
 */
export function allowed(asked: number, idle: number): number {
  const most = Math.max(
    LIMITS.machines,
    Math.min(LIMITS.machinesWhileFree, idle - LIMITS.leftFree)
  );
  return Math.max(0, Math.min(asked, idle, most));
}

/**
 * The hosts of a batch, from what the probes found: `machines` of them at
 * most (and never past the limits: `allowed`), `cereals` of those cereals (for
 * the cross-CPU check), the rest gems while there are gems, then whatever is
 * free. Each with its slots.
 */
export function choose(
  probes: readonly Probe[],
  {
    machines = LIMITS.machines,
    cereals = 0,
  }: { machines?: number; cereals?: number } = {}
): Seat[] {
  const idle = probes.filter(free),
    n = allowed(machines, idle.length);
  const of = (kind: Kind) => idle.filter((p) => p.kind === kind).sort(better);
  const xeons = of('cereal').slice(0, Math.min(cereals, n));
  const rest = [
    ...of('gem'),
    ...of('cereal').slice(xeons.length),
    ...of('other'),
  ].slice(0, n - xeons.length);
  return [...rest, ...xeons].map((p) => ({
    host: p.host,
    kind: p.kind,
    slots: slotsOf(p),
  }));
}
