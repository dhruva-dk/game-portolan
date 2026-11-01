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
// (node --test with no files would go looking for every test itself, so an empty list runs nothing)
const first = parallel.length ? run(parallel) : 0;
const second = serial.length ? run(['--test-concurrency=1', ...serial]) : 0;
process.exit(first || second);
