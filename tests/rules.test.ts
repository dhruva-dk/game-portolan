import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  closedBy,
  closings,
  createStorm,
  STORM,
  type StormTable,
} from '../src/sim/storm.ts';
import type { Depth } from '../src/sim/shoal.ts';
import { stormFor } from '../src/sim/rules.ts';
import { STORM_FACTOR, STORM_SCHEDULE } from '../src/sim/tuning.ts';
import { sail, waters } from './small.ts';
import { EVEN_SHIP, setupOf } from './setups.ts';
import { createMatch } from '../src/sim/engine.ts';

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
  assert.equal(createStorm(5, deep, STORM)(at).final, false);
  assert.equal(createStorm(5, deep, STORM)(end(STORM.phases) + 1).final, true);
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

const RATINGS = [1, 2, 3, 4, 5] as const;

test("today's schedule is 458 s; a race's is it times 300 / 458 times the storm factor: 390, 345, 300, 255 and 210 s", () => {
  assert.equal(closedBy(STORM), STORM_SCHEDULE.today);
  assert.deepEqual(
    RATINGS.map((r) => STORM_FACTOR[r]),
    [1.3, 1.15, 1, 0.85, 0.7]
  );
  const lengths = RATINGS.map((r) => closedBy(stormFor(r)));
  [390, 345, 300, 255, 210].forEach((want, i) =>
    assert.ok(Math.abs(lengths[i] - want) < 1e-9, `${lengths[i]} s`)
  );
  for (const r of RATINGS) {
    const f = (300 / 458) * STORM_FACTOR[r],
      table = stormFor(r);
    assert.equal(table.phases.length, STORM.phases.length);
    table.phases.forEach((p, k) => {
      const was = STORM.phases[k];
      assert.equal(p.radius, was.radius);
      assert.equal(p.damage, was.damage);
      assert.ok(Math.abs(p.wait - was.wait * f) < 1e-9);
      assert.ok(Math.abs(p.close - was.close * f) < 1e-9);
    });
    assert.deepEqual(
      { ...table, phases: [] },
      { ...STORM, phases: [] },
      "the rest of the storm is today's"
    );
    const at = closings(table);
    assert.ok(at.every((t, k) => k === 0 || t > at[k - 1]));
  }
});

test('in a real match a five-star storm closes sooner than a one-star one, and the match follows its own rating', () => {
  const rated = (storm: 1 | 5) =>
    createMatch(
      setupOf(11, {
        storm,
        teams: 2,
        perTeam: 1,
        values: { ...EVEN_SHIP, hullPoints: 1e9 },
      }),
      waters
    );
  const quick = rated(5),
    slow = rated(1);
  let smaller = 0;
  for (let s = 0; s < 120; s++) {
    sail(quick, 1);
    sail(slow, 1);
    const a = quick.view.storm(1),
      b = slow.view.storm(1);
    assert.ok(a.radius <= b.radius + 1e-12, `${s} s`);
    if (a.radius < b.radius - 1e-9) smaller++;
    assert.ok(a.phase >= b.phase, `${s} s: phase`);
  }
  assert.ok(smaller > 60, `smaller for ${smaller} s of 120`);
  assert.ok(quick.view.storm(1).phase > slow.view.storm(1).phase);
});
