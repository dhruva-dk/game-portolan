// The fleet's ssh: a script run on a host (bash, on its stdin, so nothing is
// quoted through a command line), never waiting on a prompt, never past its
// time; the lab's hosts listed and their keys learnt through the gate; every
// host probed at once.
//
// Host keys: the gate (limits.ts FLEET.gate) is trusted by the Mac's own
// known_hosts; the lab publishes every host's key in the gate's
// /etc/ssh/ssh_known_hosts, and those the hosts list names are written to
// .cache/fleet/known_hosts, which ssh is pointed at beside the Mac's own. Host
// keys are checked strictly: no key is taken on first sight, and nothing
// under ~/.ssh is written.
//
// Node only (tools/).

import { spawn } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { dirname, resolve } from 'node:path';
import {
  choose,
  hostsOf,
  PROBE,
  probeOf,
  type Probe,
  type Seat,
} from './hosts.ts';
import { FLEET, TIMES } from './limits.ts';

/** The repository's root, and the fleet's local folder in it (not committed). */
export const ROOT = resolve(import.meta.dirname, '../..');
export const CACHE = resolve(ROOT, '.cache/fleet');
const KNOWN = resolve(CACHE, 'known_hosts'),
  LISTED = resolve(CACHE, 'hosts.json');

/** A host's address to log in at. */
export const address = (host: string) =>
  `${FLEET.user}@${host}.${FLEET.domain}`;

/** ssh's options, every call: no prompt, a bounded connect, strict host keys, a keepalive. */
export const SSH = [
  '-o',
  'BatchMode=yes',
  '-o',
  `ConnectTimeout=${TIMES.connect}`,
  '-o',
  'StrictHostKeyChecking=yes',
  '-o',
  `UserKnownHostsFile=${KNOWN} ${resolve(homedir(), '.ssh/known_hosts')}`,
  '-o',
  `ServerAliveInterval=${TIMES.alive}`,
  '-o',
  `ServerAliveCountMax=${TIMES.aliveCount}`,
  '-o',
  'LogLevel=ERROR',
  '-T',
] as const;

/** The same ssh as one word for rsync's `-e`. */
export const RSH = ['ssh', ...SSH]
  .map((word) => (/\s/.test(word) ? `"${word}"` : word))
  .join(' ');

/** What a command came to: its exit code (null: killed, or never ran) and what it wrote. */
export interface Ran {
  code: number | null;
  out: string;
  err: string;
}

/** A command run to its end, `input` on its stdin, killed past `seconds`. */
export function run(
  command: string,
  args: readonly string[],
  { input = '', seconds = TIMES.probe as number, cwd = ROOT } = {}
): Promise<Ran> {
  return new Promise((done) => {
    const child = spawn(command, args, { cwd, stdio: 'pipe' });
    let out = '',
      err = '';
    const timer = setTimeout(() => child.kill('SIGKILL'), seconds * 1000);
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (err += d));
    child.on('error', (e) => {
      clearTimeout(timer);
      done({ code: null, out, err: err + String(e) });
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      done({ code, out, err });
    });
    child.stdin.on('error', () => {});
    child.stdin.end(input);
  });
}

/** A bash script run on a lab host. */
export const on = (host: string, script: string, seconds?: number) =>
  run('ssh', [...SSH, address(host), 'bash -s'], { input: script, seconds });

/** `work` done for each of `items`, `fan` at once; what each came to, in their order. */
export async function each<T, R>(
  items: readonly T[],
  work: (item: T) => Promise<R>,
  fan: number = FLEET.fan
): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const lane = async () => {
    while (next < items.length) {
      const at = next++;
      out[at] = await work(items[at]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(fan, items.length) }, lane));
  return out;
}

/** The host keys taken from the lab's published ones: every kind but the retired DSA. */
const taken = (type: string) =>
  /^(ssh|ecdsa)-/.test(type) && type !== 'ssh-dss';

/**
 * The known_hosts lines for `hosts`, from the lab's published keys (lines of
 * `<host>.<domain>_<kind>[,…] <type> <key>`): a line a key of each host named.
 */
export function keysOf(published: string, hosts: readonly string[]): string[] {
  const wanted = new Set(hosts.map((h) => `${h}.${FLEET.domain}`));
  const lines = new Set<string>();
  for (const line of published.split('\n')) {
    const [name, type, key] = line.trim().split(/\s+/);
    const host = name?.split(',')[0].replace(/_[a-z0-9]+$/, '');
    if (type && taken(type) && key && wanted.has(host))
      lines.add(`${host} ${type} ${key}`);
  }
  return [...lines];
}

const CUT = '---keys---';

/**
 * The lab's public hosts, asked of the gate, with their keys written for ssh;
 * the list is kept (.cache/fleet/hosts.json) for `stop` to fall back on when
 * the gate does not answer.
 */
export async function discover(): Promise<string[]> {
  const r = await on(
    FLEET.gate,
    `${FLEET.list}\necho ${CUT}\ncat /etc/ssh/ssh_known_hosts\n`
  );
  const [listing, published] = r.out.split(CUT);
  const hosts = hostsOf(listing ?? '');
  if (r.code !== 0 || hosts.length === 0 || published === undefined)
    throw new Error(
      `the gate (${FLEET.gate}) did not list the hosts: ${r.err.trim() || `exit ${r.code}`}`
    );
  mkdirSync(dirname(KNOWN), { recursive: true });
  // (whole or not at all: an ssh of ours may be reading it)
  writeFileSync(
    `${KNOWN}.${process.pid}`,
    keysOf(published, hosts).join('\n') + '\n'
  );
  renameSync(`${KNOWN}.${process.pid}`, KNOWN);
  writeFileSync(LISTED, JSON.stringify(hosts));
  return hosts;
}

/**
 * The seats of a batch to start now: the lab listed, every host probed (its
 * load is checked before each batch), and the batch chosen under the limits
 * (hosts.ts choose).
 */
export async function seatsNow(
  want: { machines?: number; cereals?: number } = {}
): Promise<Seat[]> {
  const { probes } = await probe(await discover());
  return choose(probes, want);
}

/** The hosts last listed (none if never). */
export const listed = (): string[] =>
  existsSync(LISTED) ? JSON.parse(readFileSync(LISTED, 'utf8')) : [];

/** Every host probed at once: those that answered whole, and those that did not. */
export async function probe(
  hosts: readonly string[]
): Promise<{ probes: Probe[]; silent: string[] }> {
  const found = await each(hosts, async (host) => {
    const r = await on(host, PROBE);
    return r.code === 0 ? probeOf(host, r.out) : null;
  });
  return {
    probes: found.filter((p) => p !== null),
    silent: hosts.filter((_, i) => found[i] === null),
  };
}
