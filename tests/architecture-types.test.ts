// The checker's two strictest options, as a ratchet: src checked as tsconfig.strict.json has it (an index read may be
// missing; an optional property is absent, not undefined), its errors counted by part of src, each part at most what
// its exception says (none, if it has none) and only ever fewer. tsconfig.json holds the rest of the strict options
// outright; these two came in on code written without them.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { EXCEPTIONS } from './architecture/exceptions.ts';
import { ROOT, none, unused, type Hit } from './architecture/scan.ts';

test('strict: src under exactOptionalPropertyTypes and noUncheckedIndexedAccess errs, by part, no more than its exception says, and that only comes down', () => {
  const tsc = spawnSync(process.execPath, [resolve(ROOT, 'node_modules/typescript/bin/tsc'), '--noEmit', '-p', 'tsconfig.strict.json', '--pretty', 'false'], {
    cwd: ROOT, encoding: 'utf8', timeout: 120_000,
  });
  assert.ok(tsc.status !== null, 'tsc ran');
  const errs = new Map<string, number>();
  for (const line of tsc.stdout.split('\n')) {
    const m = /^(src\/[^/(]+\/?)[^(]*\(\d+,\d+\): error TS/.exec(line);
    if (m) errs.set(m[1], (errs.get(m[1]) ?? 0) + 1);
  }
  const found: Hit[] = [];
  const parts = new Set([...errs.keys(), ...EXCEPTIONS.filter((e) => e.rule === 'strict').map((e) => e.file)]);
  for (const part of parts) {
    const n = errs.get(part) ?? 0, at = EXCEPTIONS.find((e) => e.rule === 'strict' && e.file === part)?.at ?? 0;
    if (n > at) found.push({ file: part, line: 1, name: 'over', text: `${n} errors, at most ${at}` });
    else if (n < at) found.push({ file: part, line: 1, name: 'down', text: `${n} errors: lower its exception to ${n}` });
    else if (n > 0) found.push({ file: part, line: 1, text: `${n} errors` });
  }
  none('strict', found, 'errors under the strictest options');
  assert.deepEqual(unused(['strict']).map((e) => e.file), [], 'stale exceptions: remove them');
});
