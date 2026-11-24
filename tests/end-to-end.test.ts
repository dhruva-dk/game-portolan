import { test } from 'node:test';
import assert from 'node:assert/strict';
import { YOU, runCareer, type CareerRun } from '../tools/sim/career.ts';
import { runCareers } from '../tools/sim/career-pool.ts';

const SEED = 'test';

test('three races of a career, bots at every helm and real matches, sailed twice in parallel workers, end in the same state', async () => {
  const run: CareerRun = { seed: SEED, races: 3, standin: false, you: YOU };
  const [first, second] = await runCareers([run, run], 2);
  assert.equal(first.season, 1);
  assert.equal(first.race, 4);
  assert.equal(first.phase, 'lobby');
  assert.equal(first.lastRace?.race, 3);
  assert.deepEqual(second, first);
});

test('a full season with the stand-in, sailed twice, ends in the same state', () => {
  const run: CareerRun = { seed: SEED, races: 10, standin: true, you: YOU };
  const first = runCareer(run);
  const second = runCareer(run);
  assert.equal(first.phase, 'offseason');
  assert.equal(first.lastRace?.race, 10);
  assert.notEqual(first.lastOffseason, null);
  assert.deepEqual(second, first);
});
