import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newCareer } from '../src/career/apply.ts';
import {
  driverStats,
  healRating,
  matchSeed,
  matchSetup,
  mechanicStats,
  nextRace,
  planetName,
  planetSeed,
  shipValues,
  stormRating,
  teamSpecs,
} from '../src/career/fit.ts';
import { PLANET_NAMES } from '../src/career/names.ts';
import { standings } from '../src/career/rules/standing.ts';
import type { CareerState, Person, Phase, Role } from '../src/career/state.ts';
import {
  LEAGUE,
  MECHANIC_VALUES,
  RACE_RATINGS,
  STAND_IN,
  STANDING,
} from '../src/career/tuning.ts';
import type { DriverStats, ShipSpec } from '../src/sim/setup.ts';

const SEEDS = ['test', 'alpha', 'brackwater'];
const SHIPS = LEAGUE.teams * LEAGUE.shipsPerTeam;
const BOT: DriverStats = {
  gunnery: 10,
  helm: 10,
  nerve: 10,
  territory: 10,
  stormcraft: 10,
  lookout: 10,
};

const careerOf = (seed: string): CareerState =>
  newCareer({
    seed,
    name: 'Gull Racing',
    livery: { dye: 0, pattern: 0 },
    emblem: 0,
  });

const CAREERS = SEEDS.map(careerOf);
const STATE = CAREERS[0];

function seat(
  state: CareerState,
  team: number,
  role: Role,
  id: number | null
): CareerState {
  return {
    ...state,
    teams: state.teams.map((t, index) =>
      index === team ? { ...t, seats: { ...t.seats, [role]: id } } : t
    ),
  };
}

function freeAgent(state: CareerState, role: Role): Person {
  const person = state.people.find(
    (p) => p.role === role && p.contract === null
  );
  assert.ok(person);
  return person;
}

function staff(state: CareerState, team: number, role: Role): Person {
  const id = state.teams[team].seats[role];
  const person = state.people.find((p) => p.id === id);
  assert.ok(person);
  return person;
}

const at = (
  state: CareerState,
  season: number,
  race: number,
  phase: Phase
): CareerState => ({ ...state, season, race, phase });

const shipOf = (specs: readonly ShipSpec[], team: number, slot: number) =>
  specs[LEAGUE.shipsPerTeam * team + slot];

test('a career race has 80 ships, team and slot at 2 × t + s', () => {
  for (const state of CAREERS) {
    const { ships } = matchSetup(state, { hands: 'player' });
    assert.equal(ships.length, SHIPS);
    ships.forEach((ship, id) => {
      assert.equal(ship.team, Math.floor(id / LEAGUE.shipsPerTeam));
      assert.equal(ship.slot, id % LEAGUE.shipsPerTeam);
    });
  }
});

test('your ship 0 is the one player ship when asked, and none otherwise', () => {
  for (const state of CAREERS) {
    const sailed = matchSetup(state, { hands: 'player' }).ships;
    const players = sailed.filter((ship) => ship.hands === 'player');
    assert.equal(players.length, 1);
    assert.equal(sailed[0].hands, 'player');
    const bot = matchSetup(state, { hands: BOT }).ships;
    assert.ok(bot.every((ship) => ship.hands !== 'player'));
    assert.deepEqual(bot[0].hands, BOT);
  }
});

test("a rival's slot 0 is sailed by its owner's stats", () => {
  for (const state of CAREERS) {
    const { ships } = matchSetup(state, { hands: 'player' });
    for (let team = 1; team < LEAGUE.teams; team++) {
      const { owner } = state.teams[team];
      assert.ok(owner);
      assert.deepEqual(shipOf(ships, team, 0).hands, driverStats(owner.stats));
    }
  }
});

test('your slot 1 has the stand-in while the seat is empty, then the driver', () => {
  for (const state of CAREERS) {
    assert.equal(state.teams[0].seats.driver, null);
    assert.deepEqual(
      matchSetup(state, { hands: 'player' }).ships[1].hands,
      STAND_IN
    );
    const driver = freeAgent(state, 'driver');
    const hired = seat(state, 0, 'driver', driver.id);
    const hands = matchSetup(hired, { hands: 'player' }).ships[1].hands;
    assert.deepEqual(hands, driverStats(driver.stats));
    assert.notDeepEqual(hands, STAND_IN);
    assert.deepEqual(
      matchSetup(seat(hired, 0, 'driver', null), { hands: 'player' }).ships[1]
        .hands,
      STAND_IN
    );
  }
});

test("a rival's slot 1 has its driver's current stats, or the stand-in", () => {
  for (const state of CAREERS) {
    for (let team = 1; team < LEAGUE.teams; team++) {
      const driver = staff(state, team, 'driver');
      const [, ship] = teamSpecs(state, team, { hands: 'player' });
      assert.deepEqual(ship.hands, driverStats(driver.stats));
    }
    const empty = seat(state, 5, 'driver', null);
    assert.deepEqual(
      teamSpecs(empty, 5, { hands: 'player' })[1].hands,
      STAND_IN
    );
  }
});

test('driver stats are read in the order of the driver stat list', () => {
  assert.deepEqual(driverStats([1, 2, 3, 4, 5, 6]), {
    gunnery: 1,
    helm: 2,
    nerve: 3,
    territory: 4,
    stormcraft: 5,
    lookout: 6,
  });
  assert.deepEqual(mechanicStats([7, 8, 9, 10, 11]), {
    shield: 7,
    healSpeed: 8,
    healAmount: 9,
  });
});

const TENDED: readonly (keyof typeof MECHANIC_VALUES)[] = [
  'shieldRate',
  'healTime',
  'healFactor',
];

function tendedBy(ship: ShipSpec, mechanic: Person | null): void {
  for (const key of TENDED) {
    const { none, base, perPoint } = MECHANIC_VALUES[key];
    const expected =
      mechanic === null
        ? none
        : base +
          perPoint * mechanicStats(mechanic.stats)[MECHANIC_VALUES[key].stat];
    assert.ok(Math.abs(ship[key] - expected) < 1e-9, `${key}`);
  }
}

test('the mechanic sets both ships, and an empty seat gives the no-mechanic column', () => {
  for (const state of CAREERS) {
    const [a, b] = teamSpecs(state, 0, { hands: 'player' });
    tendedBy(a, null);
    tendedBy(b, null);
    const mechanic = freeAgent(state, 'mechanic');
    const hired = seat(state, 0, 'mechanic', mechanic.id);
    for (const ship of teamSpecs(hired, 0, { hands: 'player' }))
      tendedBy(ship, mechanic);
    const rival = staff(state, 3, 'mechanic');
    for (const ship of teamSpecs(state, 3, { hands: 'player' }))
      tendedBy(ship, rival);
    for (const ship of teamSpecs(seat(state, 3, 'mechanic', null), 3, {
      hands: 'player',
    }))
      tendedBy(ship, null);
  }
});

test('every standing from 1 to 40 is carried by exactly the two ships of its team', () => {
  for (const state of CAREERS) {
    const { ships } = matchSetup(state, { hands: 'player' });
    const table = standings(state);
    for (let standing = 1; standing <= LEAGUE.teams; standing++)
      assert.equal(
        ships.filter((ship) => ship.standing === standing).length,
        LEAGUE.shipsPerTeam
      );
    ships.forEach((ship) => assert.equal(ship.standing, table[ship.team]));
    assert.equal(ships[0].standing, LEAGUE.teams);
  }
});

test('standings follow the table as points change', () => {
  const points = STATE.points.map((_, team) => (team === 0 ? 50 : 0));
  const bestPlace = STATE.points.map((_, team) =>
    team === 0 ? 1 : STANDING.noRaceYet
  );
  const leading = { ...STATE, points, bestPlace };
  const { ships } = matchSetup(leading, { hands: 'player' });
  assert.equal(ships[0].standing, 1);
  assert.equal(ships[1].standing, 1);
  assert.equal(shipOf(ships, 1, 0).standing, 2);
});

test("each ship's values are those of its team's fitted levels and gun", () => {
  for (const state of CAREERS) {
    const { ships } = matchSetup(state, { hands: 'player' });
    ships.forEach((ship) => {
      const team = state.teams[ship.team];
      const fitted = team.ships[ship.slot];
      const id = team.seats.mechanic;
      const mechanic = state.people.find((p) => p.id === id) ?? null;
      const values = shipValues(
        fitted.fitted,
        fitted.gun,
        mechanic === null ? null : mechanicStats(mechanic.stats)
      );
      const { team: t, slot, standing, hands } = ship;
      assert.deepEqual(ship, { team: t, slot, standing, hands, ...values });
    });
  }
});

test('the race is the current one, or race 1 of next season in the off-season', () => {
  assert.deepEqual(nextRace(at(STATE, 3, 7, 'lobby')), { season: 3, race: 7 });
  assert.deepEqual(nextRace(at(STATE, 3, 7, 'racing')), { season: 3, race: 7 });
  assert.deepEqual(nextRace(at(STATE, 3, 10, 'offseason')), {
    season: 4,
    race: 1,
  });
});

test('the planet seed joins the career seed, season and race', () => {
  assert.equal(planetSeed(at(STATE, 2, 6, 'lobby')), 'test/2/6');
  assert.equal(planetSeed(at(STATE, 2, 10, 'offseason')), 'test/3/1');
  assert.equal(matchSetup(STATE, { hands: 'player' }).planet, 'test/1/1');
});

const RACE_FACTS: readonly ((state: CareerState) => unknown)[] = [
  planetSeed,
  planetName,
  matchSeed,
  stormRating,
  healRating,
];

test('the race facts are the same for the same state', () => {
  for (const seed of SEEDS)
    for (const fact of RACE_FACTS)
      assert.equal(fact(careerOf(seed)), fact(careerOf(seed)));
  assert.deepEqual(
    matchSetup(careerOf('test'), { hands: 'player' }),
    matchSetup(careerOf('test'), { hands: 'player' })
  );
});

test('the race facts differ between races and stay in range', () => {
  for (const state of CAREERS) {
    const races: CareerState[] = [];
    for (let season = 1; season <= 2; season++)
      for (let race = 1; race <= LEAGUE.racesPerSeason; race++)
        races.push(at(state, season, race, 'lobby'));
    const distinct = (f: (s: CareerState) => unknown): number =>
      new Set(races.map(f)).size;
    assert.equal(distinct(planetSeed), races.length);
    assert.equal(distinct(matchSeed), races.length);
    assert.ok(distinct(planetName) > 1);
    assert.ok(distinct(stormRating) > 1);
    assert.ok(distinct(healRating) > 1);
    for (const race of races) {
      assert.ok(PLANET_NAMES.includes(planetName(race)));
      const match = matchSeed(race);
      assert.ok(Number.isInteger(match) && match >= 0 && match < 2 ** 32);
      for (const rating of [stormRating(race), healRating(race)])
        assert.ok(RACE_RATINGS.some((r) => r === rating));
    }
  }
});

test('the race facts differ between careers', () => {
  assert.equal(new Set(CAREERS.map(matchSeed)).size, CAREERS.length);
  assert.equal(new Set(CAREERS.map(planetSeed)).size, CAREERS.length);
});

test('in the off-season the facts are those of race 1 of the next season', () => {
  for (const state of CAREERS) {
    for (const season of [1, 4]) {
      const stop = at(state, season, LEAGUE.racesPerSeason, 'offseason');
      const next = at(state, season + 1, 1, 'lobby');
      for (const fact of RACE_FACTS) assert.equal(fact(stop), fact(next));
    }
  }
});

test('in the off-season each team carries the standing it starts next season with', () => {
  const points = STATE.points.map((_, team) => (team * 7) % 23);
  const bestPlace = STATE.points.map((_, team) => 1 + ((team * 5) % 80));
  const stop: CareerState = {
    ...at(STATE, 1, LEAGUE.racesPerSeason, 'offseason'),
    points,
    bestPlace,
  };
  const final = standings(stop);
  const next: CareerState = {
    ...at(STATE, 2, 1, 'lobby'),
    points: points.map(() => 0),
    bestPlace: points.map(() => STANDING.noRaceYet),
    previousStanding: final,
  };
  const standingsOf = (state: CareerState): number[] =>
    matchSetup(state, { hands: 'player' }).ships.map((ship) => ship.standing);
  assert.deepEqual(standingsOf(stop), standingsOf(next));
  assert.notDeepEqual(standingsOf(stop), standingsOf(STATE));
  assert.deepEqual(
    matchSetup(stop, { hands: BOT }),
    matchSetup(next, { hands: BOT })
  );
});
