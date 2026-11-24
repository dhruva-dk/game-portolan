import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DEFAULT_RULES, ruled } from '../src/sim/rules.ts';
import { createStorm, STORM, type StormTable } from '../src/sim/storm.ts';
import type { Depth } from '../src/sim/shoal.ts';

const deep: Depth = () => 50;

test('the game’s rules are its tables, and a variant keeps every key in their order', () => {
  assert.equal(DEFAULT_RULES.storm, STORM);
  assert.equal(ruled({}).storm, STORM);
  const r = ruled({ storm: { rise: 1 } });
  assert.deepEqual(Object.keys(r.storm), Object.keys(STORM));
  assert.equal(r.storm.rise, 1);
  assert.equal(r.storm.every, STORM.every);
  assert.throws(
    () => ruled({ storm: { gunz: 1 } as never }),
    /storm has no gunz/
  );
});

test('a quicker storm closes sooner, by the rules the match is dealt', () => {
  const quick = ruled({
    storm: { phases: STORM.phases.map((p) => ({ ...p, wait: p.wait / 2 })) },
  });
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
