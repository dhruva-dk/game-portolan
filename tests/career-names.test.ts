import { test } from 'node:test';
import assert from 'node:assert/strict';
import { draw } from '../src/career/draw.ts';
import {
  BANNED,
  FAMILY_END,
  FAMILY_START,
  GIVEN_START,
  PLANET_NAMES,
  SPONSOR_ROSTER,
  TEAM_NAMES,
  allowed,
  nameAt,
  personName,
} from '../src/career/names.ts';
import { LEAGUE, NAMES } from '../src/career/tuning.ts';
import { EMBLEMS } from '../src/world/livery.ts';

const SPONSOR_NAMES = SPONSOR_ROSTER.map((s) => s.name);
const LISTS: [string, readonly string[]][] = [
  ['teams', TEAM_NAMES],
  ['sponsors', SPONSOR_NAMES],
  ['planets', PLANET_NAMES],
];

test('the lists have the sizes of §1.13.3', () => {
  assert.ok(TEAM_NAMES.length >= NAMES.teams);
  assert.ok(TEAM_NAMES.length >= LEAGUE.teams - 1);
  assert.equal(SPONSOR_ROSTER.length, NAMES.sponsors);
  assert.ok(PLANET_NAMES.length >= NAMES.planets);
});

test('every listed name is short, trimmed, distinct and allowed', () => {
  for (const [list, names] of LISTS) {
    assert.equal(new Set(names).size, names.length, `${list} repeat a name`);
    for (const name of names) {
      assert.ok(name.length >= 1 && name.length <= NAMES.longest, name);
      assert.equal(name.trim(), name);
      assert.ok(allowed(name), name);
    }
  }
});

test('names are distinct across the three lists', () => {
  const all = LISTS.flatMap(([, names]) => names);
  assert.equal(new Set(all).size, all.length);
});

test('every sponsor has an emblem that exists', () => {
  for (const { emblem } of SPONSOR_ROSTER)
    assert.ok(Number.isInteger(emblem) && emblem >= 0 && emblem < EMBLEMS);
});

test('the kept tables are as M1.10 left them', () => {
  assert.ok(!FAMILY_START.includes('person'));
  assert.ok(FAMILY_START.includes('gray'));
  assert.ok(!FAMILY_START.includes('grey'));
  for (const table of [GIVEN_START, FAMILY_START, FAMILY_END]) {
    assert.ok(table.length > 0);
    for (const part of table) assert.match(part, /^[a-z]+$/);
  }
});

test('a person name is an initial and a family name built from the tables', () => {
  for (let id = 0; id < 300; id++) {
    const name = personName('test', id);
    const match = /^([A-Z])\. ([A-Z][a-z]+)$/.exec(name);
    assert.ok(match, name);
    const [, initial, family] = match;
    assert.ok(GIVEN_START.some((g) => g.charAt(0).toUpperCase() === initial));
    assert.ok(
      FAMILY_START.some(
        (start) =>
          family.toLowerCase().startsWith(start) &&
          FAMILY_END.includes(family.toLowerCase().slice(start.length))
      ),
      name
    );
  }
});

test('every name the tables can build fits the length limit', () => {
  for (const start of FAMILY_START)
    for (const end of FAMILY_END)
      assert.ok(`X. ${start}${end}`.length <= NAMES.longest, start + end);
});

test('a person name is fixed by the seed and id', () => {
  for (let id = 0; id < 50; id++) {
    assert.equal(personName('test', id), personName('test', id));
    assert.equal(personName('test', id), nameAt('test', id, 0));
  }
  const names = new Set(
    Array.from({ length: 50 }, (_, id) => personName('test', id))
  );
  assert.ok(names.size > 1);
  assert.notEqual(nameAt('test', 3, 0), nameAt('other', 3, 0));
});

test('each part is drawn with the person, name, part and attempt keys', () => {
  const seed = 'portolan';
  const id = 11;
  const at = (field: string, size: number, attempt: number) =>
    Math.floor(draw(seed, 'person', id, 'name', field, attempt) * size);
  for (let attempt = 0; attempt < 4; attempt++) {
    const given = GIVEN_START[at('given', GIVEN_START.length, attempt)];
    const start = FAMILY_START[at('start', FAMILY_START.length, attempt)];
    const end = FAMILY_END[at('end', FAMILY_END.length, attempt)];
    const family = start + end;
    assert.equal(
      nameAt(seed, id, attempt),
      `${given.charAt(0).toUpperCase()}. ${family.charAt(0).toUpperCase()}${family.slice(1)}`
    );
  }
});

test('a rejected name is drawn again with the next attempt number', () => {
  for (let id = 0; id < 20; id++) {
    const rejected = new Set([nameAt('test', id, 0), nameAt('test', id, 1)]);
    const name = personName('test', id, (n) => !rejected.has(n));
    let attempt = 0;
    while (rejected.has(nameAt('test', id, attempt))) attempt++;
    assert.equal(name, nameAt('test', id, attempt));
    assert.ok(attempt >= 1);
  }
});

test('allowed rejects a name holding a banned word', () => {
  for (const word of BANNED) {
    assert.equal(allowed(`A. ${word[0].toUpperCase()}${word.slice(1)}`), false);
    assert.equal(allowed(`${word} Racing`), false);
    assert.equal(allowed(`${word}x Racing`), true);
  }
  for (let id = 0; id < 300; id++) assert.ok(allowed(personName('test', id)));
});
