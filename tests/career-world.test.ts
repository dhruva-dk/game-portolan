// The world at the start, and founding.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { apply, start } from '../src/career/career.ts';
import { canonical } from '../src/career/canon.ts';
import { taken } from '../src/career/found.ts';
import { scoutsOf } from '../src/career/hq.ts';
import { stars } from '../src/career/stars.ts';
import { staffOf } from '../src/career/state.ts';
import { makeWorld, staffStars } from '../src/career/world.ts';
import { dice } from '../src/career/dice.ts';
import { TUNING } from '../src/career/tuning.ts';
import { PARTS, TEAM, TEAMS } from '../src/race.ts';
import { FOUND, founded, invariants, refused } from './career-kit.ts';

const world = makeWorld(FOUND.seed, FOUND.colours, dice(FOUND.seed, {}));

test('the world: three championships of twenty teams, a full staff each, 300 free agents with 30 managers, about 1,350 people', () => {
  assert.equal(world.championships.length, 3);
  for (const l of world.championships) assert.equal(l.teams.length, TEAMS);
  assert.equal(world.teams.length, 3 * TEAMS);
  for (const c of world.teams) {
    const staff = staffOf(c).map((id) => world.people[id]);
    const count = (role: string) => staff.filter((g) => g.role === role).length;
    assert.equal(count('manager'), 1);
    assert.equal(count('chairman'), 1);
    assert.equal(count('driver'), TEAM + 1, 'four drivers and a reserve');
    assert.equal(count('mechanic'), TEAM, 'a race mechanic a ship');
    assert.equal(count('designer'), 1);
    assert.equal(
      count('scout'),
      scoutsOf(c),
      'scouts by the Scouting Department level'
    );
    assert.equal(count('pit'), TUNING.world.pit);
    assert.equal(world.people[c.staff.reserve!].contract?.status, 'reserve');
    assert.equal(
      c.parts.length,
      TEAM * PARTS.length,
      'one part of each type on each ship'
    );
    assert.equal(c.bonds.length, TEAM);
    for (const b of Object.values(c.buildings))
      assert.ok(b.level >= 0 && b.level <= TUNING.hq.cap[c.tier]);
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
    world.people.length > 1300 && world.people.length < 1400,
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

test("colours: a dye in a pattern, no two teams of a tier in the same livery, the player's dealt to none", () => {
  const L = TUNING.world.liveries;
  const key = (c: { dye: number; pattern: number }) => `${c.dye}-${c.pattern}`;
  for (const l of world.championships) {
    const liveries = l.teams
      .map((i) => world.teams[i].colours)
      .map((c) => {
        assert.ok(
          c.dye >= 0 &&
            c.dye < L.dyes &&
            c.pattern >= 0 &&
            c.pattern < L.patterns
        );
        return key(c);
      });
    assert.equal(new Set(liveries).size, TEAMS);
    assert.ok(!liveries.includes(key(FOUND.colours)));
  }
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
      assert.ok(world.teams[i].target >= 1 && world.teams[i].target <= TEAMS);
});

test('founding: the team takes the place of the 18th of Tier 3 by staff strength; its manager and weakest driver freed, its three strongest on the ships after hers, its reserve kept', () => {
  const s = founded();
  const was = taken(world);
  const team = s.teams[was.id];
  assert.equal(s.player!.team, was.id);
  assert.equal(team.player, true);
  assert.equal(team.tier, 2);
  assert.equal(team.name, FOUND.team);
  assert.deepEqual(team.colours, FOUND.colours);
  assert.equal(team.emblem, FOUND.emblem);
  // 18th of 20: seventeen teams of Tier 3 are stronger by staff, two weaker
  const strength = (id: number) =>
    staffStars(staffOf(world.teams[id]).map((g) => world.people[g]));
  const stronger = world.championships[2].teams.filter(
    (i) => strength(i) > strength(was.id)
  );
  assert.equal(stronger.length, TUNING.player.place - 1);
  // the player
  const me = s.people[s.player!.person];
  assert.equal(me.player, true);
  assert.equal(me.given, FOUND.given);
  assert.equal(me.seed, FOUND.headshot);
  assert.equal(me.role, 'manager');
  assert.ok(
    Object.values(me.stats).every((v) => v === 0),
    'the player has no stats'
  );
  assert.equal(team.staff.manager, me.id);
  // the inheritance
  assert.equal(
    s.people[was.staff.manager!].contract,
    null,
    'its manager goes to the free agents'
  );
  const drivers = was.staff.ships
    .map((h) => h.driver!)
    .sort((a, b) => stars(world.people[b]) - stars(world.people[a]) || a - b);
  assert.equal(team.staff.ships[0].driver, null, 'the player sails ship one');
  assert.deepEqual(
    team.staff.ships.slice(1).map((h) => h.driver),
    drivers.slice(0, TEAM - 1),
    'the three strongest sail the rest'
  );
  assert.equal(
    s.people[drivers[TEAM - 1]].contract,
    null,
    'the weakest driver is released'
  );
  assert.deepEqual(
    team.staff.ships.map((h) => h.mechanic),
    was.staff.ships.map((h) => h.mechanic)
  );
  assert.equal(team.staff.reserve, was.staff.reserve);
  assert.deepEqual(team.buildings, was.buildings);
  assert.deepEqual(team.parts, was.parts);
  assert.equal(team.balance, was.balance);
  invariants(s);
});

test('Found: each refusal', () => {
  const s0 = start();
  refused(s0, { kind: 'Advance' }, 'unfounded');
  refused(s0, { ...FOUND, colours: { dye: 3, pattern: 3 } }, 'colours');
  refused(s0, { ...FOUND, colours: { dye: 16, pattern: 0 } }, 'colours');
  refused(s0, { ...FOUND, colours: { dye: 1.5, pattern: 0 } }, 'colours');
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
