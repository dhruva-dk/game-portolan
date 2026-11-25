import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SEED } from '../src/world/environment.ts';
import { createMatch, type Match } from '../src/sim/engine.ts';
import { STILL, type Hands } from '../src/sim/hands.ts';
import { PLAYER } from '../src/sim/match.ts';
import type { MatchResult } from '../src/sim/result.ts';
import { rulesOf } from '../src/sim/rules.ts';
import type { MatchSetup } from '../src/sim/setup.ts';
import { closedBy } from '../src/sim/storm.ts';
import { watersAt } from '../src/sim/waters.ts';
import { landOf, planetOf } from '../src/world/land.ts';
import { KINDS, RARITIES } from '../src/sim/kinds.ts';
import type { Loot } from '../src/sim/loot.ts';
import { TENS, setupOf, valuesAt } from './setups.ts';

const planet = planetOf(SEED, landOf(SEED)),
  waters = watersAt(planet);

const short = (match = SEED, over: Parameters<typeof setupOf>[1] = {}) =>
  setupOf(match, { teams: 3, ...over });

function sailed(
  setup: MatchSetup,
  hands: (m: Match) => Hands = () => STILL
): MatchResult {
  const m = createMatch(setup, waters);
  while (!m.done) m.step(hands(m));
  return m.result();
}

const FIRST = sailed(short());

function sound(setup: MatchSetup, r: MatchResult) {
  const team = (id: number) => setup.ships[id].team,
    teams = new Set(setup.ships.map((s) => s.team));
  assert.equal(r.ships.length, setup.ships.length);
  assert.deepEqual(
    r.ships.map((s) => s.place).sort((a, b) => a - b),
    setup.ships.map((_, i) => i + 1),
    'every ship placed'
  );
  const ids = setup.ships.map((_, id) => id),
    afloat = ids.filter((id) => r.ships[id].sunkAt === null),
    down = ids.filter((id) => r.ships[id].sunkAt !== null);
  for (const a of afloat)
    for (const d of down)
      assert.ok(r.ships[a].place < r.ships[d].place, 'the afloat first');
  assert.ok(
    new Set(afloat.map(team)).size <= 1 ||
      r.seconds >= closedBy(rulesOf(setup.storm).storm),
    'one team afloat at the end, or none (or the race was called)'
  );
  for (const id of down) {
    const { sunkAt, sunkBy } = r.ships[id];
    assert.ok(sunkBy === null || team(sunkBy) !== team(id), 'none by a mate');
    assert.ok(sunkAt !== null && sunkAt >= 0 && sunkAt <= r.seconds);
  }
  const sum = (k: 'damageDealt' | 'damageTaken') =>
    r.ships.reduce((a, s) => a + s[k], 0);
  assert.ok(Math.abs(sum('damageDealt') - sum('damageTaken')) < 1e-6);
  assert.ok(r.ships.every((s) => s.shotsLanded === 0 || s.shotsFired > 0));
  assert.equal(
    r.ships.reduce((a, s) => a + s.sinkings, 0),
    down.filter((id) => r.ships[id].sunkBy !== null).length,
    'every sinking credited once'
  );
  assert.equal(r.sea.length, teams.size);
  assert.match(r.hash, /^[0-9a-f]{8}$/);
}

test('a race is sailed to its end: one team afloat, every ship placed, the tally sound', () => {
  const setup = short();
  sound(setup, FIRST);
  assert.ok(
    FIRST.ships.filter((s) => s.sunkAt !== null).length >=
      setup.ships.length - 2
  );
  assert.ok(
    FIRST.ships.some((s) => s.shotsLanded > 0),
    'guns were found and fired'
  );
});

test('the same setup on the same planet gives the same result, hash and all; another match seed another', () => {
  assert.deepEqual(sailed(short()), FIRST);
  assert.equal(FIRST.hash, 'a1b1d84a');
  const other = sailed(short(SEED + 1));
  assert.notEqual(other.hash, FIRST.hash);
});

test("a ship's gun is its spec's from the first step to the last, and no gun is ever laid as loot", () => {
  const setup = short(SEED, {
      values: (ship) => valuesAt(50, KINDS[ship % KINDS.length]),
    }),
    m = createMatch(setup, waters),
    specced = setup.ships.map((s) => s.gun);
  const heal = (l: Loot) => RARITIES.includes(l.heal);
  let seen = 0,
    steps = 0;
  const check = () => {
    assert.deepEqual(
      m.view.crews().map((c) => c.gun.kind),
      specced,
      `step ${steps}`
    );
    const f = m.view.loot();
    for (const l of f.pieces)
      if (l.id >= seen) assert.ok(heal(l), `piece ${l.id}`);
    seen = f.next;
  };
  check();
  while (!m.done) {
    m.step(STILL);
    steps++;
    check();
  }
  assert.ok(new Set(specced).size === KINDS.length && steps > 1000);
});

test("a ship's team is its spec's, and the teams are numbered from 0 with no gaps", () => {
  const setup = short(SEED, { perTeam: 1 }),
    m = createMatch(setup, waters);
  assert.deepEqual(
    m.view.teams(),
    setup.ships.map((s) => s.team)
  );
  const mixed: MatchSetup = {
    ...setup,
    ships: setup.ships.map((s, id) => ({ ...s, team: id === 1 ? 2 : s.team })),
  };
  assert.throws(() => createMatch(mixed, waters), /team 1 has 0 ships/);
});

test('a setup the sim cannot sail is refused: too few ships, a team of three, the player off ship 0', () => {
  const two = short(SEED, { teams: 2, perTeam: 1 });
  assert.throws(
    () => createMatch({ ...two, ships: two.ships.slice(0, 1) }, waters),
    /2 to 80 ships, not 1/
  );
  const three = short(SEED, { teams: 2 });
  assert.throws(
    () =>
      createMatch(
        {
          ...three,
          ships: three.ships.map((s, id) => ({ ...s, team: id < 3 ? 0 : 1 })),
        },
        waters
      ),
    /team 0 has 3 ships/
  );
  assert.throws(
    () =>
      createMatch(
        {
          ...two,
          ships: two.ships.map((s, id) => ({
            ...s,
            hands: id === 1 ? 'player' : s.hands,
          })),
        },
        waters
      ),
    /ship 1 has the player's hands/
  );
});

test('a setup outside its contract is refused: the ratings, the slots, the standings, the gun, the hands, the values', () => {
  const two = short(SEED, { teams: 2 }),
    refused = (setup: unknown, why: RegExp) =>
      assert.throws(
        () => createMatch(setup as MatchSetup, waters),
        why,
        String(why)
      ),
    ship = (id: number, over: Record<string, unknown>) => ({
      ...two,
      ships: two.ships.map((s, i) => (i === id ? { ...s, ...over } : s)),
    });
  for (const storm of [0, 6, 2.5, NaN])
    refused({ ...two, storm }, /storm rating/);
  for (const heals of [0, 6, 3.5]) refused({ ...two, heals }, /heal rating/);
  refused({ ...two, match: NaN }, /match seed/);
  refused({ ...two, planet: 3 }, /planet/);
  refused(ship(1, { slot: 0 }), /team 0 has two ships in slot 0/);
  refused(ship(3, { slot: 2 }), /ship 3's slot is 2/);
  for (const standing of [0, 41, 1.5])
    refused(ship(2, { standing }), /ship 2's standing/);
  refused(ship(1, { gun: 'sling' }), /ship 1's gun is sling/);
  refused(ship(2, { hands: 'bot' }), /ship 2's hands/);
  refused(
    ship(2, { hands: { ...TENS, gunnery: undefined } }),
    /ship 2's gunnery/
  );
  refused(ship(3, { topSpeed: NaN }), /ship 3's topSpeed/);
  refused(ship(0, { hullPoints: undefined }), /ship 0's hullPoints/);
  for (const [storm, heals] of [
    [1, 5],
    [5, 1],
  ] as const) {
    const m = createMatch({ ...two, storm, heals }, waters);
    m.step(STILL);
    assert.ok(Number.isFinite(m.view.storm(0).radius));
  }
  const fine = ship(1, { standing: 40 });
  assert.doesNotThrow(() =>
    createMatch({ ...fine, ships: fine.ships.slice(0, 3) }, waters)
  );
});

test("ship 0 with the player's hands is sailed by them, asked every step; with a driver, by its bot, whatever the hands", () => {
  const quick = short(SEED, { player: true });
  assert.equal(quick.ships[PLAYER].hands, 'player');
  let asked = 0;
  const r = sailed(quick, () => {
    asked++;
    return STILL;
  });
  sound(quick, r);
  assert.ok(Math.abs(asked - r.seconds * 30) < 1e-6, 'asked every step');
  assert.equal(
    r.ships[PLAYER].shotsFired,
    0,
    'its hands idle, it fired nothing'
  );
  assert.notEqual(r.hash, FIRST.hash, 'a bot sailed it otherwise');
  assert.deepEqual(sailed(quick), r);
  const busy: Hands = { ...STILL, throttle: 1, fire: true, gust: true };
  assert.deepEqual(
    sailed(short(), () => busy),
    FIRST,
    'no ship has the hands: they are ignored'
  );
});
