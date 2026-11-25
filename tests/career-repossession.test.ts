import { test } from 'node:test';
import assert from 'node:assert/strict';
import { apply, newCareer, type Applied } from '../src/career/apply.ts';
import { draw, knowledgeYear } from '../src/career/draw.ts';
import { matchSetup } from '../src/career/fit.ts';
import { redrawRepossessed } from '../src/career/knowledge/ships.ts';
import { moneyTotal, payRace, raceMoney } from '../src/career/record/pay.ts';
import {
  isRepossessed,
  repossess,
  repossessTeam,
} from '../src/career/record/repossess.ts';
import { scoreRace } from '../src/career/record/score.ts';
import { shipRange } from '../src/career/rules/ship-range.ts';
import { standings } from '../src/career/rules/standing.ts';
import { standInResult } from '../src/career/standin.ts';
import {
  LINES,
  ROLES,
  type CareerState,
  type Team,
} from '../src/career/state.ts';
import { REPOSSESSION, RIVAL_SHIPS } from '../src/career/tuning.ts';
import type { MatchResult } from '../src/sim/result.ts';

const YOURS = 0;
const RIVAL = 12;
const OTHER = 25;

const BASE = newCareer({
  seed: 'bailiff',
  name: 'Gull Racing',
  livery: { dye: 0, pattern: 0 },
  emblem: 0,
});

function accepted(applied: Applied): CareerState {
  if (!applied.ok) throw new Error(`refused for ${applied.reason}`);
  return applied.state;
}

function changeTeam(
  state: CareerState,
  index: number,
  change: (team: Team) => Team
): CareerState {
  return {
    ...state,
    teams: state.teams.map((team, i) => (i === index ? change(team) : team)),
  };
}

function busy(state: CareerState, index: number): CareerState {
  const team = state.teams[index];
  const free = state.people.filter((p) => p.contract === null);
  const driver = free.find((p) => p.role === 'driver');
  if (driver === undefined) throw new Error('no free driver');
  return changeTeam(state, index, (t) => ({
    ...t,
    focus: { gun: 'mortar' },
    unlocked: ['cannon', 'scatter', 'harpoon'],
    unlockProgress: { ...t.unlockProgress, mortar: 7, repeater: 3 },
    ships: [
      { ...t.ships[0], gun: 'scatter' },
      { ...t.ships[1], gun: 'harpoon' },
    ],
    scoutSeat: 'mechanic',
    approached: { ...t.approached, driver: driver.id },
    deals: {
      driver: { candidates: [driver.id], locked: driver.id },
      designer: { candidates: free.slice(0, 2).map((p) => p.id), locked: null },
      mechanic: null,
    },
    talks: [
      { person: driver.id, attempts: 2, answer: 'refused', counter: null },
    ],
    offers: team.sponsors.flatMap((s) => (s === null ? [] : [s])),
  }));
}

const racing = (state: CareerState): CareerState => ({
  ...state,
  phase: 'racing',
  race: 4,
});

const resultOf = (state: CareerState): MatchResult =>
  standInResult(matchSetup(state, { hands: 'player' }));

function withBalance(
  state: CareerState,
  index: number,
  balance: number
): CareerState {
  return changeTeam(state, index, (t) => ({ ...t, balance }));
}

function balanceLanding(
  state: CareerState,
  result: MatchResult,
  index: number,
  then: number
): number {
  const rows = raceMoney(
    scoreRace(withBalance(state, index, 0), result),
    result
  );
  return then - moneyTotal({ ...rows[index], interest: 0 });
}

function landing(
  state: CareerState,
  result: MatchResult,
  targets: Record<number, number>
): CareerState {
  let landed = state;
  for (const [index, then] of Object.entries(targets))
    landed = withBalance(
      landed,
      Number(index),
      balanceLanding(state, result, Number(index), then)
    );
  return landed;
}

test('a balance below −10,000 is repossessed and −10,000 itself is not', () => {
  assert.equal(REPOSSESSION.below, -10000);
  assert.equal(REPOSSESSION.balance, 1500);
  assert.equal(isRepossessed(-10000), false);
  assert.equal(isRepossessed(-9999), false);
  assert.equal(isRepossessed(-10001), true);
  assert.equal(isRepossessed(-250000), true);
  assert.equal(isRepossessed(0), false);
});

test('after the race’s money, −10,000 stays, −10,001 is repossessed and −9,999 stays', () => {
  const state = racing(BASE);
  const result = resultOf(state);
  const landed = landing(state, result, {
    [RIVAL]: -9524,
    [OTHER]: -9523,
    [YOURS]: -9522,
  });
  const paid = payRace(scoreRace(landed, result), raceMoney(landed, result));
  assert.equal(paid.teams[RIVAL].balance, -10001);
  assert.equal(paid.teams[OTHER].balance, -10000);
  assert.equal(paid.teams[YOURS].balance, -9999);
  const next = accepted(
    apply(landed, { type: 'RecordRace', team: YOURS, result })
  );
  assert.equal(next.teams[RIVAL].balance, REPOSSESSION.balance);
  assert.equal(next.teams[OTHER].balance, -10000);
  assert.equal(next.teams[YOURS].balance, -9999);
  assert.equal(next.lastRace?.repossessed, false);
  assert.deepEqual(repossess(paid).teams, [RIVAL]);
});

test('repossession resets levels, guns, unlocks, staff, hiring and sponsors', () => {
  const state = withBalance(busy(BASE, RIVAL), RIVAL, -30000);
  const staff = ROLES.map((role) => state.teams[RIVAL].seats[role]);
  assert.ok(staff.every((id) => id !== null));
  const { state: next, teams } = repossess(state);
  assert.deepEqual(teams, [RIVAL]);
  const team = next.teams[RIVAL];
  for (const line of LINES) {
    assert.equal(team.design[line], 5);
    assert.equal(team.ships[0].fitted[line], 5);
    assert.equal(team.ships[1].fitted[line], 5);
  }
  assert.deepEqual(
    team.ships.map((ship) => ship.gun),
    ['cannon', 'cannon']
  );
  assert.deepEqual(team.unlocked, ['cannon']);
  assert.ok(Object.values(team.unlockProgress).every((p) => p === 0));
  assert.equal(team.focus, null);
  assert.deepEqual(team.seats, {
    driver: null,
    designer: null,
    mechanic: null,
  });
  for (const id of staff)
    assert.equal(next.people.find((p) => p.id === id)?.contract, null);
  assert.deepEqual(team.approached, {
    driver: null,
    designer: null,
    mechanic: null,
  });
  assert.deepEqual(team.deals, {
    driver: null,
    designer: null,
    mechanic: null,
  });
  assert.deepEqual(team.talks, []);
  assert.deepEqual(team.sponsors, [null, null, null]);
  assert.deepEqual(team.offers, []);
  assert.equal(team.balance, 1500);
  assert.equal(team.scoutSeat, 'designer');
});

test('repossession keeps the name, livery, emblem, owner, taste, points and standing', () => {
  const before = withBalance(
    { ...busy(BASE, RIVAL), points: BASE.points.map((_, t) => 3 * t) },
    RIVAL,
    -12000
  );
  const { state: after } = repossess(before);
  const was = before.teams[RIVAL];
  const now = after.teams[RIVAL];
  assert.equal(now.name, was.name);
  assert.deepEqual(now.livery, was.livery);
  assert.equal(now.emblem, was.emblem);
  assert.deepEqual(now.owner, was.owner);
  assert.deepEqual(now.taste, was.taste);
  assert.deepEqual(after.points, before.points);
  assert.deepEqual(after.bestPlace, before.bestPlace);
  assert.deepEqual(standings(after), standings(before));
});

test('repossession frees staff at no cost and touches no other team or person', () => {
  const before = withBalance(busy(BASE, RIVAL), RIVAL, -12000);
  const { state: after } = repossess(before);
  after.teams.forEach((team, t) => {
    if (t !== RIVAL) assert.deepEqual(team, before.teams[t], `team ${t}`);
  });
  const total = (s: CareerState) =>
    s.teams.reduce(
      (sum, team, t) => (t === RIVAL ? sum : sum + team.balance),
      0
    );
  assert.equal(total(after), total(before));
  before.people.forEach((person, i) => {
    const now = after.people[i];
    if (person.contract?.team === RIVAL)
      assert.deepEqual(now, { ...person, contract: null });
    else assert.deepEqual(now, person);
  });
  assert.equal(after.people.length, before.people.length);
  assert.equal(after.nextPersonId, before.nextPersonId);
});

test('your ranges for a repossessed rival are redrawn as at the start, keyed repossessed', () => {
  const before = racing(withBalance(BASE, RIVAL, -15000));
  const { state: after } = repossess(before);
  const year = knowledgeYear(after);
  after.knowledge.lines[RIVAL].forEach((ranges, slot) => {
    for (const line of LINES) {
      const u = draw(
        before.seed,
        'line',
        year,
        RIVAL,
        slot,
        line,
        'repossessed',
        before.race
      );
      assert.deepEqual(ranges[line], shipRange(5, RIVAL_SHIPS.width, u));
      assert.ok(ranges[line].lo <= 5 && ranges[line].hi >= 5);
      assert.ok(ranges[line].hi - ranges[line].lo <= RIVAL_SHIPS.width);
    }
  });
  assert.notDeepEqual(
    after.knowledge.lines[RIVAL],
    before.knowledge.lines[RIVAL]
  );
  after.knowledge.lines.forEach((lines, t) => {
    if (t !== RIVAL) assert.deepEqual(lines, before.knowledge.lines[t]);
  });
  assert.deepEqual(
    after.knowledge.lines,
    redrawRepossessed(repossessTeam(before, RIVAL), RIVAL).knowledge.lines
  );
});

test('your own repossession redraws nothing, and the report says so', () => {
  const state = racing(busy(BASE, YOURS));
  const result = resultOf(state);
  const landed = landing(state, result, { [YOURS]: -20000 });
  const paid = payRace(scoreRace(landed, result), raceMoney(landed, result));
  assert.ok(paid.teams[YOURS].balance < -10000);
  assert.deepEqual(
    repossess(paid).state.knowledge,
    paid.knowledge,
    'there are no ranges for your own ships'
  );
  const next = accepted(
    apply(landed, { type: 'RecordRace', team: YOURS, result })
  );
  const report = next.lastRace;
  assert.ok(report);
  assert.equal(report.repossessed, true);
  assert.equal(report.balance.before, landed.teams[YOURS].balance);
  assert.equal(report.balance.after, paid.teams[YOURS].balance);
  assert.equal(
    report.balance.after - report.balance.before,
    moneyTotal(report.money)
  );
  assert.equal(report.workshop, null);
  assert.equal(next.teams[YOURS].balance, REPOSSESSION.balance);
  assert.deepEqual(next.teams[YOURS].sponsors, [null, null, null]);
});

test('through RecordRace a repossessed team keeps no gains and every other team is paid its rows', () => {
  const state = racing(busy(BASE, RIVAL));
  const result = resultOf(state);
  const landed = landing(state, result, { [RIVAL]: -11000, [OTHER]: -11500 });
  const money = raceMoney(scoreRace(landed, result), result);
  const next = accepted(
    apply(landed, { type: 'RecordRace', team: YOURS, result })
  );
  next.teams.forEach((team, t) => {
    if (t === RIVAL || t === OTHER)
      assert.equal(team.balance, REPOSSESSION.balance, `team ${t}`);
    else
      assert.equal(
        team.balance,
        landed.teams[t].balance + moneyTotal(money[t]),
        `team ${t}`
      );
  });
  for (const t of [RIVAL, OTHER]) {
    const team = next.teams[t];
    for (const line of LINES) assert.equal(team.design[line], 5);
    assert.deepEqual(team.seats, {
      driver: null,
      designer: null,
      mechanic: null,
    });
    assert.deepEqual(team.sponsors, [null, null, null]);
    assert.equal(
      team.offers.length,
      3,
      'offers are dealt again after the race'
    );
    assert.equal(team.scoutSeat, 'designer');
    assert.equal(team.deals.driver, null);
    assert.equal(team.deals.mechanic, null);
    assert.ok(team.deals.designer !== null);
  }
  assert.equal(next.lastRace?.repossessed, false);
  assert.deepEqual(JSON.parse(JSON.stringify(next)), next);
});
