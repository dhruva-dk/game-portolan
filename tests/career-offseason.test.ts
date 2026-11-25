import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  apply,
  newCareer,
  runPolicies,
  type Applied,
} from '../src/career/apply.ts';
import type { Command } from '../src/career/commands.ts';
import { matchSetup } from '../src/career/fit.ts';
import { personOf } from '../src/career/lookup.ts';
import {
  ageLeague,
  offseasonReport,
  payPrizes,
  releaseExpired,
  turnSeason,
  winter,
} from '../src/career/offseason.ts';
import { teamMoney } from '../src/career/record/pay.ts';
import { currentStats, rookie } from '../src/career/rules/person.ts';
import {
  STANDINGS,
  income,
  seasonPrize,
  standingMerit,
} from '../src/career/rules/money.ts';
import {
  fittedWinter,
  wintered,
  winteredFitted,
} from '../src/career/rules/development.ts';
import { standInResult } from '../src/career/standin.ts';
import {
  LINES,
  MECHANIC_STATS,
  ROLES,
  perLine,
  type CareerState,
  type Levels,
  type Person,
  type Role,
} from '../src/career/state.ts';
import {
  AGEING,
  LEAGUE,
  ECONOMY,
  SHIPS,
  STANDING,
  STAT_SPAN,
} from '../src/career/tuning.ts';
import type { MatchResult } from '../src/sim/result.ts';

const TEAMS = LEAGUE.teams;
const SEASON = LEAGUE.racesPerSeason;
const YOURS = 0;
const RIVAL = 9;
const UPKEEP = MECHANIC_STATS.indexOf('upkeep');

function accepted(applied: Applied): CareerState {
  if (!applied.ok) throw new Error(`refused for ${applied.reason}`);
  return applied.state;
}

const send = (state: CareerState, command: Command): CareerState =>
  accepted(apply(state, command));

function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const key of Object.keys(value)) deepFreeze(Reflect.get(value, key));
  }
  return value;
}

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

const expectedPrize = (standing: number): number =>
  Math.round(
    ECONOMY.shares.season *
      LEAGUE.racesPerSeason *
      income(standingMerit(standing))
  );

const resultOf = (state: CareerState): MatchResult =>
  standInResult(matchSetup(state, { hands: 'player' }));

function sailRaces(state: CareerState, races: number): CareerState {
  let current = state;
  for (let r = 0; r < races; r++) {
    const started = send(current, { type: 'StartRace', team: YOURS });
    const result = resultOf(started);
    current = send(started, { type: 'RecordRace', team: YOURS, result });
    if (current.phase === 'lobby')
      current = send(current, { type: 'MarkRead', team: YOURS });
  }
  return current;
}

const career = (seed: string): CareerState =>
  newCareer({
    seed,
    name: 'Gull Racing',
    livery: { dye: 1, pattern: 2 },
    emblem: 4,
  });

function nearRetirement(state: CareerState, role: Role): Person {
  const found = state.people.find(
    (p) =>
      p.contract === null &&
      p.role === role &&
      p.age + AGEING.perStop >= p.retireAge
  );
  if (!found) throw new Error('no free agent about to retire');
  return found;
}

function young(state: CareerState, role: Role): Person {
  const found = state.people.find(
    (p) =>
      p.contract === null &&
      p.role === role &&
      p.age + AGEING.perStop < p.retireAge
  );
  if (!found) throw new Error('no young free agent');
  return found;
}

function withYourStaff(state: CareerState): CareerState {
  const driver = young(state, 'driver');
  const mechanic = nearRetirement(state, 'mechanic');
  const hired = new Map([
    [driver.id, 2],
    [mechanic.id, 1],
  ]);
  return {
    ...state,
    teams: state.teams.map((team, t) =>
      t === YOURS
        ? {
            ...team,
            seats: { driver: driver.id, designer: null, mechanic: mechanic.id },
            design: STOCKED,
            ships: [
              { ...team.ships[0], fitted: { ...STOCKED, sails: 6 } },
              { ...team.ships[1], fitted: { ...STOCKED, keel: 9 } },
            ],
          }
        : team
    ),
    people: state.people.map((p) => {
      const races = hired.get(p.id);
      return races === undefined
        ? p
        : {
            ...p,
            contract: { team: YOURS, wage: 100, clause: 0, racesLeft: races },
          };
    }),
  };
}

const SEEDS = ['ebb', 'flow', 'neap'];

const STOCKED: Levels = {
  sails: 60,
  rigging: 55,
  rudder: 50,
  hull: 45,
  keel: 40,
  mounts: 35,
  gun: 30,
};

const SEASONS = new Map<string, CareerState>();

function lastRaceOf(seed: string): CareerState {
  const known = SEASONS.get(seed);
  if (known) return known;
  const lobby = sailRaces(career(seed), SEASON - 1);
  const ready = send(withYourStaff(lobby), { type: 'StartRace', team: YOURS });
  SEASONS.set(seed, ready);
  return ready;
}

const atStop = (seed: string): CareerState => {
  const ready = lastRaceOf(seed);
  return send(ready, {
    type: 'RecordRace',
    team: YOURS,
    result: resultOf(ready),
  });
};

test('the season prize and winter loss follow §1.8.2 and §1.9', () => {
  for (const standing of STANDINGS)
    assert.equal(seasonPrize(standing), expectedPrize(standing));
  for (let s = 1; s < TEAMS; s++)
    assert.ok(seasonPrize(s) > seasonPrize(s + 1));
  assert.equal(fittedWinter(null), ECONOMY.winter + ECONOMY.winterFitted);
  for (let upkeep = STAT_SPAN.least; upkeep <= STAT_SPAN.most; upkeep++) {
    assert.equal(fittedWinter(upkeep), upkeepShare(upkeep));
    assert.ok(fittedWinter(upkeep) < fittedWinter(null));
    assert.ok(fittedWinter(upkeep) >= ECONOMY.winter);
  }
  assert.ok(fittedWinter(STAT_SPAN.most) < fittedWinter(STAT_SPAN.least));
  for (let level = SHIPS.leastLevel; level <= 100; level++) {
    const kept = (level - SHIPS.leastLevel) * (1 - ECONOMY.winter);
    assert.ok(
      Math.abs(wintered(level, ECONOMY.winter) - SHIPS.leastLevel - kept) < 1e-9
    );
  }
  assert.equal(
    wintered(SHIPS.leastLevel, fittedWinter(null)),
    SHIPS.leastLevel
  );
});

test('the season prize and winter loss at hand-worked points', () => {
  assert.equal(seasonPrize(1), 32000);
  assert.equal(seasonPrize(11), 18588);
  assert.equal(seasonPrize(21), 9120);
  assert.equal(seasonPrize(31), 3598);
  assert.equal(seasonPrize(40), 2000);
  assert.equal(fittedWinter(null), 0.4);
  assert.ok(Math.abs(fittedWinter(10) - 0.3) < 1e-12);
  assert.equal(fittedWinter(20), 0.2);
  assert.equal(wintered(90, 0.2), 73);
  assert.equal(wintered(50, 0.4), 32);
  assert.equal(wintered(5, 0.4), 5);
  assert.equal(winteredFitted(50, 50, null), 32);
  assert.equal(winteredFitted(50, 40, 10), 33);
});

test('step 1 pays every team the prize for its final standing and nothing else', () => {
  for (const seed of SEEDS) {
    const ready = lastRaceOf(seed);
    const result = resultOf(ready);
    const stop = atStop(seed);
    const final = expectedStandings(stop);
    const prized = payPrizes(stop);
    for (let team = 0; team < TEAMS; team++) {
      const rows = teamMoney(ready, result, team);
      assert.equal(
        prized.teams[team].balance - stop.teams[team].balance,
        expectedPrize(final[team])
      );
      assert.equal(
        stop.teams[team].balance - ready.teams[team].balance,
        rows.place +
          rows.sinkings +
          rows.sea +
          rows.sponsors.reduce((sum, row) => sum + row.amount, 0) +
          rows.wages +
          rows.interest +
          expectedPrize(final[team]),
        `race ten's money and the prize, team ${team}`
      );
    }
    assert.deepEqual(
      prized.teams.map((t) => ({ ...t, balance: 0 })),
      stop.teams.map((t) => ({ ...t, balance: 0 }))
    );
  }
});

const upkeepShare = (upkeep: number): number =>
  ECONOMY.winter + ECONOMY.winterFitted * (1 - upkeep / STAT_SPAN.most);

function shareOf(state: CareerState, team: number): number {
  const id = state.teams[team].seats.mechanic;
  const mechanic = state.people.find((p) => p.id === id);
  return mechanic === undefined
    ? ECONOMY.winter + ECONOMY.winterFitted
    : upkeepShare(mechanic.stats[UPKEEP]);
}

const keep = (level: number, share: number): number =>
  SHIPS.leastLevel + (level - SHIPS.leastLevel) * (1 - share);

const designAfter = (design: Levels): Levels =>
  perLine((line) => keep(design[line], ECONOMY.winter));

const fittedAfter = (fitted: Levels, design: Levels, share: number): Levels =>
  perLine((line) =>
    Math.min(keep(fitted[line], share), keep(design[line], ECONOMY.winter))
  );

test('step 2 keeps four fifths of every design level above 5, and less of each fitted level by the mechanic’s Upkeep, never above its design', () => {
  const ready = lastRaceOf('ebb');
  const unmanned: CareerState = {
    ...ready,
    teams: ready.teams.map((team, t) =>
      t === RIVAL ? { ...team, seats: { ...team.seats, mechanic: null } } : team
    ),
  };
  const after = winter(unmanned);
  for (let team = 0; team < TEAMS; team++) {
    const share = shareOf(unmanned, team);
    const { design, ships } = unmanned.teams[team];
    assert.deepEqual(after.teams[team].design, designAfter(design));
    for (let slot = 0; slot < 2; slot++) {
      assert.deepEqual(
        after.teams[team].ships[slot].fitted,
        fittedAfter(ships[slot].fitted, design, share)
      );
      assert.equal(after.teams[team].ships[slot].gun, ships[slot].gun);
      for (const line of LINES)
        assert.ok(
          after.teams[team].ships[slot].fitted[line] <=
            after.teams[team].design[line]
        );
    }
    for (const line of LINES) {
      assert.ok(after.teams[team].design[line] >= SHIPS.leastLevel);
      assert.ok(after.teams[team].design[line] <= design[line]);
    }
  }
  assert.equal(shareOf(unmanned, RIVAL), fittedWinter(null));
  assert.ok(shareOf(unmanned, YOURS) < fittedWinter(null));
  assert.deepEqual(after.people, unmanned.people);
});

test('step 3 ages everyone, retires the old and replaces each with a rookie', () => {
  for (const seed of SEEDS) {
    const state = lastRaceOf(seed);
    const after = ageLeague(state);
    const retiring = state.people.filter(
      (p) => p.age + AGEING.perStop >= p.retireAge
    );
    assert.ok(retiring.length > 0, 'somebody retires');
    const gone = new Set(retiring.map((p) => p.id));
    for (const person of state.people) {
      const now = after.people.find((p) => p.id === person.id);
      if (gone.has(person.id)) {
        assert.equal(now, undefined, 'a retired person leaves the game');
        continue;
      }
      assert.ok(now);
      assert.equal(now.age, person.age + AGEING.perStop);
      assert.deepEqual(
        now.stats,
        currentStats(person.peak, person.age + AGEING.perStop, person.peakAge)
      );
      assert.deepEqual(
        { ...now, age: 0, stats: [] },
        { ...person, age: 0, stats: [] }
      );
    }
    const rookies = after.people.filter((p) => p.id >= state.nextPersonId);
    assert.equal(rookies.length, retiring.length);
    assert.equal(after.nextPersonId, state.nextPersonId + retiring.length);
    rookies.forEach((person, i) => {
      assert.equal(person.id, state.nextPersonId + i);
      assert.equal(person.role, retiring[i].role);
      assert.equal(person.contract, null);
      assert.ok(person.age >= AGEING.rookieAge.lo);
      assert.ok(person.age <= AGEING.rookieAge.hi);
      assert.deepEqual(person, rookie(seed, person.id, person.role));
    });
    assert.equal(after.people.length, state.people.length);
    for (const role of ROLES)
      assert.equal(
        after.people.filter((p) => p.role === role).length,
        state.people.filter((p) => p.role === role).length
      );
    state.teams.forEach((team, t) => {
      for (const role of ROLES) {
        const id = team.seats[role];
        assert.equal(
          after.teams[t].seats[role],
          id !== null && gone.has(id) ? null : id
        );
      }
      assert.deepEqual(after.teams[t].owner, team.owner);
    });
  }
});

test('winter uses the mechanic in the seat before that mechanic retires', () => {
  const ready = lastRaceOf('ebb');
  const mechanicId = ready.teams[YOURS].seats.mechanic;
  const mechanic = ready.people.find((p) => p.id === mechanicId);
  assert.ok(mechanic);
  const stop = atStop('ebb');
  const share = upkeepShare(mechanic.stats[UPKEEP]);
  const { design, ships } = ready.teams[YOURS];
  assert.deepEqual(stop.teams[YOURS].design, designAfter(design));
  for (let slot = 0; slot < 2; slot++)
    assert.deepEqual(
      stop.teams[YOURS].ships[slot].fitted,
      fittedAfter(ships[slot].fitted, design, share)
    );
  assert.equal(stop.teams[YOURS].seats.mechanic, null);
  assert.equal(
    stop.people.some((p) => p.id === mechanicId),
    false
  );
});

test('the off-season report holds the table, your prize, seats and winter', () => {
  for (const seed of SEEDS) {
    const ready = lastRaceOf(seed);
    const stop = atStop(seed);
    const report = stop.lastOffseason;
    assert.ok(report);
    const final = expectedStandings(stop);
    assert.deepEqual(
      report.table.map((row) => row.team),
      final
        .map((standing, team) => ({ standing, team }))
        .sort((a, b) => a.standing - b.standing)
        .map((row) => row.team)
    );
    for (const row of report.table)
      assert.equal(row.points, stop.points[row.team]);
    assert.equal(report.table.length, TEAMS);
    assert.equal(report.prize, expectedPrize(final[YOURS]));
    assert.equal(report.seats.designer, null);
    const driverId = ready.teams[YOURS].seats.driver;
    const driver = ready.people.find((p) => p.id === driverId);
    const mechanicId = ready.teams[YOURS].seats.mechanic;
    const mechanic = ready.people.find((p) => p.id === mechanicId);
    assert.ok(driver && mechanic);
    const driverNow = stop.people.find((p) => p.id === driverId);
    assert.ok(driverNow);
    assert.deepEqual(report.seats.driver, {
      name: driver.name,
      role: 'driver',
      portrait: driver.portrait,
      age: { before: driver.age, after: driver.age + AGEING.perStop },
      stats: { before: driver.stats, after: driverNow.stats },
      racesLeft: 1,
      retired: false,
    });
    assert.deepEqual(report.seats.mechanic, {
      name: mechanic.name,
      role: 'mechanic',
      portrait: mechanic.portrait,
      age: { before: mechanic.age, after: mechanic.age + AGEING.perStop },
      stats: {
        before: mechanic.stats,
        after: currentStats(
          mechanic.peak,
          mechanic.age + AGEING.perStop,
          mechanic.peakAge
        ),
      },
      racesLeft: 0,
      retired: true,
    });
    const mine = (s: CareerState) => s.teams[YOURS];
    assert.deepEqual(report.design, {
      before: mine(ready).design,
      after: mine(stop).design,
    });
    for (let slot = 0; slot < 2; slot++)
      assert.deepEqual(report.fitted[slot], {
        before: mine(ready).ships[slot].fitted,
        after: mine(stop).ships[slot].fitted,
      });
    assert.deepEqual(
      report,
      offseasonReport(
        { ...stop, teams: ready.teams, people: ready.people.map(countedDown) },
        stop
      )
    );
  }
});

const countedDown = (person: Person): Person =>
  person.contract === null
    ? person
    : {
        ...person,
        contract: {
          ...person.contract,
          racesLeft: person.contract.racesLeft - 1,
        },
      };

test('FinishOffseason releases expired contracts, turns the season and opens the lobby', () => {
  for (const seed of SEEDS) {
    const base = atStop(seed);
    const stop = {
      ...base,
      winStreak: { team: 3, n: 4 },
      people: base.people.map((p) =>
        p.contract?.team === YOURS
          ? { ...p, contract: { ...p.contract, racesLeft: 0 } }
          : p
      ),
    };
    const next = send(stop, { type: 'FinishOffseason', team: YOURS });
    const ran = runPolicies(stop);
    assert.deepEqual(ran.refused, []);
    assert.ok(ran.sent.length > 0, 'the rivals act at the stop');
    const acted = ran.state;
    const final = expectedStandings(stop);
    assert.equal(next.phase, 'lobby');
    assert.equal(next.season, stop.season + 1);
    assert.equal(next.race, 1);
    assert.deepEqual(
      next.points,
      stop.points.map(() => 0)
    );
    assert.deepEqual(
      next.bestPlace,
      stop.bestPlace.map(() => STANDING.noRaceYet)
    );
    assert.deepEqual(next.previousStanding, final);
    assert.deepEqual(next.lastStanding, final);
    assert.deepEqual(expectedStandings(next), final);
    assert.deepEqual(next.winStreak, { team: 3, n: 4 });
    assert.deepEqual(next.lastOffseason, stop.lastOffseason);
    assert.deepEqual(next.lastRace, stop.lastRace);
    assert.equal(next.unread, stop.unread);
    const expired = acted.people.filter((p) => p.contract?.racesLeft === 0);
    assert.ok(expired.length > 0);
    const leaving = new Set(expired.map((p) => p.id));
    acted.people.forEach((person, i) => {
      const now = next.people[i];
      assert.equal(now.id, person.id);
      assert.deepEqual(
        now.contract,
        leaving.has(person.id) ? null : person.contract
      );
    });
    acted.teams.forEach((team, t) => {
      for (const role of ROLES) {
        const id = team.seats[role];
        assert.equal(
          next.teams[t].seats[role],
          id !== null && leaving.has(id) ? null : id
        );
      }
      assert.deepEqual(
        { ...next.teams[t], seats: team.seats },
        team,
        `only seats change on team ${t}`
      );
    });
    for (const person of next.people)
      assert.ok((person.contract?.racesLeft ?? 1) > 0);
  }
});

test('releaseExpired and turnSeason each do only their own part', () => {
  const stop = atStop('neap');
  const released = releaseExpired(stop);
  assert.equal(released.season, stop.season);
  assert.deepEqual(released.points, stop.points);
  const turned = turnSeason(stop);
  assert.deepEqual(turned.people, stop.people);
  assert.deepEqual(turned.teams, stop.teams);
  assert.equal(turned.phase, stop.phase);
});

test('the race set up during the stop is the race the lobby sails after FinishOffseason', () => {
  for (const seed of SEEDS) {
    const stop = atStop(seed);
    const next = send(stop, { type: 'FinishOffseason', team: YOURS });
    const during = matchSetup(stop, { hands: 'player' });
    const after = matchSetup(next, { hands: 'player' });
    assert.equal(during.planet, after.planet);
    assert.equal(during.match, after.match);
    assert.equal(during.storm, after.storm);
    assert.equal(during.heals, after.heals);
    assert.equal(during.ships.length, after.ships.length);
    const holders = (state: CareerState, team: number): unknown[] =>
      ROLES.map((role) => {
        const id = state.teams[team].seats[role];
        return id === null ? null : personOf(state, id)?.stats;
      });
    const unchanged = (team: number): boolean =>
      JSON.stringify([stop.teams[team], holders(stop, team)]) ===
      JSON.stringify([next.teams[team], holders(next, team)]);
    let same = 0;
    during.ships.forEach((ship, id) => {
      assert.equal(ship.standing, after.ships[id].standing);
      if (!unchanged(ship.team)) return;
      assert.deepEqual(ship, after.ships[id], `ship ${id}`);
      same += 1;
    });
    assert.ok(same > 0);
  }
});

test('the off-season commands are refused in the wrong phase or from a rival, untouched', () => {
  const stop = atStop('ebb');
  const lobby = send(stop, { type: 'FinishOffseason', team: YOURS });
  const racing = send(lobby, { type: 'StartRace', team: YOURS });
  const cases: [CareerState, Command, string][] = [
    [lobby, { type: 'FinishOffseason', team: YOURS }, 'phase'],
    [racing, { type: 'FinishOffseason', team: YOURS }, 'phase'],
    [stop, { type: 'FinishOffseason', team: RIVAL }, 'team'],
    [stop, { type: 'StartRace', team: YOURS }, 'phase'],
    [
      stop,
      { type: 'RecordRace', team: YOURS, result: resultOf(stop) },
      'phase',
    ],
  ];
  for (const [state, command, reason] of cases) {
    const before = structuredClone(state);
    assert.deepEqual(apply(deepFreeze(state), command), { ok: false, reason });
    assert.deepEqual(state, before);
  }
});

test('entering and finishing the stop never mutate their input and repeat exactly', () => {
  const ready = structuredClone(lastRaceOf('flow'));
  const copy = structuredClone(ready);
  const result = deepFreeze(resultOf(ready));
  deepFreeze(ready);
  const stop = send(ready, { type: 'RecordRace', team: YOURS, result });
  assert.deepEqual(ready, copy);
  assert.deepEqual(
    send(copy, { type: 'RecordRace', team: YOURS, result }),
    stop
  );
  deepFreeze(stop);
  const stopCopy = structuredClone(stop);
  const next = send(stop, { type: 'FinishOffseason', team: YOURS });
  assert.deepEqual(stop, stopCopy);
  assert.deepEqual(
    send(stopCopy, { type: 'FinishOffseason', team: YOURS }),
    next
  );
  assert.deepEqual(JSON.parse(JSON.stringify(stop)), stop);
  assert.deepEqual(JSON.parse(JSON.stringify(next)), next);
  const read = send(stop, { type: 'MarkRead', team: YOURS });
  assert.equal(read.unread, false);
  assert.equal(read.phase, 'offseason');
});

test('a second season starts and runs after the stop', () => {
  const stop = atStop('neap');
  const next = send(send(stop, { type: 'MarkRead', team: YOURS }), {
    type: 'FinishOffseason',
    team: YOURS,
  });
  const later = sailRaces(next, 2);
  assert.equal(later.season, stop.season + 1);
  assert.equal(later.race, 3);
  assert.equal(later.phase, 'lobby');
  assert.deepEqual(JSON.parse(JSON.stringify(later)), later);
});
