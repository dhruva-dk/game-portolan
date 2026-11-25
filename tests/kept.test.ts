import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  keepLivery,
  keepSettings,
  keptLivery,
  keptSettings,
  type Store,
} from '../src/app/kept.ts';
import { LIVERY } from '../src/world/livery.ts';

const NAMES = ['vermilion', 'coral', 'lemon', 'charcoal'];
const DEFAULT = {
  sound: 0.8,
  music: 0.6,
  leftHanded: false,
  sensitivity: 1,
  stats: false,
};
const HERS = {
  sound: 0.3,
  music: 0.15,
  leftHanded: true,
  sensitivity: 1.65,
  stats: true,
};

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
  keepSettings(store, HERS);
  assert.deepEqual(keptSettings(store), HERS);
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
    keepSettings(store, { ...HERS, sound: 0 });
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
    JSON.stringify({ sound: 7, look: 0.25, stats: 'yes', sensitivity: 0.5 })
  );
  assert.deepEqual(keptSettings(store), { ...DEFAULT, sensitivity: 0.5 });
  keepLivery(store, { dye: 99, pattern: -1 }, NAMES);
  assert.deepEqual(keptLivery(store, NAMES), LIVERY);
});

test('the settings sheet keeps its four under the same key without losing the meter switch', () => {
  const store = memory();
  keepSettings(store, { ...DEFAULT, stats: true });
  keepSettings(store, {
    sound: 0.45,
    music: 0,
    leftHanded: true,
    sensitivity: 0.75,
  });
  assert.deepEqual(keptSettings(store), {
    sound: 0.45,
    music: 0,
    leftHanded: true,
    sensitivity: 0.75,
    stats: true,
  });
  assert.deepEqual(
    Object.keys(JSON.parse(store.items.get('portolan.settings') ?? '')).sort(),
    ['leftHanded', 'music', 'sensitivity', 'sound', 'stats']
  );
});
