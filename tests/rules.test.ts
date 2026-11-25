import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createStorm, STORM, type StormTable } from '../src/sim/storm.ts';
import type { Depth } from '../src/sim/shoal.ts';

const deep: Depth = () => 50;

test('a quicker storm closes sooner', () => {
  const quick = {
    storm: {
      ...STORM,
      phases: STORM.phases.map((p) => ({ ...p, wait: p.wait / 2 })),
    },
  };
  const end = (phases: StormTable['phases']) =>
    phases.reduce((t, p) => t + p.wait + p.close, 0);
  const at = end(quick.storm.phases) + 1;
  assert.equal(createStorm(5, deep, quick.storm)(at).final, true);
  assert.equal(createStorm(5, deep)(at).final, false);
  assert.equal(createStorm(5, deep)(end(STORM.phases) + 1).final, true);
});

test('nothing in src reads the storm table but through a match’s rules', () => {
  const src = join(import.meta.dirname, '..', 'src');
  const files = readdirSync(src, { recursive: true, encoding: 'utf8' }).filter(
    (f) => f.endsWith('.ts')
  );
  const own = new Set(['sim/storm.ts', 'sim/rules.ts']);
  const readers = files.filter(
    (f) =>
      !own.has(f) &&
      /import\s*{[^}]*\bSTORM\b[^}]*}\s*from\s*'[./]*\/?(sim\/)?storm\.ts'/.test(
        readFileSync(join(src, f), 'utf8')
      )
  );
  assert.deepEqual(readers, []);
});
