import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EVEN, evenSetup, type EvenOptions } from '../src/sim/even.ts';
import type { DriverStats, ShipValues } from '../src/sim/setup.ts';

const values = (topSpeed: number): ShipValues => ({
  topSpeed,
  gather: 1,
  turnRate: 0.5,
  hullPoints: 100,
  spreadFactor: 1,
  reloadFactor: 1,
  gun: 'cannon',
  damageFactor: 1,
  assistCone: 0.08,
  gustCapacity: 5,
  shieldRate: 2,
  healTime: 2,
  healFactor: 1,
});

const stats = (gunnery: number): DriverStats => ({
  gunnery,
  helm: 10,
  nerve: 10,
  territory: 10,
  stormcraft: 10,
  lookout: 10,
});

const base: EvenOptions = {
  planet: 'even',
  match: 7,
  storm: 3,
  heals: 2,
  values: values(30),
  stats: stats(10),
};

test('the defaults give 40 teams of two ships, team t slot s at index 2t + s', () => {
  const setup = evenSetup(base);
  assert.equal(setup.ships.length, EVEN.teams.most * 2);
  setup.ships.forEach((ship, i) => {
    assert.equal(i, 2 * ship.team + ship.slot);
  });
  assert.deepEqual(
    [...new Set(setup.ships.map((s) => s.team))],
    Array.from({ length: EVEN.teams.most }, (_, t) => t)
  );
});

test('the race fields pass through', () => {
  const setup = evenSetup(base);
  assert.equal(setup.planet, base.planet);
  assert.equal(setup.match, base.match);
  assert.equal(setup.storm, base.storm);
  assert.equal(setup.heals, base.heals);
});

test('every count of teams and ships per team numbers teams without gaps', () => {
  for (const perTeam of [1, 2] as const) {
    for (const teams of [EVEN.teams.least, 7, EVEN.teams.most]) {
      const { ships } = evenSetup({ ...base, teams, perTeam });
      assert.equal(ships.length, teams * perTeam);
      ships.forEach((ship, i) => {
        assert.equal(ship.team, Math.floor(i / perTeam));
        assert.equal(ship.slot, i % perTeam);
      });
      assert.equal(ships.at(-1)?.team, teams - 1);
    }
  }
});

test('a duel is two teams of one ship', () => {
  const { ships } = evenSetup({ ...base, teams: 2, perTeam: 1 });
  assert.deepEqual(
    ships.map((s) => [s.team, s.slot]),
    [
      [0, 0],
      [1, 0],
    ]
  );
});

test('standings default to team order and can be given', () => {
  const plain = evenSetup({ ...base, teams: 4 });
  assert.deepEqual(
    plain.ships.map((s) => s.standing),
    [1, 1, 2, 2, 3, 3, 4, 4]
  );
  const given = evenSetup({ ...base, teams: 3, standings: [40, 1, 12] });
  assert.deepEqual(
    given.ships.map((s) => s.standing),
    [40, 40, 1, 1, 12, 12]
  );
});

test('one set of values and stats goes to every ship', () => {
  const { ships } = evenSetup({ ...base, teams: 3 });
  for (const ship of ships) {
    assert.equal(ship.topSpeed, 30);
    assert.deepEqual(ship.hands, stats(10));
    const { team: _t, slot: _s, standing: _d, hands: _h, ...rest } = ship;
    assert.deepEqual(rest, values(30));
  }
});

test('values and stats can be functions of the ship index', () => {
  const { ships } = evenSetup({
    ...base,
    teams: 5,
    values: (i) => values(20 + i),
    stats: (i) => stats(1 + i),
  });
  ships.forEach((ship, i) => {
    assert.equal(ship.topSpeed, 20 + i);
    assert.deepEqual(ship.hands, stats(1 + i));
  });
});

test('with player, ship 0 alone has the player at its helm', () => {
  const { ships } = evenSetup({ ...base, teams: 3, player: true });
  assert.equal(ships[0].hands, 'player');
  assert.ok(ships.slice(1).every((s) => s.hands !== 'player'));
  const none = evenSetup({ ...base, teams: 3 });
  assert.ok(none.ships.every((s) => s.hands !== 'player'));
});

test('out-of-range arguments throw a RangeError', () => {
  for (const teams of [
    EVEN.teams.least - 1,
    EVEN.teams.most + 1,
    2.5,
    Number.NaN,
  ]) {
    assert.throws(() => evenSetup({ ...base, teams }), RangeError);
  }
  for (const perTeam of [0, 3, 1.5]) {
    assert.throws(
      () => evenSetup({ ...base, perTeam: perTeam as never }),
      RangeError
    );
  }
  assert.throws(
    () => evenSetup({ ...base, teams: 3, standings: [1, 2] }),
    RangeError
  );
  for (const bad of [EVEN.standing.best - 1, EVEN.standing.worst + 1, 1.5]) {
    assert.throws(
      () => evenSetup({ ...base, teams: 2, standings: [1, bad] }),
      RangeError
    );
  }
});
