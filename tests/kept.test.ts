import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  keepLivery,
  keepSettings,
  keptLivery,
  keptSettings,
  type Store,
} from '../src/ui/kept.ts';
import { LIVERY } from '../src/player.ts';

const NAMES = ['vermilion', 'coral', 'lemon', 'charcoal'];
const DEFAULT = { sound: 0.8, look: 0.5, stats: false };

function memory(): Store & { items: Map<string, string> } {
  const items = new Map<string, string>();
  return {
    items,
    getItem: (k) => items.get(k) ?? null,
    setItem: (k, v) => void items.set(k, String(v)),
  };
}
const refusing: Store = {
  getItem: () => {
    throw new Error('refused');
  },
  setItem: () => {
    throw new Error('refused');
  },
};

test('her settings and her livery, kept, read back as she left them', () => {
  const store = memory();
  keepSettings(store, { sound: 0.3, look: 1, stats: true });
  assert.deepEqual(keptSettings(store), { sound: 0.3, look: 1, stats: true });
  for (let dye = 0; dye < NAMES.length; dye++)
    for (let pattern = 0; pattern < 3; pattern++) {
      keepLivery(store, { dye, pattern }, NAMES);
      assert.deepEqual(keptLivery(store, NAMES), { dye, pattern });
    }
});

test('her livery is kept by name: the set reordered or grown, she wears the same dye', () => {
  const store = memory();
  keepLivery(store, { dye: 2, pattern: 1 }, NAMES);
  assert.deepEqual(JSON.parse(store.items.get('portolan.livery') ?? ''), {
    dye: 'lemon',
    pattern: 'band',
  });
  const grown = ['charcoal', 'peach', 'lemon', 'vermilion', 'coral'];
  assert.deepEqual(keptLivery(store, grown), { dye: 2, pattern: 1 });
  assert.deepEqual(keptLivery(store, ['vermilion', 'coral']), {
    dye: LIVERY.dye,
    pattern: 1,
  });
});

test('nothing kept, or a store that refuses: hers by default, and keeping does not throw', () => {
  for (const store of [memory(), refusing, null]) {
    assert.deepEqual(keptSettings(store), DEFAULT);
    assert.deepEqual(keptLivery(store, NAMES), LIVERY);
    keepSettings(store, { sound: 0, look: 0, stats: true });
    keepLivery(store, { dye: 1, pattern: 2 }, NAMES);
  }
});

test('what cannot be read is hers by default: not JSON, not a record, out of the set', () => {
  const store = memory();
  for (const garbage of ['{', 'null', '42', '"lemon"', '[1,2]', '']) {
    store.items.set('portolan.settings', garbage);
    store.items.set('portolan.livery', garbage);
    assert.deepEqual(keptSettings(store), DEFAULT, garbage);
    assert.deepEqual(keptLivery(store, NAMES), LIVERY, garbage);
  }
  for (const [dye, pattern] of [
    [3, 1],
    ['ultramarine', 'checkers'],
    [null, -1],
  ]) {
    store.items.set('portolan.livery', JSON.stringify({ dye, pattern }));
    assert.deepEqual(keptLivery(store, NAMES), LIVERY);
  }
  store.items.set(
    'portolan.settings',
    JSON.stringify({ sound: 7, look: 0.25, stats: 'yes' })
  );
  assert.deepEqual(keptSettings(store), { ...DEFAULT, look: 0.25 });
  keepLivery(store, { dye: 99, pattern: -1 }, NAMES);
  assert.deepEqual(keptLivery(store, NAMES), LIVERY);
});
