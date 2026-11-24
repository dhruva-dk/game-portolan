import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dealt, TYPES } from '../src/sim/persona.ts';
import { DEFAULT_RULES } from '../src/sim/rules.ts';
import { RULES, ruledBy } from '../tools/sim/rules.ts';
import { typeNamed } from '../tools/sim/types.ts';

test('no variant named leaves the dealing as it was, the game’s own', () => {
  assert.equal(ruledBy(undefined), undefined);
  const of = typeNamed('cagey');
  assert.equal(ruledBy(of), of);
  const same = ruledBy(undefined, 'default')!;
  for (let s = 1; s < 40; s++) assert.deepEqual(same(s).rules, dealt(s).rules);
});

test('a variant changes the rules its match type deals, and keeps the type’s own changes', () => {
  const blood = TYPES.find((t) => t.name === 'bloodbath')!;
  const r = ruledBy(typeNamed('bloodbath'), 'sparse')!(7);
  assert.equal(r.name, 'bloodbath');
  assert.equal(
    r.rules.loot.spots,
    Math.round(blood.rules.loot.spots * (2 / 3))
  );
  assert.equal(r.rules.loot.gun, blood.rules.loot.gun);
  assert.deepEqual(r.rules.storm, blood.rules.storm);
  const q = ruledBy(undefined, 'quick')!(7);
  assert.ok(
    q.rules.storm.phases.every(
      (p, i) => p.wait < dealt(7).rules.storm.phases[i].wait
    )
  );
});

test('every variant makes whole rules, keys in the game’s order', () => {
  for (const name of Object.keys(RULES)) {
    const r = ruledBy(undefined, name)!(3).rules;
    assert.deepEqual(Object.keys(r.loot), Object.keys(DEFAULT_RULES.loot));
    assert.deepEqual(Object.keys(r.storm), Object.keys(DEFAULT_RULES.storm));
    assert.deepEqual(Object.keys(r.aim), Object.keys(DEFAULT_RULES.aim));
  }
  assert.throws(() => ruledBy(undefined, 'nonesuch'), /no rules "nonesuch"/);
});

test('noAssist takes the assist away at every rarity, and nothing else', () => {
  const r = ruledBy(undefined, 'noAssist')!(5).rules;
  assert.deepEqual(
    r.aim.assist,
    DEFAULT_RULES.aim.assist.map(() => 0)
  );
  assert.deepEqual(r.loot, dealt(5).rules.loot);
  assert.deepEqual(r.storm, dealt(5).rules.storm);
});
