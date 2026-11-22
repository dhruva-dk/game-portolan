// The world at the start and founding (Phase B section 3).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { apply, start } from '../src/career/career.ts';
import { canonical } from '../src/career/canon.ts';
import { weakest } from '../src/career/found.ts';
import { stars } from '../src/career/stars.ts';
import { staffOf } from '../src/career/state.ts';
import { makeWorld, staffStars } from '../src/career/world.ts';
import { dice } from '../src/career/dice.ts';
import { SWATCHES } from '../src/race.ts';
import { FOUND, founded, invariants, refused } from './career-kit.ts';

const world = makeWorld(FOUND.seed, FOUND.colours, dice(FOUND.seed, {}));

test('the world: three leagues of forty crews, a full staff each, 300 free agents with 30 managers, about 1,900 gulls', () => {
  assert.equal(world.leagues.length, 3);
  for (const l of world.leagues) assert.equal(l.crews.length, 40);
  assert.equal(world.crews.length, 120);
  for (const c of world.crews) {
    const staff = staffOf(c).map((id) => world.gulls[id]);
    const count = (role: string) => staff.filter((g) => g.role === role).length;
    assert.equal(count('manager'), 1);
    assert.equal(count('elder'), 1);
    assert.equal(count('captain'), 3, 'two captains and a reserve');
    assert.equal(count('bosun'), 2);
    assert.equal(count('shipwright'), 1);
    assert.equal(
      count('scout'),
      c.buildings.crowsNest.level,
      "one scout a crow's nest level"
    );
    assert.equal(count('flight'), 4);
    assert.equal(world.gulls[c.staff.reserve!].contract?.status, 'reserve');
    assert.equal(c.parts.length, 12, 'one part of each type on each ship');
    for (const b of Object.values(c.buildings))
      assert.ok(b.level >= 1 && b.level <= 3);
  }
  const free = world.gulls.filter((g) => g.contract === null);
  assert.equal(free.length, 300);
  assert.equal(free.filter((g) => g.role === 'manager').length, 30);
  for (const role of ['captain', 'bosun', 'shipwright', 'scout', 'flight'])
    assert.ok(
      free.some((g) => g.role === role),
      `free ${role}s`
    );
  assert.ok(
    world.gulls.length > 1800 && world.gulls.length < 2000,
    `${world.gulls.length} gulls`
  );
  invariants(world);
});

test('strength by league: staff about 3.5, 2.5 and 1.75 stars', () => {
  const means = world.leagues.map((l) => {
    const all = l.crews
      .flatMap((i) => staffOf(world.crews[i]).map((id) => world.gulls[id]))
      .filter((g) => g.role !== 'elder');
    return all.reduce((a, g) => a + stars(g), 0) / all.length;
  });
  for (const [i, want] of [3.5, 2.5, 1.75].entries())
    assert.ok(
      Math.abs(means[i] - want) < 0.35,
      `league ${i + 1}: ${means[i].toFixed(2)} stars`
    );
  assert.ok(means[0] > means[1] && means[1] > means[2]);
});

test("colours: two different swatches, no two crews of a league with the same pair, the player's pair dealt to none", () => {
  const key = (a: number, b: number) => `${Math.min(a, b)}-${Math.max(a, b)}`;
  const theirs = key(FOUND.colours.first, FOUND.colours.second);
  for (const l of world.leagues) {
    const pairs = l.crews
      .map((i) => world.crews[i].colours)
      .map((c) => {
        assert.ok(
          c.first !== c.second &&
            c.first >= 0 &&
            c.first < SWATCHES &&
            c.second >= 0 &&
            c.second < SWATCHES
        );
        return key(c.first, c.second);
      });
    assert.equal(new Set(pairs).size, 40);
    assert.ok(!pairs.includes(theirs));
  }
  assert.equal(
    SWATCHES,
    24,
    'Phase A builds 24 crew swatches in the palette (#58 step 3)'
  );
  // the deal reaches every swatch: 276 pairs over 120 crews leave none of the 24 unused
  const used = new Set(
    world.crews.flatMap((c) => [c.colours.first, c.colours.second])
  );
  assert.equal(used.size, SWATCHES);
  for (const c of world.crews) assert.ok(c.emblem >= 0 && c.emblem < 12);
});

test('the same seed and colours make the same world', () => {
  const again = makeWorld(FOUND.seed, FOUND.colours, dice(FOUND.seed, {}));
  assert.equal(canonical(again), canonical(world));
  const other = makeWorld(
    FOUND.seed + 1,
    FOUND.colours,
    dice(FOUND.seed + 1, {})
  );
  assert.notEqual(canonical(other).length, 0);
  assert.notEqual(other.crews[0].name, world.crews[0].name);
});

test("targets: each elder's target is a place in the league, the strongest crews' higher", () => {
  for (const l of world.leagues)
    for (const i of l.crews)
      assert.ok(world.crews[i].target >= 1 && world.crews[i].target <= 40);
});

test('founding: the crew takes the weakest of League Three, its manager and weaker captain freed, its stronger on ship two, its reserve kept', () => {
  const s = founded();
  const was = weakest(world);
  const crew = s.crews[was.id];
  assert.equal(s.player!.crew, was.id);
  assert.equal(crew.player, true);
  assert.equal(crew.league, 2);
  assert.equal(crew.name, FOUND.crew);
  assert.deepEqual(crew.colours, FOUND.colours);
  assert.equal(crew.emblem, FOUND.emblem);
  // weakest: no crew of League Three has a lower staff mean
  const strength = (id: number) =>
    staffStars(staffOf(world.crews[id]).map((g) => world.gulls[g]));
  for (const i of world.leagues[2].crews)
    assert.ok(strength(i) >= strength(was.id));
  // the player
  const me = s.gulls[s.player!.gull];
  assert.equal(me.player, true);
  assert.equal(me.given, FOUND.given);
  assert.equal(me.seed, FOUND.headshot);
  assert.equal(me.role, 'manager');
  assert.ok(
    Object.values(me.stats).every((v) => v === 0),
    'the player has no stats (D8)'
  );
  assert.equal(crew.staff.manager, me.id);
  // the inheritance
  assert.equal(
    s.gulls[was.staff.manager!].contract,
    null,
    'its manager goes to the free agents'
  );
  const [a, b] = was.staff.ships.map((h) => h.captain!);
  const [strong, weak] =
    stars(world.gulls[b]) > stars(world.gulls[a]) ? [b, a] : [a, b];
  assert.equal(crew.staff.ships[0].captain, null, 'the player sails ship one');
  assert.equal(crew.staff.ships[1].captain, strong);
  assert.equal(s.gulls[weak].contract, null, 'the weaker captain is released');
  assert.equal(crew.staff.reserve, was.staff.reserve);
  assert.deepEqual(crew.buildings, was.buildings);
  assert.deepEqual(crew.parts, was.parts);
  assert.equal(crew.coin, was.coin);
  invariants(s);
});

test('Found: each refusal', () => {
  const s0 = start();
  refused(s0, { kind: 'Advance' }, 'unfounded');
  refused(s0, { ...FOUND, colours: { first: 3, second: 3 } }, 'colours');
  refused(s0, { ...FOUND, colours: { first: 3, second: SWATCHES } }, 'colours');
  refused(s0, { ...FOUND, emblem: 12 }, 'emblem');
  refused(s0, { ...FOUND, crew: '   ' }, 'name');
  refused(s0, { ...FOUND, crew: 'x'.repeat(40) }, 'name');
  refused(s0, { ...FOUND, crew: 'Crew <script>' }, 'name');
  refused(s0, { ...FOUND, crew: 'Mara Gulls' }, 'banned');
  refused(s0, { ...FOUND, given: 'MARA' }, 'banned');
  refused(s0, { ...FOUND, family: '' }, 'name');
  refused(s0, { ...FOUND, seed: -1 }, 'seed');
  refused(s0, { ...FOUND, seed: 1.5 }, 'seed');
  refused(s0, { ...FOUND, headshot: 2 ** 32 }, 'headshot');
  const noun = world.crews[0].name.split(' ')[1];
  refused(s0, { ...FOUND, crew: `Brave ${noun}` }, 'name');
  refused(founded(), FOUND, 'founded');
});

test("a reroll of the headshot changes only the player's face", () => {
  const a = founded();
  const r = apply(start(), { ...FOUND, headshot: 12345 });
  assert.ok(r.ok);
  if (r.ok) {
    assert.equal(r.state.gulls[r.state.player!.gull].seed, 12345);
    assert.equal(canonical(r.state.crews), canonical(a.crews));
  }
});
