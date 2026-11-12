import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MEAN, SWING, createWeather, type Weather } from '../src/world/weather.ts';

const KEYS = ['wind', 'cloud', 'haze'] as const;
/** A match's weather every `step` seconds for an hour. */
const hour = (seed: number, step = 1, mean = MEAN, swing = SWING) => {
  const w = createWeather(seed, mean, swing);
  return Array.from({ length: 3600 / step + 1 }, (_, i) => w(i * step));
};

test('the weather stays within its swing of its means, and wanders over most of it', () => {
  for (let seed = 1; seed <= 20; seed++) {
    const days = hour(seed, 5);
    for (const k of KEYS) {
      const bound = k === 'haze' ? MEAN.haze * SWING.haze : SWING[k];
      const off = days.map((d) => d[k] - MEAN[k]);
      assert.ok(off.every((o) => Math.abs(o) <= bound + 1e-12), `seed ${seed} ${k}`);
      assert.ok(Math.max(...off) - Math.min(...off) > bound * 0.6, `seed ${seed} ${k}: stays put`);
    }
  }
  assert.ok(MEAN.cloud - SWING.cloud >= 0 && MEAN.cloud + SWING.cloud <= 1);
});

test('the weather changes over minutes, never suddenly', () => {
  for (let seed = 1; seed <= 20; seed++) {
    const days = hour(seed);
    for (const k of KEYS) {
      const range = 2 * (k === 'haze' ? MEAN.haze * SWING.haze : SWING[k]);
      // no faster than across its whole range in a little under two minutes
      for (let i = 1; i < days.length; i++) assert.ok(Math.abs(days[i][k] - days[i - 1][k]) < range / 100, `seed ${seed} ${k} at ${i} s`);
    }
  }
});

test('the weather is the seed and the clock alone', () => {
  const a = createWeather(4), b = createWeather(4), c = createWeather(5);
  for (const t of [0, 1, 61.5, 900, 3599]) assert.deepEqual(a(t), b(t));
  assert.notDeepEqual(a(900), c(900));
});

test('a pinned quantity holds; the others drift as before', () => {
  const pinned: Weather = { ...SWING, cloud: 0 }, held = { ...MEAN, cloud: 0.6 };
  const free = hour(9, 30), some = hour(9, 30, held, pinned);
  some.forEach((d, i) => {
    assert.equal(d.cloud, 0.6);
    assert.equal(d.wind, free[i].wind);
    assert.equal(d.haze, free[i].haze);
  });
});
