// Starting again after a lost GPU, without going round in a loop.
//   node --test tests/recover.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shouldReload } from '../src/render/gpu/recover.ts';

const memory = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
};

test('the first loss reloads', () => {
  assert.equal(shouldReload(memory(), 1_000_000), true);
});

test('a second loss soon after does not', () => {
  const s = memory();
  shouldReload(s, 1_000_000);
  assert.equal(shouldReload(s, 1_000_000 + 5_000), false);
});

test('a loss long after does', () => {
  const s = memory();
  shouldReload(s, 1_000_000);
  assert.equal(shouldReload(s, 1_000_000 + 60_000), true);
});

test('a store that fails does not reload', () => {
  const broken = { getItem: () => { throw new Error('no'); }, setItem: () => {} };
  assert.equal(shouldReload(broken, 1_000_000), false);
});
