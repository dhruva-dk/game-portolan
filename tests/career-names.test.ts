// Names (Phase B section 2.4, D34): no generated name of any kind holds a banned word as a whole word, in any case.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { random } from '../src/world/random.ts';
import {
  BANNED,
  NOUNS,
  allowed,
  colony,
  teamName,
  family,
  given,
  sponsor,
  place,
  planet,
  words,
} from '../src/career/names.ts';
import { freshName } from '../src/career/recruit.ts';

const N = 100_000;

test('the banned rule: a banned word as a whole word, in any case', () => {
  assert.deepEqual(BANNED, ['mara']);
  for (const bad of [
    'Mara',
    'MARA',
    'mara',
    'Mara People',
    'The mara',
    'People of Mara',
    'Hale & Mara, Coopers',
    'x-Mara',
  ])
    assert.equal(allowed(bad), false, bad);
  for (const ok of ['Marat', 'Amara', 'Maraton People', 'Samara', 'Mar a'])
    assert.equal(allowed(ok), true, ok);
});

const kinds: Record<string, (r: () => number) => string> = {
  given,
  family,
  colony,
  place,
  planet,
  sponsor,
  person: (r) => `${given(r)} ${family(r)}`,
  team: (r) => teamName(place(r), NOUNS[Math.floor(r() * NOUNS.length)]),
};

for (const [kind, make] of Object.entries(kinds)) {
  test(`${N.toLocaleString('en')} ${kind} names: none banned, all well formed`, () => {
    const rand = random(kind.length * 7919);
    for (let i = 0; i < N; i++) {
      const name = make(rand);
      if (!allowed(name)) assert.fail(`${kind} ${i}: '${name}'`);
      if (name.length === 0 || /\s\s/.test(name))
        assert.fail(`${kind} ${i}: '${name}'`);
    }
  });
}

test("people' full names: drawn fresh, never one taken", () => {
  const taken = new Set<string>();
  const rand = random(4);
  for (let i = 0; i < 20_000; i++) freshName(rand, taken);
  assert.equal(taken.size, 20_000);
});

test('sponsors are "<family> & <relation>, <trade>"; teams\' nouns are enough for every team with words to spare', () => {
  assert.match(
    sponsor(random(3)),
    /^[A-Z][a-z]+ & [A-Z][a-z]+, [A-Z][A-Za-z ]+$/
  );
  assert.ok(NOUNS.length >= 125);
  assert.equal(new Set(NOUNS.map((n) => n.toLowerCase())).size, NOUNS.length);
  for (const n of NOUNS) assert.equal(words(n).length, 1);
});
