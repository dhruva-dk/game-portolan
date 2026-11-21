import assert from 'node:assert/strict';
import { test } from 'node:test';
import { random } from '../src/world/random.ts';
import { named, rolled, seedOf } from '../src/world/seeds.ts';

test('a seed of digits is that number, so the planets known by number keep theirs', () => {
  assert.equal(seedOf('3'), 3);
  assert.equal(seedOf(' 4294967295 '), 4294967295);
  // past 32 bits it is text like any other
  assert.notEqual(seedOf('4294967296'), 4294967296);
  assert.ok(seedOf('4294967296') <= 0xffffffff);
});

test('a seed is its text trimmed and lowercased, the same number every time', () => {
  assert.equal(named('  DogDog '), 'dogdog');
  assert.equal(seedOf('DogDog'), seedOf('dogdog'));
  assert.equal(seedOf('dogdog'), seedOf('dogdog'));
  assert.notEqual(seedOf('dogdog'), seedOf('dogcat'));
  assert.notEqual(seedOf('ab'), seedOf('ba'));
  const s = seedOf('saltgull');
  assert.ok(Number.isInteger(s) && s >= 0 && s <= 0xffffffff);
});

test('seeds rolled are two words of the sea, run together, and spread', () => {
  const u = random(7),
    seen = new Set<string>();
  for (let i = 0; i < 200; i++) {
    const r = rolled(u);
    assert.match(r, /^[a-z]{4,16}$/);
    seen.add(r);
  }
  assert.ok(seen.size > 190, `${seen.size} of 200 rolls apart`);
});
