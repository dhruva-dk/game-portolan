// The headshots (ui/gull.ts, Phase C section 4): a thousand seeds give at least 990 distinct drawings; a seed always
// draws the same one; age and role and crew change the drawing but never what the seed picked.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GLASSES, headshot, traitKey, traits } from '../src/ui/gull.ts';
import { ACCESSORY_NAMES } from '../src/ui/garb.ts';
import type { Face, Role } from '../src/office.ts';

const face = (seed: number, o: Partial<Face> = {}): Face => ({ seed, role: 'captain', age: 30, colours: { first: 0, second: 7 }, emblem: 3, ...o });

test('1,000 seeds give at least 990 distinct drawings', () => {
  const keys = new Set<string>(), drawn = new Set<string>();
  for (let s = 0; s < 1000; s++) {
    keys.add(traitKey(s));
    drawn.add(headshot(face(s), 96));
  }
  assert.ok(keys.size >= 990, `${keys.size} distinct of 1000 by traits`);
  assert.ok(drawn.size >= 990, `${drawn.size} distinct of 1000 drawn`);
});

test('a seed draws the same headshot every time, at each size', () => {
  for (const size of [40, 96, 240] as const) assert.equal(headshot(face(4242), size), headshot(face(4242), size));
});

test('every trait is reached: six sunglasses, twelve accessories, three heads, four beaks', () => {
  const seen = { glasses: new Set<number>(), accessory: new Set<number>(), head: new Set<number>(), beak: new Set<number>() };
  for (let s = 0; s < 2000; s++) {
    const t = traits(s);
    for (const k of Object.keys(seen) as (keyof typeof seen)[]) seen[k].add(t[k]);
  }
  assert.equal(seen.glasses.size, GLASSES.length);
  assert.equal(seen.accessory.size, ACCESSORY_NAMES.length);
  assert.ok(ACCESSORY_NAMES.length >= 12);
  assert.equal(seen.head.size, 3);
  assert.equal(seen.beak.size, 4);
});

test('age, role and crew change the drawing; a free agent is on paper', () => {
  const base = headshot(face(9), 96);
  assert.notEqual(headshot(face(9, { age: 17 }), 96), base);
  assert.notEqual(headshot(face(9, { age: 52 }), 96), base);
  const roles: Role[] = ['manager', 'captain', 'bosun', 'shipwright', 'scout', 'flight', 'elder'];
  assert.equal(new Set(roles.map((role) => headshot(face(9, { role }), 96))).size, roles.length);
  assert.notEqual(headshot(face(9, { colours: null, emblem: null }), 96), base);
});
