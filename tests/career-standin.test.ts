import { test } from 'node:test';
import assert from 'node:assert/strict';
import { apply, newCareer } from '../src/career/apply.ts';
import { fieldsValid } from '../src/career/fields.ts';
import type { Command } from '../src/career/commands.ts';
import { matchSetup, shipValues, type Hands } from '../src/career/fit.ts';
import { resultHash, standInResult, strength } from '../src/career/standin.ts';
import { perLine, type CareerState } from '../src/career/state.ts';
import {
  LEVEL_SPAN,
  STAND_IN_RESULT,
  STAT_SPAN,
} from '../src/career/tuning.ts';
import type { MatchResult, ShipResult } from '../src/sim/result.ts';
import type { DriverStats, MatchSetup, ShipSpec } from '../src/sim/setup.ts';

const statsAt = (n: number): DriverStats => ({
  gunnery: n,
  helm: n,
  nerve: n,
  territory: n,
  stormcraft: n,
  lookout: n,
});

type Ship = { level: number; stats: DriverStats | 'player' };

const plain = (id: number): Ship => ({
  level: 10 + ((id * 37) % 80),
  stats: statsAt(1 + ((id * 11) % 20)),
});

function specOf(team: number, slot: 0 | 1, ship: Ship): ShipSpec {
  return {
    team,
    slot,
    standing: team + 1,
    hands: ship.stats,
    ...shipValues(
      perLine(() => ship.level),
      'cannon',
      null
    ),
  };
}

function setupOf(
  sizes: readonly (1 | 2)[],
  match: number,
  shipOf: (id: number) => Ship = plain
): MatchSetup {
  const ships: ShipSpec[] = [];
  sizes.forEach((size, team) => {
    ships.push(specOf(team, 0, shipOf(ships.length)));
    if (size === 2) ships.push(specOf(team, 1, shipOf(ships.length)));
  });
  return { planet: 'standin', match, storm: 3, heals: 3, ships };
}

const sizesOf = (teams: number, size: 1 | 2): (1 | 2)[] =>
  Array.from({ length: teams }, () => size);

const mixed = (teams: number): (1 | 2)[] =>
  Array.from({ length: teams }, (_, team) => (team % 3 === 0 ? 1 : 2));

const SHAPES: readonly (1 | 2)[][] = [
  sizesOf(2, 1),
  sizesOf(2, 2),
  sizesOf(3, 1),
  sizesOf(4, 2),
  mixed(5),
  sizesOf(8, 1),
  sizesOf(9, 2),
  mixed(17),
  sizesOf(40, 1),
  sizesOf(40, 2),
];

const MATCHES = [1, 77, 4242, 90001];

const CASES: { setup: MatchSetup; result: MatchResult }[] = SHAPES.flatMap(
  (sizes) =>
    MATCHES.map((match) => {
      const setup = setupOf(sizes, match);
      return { setup, result: standInResult(setup) };
    })
);

const CAREER = newCareer({
  seed: 'test',
  name: 'Gull Racing',
  livery: { dye: 0, pattern: 0 },
  emblem: 0,
});

const winnerOf = (result: MatchResult): number =>
  result.ships.findIndex((ship) => ship.place === 1);

const teammateOf = (setup: MatchSetup, id: number): number =>
  setup.ships.findIndex(
    (ship, other) => other !== id && ship.team === setup.ships[id].team
  );

const close = (a: number, b: number): void =>
  assert.ok(Math.abs(a - b) < 1e-9, `${a} is not ${b}`);

test('places are a permutation of 1 to N', () => {
  for (const { setup, result } of CASES) {
    const places = result.ships.map((ship) => ship.place);
    assert.equal(places.length, setup.ships.length);
    assert.deepEqual(
      [...places].sort((a, b) => a - b),
      places.map((_, i) => i + 1)
    );
  }
});

test('the winner is afloat, and its teammate only when placed in the top ceil(N / 8)', () => {
  for (const { setup, result } of CASES) {
    const n = setup.ships.length;
    const winner = winnerOf(result);
    const teammate = teammateOf(setup, winner);
    result.ships.forEach((ship, id) => {
      const afloat =
        id === winner ||
        (id === teammate &&
          ship.place <= Math.ceil(n / STAND_IN_RESULT.teammateAfloatShare));
      assert.equal(ship.sunkAt === null, afloat, `ship ${id}`);
      if (afloat) assert.equal(ship.sunkBy, null);
    });
  }
});

test('the match lasts 480 seconds', () => {
  for (const { result } of CASES) assert.equal(result.seconds, 480);
});

test('a sunk ship sinks at 30 + 420 × (N − place) / (N − 1), rounded', () => {
  for (const { setup, result } of CASES) {
    const n = setup.ships.length;
    for (const ship of result.ships) {
      if (ship.sunkAt === null) continue;
      assert.equal(
        ship.sunkAt,
        Math.round(30 + (420 * (n - ship.place)) / (n - 1))
      );
    }
    const last = result.ships.find((ship) => ship.place === n);
    assert.equal(last?.sunkAt, 30);
    const second = result.ships.find((ship) => ship.place === 2);
    if (second?.sunkAt !== null)
      assert.equal(second?.sunkAt, Math.round(30 + (420 * (n - 2)) / (n - 1)));
  }
});

test('the last place sinks first', () => {
  for (const { result } of CASES) {
    const sunk = result.ships.filter((ship) => ship.sunkAt !== null);
    for (const a of sunk)
      for (const b of sunk)
        if (a.place > b.place) assert.ok((a.sunkAt ?? 0) <= (b.sunkAt ?? 0));
  }
});

test('a sinking is credited only to a better-placed ship of another team', () => {
  for (const { setup, result } of CASES) {
    result.ships.forEach((ship, id) => {
      if (ship.sunkBy === null) return;
      const by = ship.sunkBy;
      assert.notEqual(setup.ships[by].team, setup.ships[id].team);
      assert.ok(result.ships[by].place < ship.place);
    });
  }
});

test('a sunk ship is credited to nobody exactly when no other team placed better', () => {
  for (const { setup, result } of CASES) {
    result.ships.forEach((ship, id) => {
      if (ship.sunkAt === null) return;
      const anyone = result.ships.some(
        (other, j) =>
          setup.ships[j].team !== setup.ships[id].team &&
          other.place < ship.place
      );
      assert.equal(ship.sunkBy !== null, anyone, `ship ${id}`);
    });
  }
});

test('sinkings are the counts that follow from sunkBy', () => {
  for (const { result } of CASES)
    result.ships.forEach((ship, id) =>
      assert.equal(
        ship.sinkings,
        result.ships.filter((other) => other.sunkBy === id).length
      )
    );
});

test('afloat at phase four means a place from 1 to ceil(N / 4)', () => {
  for (const { setup, result } of CASES) {
    const top = Math.ceil(setup.ships.length / 4);
    for (const ship of result.ships)
      assert.equal(ship.afloatAtPhaseFour, ship.place <= top);
  }
});

test('shots: 100 fired, and 100 × (0.1 + 0.4 × Gunnery / 20) landed', () => {
  const landed = (gunnery: number): ShipResult => {
    const setup = setupOf(sizesOf(2, 1), 5, () => ({
      level: 50,
      stats: statsAt(gunnery),
    }));
    return standInResult(setup).ships[0];
  };
  assert.equal(landed(1).shotsLanded, 12);
  assert.equal(landed(20).shotsLanded, 50);
  assert.equal(landed(13).shotsLanded, 36);
  for (const { setup, result } of CASES)
    result.ships.forEach((ship, id) => {
      const { hands } = setup.ships[id];
      const gunnery = hands === 'player' ? 10 : hands.gunnery;
      assert.equal(ship.shotsFired, 100);
      assert.equal(
        ship.shotsLanded,
        Math.round(100 * (0.1 + (0.4 * gunnery) / STAT_SPAN.most))
      );
    });
});

test('a player ship counts 10 in every stat', () => {
  const setup = setupOf(sizesOf(3, 2), 9, (id) => ({
    level: 40,
    stats: id === 0 ? 'player' : statsAt(10),
  }));
  const { ships } = standInResult(setup);
  assert.equal(ships[0].shotsLanded, 30);
  assert.equal(strength(setup.ships[0]), strength(setup.ships[1]));
});

test('damage: 100 dealt per sinking, 100 taken when sunk and 50 afloat', () => {
  for (const { result } of CASES)
    for (const ship of result.ships) {
      assert.equal(ship.damageDealt, 100 * ship.sinkings);
      assert.equal(ship.damageTaken, ship.sunkAt === null ? 50 : 100);
    }
});

test('strength is the mean scaled level value plus the mean stat over 20', () => {
  const ship = (level: number, stat: number): ShipSpec =>
    specOf(0, 0, { level, stats: statsAt(stat) });
  close(strength(ship(LEVEL_SPAN.least, STAT_SPAN.most)), 1);
  close(strength(ship(LEVEL_SPAN.most, STAT_SPAN.most)), 2);
  close(strength(ship(LEVEL_SPAN.most, 10)), 1.5);
  close(strength(ship(25, 4)), 0.25 + 0.2);
  const tended = {
    ...ship(50, 10),
    shieldRate: 9,
    healTime: 0.1,
    healFactor: 3,
  };
  close(strength(tended), strength(ship(50, 10)));
});

function sampleWeights(setup: MatchSetup, result: MatchResult, k: number) {
  const time = (480 * k) / 8;
  const weights = result.sea.map(() => 0);
  setup.ships.forEach((ship, id) => {
    const { sunkAt } = result.ships[id];
    if (sunkAt !== null && sunkAt <= time) return;
    const territory = ship.hands === 'player' ? 10 : ship.hands.territory;
    weights[ship.team] += strength(ship) + territory / 20;
  });
  return weights;
}

test('sea: seven samples per team, shares by weight summing to 0.8', () => {
  for (const { setup, result } of CASES) {
    const teams = new Set(setup.ships.map((ship) => ship.team)).size;
    assert.equal(result.sea.length, teams);
    for (const samples of result.sea) assert.equal(samples.length, 7);
    for (let k = 1; k <= 7; k++) {
      const weights = sampleWeights(setup, result, k);
      const total = weights.reduce((sum, w) => sum + w, 0);
      close(
        result.sea.reduce((sum, samples) => sum + samples[k - 1], 0),
        0.8
      );
      weights.forEach((w, team) =>
        close(result.sea[team][k - 1], (w / total) * 0.8)
      );
    }
  }
});

test('sea: three one-ship teams share by hand-worked weights', () => {
  const at = (n: number): Ship => ({
    level: LEVEL_SPAN.least,
    stats: statsAt(n),
  });
  const crews = [at(20), at(10), at(4)];
  const weightOf = [2, 1, 0.4];
  for (const match of MATCHES) {
    const setup = setupOf(sizesOf(3, 1), match, (id) => crews[id]);
    const { ships, sea } = standInResult(setup);
    const first = ships.findIndex((ship) => ship.place === 1);
    const second = ships.findIndex((ship) => ship.place === 2);
    const third = ships.findIndex((ship) => ship.place === 3);
    assert.equal(ships[third].sunkAt, 30);
    assert.equal(ships[second].sunkAt, 240);
    const shares: Record<string, [number, number]> = {
      '2,1': [0.8 * (2 / 3), 0.8 * (1 / 3)],
      '1,2': [0.8 * (1 / 3), 0.8 * (2 / 3)],
      '2,0.4': [0.8 * (2 / 2.4), 0.8 * (0.4 / 2.4)],
      '0.4,2': [0.8 * (0.4 / 2.4), 0.8 * (2 / 2.4)],
      '1,0.4': [0.8 * (1 / 1.4), 0.8 * (0.4 / 1.4)],
      '0.4,1': [0.8 * (0.4 / 1.4), 0.8 * (1 / 1.4)],
    };
    const [firstShare, secondShare] =
      shares[`${weightOf[first]},${weightOf[second]}`];
    for (let k = 0; k < 3; k++) {
      close(sea[first][k], firstShare);
      close(sea[second][k], secondShare);
      assert.equal(sea[third][k], 0);
    }
    for (let k = 3; k < 7; k++) {
      close(sea[first][k], 0.8);
      assert.equal(sea[second][k], 0);
      assert.equal(sea[third][k], 0);
    }
  }
});

test('sea: a team with no ship afloat at a sample holds nothing', () => {
  let seen = 0;
  for (const { setup, result } of CASES)
    for (let k = 1; k <= 7; k++) {
      const time = (480 * k) / 8;
      result.sea.forEach((samples, team) => {
        const afloat = setup.ships.some(
          (ship, id) =>
            ship.team === team && (result.ships[id].sunkAt ?? Infinity) > time
        );
        if (afloat) assert.ok(samples[k - 1] > 0);
        else {
          seen++;
          assert.equal(samples[k - 1], 0);
        }
      });
    }
  assert.ok(seen > 0);
});

test('the hash is that of the rest of the result', () => {
  for (const { result } of CASES) {
    const { hash, ...rest } = result;
    assert.equal(hash, resultHash(rest));
    assert.match(hash, /^[0-9a-f]{8}$/);
  }
});

test('the hash changes when any field changes', () => {
  const { result } = CASES[CASES.length - 1];
  const { hash, ...rest } = result;
  const shipChanged = (id: number, change: Partial<ShipResult>) =>
    resultHash({
      ...rest,
      ships: rest.ships.map((ship, i) =>
        i === id ? { ...ship, ...change } : ship
      ),
    });
  const sunk = rest.ships.findIndex((ship) => ship.sunkBy !== null);
  const ship = rest.ships[sunk];
  const changed = [
    resultHash({ ...rest, seconds: rest.seconds + 1 }),
    shipChanged(sunk, { place: ship.place + 1 }),
    shipChanged(sunk, { sunkAt: (ship.sunkAt ?? 0) + 1 }),
    shipChanged(sunk, { sunkAt: null }),
    shipChanged(sunk, { sunkBy: (ship.sunkBy ?? 0) + 1 }),
    shipChanged(sunk, { sunkBy: null }),
    shipChanged(sunk, { sinkings: ship.sinkings + 1 }),
    shipChanged(sunk, { shotsFired: ship.shotsFired + 1 }),
    shipChanged(sunk, { shotsLanded: ship.shotsLanded + 1 }),
    shipChanged(sunk, { damageDealt: ship.damageDealt + 1 }),
    shipChanged(sunk, { damageTaken: ship.damageTaken + 1 }),
    shipChanged(sunk, { afloatAtPhaseFour: !ship.afloatAtPhaseFour }),
    resultHash({
      ...rest,
      sea: rest.sea.map((samples, team) =>
        team === 3 ? samples.map((s, k) => (k === 2 ? s + 0.001 : s)) : samples
      ),
    }),
  ];
  for (const other of changed) assert.notEqual(other, hash);
  assert.equal(new Set(changed).size, changed.length);
});

test('the same setup gives the same result', () => {
  for (const sizes of SHAPES) {
    const setup = setupOf(sizes, 31337);
    assert.deepEqual(
      standInResult(setup),
      standInResult(setupOf(sizes, 31337))
    );
  }
  const setup = matchSetup(CAREER, { hands: 'player' });
  assert.deepEqual(standInResult(setup), standInResult(setup));
});

test('the match seed changes the result', () => {
  for (const sizes of [sizesOf(40, 2), sizesOf(9, 2), mixed(17)]) {
    const results = MATCHES.map((match) =>
      standInResult(setupOf(sizes, match))
    );
    const orders = results.map((r) => r.ships.map((s) => s.place).join());
    assert.equal(new Set(orders).size, MATCHES.length);
    assert.equal(new Set(results.map((r) => r.hash)).size, MATCHES.length);
  }
});

test('a duel of two one-ship teams', () => {
  for (const match of MATCHES) {
    const setup = setupOf(sizesOf(2, 1), match);
    const { ships, sea } = standInResult(setup);
    const winner = ships[0].place === 1 ? 0 : 1;
    const loser = 1 - winner;
    assert.equal(ships[loser].place, 2);
    assert.equal(ships[winner].sunkAt, null);
    assert.equal(ships[loser].sunkAt, 30);
    assert.equal(ships[loser].sunkBy, winner);
    assert.equal(ships[winner].sinkings, 1);
    assert.equal(ships[winner].damageDealt, 100);
    assert.equal(ships[winner].afloatAtPhaseFour, true);
    assert.equal(ships[loser].afloatAtPhaseFour, false);
    for (let k = 0; k < 7; k++) {
      close(sea[winner][k], 0.8);
      assert.equal(sea[loser][k], 0);
    }
  }
});

function teammateSecond(sizes: readonly (1 | 2)[]): MatchSetup {
  for (let match = 0; ; match++) {
    const setup = setupOf(sizes, match);
    const result = standInResult(setup);
    const teammate = teammateOf(setup, winnerOf(result));
    if (teammate >= 0 && result.ships[teammate].place === 2) return setup;
  }
}

test("in a match of at most 8 ships the winner's teammate placed second is sunk, by nobody", () => {
  for (const sizes of [sizesOf(2, 2), sizesOf(4, 2), mixed(5)]) {
    const setup = teammateSecond(sizes);
    const n = setup.ships.length;
    assert.ok(n <= 8);
    const result = standInResult(setup);
    const teammate = teammateOf(setup, winnerOf(result));
    const ship = result.ships[teammate];
    assert.equal(ship.sunkAt, Math.round(30 + (420 * (n - 2)) / (n - 1)));
    assert.equal(ship.sunkBy, null);
    assert.equal(result.ships.filter((s) => s.sunkAt === null).length, 1);
  }
});

test("in a larger match the winner's teammate placed second stays afloat", () => {
  const setup = teammateSecond(sizesOf(8, 2));
  const result = standInResult(setup);
  const teammate = teammateOf(setup, winnerOf(result));
  assert.equal(result.ships[teammate].sunkAt, null);
  assert.equal(result.ships[teammate].sunkBy, null);
  assert.equal(result.ships.filter((s) => s.sunkAt === null).length, 2);
});

test('stronger ships place better on average over many seeds', () => {
  const strong = (id: number): boolean => id % 2 === 0;
  const sizes = sizesOf(20, 2);
  let strongPlaces = 0;
  let weakPlaces = 0;
  for (let match = 0; match < 60; match++) {
    const setup = setupOf(sizes, match, (id) =>
      strong(id)
        ? { level: LEVEL_SPAN.most, stats: statsAt(STAT_SPAN.most) }
        : { level: 5, stats: statsAt(STAT_SPAN.least) }
    );
    standInResult(setup).ships.forEach((ship, id) => {
      if (strong(id)) strongPlaces += ship.place;
      else weakPlaces += ship.place;
    });
  }
  assert.ok(strongPlaces < weakPlaces);
});

test("the stand-in's result for a new career passes RecordRace's check", () => {
  const racing: CareerState = { ...CAREER, phase: 'racing' };
  const sailors: Hands[] = ['player', statsAt(10)];
  for (const hands of sailors) {
    const result = standInResult(matchSetup(CAREER, { hands }));
    const command: Command = { type: 'RecordRace', team: 0, result };
    assert.ok(fieldsValid(racing, command));
    assert.equal(apply(racing, command).ok, true);
    assert.equal(result.ships.length, 80);
    assert.equal(result.sea.length, 40);
  }
});
