import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SHIP } from '../src/sim/handling.ts';
import { SHIPS } from '../src/sim/match.ts';
import { SPAWN, berthing, berths, closest } from '../src/sim/spawn.ts';
import { createMatches } from '../src/play/setup.ts';
import { SEED, createPlanet } from '../src/world/planet.ts';
import { R, along, dot, length } from '../src/world/sphere.ts';

const planet = createPlanet(SEED);
const depth = (p: readonly [number, number, number]) => -planet.height(p);
const water = berthing(depth);

test('a match\'s berths are its seed\'s alone: the same seed the same berths, to the bit; another seed others', () => {
  const a = berths(water, 1234, SHIPS, depth), b = berths(berthing(depth), 1234, SHIPS, depth), c = berths(water, 1235, SHIPS, depth);
  assert.deepEqual(a, b);
  assert.notDeepEqual(a.map((s) => s.at), c.map((s) => s.at));
  assert.equal(a.length, SHIPS);
});

test('every ship starts afloat in open water, clear of land all round, heading a tangent with open water ahead', () => {
  for (const seed of [1, 2, 3]) {
    for (const s of berths(water, seed, SHIPS, depth)) {
      assert.ok(Math.abs(length(s.at) - 1) < 1e-9 && Math.abs(length(s.heading) - 1) < 1e-9 && Math.abs(dot(s.at, s.heading)) < 1e-9);
      assert.ok(depth(s.at) >= SHIP.draught + SPAWN.depth, `${depth(s.at)} m under her`);
      for (let k = 0; k < 24; k++) {
        const t = along(s.at, s.heading, 1).t, b = (2 * Math.PI * k) / 24;
        const round = [Math.cos(b), Math.sin(b)] as const, port = [s.at[1] * t[2] - s.at[2] * t[1], s.at[2] * t[0] - s.at[0] * t[2], s.at[0] * t[1] - s.at[1] * t[0]] as const;
        const dir = [t[0] * round[0] + port[0] * round[1], t[1] * round[0] + port[1] * round[1], t[2] * round[0] + port[2] * round[1]] as const;
        assert.ok(depth(along(s.at, dir, SPAWN.clear).p) >= SHIP.draught, 'land within her clearance');
      }
      // the first 40 m ahead of her are open
      for (let d = 8; d <= 40; d += 8) assert.ok(depth(along(s.at, s.heading, d).p) >= SHIP.draught + SPAWN.depth, `shoal ${d} m ahead`);
    }
  }
});

test('the berths spread over the whole planet: no two within several ships\' lengths, the nearest pair far apart', () => {
  // an even spread of SHIPS over the sphere would have them about this far apart; the berths keep most of it
  const even = Math.sqrt((2 * 4 * Math.PI * R * R) / (Math.sqrt(3) * SHIPS));
  for (const n of [20, SHIPS, 100]) {
    const least = closest(berths(water, 7, n, depth));
    assert.ok(least > 5 * SHIP.length, `${n} ships: two only ${least.toFixed(0)} m apart`);
    if (n === SHIPS) assert.ok(least > 0.6 * even, `${n} ships ${least.toFixed(0)} m apart at least, of an even ${even.toFixed(0)}`);
  }
});

test('each match is berthed ahead of its deal (off the main thread in the game), so PLAY does not work its berths out', async () => {
  const matches = createMatches(SEED, planet, null, null), asked: number[] = [];
  matches.berthBy((seed) => {
    asked.push(seed);
    return Promise.resolve(berths(water, seed, SHIPS, depth));
  });
  // the first asked for at once, and dealt with its berths once they are back; the next asked for as it is dealt
  await new Promise((done) => setTimeout(done, 0));
  const first = matches.deal();
  assert.equal(asked[0], first.seed);
  assert.deepEqual(first.berths, berths(water, first.seed, SHIPS, depth));
  assert.equal(asked.length, 2);
  // dealt before they are back: without them (the match works them out itself)
  const second = matches.deal();
  assert.equal(asked[1], second.seed);
  assert.equal(second.berths, undefined);
});
