// A match's rules (sim/rules.ts): the game's own leave a match as it was; a
// variant changes what is laid and how the storm closes; and nothing reads the
// tables round them.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { isArms, laying, LOOT } from '../src/sim/loot.ts';
import { DEFAULT_RULES, ruled } from '../src/sim/rules.ts';
import { createStorm, STORM, type StormTable } from '../src/sim/storm.ts';
import type { Depth } from '../src/sim/shoal.ts';

const deep: Depth = () => 50;

test('the game’s rules are its tables, and a variant keeps every key in their order', () => {
  assert.equal(DEFAULT_RULES.loot, LOOT);
  assert.equal(DEFAULT_RULES.storm, STORM);
  assert.equal(ruled({}).loot, LOOT);
  const r = ruled({ loot: { gun: 0.8 }, storm: { rise: 1 } });
  assert.deepEqual(Object.keys(r.loot), Object.keys(LOOT));
  assert.deepEqual(Object.keys(r.storm), Object.keys(STORM));
  assert.equal(r.loot.gun, 0.8);
  assert.equal(r.loot.spots, LOOT.spots);
  assert.throws(
    () => ruled({ loot: { gunz: 1 } as never }),
    /loot has no gunz/
  );
});

test('richer rules lay more guns, and of rarer tiers', () => {
  const rich = ruled({ loot: { gun: 0.8, weights: [0, 10, 30, 40, 20] } });
  const plain = laying(5, deep)
      .strewn()
      .pieces.map((l) => l.goods),
    lavish = laying(5, deep, rich.loot)
      .strewn()
      .pieces.map((l) => l.goods);
  const guns = (g: typeof plain) => g.filter(isArms);
  assert.ok(guns(lavish).length > 1.5 * guns(plain).length);
  const rarity = (g: typeof plain) =>
    guns(g).reduce((a, k) => a + k.rarity, 0) / guns(g).length;
  assert.ok(rarity(lavish) > rarity(plain) + 1);
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

test('nothing in src reads the loot or storm tables but through a match’s rules', () => {
  const src = join(import.meta.dirname, '..', 'src');
  const files = readdirSync(src, { recursive: true, encoding: 'utf8' }).filter(
    (f) => f.endsWith('.ts')
  );
  const own = new Set(['sim/loot.ts', 'sim/storm.ts', 'sim/rules.ts']);
  const readers = files.filter(
    (f) =>
      !own.has(f) &&
      /import\s*{[^}]*\b(LOOT|STORM)\b[^}]*}\s*from\s*'[./]*\/?(sim\/)?(loot|storm)\.ts'/.test(
        readFileSync(join(src, f), 'utf8')
      )
  );
  assert.deepEqual(readers, []);
});
