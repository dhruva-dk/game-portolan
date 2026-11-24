import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  shipValues,
  type FittedLevels,
  type MechanicStats,
} from '../src/career/fit.ts';
import {
  LEVEL_SPAN,
  LEVEL_VALUES,
  MECHANIC_VALUES,
} from '../src/career/tuning.ts';
import { KINDS } from '../src/sim/kinds.ts';

const LEVELED = Object.keys(LEVEL_VALUES) as (keyof typeof LEVEL_VALUES)[];
const TENDED = Object.keys(MECHANIC_VALUES) as (keyof typeof MECHANIC_VALUES)[];
const LINES = [...new Set(LEVELED.map((v) => LEVEL_VALUES[v].line))];
const STATS = TENDED.map((v) => MECHANIC_VALUES[v].stat);

const all = (level: number): FittedLevels =>
  Object.fromEntries(LINES.map((l) => [l, level])) as FittedLevels;

const mechanicAt = (n: number): MechanicStats =>
  Object.fromEntries(STATS.map((s) => [s, n])) as MechanicStats;

const close = (a: number, b: number): void =>
  assert.ok(Math.abs(a - b) < 1e-9, `${a} is not ${b}`);

const span = LEVEL_SPAN.most - LEVEL_SPAN.least;
const at = (fraction: number): number => LEVEL_SPAN.least + span * fraction;

test('there are seven lines', () => {
  assert.equal(LINES.length, 7);
});

test('level 0 and level 100 give the ends of each row', () => {
  const low = shipValues(all(LEVEL_SPAN.least), 'cannon', null);
  const high = shipValues(all(LEVEL_SPAN.most), 'cannon', null);
  for (const v of LEVELED) {
    assert.equal(low[v], LEVEL_VALUES[v].atZero);
    assert.equal(high[v], LEVEL_VALUES[v].atHundred);
  }
});

test('each row is linear between its ends', () => {
  for (const fraction of [0.25, 0.5, 0.8]) {
    const mid = shipValues(all(at(fraction)), 'cannon', null);
    for (const v of LEVELED) {
      const { atZero, atHundred } = LEVEL_VALUES[v];
      close(mid[v], atZero + (atHundred - atZero) * fraction);
    }
  }
});

test('each row moves in its direction as its level rises', () => {
  const steps = Array.from({ length: 11 }, (_, i) => at(i / 10));
  for (const v of LEVELED) {
    const { atZero, atHundred } = LEVEL_VALUES[v];
    const sign = Math.sign(atHundred - atZero);
    const seen = steps.map((l) => shipValues(all(l), 'cannon', null)[v]);
    for (let i = 1; i < seen.length; i++) {
      assert.equal(Math.sign(seen[i] - seen[i - 1]), sign, v);
    }
  }
});

test('a line moves only its own values', () => {
  const plain = shipValues(all(at(0.5)), 'cannon', null);
  for (const line of LINES) {
    const raised = shipValues(
      { ...all(at(0.5)), [line]: LEVEL_SPAN.most },
      'cannon',
      null
    );
    for (const v of LEVELED) {
      const moved = raised[v] !== plain[v];
      assert.equal(moved, LEVEL_VALUES[v].line === line, `${line} ${v}`);
    }
  }
});

test('the gun kind passes through', () => {
  for (const kind of KINDS) {
    assert.equal(shipValues(all(at(0.5)), kind, null).gun, kind);
  }
});

test('no mechanic gives the No mechanic column', () => {
  const values = shipValues(all(at(0.5)), 'cannon', null);
  for (const v of TENDED) {
    assert.equal(values[v], MECHANIC_VALUES[v].none);
  }
});

test('a mechanic gives each formula of the With a mechanic column', () => {
  for (const n of [1, 10, 20]) {
    const values = shipValues(all(at(0.5)), 'cannon', mechanicAt(n));
    for (const v of TENDED) {
      const { base, perPoint } = MECHANIC_VALUES[v];
      close(values[v], base + perPoint * n);
    }
  }
});

test('each mechanic stat moves only its own value, in its direction', () => {
  const plain = shipValues(all(at(0.5)), 'cannon', mechanicAt(1));
  for (const stat of STATS) {
    const raised = shipValues(all(at(0.5)), 'cannon', {
      ...mechanicAt(1),
      [stat]: 20,
    });
    for (const v of TENDED) {
      const { stat: own, perPoint } = MECHANIC_VALUES[v];
      const change = Math.sign(raised[v] - plain[v]);
      assert.equal(change, own === stat ? Math.sign(perPoint) : 0, stat);
    }
    for (const v of LEVELED) assert.equal(raised[v], plain[v]);
  }
});

test('a mechanic leaves the level values alone', () => {
  const without = shipValues(all(at(0.5)), 'cannon', null);
  const withOne = shipValues(all(at(0.5)), 'cannon', mechanicAt(20));
  for (const v of LEVELED) assert.equal(withOne[v], without[v]);
});
