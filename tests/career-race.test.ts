import { test } from 'node:test';
import assert from 'node:assert/strict';
import { apply, newCareer, type Applied } from '../src/career/apply.ts';
import type { Command } from '../src/career/commands.ts';
import { matchSetup, planetName } from '../src/career/fit.ts';
import { employees } from '../src/career/lookup.ts';
import {
  enterPhase,
  nextRaceLobby,
  seasonOver,
} from '../src/career/record/advance.ts';
import { countDownContracts } from '../src/career/record/contracts.ts';
import {
  bestPlaceOf,
  placedTeam,
  shipOf,
  teamOfShip,
  teamShips,
} from '../src/career/record/finish.ts';
import { publishNews } from '../src/career/record/news.ts';
import {
  moneyTotal,
  payRace,
  raceMoney,
  teamMoney,
  wageBill,
} from '../src/career/record/pay.ts';
import { raceReport, workshop } from '../src/career/record/report.ts';
import { racePoints, scoreRace } from '../src/career/record/score.ts';
import {
  interestOn,
  meanShare,
  placePrize,
  seaMoney,
  sinkingMoney,
} from '../src/career/rules/race-money.ts';
import { standInResult } from '../src/career/standin.ts';
import {
  ROLES,
  type CareerState,
  type MoneyRows,
  type NewsEvent,
  type Person,
  type Phase,
  type Role,
} from '../src/career/state.ts';
import { LEAGUE, POINTS, RACE_MONEY } from '../src/career/tuning.ts';
import type { MatchResult, ShipResult } from '../src/sim/result.ts';

const TEAMS = LEAGUE.teams;
const PER_TEAM = LEAGUE.shipsPerTeam;
const SHIPS = TEAMS * PER_TEAM;
const SEASON = LEAGUE.racesPerSeason;
const YOURS = 0;
const RIVAL = 7;
const WAGES: Record<Role, number> = {
  driver: 300,
  designer: 200,
  mechanic: 100,
};

const BASE = newCareer({
  seed: 'race',
  name: 'Gull Racing',
  livery: { dye: 0, pattern: 0 },
  emblem: 0,
});

function freeAgent(role: Role): Person {
  const found = BASE.people.find((p) => p.contract === null && p.role === role);
  if (!found) throw new Error('no free agent of that role');
  return found;
}

const HIRED: Record<Role, Person> = {
  driver: freeAgent('driver'),
  designer: freeAgent('designer'),
  mechanic: freeAgent('mechanic'),
};

function staffed(race: number, phase: Phase, balance?: number): CareerState {
  const state = structuredClone(BASE);
  const ids = new Map(ROLES.map((role) => [HIRED[role].id, role]));
  return {
    ...state,
    race,
    phase,
    teams: state.teams.map((team, t) =>
      t === YOURS
        ? {
            ...team,
            balance: balance ?? team.balance,
            seats: {
              driver: HIRED.driver.id,
              designer: HIRED.designer.id,
              mechanic: HIRED.mechanic.id,
            },
          }
        : team
    ),
    people: state.people.map((p) => {
      const role = ids.get(p.id);
      return role === undefined
        ? p
        : {
            ...p,
            contract: {
              team: YOURS,
              wage: WAGES[role],
              clause: 0,
              racesLeft: SEASON + 1 - race,
            },
          };
    }),
  };
}

function handResult(shift: number): MatchResult {
  const placeOf = (ship: number): number => ((ship + shift) % SHIPS) + 1;
  const shipAt = Array.from({ length: SHIPS + 1 }, () => 0);
  for (let ship = 0; ship < SHIPS; ship++) shipAt[placeOf(ship)] = ship;
  const sunkBy = Array.from({ length: SHIPS }, (_, ship): number | null => {
    const place = placeOf(ship);
    if (place === 1) return null;
    const killer = shipAt[1 + (place % 3)];
    const better = placeOf(killer) < place;
    return better && teamOfShip(killer) !== teamOfShip(ship) ? killer : null;
  });
  const ships = sunkBy.map(
    (by, ship): ShipResult => ({
      place: placeOf(ship),
      sunkAt: placeOf(ship) === 1 ? null : 480 - placeOf(ship),
      sunkBy: by,
      sinkings: sunkBy.filter((b) => b === ship).length,
      shotsFired: 20 + ship,
      shotsLanded: ship % 11,
      damageDealt: 0,
      damageTaken: 0,
      afloatAtPhaseFour: placeOf(ship) <= 20,
    })
  );
  const sea = Array.from({ length: TEAMS }, (_, t) =>
    Array.from(
      { length: RACE_MONEY.seaSamples },
      (_, k) => ((t * 7 + k * 3 + shift) % 13) / 400
    )
  );
  return { seconds: 480, hash: `hand${shift}`, ships, sea };
}

function accepted(applied: Applied): CareerState {
  if (!applied.ok) throw new Error(`refused for ${applied.reason}`);
  return applied.state;
}

const record = (state: CareerState, result: MatchResult): CareerState =>
  accepted(apply(state, { type: 'RecordRace', team: YOURS, result }));

function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const key of Object.keys(value)) deepFreeze(Reflect.get(value, key));
  }
  return value;
}

function expectedPlacePoints(place: number): number {
  if (place <= POINTS.podium.length) return POINTS.podium[place - 1];
  return place <= POINTS.lastScoring ? POINTS.scoringFrom - place : 0;
}

const expectedShipPoints = (ship: ShipResult): number =>
  expectedPlacePoints(ship.place) + POINTS.perSinking * ship.sinkings;

const shipsOf = (result: MatchResult, team: number): ShipResult[] =>
  [0, 1].map((slot) => result.ships[team * PER_TEAM + slot]);

const expectedTeamPoints = (result: MatchResult, team: number): number =>
  shipsOf(result, team).reduce((sum, s) => sum + expectedShipPoints(s), 0);

function expectedStandings(state: CareerState): number[] {
  const order = state.points
    .map((_, t) => t)
    .sort(
      (a, b) =>
        state.points[b] - state.points[a] ||
        state.bestPlace[a] - state.bestPlace[b] ||
        state.previousStanding[a] - state.previousStanding[b]
    );
  const result = state.points.map(() => 0);
  order.forEach((team, i) => {
    result[team] = i + 1;
  });
  return result;
}

const prizeFor = (place: number): number =>
  Math.round(
    RACE_MONEY.placePrize *
      ((RACE_MONEY.prizeFrom - place) / RACE_MONEY.prizeSpan) **
        RACE_MONEY.prizePower
  );

function expectedMoney(state: CareerState, result: MatchResult, team: number) {
  const ships = shipsOf(result, team);
  const samples = result.sea[team];
  const place = ships.reduce((sum, s) => sum + prizeFor(s.place), 0);
  const sinkings = ships.reduce(
    (sum, s) => sum + RACE_MONEY.perSinking * s.sinkings,
    0
  );
  const sea = Math.round(
    (RACE_MONEY.seaPrize * samples.reduce((a, b) => a + b, 0)) / samples.length
  );
  const wages = state.people
    .filter((p) => p.contract?.team === team)
    .reduce((sum, p) => sum + (p.contract?.wage ?? 0), 0);
  const then = state.teams[team].balance + place + sinkings + sea - wages;
  const interest = then < 0 ? Math.ceil(RACE_MONEY.interest * -then) : 0;
  return { place, sinkings, sea, wages, interest, then };
}

test('place prize, sinkings, sea and interest follow §1.8.1', () => {
  assert.equal(placePrize(1), RACE_MONEY.placePrize);
  assert.equal(placePrize(SHIPS), prizeFor(SHIPS));
  assert.equal(placePrize(41), Math.round(RACE_MONEY.placePrize / 4));
  for (let place = 1; place < SHIPS; place++)
    assert.ok(placePrize(place) >= placePrize(place + 1));
  assert.equal(sinkingMoney(0), 0);
  assert.equal(sinkingMoney(3), 3 * RACE_MONEY.perSinking);
  const none = Array.from({ length: RACE_MONEY.seaSamples }, () => 0);
  const all = none.map(() => 1);
  const half = none.map((_, k) => (k % 2 === 0 ? 0.25 : 0.75));
  assert.equal(seaMoney(none), 0);
  assert.equal(seaMoney(all), RACE_MONEY.seaPrize);
  assert.equal(meanShare(half), (4 * 0.25 + 3 * 0.75) / 7);
  assert.equal(
    seaMoney(half),
    Math.round(RACE_MONEY.seaPrize * meanShare(half))
  );
  assert.equal(interestOn(1000), 0);
  assert.equal(interestOn(0), 0);
  assert.equal(interestOn(-1), 1);
  assert.equal(interestOn(-1000), RACE_MONEY.interest * 1000);
  assert.equal(interestOn(-1001), Math.ceil(RACE_MONEY.interest * 1000) + 1);
});

test('a team’s ships are 2t and 2t + 1 in a result', () => {
  const result = handResult(5);
  for (let team = 0; team < TEAMS; team++) {
    assert.deepEqual(teamShips(result, team), shipsOf(result, team));
    for (let slot = 0; slot < PER_TEAM; slot++)
      assert.equal(teamOfShip(shipOf(team, slot)), team);
    assert.equal(
      bestPlaceOf(result, team),
      Math.min(...shipsOf(result, team).map((s) => s.place))
    );
  }
  for (let place = 1; place <= 3; place++) {
    const ship = result.ships.findIndex((s) => s.place === place);
    assert.equal(placedTeam(result, place), Math.floor(ship / PER_TEAM));
  }
});

test('step 1 sets lastStanding and adds every ship’s points and best place', () => {
  const before = enterPhase(
    record(staffed(1, 'racing'), handResult(3)),
    'racing'
  );
  const result = handResult(11);
  const scored = scoreRace(before, result);
  assert.deepEqual(scored.lastStanding, expectedStandings(before));
  for (let team = 0; team < TEAMS; team++) {
    const gained = expectedTeamPoints(result, team);
    assert.equal(racePoints(result, team), gained);
    assert.equal(scored.points[team], before.points[team] + gained);
    const best = Math.min(...shipsOf(result, team).map((s) => s.place));
    assert.equal(
      scored.bestPlace[team],
      Math.min(before.bestPlace[team], best)
    );
  }
  assert.deepEqual(scored.teams, before.teams);
  assert.deepEqual(scored.people, before.people);
});

test('step 2 pays every team its rows, and the change is their sum', () => {
  const state = staffed(4, 'racing', -20000);
  const result = handResult(17);
  const money = raceMoney(state, result);
  const paid = payRace(state, money);
  for (let team = 0; team < TEAMS; team++) {
    const rows = money[team];
    const want = expectedMoney(state, result, team);
    assert.equal(rows.place, want.place, `place ${team}`);
    assert.equal(rows.sinkings, want.sinkings, `sinkings ${team}`);
    assert.equal(rows.sea, want.sea, `sea ${team}`);
    assert.deepEqual(rows.sponsors, []);
    assert.equal(rows.wages, want.wages === 0 ? 0 : -want.wages);
    assert.equal(rows.interest, want.interest === 0 ? 0 : -want.interest);
    assert.deepEqual(rows, teamMoney(state, result, team));
    const sum =
      rows.place + rows.sinkings + rows.sea + rows.wages + rows.interest;
    assert.equal(moneyTotal(rows), sum);
    assert.equal(
      paid.teams[team].balance - state.teams[team].balance,
      sum,
      `team ${team}`
    );
  }
  assert.ok(money[YOURS].interest < 0, 'your debt is charged interest');
  assert.equal(
    wageBill(state, YOURS),
    WAGES.driver + WAGES.designer + WAGES.mechanic
  );
  assert.deepEqual(
    money[YOURS].paid,
    ROLES.map((role) => HIRED[role].portrait)
  );
  assert.deepEqual(
    money[RIVAL].paid,
    employees(state, RIVAL).map((p) => p.portrait)
  );
});

test('interest is charged only when the balance after the other rows is negative', () => {
  const result = handResult(0);
  const income = expectedMoney(staffed(1, 'racing', 0), result, YOURS);
  const net = income.place + income.sinkings + income.sea - income.wages;
  const just = staffed(1, 'racing', -net);
  assert.equal(teamMoney(just, result, YOURS).interest, 0);
  const under = staffed(1, 'racing', -net - 1);
  assert.equal(
    teamMoney(under, result, YOURS).interest,
    -Math.ceil(RACE_MONEY.interest)
  );
  const deep = staffed(1, 'racing', -net - 10000);
  assert.equal(
    teamMoney(deep, result, YOURS).interest,
    -Math.ceil(RACE_MONEY.interest * 10000)
  );
});

test('step 5 counts every contract down by one and leaves free agents alone', () => {
  const state = staffed(1, 'racing');
  const counted = countDownContracts(state);
  state.people.forEach((person, i) => {
    const after = counted.people[i];
    if (person.contract === null) assert.equal(after.contract, null);
    else
      assert.deepEqual(after.contract, {
        ...person.contract,
        racesLeft: person.contract.racesLeft - 1,
      });
  });
});

test('step 9 moves to the next race in the lobby, or says the season is over', () => {
  for (let race = 1; race < SEASON; race++) {
    const state = staffed(race, 'racing');
    assert.equal(seasonOver(state), false);
    const next = nextRaceLobby(state);
    assert.equal(next.race, race + 1);
    assert.equal(next.phase, 'lobby');
    assert.equal(next.season, state.season);
  }
  assert.equal(seasonOver(staffed(SEASON, 'racing')), true);
  assert.equal(
    enterPhase(staffed(SEASON, 'racing'), 'offseason').phase,
    'offseason'
  );
});

test('step 10 replaces the news with the pending events and empties them', () => {
  const event: NewsEvent = { kind: 'yourFinish', team: 0, place: 3 };
  const state: CareerState = {
    ...BASE,
    pendingEvents: [event],
    news: [{ kind: 'title', team: 2 }],
  };
  const published = publishNews(state);
  assert.deepEqual(published.news, [event]);
  assert.deepEqual(published.pendingEvents, []);
});

test('the workshop strip shows the focus before and after, only with a designer', () => {
  const state = staffed(2, 'racing');
  assert.equal(workshop(state, state), null);
  const focused: CareerState = {
    ...state,
    teams: state.teams.map((team, t) =>
      t === YOURS ? { ...team, focus: { line: 'keel' } } : team
    ),
  };
  const later: CareerState = {
    ...focused,
    teams: focused.teams.map((team, t) =>
      t === YOURS
        ? { ...team, design: { ...team.design, keel: team.design.keel + 2 } }
        : team
    ),
  };
  assert.deepEqual(workshop(focused, later), {
    focus: { line: 'keel' },
    before: focused.teams[YOURS].design.keel,
    after: focused.teams[YOURS].design.keel + 2,
  });
  const gun: CareerState = {
    ...focused,
    teams: focused.teams.map((team, t) =>
      t === YOURS ? { ...team, focus: { gun: 'mortar' } } : team
    ),
  };
  assert.deepEqual(workshop(gun, gun), {
    focus: { gun: 'mortar' },
    before: 0,
    after: 0,
  });
  const alone: CareerState = {
    ...focused,
    teams: focused.teams.map((team, t) =>
      t === YOURS ? { ...team, seats: { ...team.seats, designer: null } } : team
    ),
  };
  assert.equal(workshop(alone, alone), null);
});

test('RecordRace fills the race report with numbers recomputed from the result', () => {
  for (const shift of [0, 1, 40, 79]) {
    const state = staffed(3, 'racing', -50000);
    const result = handResult(shift);
    const next = record(state, result);
    const report = next.lastRace;
    assert.ok(report);
    const ships = shipsOf(result, YOURS);
    const want = expectedMoney(state, result, YOURS);
    assert.equal(report.season, state.season);
    assert.equal(report.race, 3);
    assert.equal(report.planet, planetName(state));
    ships.forEach((ship, slot) =>
      assert.deepEqual(report.ships[slot], {
        place: ship.place,
        sinkings: ship.sinkings,
        sunk: ship.sunkAt !== null,
        sunkBy: ship.sunkBy === null ? null : Math.floor(ship.sunkBy / 2),
      })
    );
    assert.equal(report.driver, HIRED.driver.portrait);
    assert.equal(report.shotsFired, ships[0].shotsFired + ships[1].shotsFired);
    assert.equal(
      report.shotsLanded,
      ships[0].shotsLanded + ships[1].shotsLanded
    );
    const samples = result.sea[YOURS];
    assert.equal(
      report.sea,
      samples.reduce((a, b) => a + b, 0) / samples.length
    );
    assert.deepEqual(
      report.podium,
      [1, 2, 3].map((place) =>
        Math.floor(result.ships.findIndex((s) => s.place === place) / 2)
      )
    );
    assert.equal(report.points, expectedTeamPoints(result, YOURS));
    assert.equal(report.money.place, want.place);
    assert.equal(report.money.sinkings, want.sinkings);
    assert.equal(report.money.sea, want.sea);
    assert.equal(report.money.wages, -want.wages);
    assert.equal(report.money.interest, -want.interest);
    assert.ok(want.interest > 0);
    assert.equal(report.balance.before, state.teams[YOURS].balance);
    assert.equal(report.balance.after, want.then - want.interest);
    assert.equal(next.teams[YOURS].balance, report.balance.after);
    const points = state.points.map(
      (p, t) => p + expectedTeamPoints(result, t)
    );
    const bestPlace = state.bestPlace.map((b, t) =>
      Math.min(b, ...shipsOf(result, t).map((s) => s.place))
    );
    assert.equal(report.standing.before, expectedStandings(state)[YOURS]);
    assert.equal(
      report.standing.after,
      expectedStandings({ ...state, points, bestPlace })[YOURS]
    );
    assert.deepEqual(next.points, points);
    assert.deepEqual(next.bestPlace, bestPlace);
    assert.deepEqual(next.lastStanding, expectedStandings(state));
    assert.equal(report.workshop, null);
    assert.equal(report.repossessed, false);
  }
});

test('Uncle sails slot 1 in the report when the driver seat is empty', () => {
  const state = structuredClone(BASE);
  const next = record({ ...state, phase: 'racing' }, handResult(2));
  assert.equal(next.lastRace?.driver, null);
  assert.deepEqual(next.lastRace?.money.paid, []);
  assert.equal(next.lastRace?.money.wages, 0);
});

test('RecordRace conserves money for every team: the change is the sum of the rows', () => {
  for (const race of [1, 5, SEASON - 1]) {
    const state = staffed(race, 'racing', -3000);
    const result = standInResult(matchSetup(state, { hands: 'player' }));
    const next = record(state, result);
    for (let team = 0; team < TEAMS; team++) {
      const rows = teamMoney(state, result, team);
      const want = expectedMoney(state, result, team);
      assert.equal(
        next.teams[team].balance - state.teams[team].balance,
        moneyTotal(rows),
        `team ${team}`
      );
      assert.equal(
        next.teams[team].balance,
        want.then - want.interest,
        `team ${team}`
      );
    }
    assert.deepEqual(next.lastRace?.money, teamMoney(state, result, YOURS));
  }
});

test('RecordRace counts every employed person’s contract down on every team', () => {
  const state = staffed(1, 'racing');
  const next = record(state, handResult(9));
  assert.equal(next.people.length, state.people.length);
  state.people.forEach((person, i) => {
    const after = next.people[i];
    assert.equal(after.id, person.id);
    assert.equal(
      after.contract?.racesLeft ?? null,
      person.contract === null ? null : person.contract.racesLeft - 1
    );
    assert.equal(after.contract?.team ?? null, person.contract?.team ?? null);
  });
  assert.deepEqual(
    next.teams.map((t) => t.seats),
    state.teams.map((t) => t.seats)
  );
});

test('a contract reaches 0 after race ten and its holder stays seated through the stop', () => {
  const state = staffed(SEASON, 'racing');
  const next = record(state, handResult(4));
  assert.equal(next.phase, 'offseason');
  for (const role of ROLES) {
    const person = next.people.find((p) => p.id === HIRED[role].id);
    if (person === undefined) {
      assert.equal(next.teams[YOURS].seats[role], null, 'retired');
      continue;
    }
    assert.equal(person.contract?.racesLeft, 0);
    assert.equal(next.teams[YOURS].seats[role], person.id);
  }
});

test('the race counter and phase after races 1 to 9 and after race 10', () => {
  for (let race = 1; race <= SEASON; race++) {
    const state = staffed(race, 'racing');
    const next = record(state, handResult(race));
    assert.equal(next.season, state.season);
    if (race < SEASON) {
      assert.equal(next.race, race + 1);
      assert.equal(next.phase, 'lobby');
      assert.equal(next.lastOffseason, null);
    } else {
      assert.equal(next.race, SEASON);
      assert.equal(next.phase, 'offseason');
      assert.ok(next.lastOffseason);
    }
  }
});

test('RecordRace sets unread, MarkRead clears it in the lobby and the stop', () => {
  for (const race of [1, SEASON]) {
    const next = record(staffed(race, 'racing'), handResult(race));
    assert.equal(next.unread, true);
    const read = accepted(apply(next, { type: 'MarkRead', team: YOURS }));
    assert.equal(read.unread, false);
    assert.deepEqual({ ...read, unread: true }, next);
    const again = accepted(apply(read, { type: 'MarkRead', team: YOURS }));
    assert.deepEqual(again, read);
  }
});

test('StartRace moves the lobby to racing and changes nothing else', () => {
  const state = staffed(4, 'lobby');
  const started = accepted(apply(state, { type: 'StartRace', team: YOURS }));
  assert.deepEqual(started, { ...state, phase: 'racing' });
});

test('refused race commands leave the state untouched', () => {
  const result = handResult(6);
  const cases: [CareerState, Command, string][] = [
    [staffed(3, 'lobby'), { type: 'RecordRace', team: YOURS, result }, 'phase'],
    [
      staffed(SEASON, 'offseason'),
      { type: 'RecordRace', team: YOURS, result },
      'phase',
    ],
    [staffed(3, 'racing'), { type: 'RecordRace', team: RIVAL, result }, 'team'],
    [staffed(3, 'racing'), { type: 'StartRace', team: YOURS }, 'phase'],
    [staffed(3, 'lobby'), { type: 'StartRace', team: RIVAL }, 'team'],
    [staffed(3, 'racing'), { type: 'MarkRead', team: YOURS }, 'phase'],
    [staffed(3, 'lobby'), { type: 'MarkRead', team: RIVAL }, 'team'],
    [
      staffed(3, 'racing'),
      {
        type: 'RecordRace',
        team: YOURS,
        result: { ...result, ships: result.ships.slice(2) },
      },
      'invalid',
    ],
    [
      staffed(3, 'racing'),
      {
        type: 'RecordRace',
        team: YOURS,
        result: {
          ...result,
          ships: result.ships.map((s, i) => (i === 5 ? { ...s, place: 1 } : s)),
        },
      },
      'invalid',
    ],
  ];
  for (const [state, command, reason] of cases) {
    const before = structuredClone(state);
    const applied = apply(deepFreeze(state), command);
    assert.deepEqual(applied, { ok: false, reason }, command.type);
    assert.deepEqual(state, before);
  }
});

test('RecordRace never mutates its input and is deterministic', () => {
  for (const race of [2, SEASON]) {
    const state = staffed(race, 'racing', -100);
    const copy = structuredClone(state);
    const result = handResult(race * 3);
    deepFreeze(state);
    deepFreeze(result);
    const first = record(state, result);
    const second = record(state, result);
    assert.deepEqual(state, copy);
    assert.deepEqual(first, second);
    assert.deepEqual(record(copy, structuredClone(result)), first);
    assert.deepEqual(JSON.parse(JSON.stringify(first)), first);
  }
});

test('the report is built from the state before the race and the result alone', () => {
  const state = staffed(6, 'racing');
  const result = handResult(13);
  const scored = scoreRace(state, result);
  const money = raceMoney(scored, result);
  const paid = payRace(scored, money);
  const after = countDownContracts(paid);
  const report = raceReport({
    before: state,
    paid,
    after,
    result,
    money: money[YOURS],
    repossessed: [],
  });
  assert.deepEqual(record(state, result).lastRace, report);
  assert.equal(
    raceReport({
      before: state,
      paid,
      after,
      result,
      money: money[YOURS],
      repossessed: [RIVAL, YOURS],
    }).repossessed,
    true
  );
});

function sail(state: CareerState): { state: CareerState; result: MatchResult } {
  const started = accepted(apply(state, { type: 'StartRace', team: YOURS }));
  const result = standInResult(matchSetup(started, { hands: 'player' }));
  return { state: record(started, result), result };
}

const TABLE_SUM = Array.from({ length: SHIPS }, (_, i) =>
  expectedPlacePoints(i + 1)
).reduce((a, b) => a + b, 0);

test('a ten-race season through apply alone, from three seeds', () => {
  for (const seed of ['alpha', 'bravo', 'charlie']) {
    let state = newCareer({
      seed,
      name: 'Gull Racing',
      livery: { dye: 3, pattern: 1 },
      emblem: 2,
    });
    const contracts = new Map(
      state.people.map((p) => [p.id, p.contract?.racesLeft ?? null])
    );
    for (let race = 1; race <= SEASON; race++) {
      assert.equal(state.race, race);
      const before = state;
      const sailed = sail(state);
      state = sailed.state;
      const sinkings = sailed.result.ships.reduce((s, x) => s + x.sinkings, 0);
      const awarded =
        state.points.reduce((a, b) => a + b, 0) -
        before.points.reduce((a, b) => a + b, 0);
      assert.equal(awarded, TABLE_SUM + POINTS.perSinking * sinkings);
      assert.deepEqual(JSON.parse(JSON.stringify(state)), state);
      assert.equal(state.unread, true);
      if (race < SEASON) {
        for (const person of state.people) {
          const start = contracts.get(person.id);
          assert.equal(
            person.contract?.racesLeft ?? null,
            start === undefined || start === null ? null : start - race
          );
        }
        state = accepted(apply(state, { type: 'MarkRead', team: YOURS }));
        assert.equal(state.phase, 'lobby');
      }
    }
    assert.equal(state.phase, 'offseason');
    assert.equal(state.season, 1);
    assert.equal(state.race, SEASON);
    assert.ok(state.lastOffseason);
    for (const person of state.people)
      assert.ok((person.contract?.racesLeft ?? 0) >= 0);
  }
});

test('the money rows have the shape of the report and survive JSON', () => {
  const rows: MoneyRows = teamMoney(staffed(1, 'racing'), handResult(1), 0);
  assert.deepEqual(JSON.parse(JSON.stringify(rows)), rows);
  assert.ok(Object.values(rows).every((v) => v !== undefined));
});
