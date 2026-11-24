import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  OFFSEASON_RACE,
  draw,
  knowledgeYear,
  ordered,
  pick,
  raceKey,
  uniform,
  whole,
} from '../src/career/draw.ts';
import { LEAGUE } from '../src/career/tuning.ts';

const SEEDS = ['test', 'portolan', 'saltgull', '12345'];

test('a draw is fixed by its seed and keys, the same on every machine', () => {
  assert.equal(draw('test', 'person', 7, 'age'), 0.2144638653844595);
  assert.equal(draw('portolan', 'planet', 1, 1), 0.1405070924665779);
  assert.equal(whole(1, 6, 'test', 'x'), 3);
});

test('the same seed and keys give the same draw every time', () => {
  for (const seed of SEEDS)
    for (let id = 0; id < 50; id++)
      assert.equal(
        draw(seed, 'person', id, 'peakAge'),
        draw(seed, 'person', id, 'peakAge')
      );
});

test('draws do not depend on the order they are made in', () => {
  const keys = Array.from({ length: 40 }, (_, i) => ['team', i, 'balance']);
  const forward = keys.map((k) => draw('test', ...k));
  const backward = [...keys].reverse().map((k) => draw('test', ...k));
  assert.deepEqual(forward, backward.reverse());
  for (let i = 0; i < 100; i++) draw('test', 'noise', i);
  assert.deepEqual(
    keys.map((k) => draw('test', ...k)),
    forward
  );
});

test('the keys are joined with a slash', () => {
  assert.equal(draw('test', 'deal', 1, 2), draw('test', 'deal/1/2'));
});

test('different keys and different seeds give different draws', () => {
  const values = new Set<number>();
  for (const seed of SEEDS)
    for (let id = 0; id < 250; id++)
      values.add(draw(seed, 'person', id, 'spikiness'));
  assert.equal(values.size, SEEDS.length * 250);
  assert.notEqual(draw('test', 'a', 'b'), draw('test', 'b', 'a'));
  assert.notEqual(
    draw('test', 'range', 1, 7, 0),
    draw('test', 'range', 2, 7, 0)
  );
});

test('a draw is from 0 up to but not including 1', () => {
  for (let i = 0; i < 5000; i++) {
    const u = draw('test', 'unit', i);
    assert.ok(u >= 0 && u < 1, `${u}`);
  }
});

test('uniform stays in its range', () => {
  for (let i = 0; i < 2000; i++) {
    const x = uniform(-8, 8, 'test', 'team', i, 'design');
    assert.ok(x >= -8 && x < 8, `${x}`);
  }
});

test('whole gives every whole number from lo to hi and nothing else', () => {
  const seen = new Set<number>();
  for (let i = 0; i < 2000; i++) {
    const n = whole(26, 31, 'test', 'person', i, 'peakAge');
    assert.ok(Number.isInteger(n) && n >= 26 && n <= 31, `${n}`);
    seen.add(n);
  }
  assert.deepEqual(
    [...seen].sort((a, b) => a - b),
    [26, 27, 28, 29, 30, 31]
  );
  assert.equal(whole(5, 5, 'test', 'one'), 5);
});

test('pick returns an item of the list', () => {
  const items = ['a', 'b', 'c'];
  const seen = new Set<string>();
  for (let i = 0; i < 200; i++) seen.add(pick(items, 'test', 'pick', i));
  assert.deepEqual([...seen].sort(), items);
});

test('a keyed ordering is a permutation fixed by its keys', () => {
  const ids = Array.from({ length: 60 }, (_, i) => i * 3 + 1);
  const keys = ['deal', 1, 4, 0, 'driver'];
  const order = ordered(ids, (id) => id, 'test', ...keys);
  assert.deepEqual(
    [...order].sort((a, b) => a - b),
    ids
  );
  assert.deepEqual(
    ordered(ids, (id) => id, 'test', ...keys),
    order
  );
  assert.deepEqual(
    ordered([...ids].reverse(), (id) => id, 'test', ...keys),
    order
  );
  assert.notDeepEqual(
    ordered(ids, (id) => id, 'test', 'deal', 1, 5),
    order
  );
  assert.notDeepEqual(order, ids);
});

test('an ordering puts each item by its own draw with its key last', () => {
  const ids = [4, 9, 2];
  const order = ordered(ids, (id) => id, 'test', 'deal', 1, 1, 0, 'mechanic');
  const u = (id: number) => draw('test', 'deal', 1, 1, 0, 'mechanic', id);
  for (let i = 1; i < order.length; i++)
    assert.ok(u(order[i - 1]) <= u(order[i]));
});

test('the off-season stop draws with race 11 and the next knowledge year', () => {
  assert.equal(OFFSEASON_RACE, LEAGUE.racesPerSeason + 1);
  assert.equal(raceKey({ race: 4, phase: 'lobby' }), 4);
  assert.equal(raceKey({ race: 4, phase: 'racing' }), 4);
  assert.equal(raceKey({ race: 10, phase: 'offseason' }), OFFSEASON_RACE);
  assert.equal(knowledgeYear({ season: 3, phase: 'lobby' }), 3);
  assert.equal(knowledgeYear({ season: 3, phase: 'racing' }), 3);
  assert.equal(knowledgeYear({ season: 3, phase: 'offseason' }), 4);
});
