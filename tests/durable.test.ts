// Keeping the career where iOS will not clear it, and bringing an earlier build's across.
//   node --test tests/durable.test.ts
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { closeDurable, durable, openDurable, type Item, type Prefs } from '../src/app/durable.ts';

const prefs = (start: Record<string, string> = {}) => {
  const m = new Map(Object.entries(start));
  const p: Prefs & { m: Map<string, string> } = {
    m,
    get: async ({ key }) => ({ value: m.get(key) ?? null }),
    set: async ({ key, value }) => void m.set(key, value),
  };
  return p;
};
const old = (start: Record<string, string> = {}): Item => {
  const m = new Map(Object.entries(start));
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v) };
};

afterEach(closeDurable);

test('what the device holds is read back', async () => {
  await openDurable(prefs({ a: '1' }), old(), ['a', 'b']);
  assert.equal(durable().getItem('a'), '1');
  assert.equal(durable().getItem('b'), null);
});

test('an earlier build\'s save is carried across', async () => {
  const p = prefs();
  await openDurable(p, old({ a: 'saved' }), ['a']);
  assert.equal(durable().getItem('a'), 'saved');
  assert.equal(p.m.get('a'), 'saved');
});

test('the device\'s copy wins over a stale one in local storage', async () => {
  await openDurable(prefs({ a: 'new' }), old({ a: 'stale' }), ['a']);
  assert.equal(durable().getItem('a'), 'new');
});

test('a write is read back at once and reaches the device', async () => {
  const p = prefs();
  await openDurable(p, old(), ['a']);
  durable().setItem('a', 'x');
  assert.equal(durable().getItem('a'), 'x');
  await Promise.resolve();
  assert.equal(p.m.get('a'), 'x');
});

test('local storage that throws costs nothing', async () => {
  const broken: Item = { getItem: () => { throw new Error('blocked'); }, setItem: () => {} };
  await openDurable(prefs(), broken, ['a']);
  assert.equal(durable().getItem('a'), null);
});

test('a write the device refuses still holds for the visit', async () => {
  const p = prefs();
  p.set = async () => { throw new Error('full'); };
  await openDurable(p, old(), ['a']);
  durable().setItem('a', 'x');
  await Promise.resolve();
  assert.equal(durable().getItem('a'), 'x');
});
