// Where a tool's run writes what it found: one folder a run,
// captures/YYYY-MM-DD-HHMM-<subject>/ (gitignored), and in it run.json, what
// it takes to run it again and judge it (the command, what it ran, the commit
// and whether the tree was clean, the machine). The terminal gets a summary;
// the folder gets everything.
//
// Node only (tools/).

import { execFileSync } from 'node:child_process';
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  writeFileSync,
  writeSync,
} from 'node:fs';
import { cpus, platform, release } from 'node:os';
import { join } from 'node:path';

const pad = (n: number) => String(n).padStart(2, '0');

/** A subject as a folder name: lower case, words joined by hyphens. */
const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'run';

const git = (...args: string[]) => {
  try {
    return execFileSync('git', args, { encoding: 'utf8' }).trim();
  } catch {
    return null;
  }
};

/** The commit checked out, and whether anything tracked or new differs from it. */
export const commitOf = () => ({
  commit: git('rev-parse', '--short', 'HEAD'),
  dirty: (git('status', '--porcelain') ?? '') !== '',
});

/**
 * A new folder for a run about `subject`, made, with run.json written in it:
 * the command, the date, the commit, the machine and `what` (the run's own
 * account of what it ran: its resolved scenario, its seed).
 */
export function outDir(subject: string, what: Record<string, unknown>): string {
  const d = new Date();
  const stamp = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
  const base = join('captures', `${stamp}-${slug(subject)}`);
  let dir = base;
  for (let k = 2; existsSync(dir); k++) dir = `${base}-${k}`;
  mkdirSync(dir, { recursive: true });
  writeJson(join(dir, 'run.json'), {
    command: ['node', ...process.argv.slice(1)].join(' '),
    date: d.toISOString(),
    ...commitOf(),
    node: process.version,
    machine: {
      platform: platform(),
      release: release(),
      cpu: cpus()[0]?.model ?? null,
      cores: cpus().length,
    },
    ...what,
  });
  return dir;
}

/** A value written as indented JSON. */
export const writeJson = (path: string, value: unknown) =>
  writeFileSync(path, JSON.stringify(value, null, 2) + '\n');

/** A JSON Lines file written as it goes: one value a line. */
export function lines(path: string) {
  const fd = openSync(path, 'w');
  let count = 0;
  return {
    write(value: unknown) {
      writeSync(fd, JSON.stringify(value) + '\n');
      count++;
    },
    /** Lines written so far. */
    count: () => count,
    close: () => closeSync(fd),
  };
}
export type Lines = ReturnType<typeof lines>;
