import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newCareer, type CareerOptions } from '../src/career/apply.ts';
import { TEAM_NAMES } from '../src/career/names.ts';
import { ask, standardClause } from '../src/career/rules/hiring.ts';
import {
  startBalance,
  startDesign,
  startFitted,
  staffLevel,
  strength,
  unlockCount,
} from '../src/career/rules/league.ts';
import { lineLeader } from '../src/career/rules/standing.ts';
import { shipRange } from '../src/career/rules/knowledge.ts';
import {
  LINES,
  ROLES,
  STATS,
  VERSION,
  perLine,
  type CareerState,
  type Team,
} from '../src/career/state.ts';
import {
  HEADCOUNT,
  LEAGUE,
  LEAGUE_START,
  LEVEL_SPAN,
  NEGOTIATION,
  PERSON,
  RIVAL_SHIPS,
  SHIPS,
  STANDING,
  STAT_SPAN,
  START,
  WANTS,
  YOUR_START,
} from '../src/career/tuning.ts';
import { KINDS } from '../src/sim/kinds.ts';
import { DYES, EMBLEMS, PATTERNS } from '../src/world/livery.ts';

const RIVALS = LEAGUE.teams - 1;
const SEEDS = ['test', 'portolan', 'saltgull'];
const options = (seed: string): CareerOptions => ({
  seed,
  name: 'Gull Racing',
  livery: { dye: 3, pattern: 1 },
  emblem: 4,
});
const CAREERS: CareerState[] = SEEDS.map((seed) => newCareer(options(seed)));
const rivals = (state: CareerState): [Team, number][] =>
  state.teams.map((team, index): [Team, number] => [team, index]).slice(1);
const within = (x: number, lo: number, hi: number, what = '') =>
  assert.ok(x >= lo - 1e-9 && x <= hi + 1e-9, `${what} ${x} in [${lo}, ${hi}]`);

test('the same seed gives the same career and different seeds differ', () => {
  for (const seed of SEEDS)
    assert.deepEqual(newCareer(options(seed)), newCareer(options(seed)));
  assert.notDeepEqual(CAREERS[0].people, CAREERS[1].people);
  assert.notDeepEqual(CAREERS[0].teams, CAREERS[1].teams);
});

test('a new career is in the lobby at season 1, race 1, unread false', () => {
  for (const state of CAREERS) {
    assert.equal(state.version, VERSION);
    assert.equal(state.phase, 'lobby');
    assert.equal(state.season, 1);
    assert.equal(state.race, 1);
    assert.equal(state.unread, false);
    assert.equal(state.teams.length, LEAGUE.teams);
    assert.deepEqual(
      state.points,
      state.teams.map(() => 0)
    );
    assert.deepEqual(
      state.bestPlace,
      state.teams.map(() => STANDING.noRaceYet)
    );
    assert.equal(state.winStreak, null);
    assert.equal(state.lastRace, null);
    assert.equal(state.lastOffseason, null);
    assert.deepEqual(state.pendingEvents, []);
    assert.deepEqual(state.news, []);
    assert.deepEqual(state.seen, []);
    assert.deepEqual(state.knowledge.reports, []);
  }
});

test('the generated order is team 1 to 39, then yours 40th', () => {
  for (const state of CAREERS) {
    const expected = state.teams.map((_, t) => (t === 0 ? LEAGUE.teams : t));
    assert.deepEqual(state.previousStanding, expected);
    assert.deepEqual(state.lastStanding, expected);
  }
});

test('the counts of §1.5.8 hold', () => {
  for (const state of CAREERS) {
    const owners = state.teams.flatMap((team) =>
      team.owner === null ? [] : [team.owner]
    );
    assert.equal(owners.length, RIVALS);
    const employed = state.people.filter((p) => p.contract !== null);
    assert.equal(employed.length, RIVALS * ROLES.length);
    for (const role of ROLES) {
      const free = state.people.filter(
        (p) => p.contract === null && p.role === role
      );
      assert.equal(free.length, HEADCOUNT.freeAgentsPerRole, role);
      assert.equal(
        employed.filter((p) => p.role === role).length,
        RIVALS,
        role
      );
    }
    assert.equal(
      state.people.length,
      RIVALS * ROLES.length + ROLES.length * HEADCOUNT.freeAgentsPerRole
    );
    for (const [team, index] of rivals(state))
      for (const role of ROLES) {
        const id = team.seats[role];
        const person = state.people.find((p) => p.id === id);
        assert.ok(person, `${index} ${role}`);
        assert.equal(person.role, role);
        assert.equal(person.contract?.team, index);
      }
    for (const person of employed) {
      const team = state.teams[person.contract?.team ?? 0];
      assert.equal(team.seats[person.role], person.id);
    }
  }
});

test('ids are unique, and owners and people share one counter', () => {
  for (const state of CAREERS) {
    const ids = [
      ...state.teams.flatMap((team) =>
        team.owner === null ? [] : [team.owner.id]
      ),
      ...state.people.map((p) => p.id),
    ];
    assert.equal(new Set(ids).size, ids.length);
    assert.equal(state.nextPersonId, ids.length);
    assert.deepEqual(
      [...ids].sort((a, b) => a - b),
      ids.map((_, i) => i)
    );
  }
});

test('the 39 rivals have different names from the list, and no livery is worn twice', () => {
  for (const state of CAREERS) {
    const names = rivals(state).map(([team]) => team.name);
    assert.equal(new Set(names).size, RIVALS);
    for (const name of names) assert.ok(TEAM_NAMES.includes(name), name);
    const liveries = state.teams.map(
      (t) => `${t.livery.dye}/${t.livery.pattern}`
    );
    assert.equal(new Set(liveries).size, LEAGUE.teams);
    for (const team of state.teams) {
      assert.ok(team.livery.dye >= 0 && team.livery.dye < DYES.length);
      assert.ok(
        team.livery.pattern >= 0 && team.livery.pattern < PATTERNS.length
      );
      assert.ok(
        Number.isInteger(team.emblem) &&
          team.emblem >= 0 &&
          team.emblem < EMBLEMS
      );
    }
  }
});

test('your name may equal a rival name and your livery is never dealt to a rival', () => {
  for (const seed of SEEDS)
    for (let dye = 0; dye < DYES.length; dye += 5) {
      const livery = { dye, pattern: dye % PATTERNS.length };
      const state = newCareer({ seed, name: TEAM_NAMES[0], livery, emblem: 0 });
      assert.equal(state.teams[0].name, TEAM_NAMES[0]);
      assert.deepEqual(state.teams[0].livery, livery);
      for (const [team] of rivals(state))
        assert.notDeepEqual(team.livery, livery);
      assert.equal(new Set(rivals(state).map(([t]) => t.name)).size, RIVALS);
    }
});

test('your team starts as §1.7.5 and §1.8.7 say', () => {
  for (const [state, seed] of CAREERS.map((s, i): [CareerState, string] => [
    s,
    SEEDS[i],
  ])) {
    const mine = state.teams[0];
    const fives = perLine(() => START.level);
    assert.equal(mine.name, options(seed).name);
    assert.deepEqual(mine.livery, options(seed).livery);
    assert.equal(mine.emblem, options(seed).emblem);
    assert.equal(mine.owner, null);
    assert.equal(mine.balance, YOUR_START.balance);
    assert.deepEqual(mine.design, fives);
    for (const ship of mine.ships) {
      assert.deepEqual(ship.fitted, fives);
      assert.equal(ship.gun, 'cannon');
    }
    assert.deepEqual(mine.unlocked, ['cannon']);
    assert.deepEqual(mine.seats, {
      driver: null,
      designer: null,
      mechanic: null,
    });
    assert.deepEqual(mine.sponsors, [null, null, null]);
    assert.deepEqual(mine.offers, []);
    assert.deepEqual(mine.deals, {
      driver: null,
      designer: null,
      mechanic: null,
    });
    assert.deepEqual(mine.approached, {
      driver: null,
      designer: null,
      mechanic: null,
    });
    assert.deepEqual(mine.talks, []);
    assert.equal(mine.focus, null);
    assert.equal(mine.scoutSeat, 'designer');
    assert.deepEqual([...mine.taste].sort(), [...KINDS].sort());
    assert.ok(state.people.every((p) => p.contract?.team !== 0));
  }
});

test('every rival team is generated as §1.10.1 says', () => {
  const { jitter } = LEAGUE_START.design;
  for (const state of CAREERS)
    for (const [team, index] of rivals(state)) {
      const t = strength(index);
      for (const line of LINES) {
        within(
          team.design[line],
          startDesign(t, -jitter),
          startDesign(t, jitter),
          line
        );
        for (const ship of team.ships) {
          assert.ok(ship.fitted[line] <= team.design[line]);
          within(
            ship.fitted[line],
            startFitted(team.design[line], LEAGUE_START.fittedShortfall.hi),
            team.design[line]
          );
          assert.ok(ship.fitted[line] >= SHIPS.leastLevel);
        }
      }
      assert.equal(team.balance, startBalance(t));
      assert.deepEqual([...team.taste].sort(), [...KINDS].sort());
      const others = team.taste.filter((k) => k !== 'cannon');
      const expected = ['cannon', ...others.slice(0, unlockCount(t))];
      assert.deepEqual([...team.unlocked].sort(), expected.sort());
      const first = team.taste.find((k) => team.unlocked.includes(k));
      for (const ship of team.ships) assert.equal(ship.gun, first);
      assert.equal(team.sponsors.length, 3);
      assert.ok(team.sponsors.every((sponsor) => sponsor !== null));
      assert.deepEqual(team.offers, []);
      assert.equal(team.focus, null);
      assert.equal(team.scoutSeat, 'designer');
      assert.deepEqual(team.talks, []);
      assert.ok(team.owner !== null);
      assert.equal(team.owner.stats.length, STATS.driver.length);
    }
});

test('every contract and wage is within the plan ranges', () => {
  for (const state of CAREERS)
    for (const person of state.people) {
      const { contract } = person;
      if (contract === null) continue;
      assert.equal(contract.wage, ask(person));
      assert.equal(contract.wage % NEGOTIATION.wage.step, 0);
      within(
        contract.wage,
        NEGOTIATION.wage.least,
        NEGOTIATION.wage.most,
        'wage'
      );
      assert.equal(contract.clause, standardClause(contract.wage));
      assert.equal(contract.clause % NEGOTIATION.clause.step, 0);
      within(
        contract.clause,
        NEGOTIATION.clause.least,
        NEGOTIATION.clause.most,
        'clause'
      );
      assert.ok(LEAGUE_START.contractRaces.includes(contract.racesLeft));
    }
});

test('people are generated with the levels and ages of §1.5.8 and §1.10.1', () => {
  for (const state of CAREERS)
    for (const person of state.people) {
      const level =
        person.contract === null
          ? HEADCOUNT.freeAgentLevel
          : staffLevel(strength(person.contract.team));
      const age =
        person.contract === null ? HEADCOUNT.freeAgentAge : HEADCOUNT.staffAge;
      within(person.age, age.lo, Math.min(age.hi, person.retireAge - 1), 'age');
      for (const stat of person.peak)
        within(
          stat,
          Math.max(STAT_SPAN.least, Math.round(level.lo - PERSON.reach)),
          Math.min(STAT_SPAN.most, Math.round(level.hi + PERSON.reach)),
          'peak'
        );
      assert.equal(person.stats.length, STATS[person.role].length);
      assert.ok(WANTS.preferred.includes(person.preferred));
    }
});

test('your ranges for rival ships contain the true level and are at most 30 wide', () => {
  for (const state of CAREERS) {
    assert.deepEqual(state.knowledge.lines[0], []);
    for (const [team, index] of rivals(state)) {
      const ranges = state.knowledge.lines[index];
      assert.equal(ranges.length, LEAGUE.shipsPerTeam);
      team.ships.forEach((ship, slot) => {
        for (const line of LINES) {
          const { lo, hi } = ranges[slot][line];
          within(ship.fitted[line], lo, hi, line);
          assert.ok(hi - lo <= RIVAL_SHIPS.width + 1e-9);
          assert.ok(lo >= LEVEL_SPAN.least && hi <= LEVEL_SPAN.most);
        }
      });
    }
  }
});

test('the line leaders are the single highest design level, or none on a tie', () => {
  for (const state of CAREERS)
    for (const line of LINES)
      assert.equal(state.lineLeaders[line], lineLeader(state.teams, line));
  const design = (n: number) => ({ design: perLine(() => n) });
  assert.equal(lineLeader([design(5), design(9), design(7)], 'hull'), 1);
  assert.equal(lineLeader([design(9), design(9), design(7)], 'hull'), null);
  assert.equal(lineLeader([design(9), design(9), design(12)], 'hull'), 2);
  assert.equal(lineLeader([], 'hull'), null);
});

test('the state survives a JSON round trip', () => {
  for (const state of CAREERS)
    assert.deepEqual(JSON.parse(JSON.stringify(state)), state);
});

test('the league formulas of §1.10.1 at their ends', () => {
  const { design, balance, staffLevel: staff } = LEAGUE_START;
  assert.equal(strength(1), 1);
  assert.equal(strength(RIVALS), 0);
  assert.equal(strength(20), 0.5);
  assert.equal(startDesign(1, 0), design.base + design.perStrength);
  assert.equal(startDesign(0, -design.jitter), SHIPS.leastLevel);
  assert.equal(startDesign(1, 100), LEVEL_SPAN.most);
  assert.equal(startFitted(50, 6), 44);
  assert.equal(startFitted(8, 6), SHIPS.leastLevel);
  assert.deepEqual(staffLevel(1), {
    lo: staff.base + staff.perStrength - staff.jitter,
    hi: staff.base + staff.perStrength + staff.jitter,
  });
  assert.deepEqual(staffLevel(0), {
    lo: staff.base - staff.jitter,
    hi: staff.base + staff.jitter,
  });
  assert.equal(startBalance(1), balance.base + balance.perStrength);
  assert.equal(startBalance(0), balance.base);
  assert.equal(startBalance(strength(2)), 31211);
  assert.equal(unlockCount(1), KINDS.length - 1);
  assert.equal(unlockCount(0), 0);
  assert.equal(unlockCount(strength(20)), 2);
  assert.equal(unlockCount(strength(21)), 1);
});

test('the league formulas of §1.10.1 at hand-worked points', () => {
  assert.equal(strength(1), 1);
  assert.equal(strength(20), 0.5);
  assert.equal(strength(39), 0);
  assert.equal(startDesign(1, 0), 80);
  assert.equal(startDesign(0.5, 3), 48);
  assert.equal(startDesign(0, -8), 5);
  assert.equal(startDesign(1, 8), 88);
  assert.equal(startFitted(48, 6), 42);
  assert.equal(startFitted(9, 6), 5);
  assert.deepEqual(staffLevel(1), { lo: 14, hi: 18 });
  assert.deepEqual(staffLevel(0.5), { lo: 8, hi: 12 });
  assert.deepEqual(staffLevel(0), { lo: 2, hi: 6 });
  assert.equal(startBalance(1), 32000);
  assert.equal(startBalance(0.5), 17000);
  assert.equal(startBalance(0), 2000);
  assert.equal(unlockCount(1), 4);
  assert.equal(unlockCount(0.75), 3);
  assert.equal(unlockCount(0.5), 2);
  assert.equal(unlockCount(0.24), 0);
});

test('a ship range is width wide from true − width × u, clamped to 0 to 100', () => {
  const w = RIVAL_SHIPS.width;
  assert.deepEqual(shipRange(50, w, 0), { lo: 50, hi: 50 + w });
  assert.deepEqual(shipRange(50, w, 1), { lo: 50 - w, hi: 50 });
  assert.deepEqual(shipRange(50, w, 0.5), { lo: 50 - w / 2, hi: 50 + w / 2 });
  assert.deepEqual(shipRange(10, w, 1), { lo: LEVEL_SPAN.least, hi: 10 });
  assert.deepEqual(shipRange(95, w, 0), { lo: 95, hi: LEVEL_SPAN.most });
  assert.deepEqual(shipRange(50, RIVAL_SHIPS.builtWidth, 1), {
    lo: 50 - RIVAL_SHIPS.builtWidth,
    hi: 50,
  });
});
