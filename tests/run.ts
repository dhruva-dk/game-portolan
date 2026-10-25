// npm test (S-007). Two phases so the tests that time themselves or drive a browser never contend with the rest of the
// suite for the CPU: first every other file in parallel (node's default concurrency), then those files one at a time
// (cost budgets read CPU time, tests/cpu.ts; the browser tests boot Chromium and WebKit, which want the whole machine).
// A file joins the serial phase by what it contains: the harness or playwright, or a clock. Both phases always run;
// the exit code is non-zero if either failed. Arguments go straight to node --test: npm test -- tests/sim/x.test.ts
import { readdirSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const run = (args: string[]): number => spawnSync(process.execPath, ['--test', ...args], { cwd: root, stdio: 'inherit' }).status ?? 1;

const given = process.argv.slice(2);
if (given.length > 0) process.exit(run(given));

const SERIAL = /harness\.ts'|playwright|cpuNow|performance\.now\(|cpuUsage|hrtime/;
const files = readdirSync(join(root, 'tests'), { recursive: true, encoding: 'utf8' })
  .filter((f) => f.endsWith('.test.ts'))
  .map((f) => join('tests', f))
  .sort();
const serial = files.filter((f) => SERIAL.test(readFileSync(join(root, f), 'utf8')));
const parallel = files.filter((f) => !serial.includes(f));
console.log(`npm test: ${parallel.length} files in parallel, then ${serial.length} one at a time`);
const first = run(parallel);
const second = run(['--test-concurrency=1', ...serial]);
process.exit(first || second);
