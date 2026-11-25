import { test } from 'node:test';
import assert from 'node:assert/strict';
import { keepSettings, keptSettings, type Store } from '../src/app/kept.ts';

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

test('her settings, kept, read back as she left them', () => {
  const store = memory();
  keepSettings(store, HERS);
  assert.deepEqual(keptSettings(store), HERS);
});

test('nothing kept, or a store that refuses: hers by default, and keeping does not throw', () => {
  for (const store of [memory(), refusing, null]) {
    assert.deepEqual(keptSettings(store), DEFAULT);
    keepSettings(store, { ...HERS, sound: 0 });
  }
});

test('what cannot be read is hers by default: not JSON, not a record', () => {
  const store = memory();
  for (const garbage of ['{', 'null', '42', '"lemon"', '[1,2]', '']) {
    store.items.set('portolan.settings', garbage);
    assert.deepEqual(keptSettings(store), DEFAULT, garbage);
  }
  store.items.set(
    'portolan.settings',
    JSON.stringify({ sound: 7, look: 0.25, stats: 'yes', sensitivity: 0.5 })
  );
  assert.deepEqual(keptSettings(store), { ...DEFAULT, sensitivity: 0.5 });
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
