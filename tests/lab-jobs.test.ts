// The lab fleet's kinds of job, their pure parts (tools/fleet/jobs/race.ts,
// tools/fleet/jobs/career.ts): a shard's name read or refused, a career's
// report parted into what two hosts must agree on and what is the machine's
// own; a batch of careers asked for in one line (tools/fleet/dispatch.ts); and
// the harness keeping only its last few planets (tools/harness/world.ts).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shardsOf } from '../tools/fleet/dispatch.ts';
import { careerShard, parted } from '../tools/fleet/jobs/career.ts';
import { raceShard } from '../tools/fleet/jobs/race.ts';
import { KEPT, keptWorlds, worldOf } from '../tools/harness/world.ts';
import { TEAMS } from '../src/race.ts';

test('race: a shard is a seed, and a field of teams if asked; nothing else is', () => {
  assert.deepEqual(raceShard('7'), { seed: 7, teams: TEAMS });
  assert.deepEqual(raceShard('7-4'), { seed: 7, teams: 4 });
  for (const bad of ['', 'x', '7-0', `7-${TEAMS + 1}`, '7-4-1', '-7'])
    assert.throws(() => raceShard(bad), /race/, bad);
});

test('career: a shard is a manager, a seed and seasons; nothing else is', () => {
  assert.deepEqual(careerShard('shrewd-12-5'), {
    manager: 'shrewd',
    seed: 12,
    seasons: 5,
  });
  for (const bad of [
    'shrewd-12',
    'lazy-1-5',
    'idle-1-0',
    'idle-x-5',
    'idle-1-5-',
  ])
    assert.throws(() => careerShard(bad), /career/, bad);
});

test('career: a batch of careers is asked for in one line, every manager by every seed', () => {
  const shards = shardsOf('idle|sensible|shrewd-1..24-5');
  assert.equal(shards.length, 72);
  assert.equal(new Set(shards).size, 72);
  assert.deepEqual(shards.slice(0, 2), ['idle-1-5', 'idle-2-5']);
  assert.equal(shards.at(-1), 'shrewd-24-5');
  for (const s of shards) careerShard(s);
  // a name with no range or choice in it is itself, dashes and all
  assert.deepEqual(shardsOf('gold-rush,4..5'), ['gold-rush', '4', '5']);
});

// only a record's wall is read by the parting; the rest is carried as it is
const season = (n: number, ms: number) => ({
  season: n,
  wall: { ms, races: 30, raceMs: ms - 9, planetMs: 9 },
});

const report = (ms: number) => ({
  manager: 'sensible' as const,
  seed: 3,
  seasons: 2,
  tuning: 7,
  journal: { entries: 900, tip: 'abcd1234' },
  refused: { 'SetPlan:unfit': 1 },
  ended: null,
  wall: { ms: ms * 2, perSeason: [ms, ms] },
  records: [season(1, ms), season(2, ms)],
});

test('career: a report parted keeps every number of the career, and no time of the machine’s, in what is hashed', () => {
  const fast = parted(report(1000)),
    slow = parted(report(7777));
  assert.deepEqual(fast.result, slow.result);
  assert.equal(JSON.stringify(fast.result).includes('1000'), false);
  assert.deepEqual(fast.result.records[1], { season: 2, wall: { races: 30 } });
  assert.equal(fast.result.journal.tip, 'abcd1234');
  assert.deepEqual(fast.aside.perSeason, [1000, 1000]);
  assert.equal(fast.aside.seasons[0].raceMs, 991);
  assert.notDeepEqual(fast.aside, slow.aside);
});

test(`world: the harness keeps its last ${KEPT} planets, not every one a career sails`, () => {
  const seeds = Array.from({ length: KEPT + 2 }, (_, i) => 101 + i);
  const first = worldOf(seeds[0]);
  for (const s of seeds.slice(1)) worldOf(s);
  assert.deepEqual(keptWorlds(), seeds.slice(-KEPT));
  // one asked for again is kept longest
  const again = worldOf(seeds[2]);
  assert.equal(keptWorlds().at(-1), seeds[2]);
  assert.equal(worldOf(seeds[2]), again);
  // one let go is made anew, the same
  const remade = worldOf(seeds[0]);
  assert.notEqual(remade, first);
  assert.equal(remade.seed, first.seed);
  assert.ok(keptWorlds().length <= KEPT);
});
