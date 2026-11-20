// A bot's mood (sim/fighting.ts mood): the blows she takes cool it, the ships
// she sinks warm it, and it settles back to her temper's.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mind, sank, shot } from '../src/sim/bot.ts';
import { DEFAULT_BRAIN } from '../src/sim/brain.ts';
import { aggroOf, type Ctx } from '../src/sim/captain.ts';
import { mood, MIND } from '../src/sim/fighting.ts';
import { temper } from '../src/sim/temper.ts';
import { fromLatLon } from '../src/world/sphere.ts';

/** What `mood` and `aggroOf` read of a think: her memory, brain and temper. */
const ctx = (m = mind(7, fromLatLon(0.1, 0.2))): Ctx => ({
  own: null as never,
  others: [],
  sea: null as never,
  m,
  b: DEFAULT_BRAIN,
  t: temper(7),
  foe: null,
  foeD: Infinity,
  seed: 7,
});

test('a mood stands at her temper till something befalls her', () => {
  const c = ctx();
  mood(c, 10);
  assert.equal(c.m.heat, 0);
  assert.equal(aggroOf(c), c.t.aggro);
});

test('a hundred hit points taken cool her; a ship sunk warms her; both settle back by half each `settle` s', () => {
  const c = ctx(shot(mind(7, fromLatLon(0.1, 0.2)), 3, 100));
  mood(c, 0);
  assert.ok(Math.abs(c.m.heat + MIND.hurt) < 1e-12);
  assert.equal(c.m.hurt, 0);
  mood(c, MIND.settle);
  assert.ok(Math.abs(c.m.heat + MIND.hurt / 2) < 1e-12);
  c.m = sank(c.m);
  mood(c, 0);
  assert.ok(Math.abs(c.m.heat - (MIND.won - MIND.hurt / 2)) < 1e-12);
});

test('her mood keeps within its band of her temper, and her aggro within 0..1', () => {
  const c = ctx(shot(mind(7, fromLatLon(0.1, 0.2)), 3, 1000));
  mood(c, 0);
  assert.equal(c.m.heat, -MIND.band);
  assert.ok(aggroOf(c) >= 0);
  for (let i = 0; i < 10; i++) c.m = sank(c.m);
  mood(c, 0);
  assert.equal(c.m.heat, MIND.band);
  assert.ok(aggroOf(c) <= 1);
});
