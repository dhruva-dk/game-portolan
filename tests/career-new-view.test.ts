import { test } from 'node:test';
import assert from 'node:assert/strict';
import { apply, newCareer } from '../src/career/apply.ts';
import { TEAM_NAMES } from '../src/career/names.ts';
import { NAMES } from '../src/career/tuning.ts';
import {
  NEW_CAREER,
  newCareerView,
  prefilled,
  type NewCareerForm,
} from '../src/career/views/new-career.ts';
import { DYES, EMBLEMS, PATTERNS } from '../src/world/livery.ts';
import { rolled } from '../src/world/seeds.ts';

const ROLLED = rolled(() => 0.37);
const FRESH = { rolled: ROLLED, existing: false };
const OVER = { rolled: ROLLED, existing: true };

const edited = (change: Partial<NewCareerForm>): NewCareerForm => ({
  ...prefilled(ROLLED),
  ...change,
});

const chosen = (swatches: readonly { chosen: boolean }[]) =>
  swatches.flatMap((s, i) => (s.chosen ? [i] : []));

test('New Career opens prefilled: the first team name, the rolled seed, the first of each swatch, no dye yet', () => {
  const view = newCareerView(null, FRESH);
  assert.equal(view.title, 'Portolan');
  assert.equal(view.name.value, TEAM_NAMES[0]);
  assert.equal(view.seed.value, ROLLED);
  assert.deepEqual(chosen(view.dyes), [0]);
  assert.deepEqual(chosen(view.patterns), [0]);
  assert.deepEqual(chosen(view.emblems), [0]);
  assert.equal(view.wearing, null);
  assert.equal(view.start.faint, false);
});

test('the name holds 1 to 16 characters and the seed 1 to 24', () => {
  assert.deepEqual(
    [NEW_CAREER.name.least, NEW_CAREER.name.most],
    [1, NAMES.longest]
  );
  assert.equal(NAMES.longest, 16);
  assert.deepEqual([NEW_CAREER.seed.least, NEW_CAREER.seed.most], [1, 24]);
  const long = newCareerView(
    edited({ name: 'x'.repeat(30), seed: 'y'.repeat(30) }),
    FRESH
  );
  assert.equal(long.name.value.length, 16);
  assert.equal(long.seed.value.length, 24);
  assert.equal(long.options?.name.length, 16);
  assert.equal(long.options?.seed.length, 24);
  const one = newCareerView(edited({ name: 'A', seed: 'b' }), FRESH);
  assert.equal(one.start.faint, false);
});

test('Start is faint until both Name and Seed are non-empty, spaces alone counting as empty', () => {
  for (const [name, seed, faint] of [
    ['', ROLLED, true],
    ['Gulls', '', true],
    ['   ', ROLLED, true],
    ['Gulls', '  ', true],
    ['Gulls', ROLLED, false],
  ] as const) {
    const view = newCareerView(edited({ name, seed }), FRESH);
    assert.equal(view.start.faint, faint, `${name}/${seed}`);
    assert.equal(view.options === null, faint);
  }
  const trimmed = newCareerView(
    edited({ name: ' Gulls ', seed: ' tin ' }),
    FRESH
  );
  assert.equal(trimmed.options?.name, 'Gulls');
  assert.equal(trimmed.options?.seed, 'tin');
});

test('every dye, pattern and emblem that exists is offered, one of each chosen, none faint', () => {
  const view = newCareerView(
    edited({ livery: { dye: 9, pattern: 2 }, emblem: 11, dyed: true }),
    FRESH
  );
  assert.equal(view.dyes.length, DYES.length);
  assert.equal(view.dyes.length, 16);
  assert.equal(view.patterns.length, PATTERNS.length);
  assert.equal(view.patterns.length, 3);
  assert.equal(view.emblems.length, EMBLEMS);
  assert.equal(view.emblems.length, 12);
  assert.deepEqual(chosen(view.dyes), [9]);
  assert.deepEqual(chosen(view.patterns), [2]);
  assert.deepEqual(chosen(view.emblems), [11]);
  for (const s of [...view.dyes, ...view.patterns, ...view.emblems])
    assert.equal(s.faint, false);
  assert.deepEqual(view.wearing, { dye: 9, pattern: 2 });
  assert.equal(view.emblem, 11);
  const odd = newCareerView(
    edited({ livery: { dye: 99, pattern: -1 }, emblem: 12 }),
    FRESH
  );
  assert.deepEqual(odd.form.livery, { dye: 0, pattern: 0 });
  assert.equal(odd.emblem, 0);
});

test('with no career there is no close and Start acts at once; with a career, a close and a two-tap Start', () => {
  const fresh = newCareerView(null, FRESH),
    over = newCareerView(null, OVER);
  assert.equal(fresh.close, false);
  assert.equal(fresh.start.twoTap, false);
  assert.equal(over.close, true);
  assert.equal(over.start.twoTap, true);
});

test("Start's options make a career that accepts StartRace", () => {
  const view = newCareerView(
    edited({ livery: { dye: 4, pattern: 1 }, emblem: 6, dyed: true }),
    FRESH
  );
  assert.ok(view.options);
  const career = newCareer(view.options);
  assert.equal(career.teams[0].name, TEAM_NAMES[0]);
  assert.deepEqual(career.teams[0].livery, { dye: 4, pattern: 1 });
  assert.equal(career.teams[0].emblem, 6);
  const started = apply(career, { type: 'StartRace', team: 0 });
  assert.equal(started.ok, true);
  if (started.ok) assert.equal(started.state.phase, 'racing');
});
