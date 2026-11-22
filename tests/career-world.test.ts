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

test('the world: three championships of forty teams, a full staff each, 300 free agents with 30 managers, about 1,900 people', () => {
  assert.equal(world.championships.length, 3);
  for (const l of world.championships) assert.equal(l.teams.length, 40);
  assert.equal(world.teams.length, 120);
  for (const c of world.teams) {
    const staff = staffOf(c).map((id) => world.people[id]);
    const count = (role: string) => staff.filter((g) => g.role === role).length;
    assert.equal(count('manager'), 1);
    assert.equal(count('chairman'), 1);
    assert.equal(count('driver'), 3, 'two drivers and a reserve');
    assert.equal(count('mechanic'), 2);
    assert.equal(count('designer'), 1);
    assert.equal(
      count('scout'),
      c.buildings.crowsNest.level,
      "one scout a crow's nest level"
    );
    assert.equal(count('pit'), 4);
    assert.equal(world.people[c.staff.reserve!].contract?.status, 'reserve');
    assert.equal(c.parts.length, 12, 'one part of each type on each ship');
    for (const b of Object.values(c.buildings))
      assert.ok(b.level >= 1 && b.level <= 3);
  }
  const free = world.people.filter((g) => g.contract === null);
  assert.equal(free.length, 300);
  assert.equal(free.filter((g) => g.role === 'manager').length, 30);
  for (const role of ['driver', 'mechanic', 'designer', 'scout', 'pit'])
    assert.ok(
      free.some((g) => g.role === role),
      `free ${role}s`
    );
  assert.ok(
    world.people.length > 1800 && world.people.length < 2000,
    `${world.people.length} people`
  );
  invariants(world);
});

test('strength by tier: staff about 3.5, 2.5 and 1.75 stars', () => {
  const means = world.championships.map((l) => {
    const all = l.teams
      .flatMap((i) => staffOf(world.teams[i]).map((id) => world.people[id]))
      .filter((g) => g.role !== 'chairman');
    return all.reduce((a, g) => a + stars(g), 0) / all.length;
  });
  for (const [i, want] of [3.5, 2.5, 1.75].entries())
    assert.ok(
      Math.abs(means[i] - want) < 0.35,
      `tier ${i + 1}: ${means[i].toFixed(2)} stars`
    );
  assert.ok(means[0] > means[1] && means[1] > means[2]);
});

test("colours: two different swatches, no two teams of a tier with the same pair, the player's pair dealt to none", () => {
  const key = (a: number, b: number) => `${Math.min(a, b)}-${Math.max(a, b)}`;
  const theirs = key(FOUND.colours.first, FOUND.colours.second);
  for (const l of world.championships) {
    const pairs = l.teams
      .map((i) => world.teams[i].colours)
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
    'Phase A builds 24 team swatches in the palette (#58 step 3)'
  );
  // the deal reaches every swatch: 276 pairs over 120 teams leave none of the 24 unused
  const used = new Set(
    world.teams.flatMap((c) => [c.colours.first, c.colours.second])
  );
  assert.equal(used.size, SWATCHES);
  for (const c of world.teams) assert.ok(c.emblem >= 0 && c.emblem < 12);
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
  assert.notEqual(other.teams[0].name, world.teams[0].name);
});

test("targets: each chairman's target is a place in the tier, the strongest teams' higher", () => {
  for (const l of world.championships)
    for (const i of l.teams)
      assert.ok(world.teams[i].target >= 1 && world.teams[i].target <= 40);
});

test('founding: the team takes the weakest of Tier 3, its manager and weaker driver freed, its stronger on ship two, its reserve kept', () => {
  const s = founded();
  const was = weakest(world);
  const team = s.teams[was.id];
  assert.equal(s.player!.team, was.id);
  assert.equal(team.player, true);
  assert.equal(team.tier, 2);
  assert.equal(team.name, FOUND.team);
  assert.deepEqual(team.colours, FOUND.colours);
  assert.equal(team.emblem, FOUND.emblem);
  // weakest: no team of Tier 3 has a lower staff mean
  const strength = (id: number) =>
    staffStars(staffOf(world.teams[id]).map((g) => world.people[g]));
  for (const i of world.championships[2].teams)
    assert.ok(strength(i) >= strength(was.id));
  // the player
  const me = s.people[s.player!.person];
  assert.equal(me.player, true);
  assert.equal(me.given, FOUND.given);
  assert.equal(me.seed, FOUND.headshot);
  assert.equal(me.role, 'manager');
  assert.ok(
    Object.values(me.stats).every((v) => v === 0),
    'the player has no stats (D8)'
  );
  assert.equal(team.staff.manager, me.id);
  // the inheritance
  assert.equal(
    s.people[was.staff.manager!].contract,
    null,
    'its manager goes to the free agents'
  );
  const [a, b] = was.staff.ships.map((h) => h.driver!);
  const [strong, weak] =
    stars(world.people[b]) > stars(world.people[a]) ? [b, a] : [a, b];
  assert.equal(team.staff.ships[0].driver, null, 'the player sails ship one');
  assert.equal(team.staff.ships[1].driver, strong);
  assert.equal(s.people[weak].contract, null, 'the weaker driver is released');
  assert.equal(team.staff.reserve, was.staff.reserve);
  assert.deepEqual(team.buildings, was.buildings);
  assert.deepEqual(team.parts, was.parts);
  assert.equal(team.balance, was.balance);
  invariants(s);
});

test('Found: each refusal', () => {
  const s0 = start();
  refused(s0, { kind: 'Advance' }, 'unfounded');
  refused(s0, { ...FOUND, colours: { first: 3, second: 3 } }, 'colours');
  refused(s0, { ...FOUND, colours: { first: 3, second: SWATCHES } }, 'colours');
  refused(s0, { ...FOUND, emblem: 12 }, 'emblem');
  refused(s0, { ...FOUND, team: '   ' }, 'name');
  refused(s0, { ...FOUND, team: 'x'.repeat(40) }, 'name');
  refused(s0, { ...FOUND, team: 'Team <script>' }, 'name');
  refused(s0, { ...FOUND, team: 'Mara People' }, 'banned');
  refused(s0, { ...FOUND, given: 'MARA' }, 'banned');
  refused(s0, { ...FOUND, family: '' }, 'name');
  refused(s0, { ...FOUND, seed: -1 }, 'seed');
  refused(s0, { ...FOUND, seed: 1.5 }, 'seed');
  refused(s0, { ...FOUND, headshot: 2 ** 32 }, 'headshot');
  const noun = world.teams[0].name.split(' ')[1];
  refused(s0, { ...FOUND, team: `Brave ${noun}` }, 'name');
  refused(founded(), FOUND, 'founded');
});

test("a reroll of the headshot changes only the player's face", () => {
  const a = founded();
  const r = apply(start(), { ...FOUND, headshot: 12345 });
  assert.ok(r.ok);
  if (r.ok) {
    assert.equal(r.state.people[r.state.player!.person].seed, 12345);
    assert.equal(canonical(r.state.teams), canonical(a.teams));
  }
});
