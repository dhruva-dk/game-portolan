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

export const commitOf = () => ({
  commit: git('rev-parse', '--short', 'HEAD'),
  dirty: (git('status', '--porcelain') ?? '') !== '',
});

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

export const writeJson = (path: string, value: unknown) =>
  writeFileSync(path, JSON.stringify(value, null, 2) + '\n');

export function lines(path: string) {
  const fd = openSync(path, 'w');
  let count = 0;
  return {
    write(value: unknown) {
      writeSync(fd, JSON.stringify(value) + '\n');
      count++;
    },
    count: () => count,
    close: () => closeSync(fd),
  };
}
export type Lines = ReturnType<typeof lines>;
