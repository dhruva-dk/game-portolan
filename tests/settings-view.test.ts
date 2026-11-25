import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  RANGES,
  SETTINGS,
  moved,
  settingsView,
  settled,
  shareOf,
  thrown,
  valueAt,
  type Level,
  type Settings,
} from '../src/ui/base/settings.ts';

const LEVELS: Level[] = ['sound', 'music', 'sensitivity'];
const near = (a: number, b: number) =>
  assert.ok(Math.abs(a - b) < 1e-9, `${a} ≠ ${b}`);

test('the defaults are the plan’s: sound 0.8, music 0.6, right-handed, sensitivity 1', () => {
  assert.deepEqual(SETTINGS, {
    sound: 0.8,
    music: 0.6,
    leftHanded: false,
    sensitivity: 1,
  });
  assert.deepEqual(RANGES.sound, { least: 0, most: 1, step: 0.05 });
  assert.deepEqual(RANGES.music, { least: 0, most: 1, step: 0.05 });
  assert.deepEqual(RANGES.sensitivity, { least: 0.5, most: 2, step: 0.05 });
});

test('the lobby sheet has six rows in the plan’s order, the seed as text and New Career last', () => {
  const v = settingsView(SETTINGS, { seed: 'pelican' });
  assert.deepEqual(
    v.rows.map((r) => r.word),
    ['Sound', 'Music', 'Left-handed', 'Sensitivity', 'Seed', 'New Career']
  );
  assert.deepEqual(v.rows[4], { kind: 'seed', word: 'Seed', seed: 'pelican' });
  assert.deepEqual(v.rows[5], { kind: 'newCareer', word: 'New Career' });
});

test('the pause sheet is the same sheet without its last two rows', () => {
  const lobby = settingsView(SETTINGS, { seed: 'pelican' }),
    pause = settingsView(SETTINGS, null);
  assert.deepEqual(pause.rows, lobby.rows.slice(0, 4));
});

test('each slider shows its value as a share of its range', () => {
  const s: Settings = {
    sound: 0.25,
    music: 1,
    leftHanded: true,
    sensitivity: 2,
  };
  const rows = settingsView(s, null).rows;
  assert.deepEqual(rows[0], {
    kind: 'slider',
    id: 'sound',
    word: 'Sound',
    share: 0.25,
    mark: null,
  });
  assert.equal(rows[1].kind === 'slider' && rows[1].share, 1);
  assert.deepEqual(rows[2], {
    kind: 'switch',
    id: 'leftHanded',
    word: 'Left-handed',
    on: true,
  });
  assert.equal(rows[3].kind === 'slider' && rows[3].share, 1);
  const quiet = settingsView(SETTINGS, null).rows;
  assert.equal(quiet[0].kind === 'slider' && quiet[0].share, 0.8);
  assert.equal(quiet[1].kind === 'slider' && quiet[1].share, 0.6);
  if (quiet[3].kind !== 'slider') throw new Error('no sensitivity slider');
  near(quiet[3].share, 1 / 3);
});

test('only sensitivity marks its default on the track', () => {
  const rows = settingsView(SETTINGS, null).rows;
  const marks = rows.flatMap((r) => (r.kind === 'slider' ? [r.mark] : []));
  assert.equal(marks[0], null);
  assert.equal(marks[1], null);
  near(marks[2] ?? NaN, 1 / 3);
});

test('a slider moved to a share lands on a step inside its range', () => {
  for (const id of LEVELS) {
    const { least, most, step } = RANGES[id];
    assert.equal(valueAt(id, 0), least);
    assert.equal(valueAt(id, 1), most);
    assert.equal(valueAt(id, -3), least);
    assert.equal(valueAt(id, 7), most);
    for (let k = 0; k <= 100; k++) {
      const v = valueAt(id, k / 100);
      assert.ok(v >= least && v <= most);
      near(Math.round(v / step) * step, v);
      assert.equal(Math.round(v * 100) / 100, v);
    }
  }
  assert.equal(valueAt('sensitivity', 0.5), 1.25);
  assert.equal(valueAt('sound', 0.333), 0.35);
});

test('a value read back through its share is the same value', () => {
  for (const id of LEVELS) {
    const { least, most, step } = RANGES[id];
    for (let v = least; v <= most + 1e-9; v += step) {
      const kept = Math.round(v * 100) / 100;
      assert.equal(valueAt(id, shareOf(id, kept)), kept);
    }
  }
});

test('moving one slider changes that setting alone; the switch throws back and forth', () => {
  const s = moved(SETTINGS, 'music', 0.1);
  assert.deepEqual(s, { ...SETTINGS, music: 0.1 });
  assert.deepEqual(moved(s, 'sensitivity', 0), { ...s, sensitivity: 0.5 });
  assert.equal(thrown(SETTINGS).leftHanded, true);
  assert.deepEqual(thrown(thrown(s)), s);
});

test('stored settings are read field by field, anything unreadable falling back to its default', () => {
  const read = (o: Record<string, unknown>) =>
    settled(new Map(Object.entries(o)));
  assert.deepEqual(read({}), SETTINGS);
  assert.deepEqual(
    read({ sound: 0.3, music: 0, leftHanded: true, sensitivity: 1.75 }),
    { sound: 0.3, music: 0, leftHanded: true, sensitivity: 1.75 }
  );
  assert.deepEqual(
    read({ sound: 1.2, music: '0.4', leftHanded: 'yes', sensitivity: 0.2 }),
    SETTINGS
  );
  assert.deepEqual(
    read({ sound: Number.NaN, sensitivity: 3, look: 0.25 }),
    SETTINGS
  );
});
