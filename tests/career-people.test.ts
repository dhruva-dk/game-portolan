import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  aged,
  currentStats,
  drawnPeak,
  drawnWants,
  form,
  generateOwner,
  generatePerson,
  peakStat,
  retires,
  rookie,
  shape,
  stars,
  wantsOf,
} from '../src/career/rules/person.ts';
import {
  ask,
  askingWage,
  eligible,
  expectedReputation,
  standardClause,
  standingScore,
} from '../src/career/rules/hiring.ts';
import { income, starMerit } from '../src/career/rules/money.ts';
import { DRIVER_STATS, ROLES, STATS } from '../src/career/state.ts';
import {
  AGEING,
  ECONOMY,
  HEADCOUNT,
  NEGOTIATION,
  OWNERS,
  PERSON,
  STARS,
  STAT_SPAN,
  WANTS,
} from '../src/career/tuning.ts';

const SEEDS = ['test', 'portolan', 'saltgull'];
const IDS = Array.from({ length: 60 }, (_, i) => i);
const LOW = STAT_SPAN.least;
const HIGH = STAT_SPAN.most;
const ORIGIN = { level: HEADCOUNT.freeAgentLevel, age: HEADCOUNT.freeAgentAge };
const near = (a: number, b: number) =>
  assert.ok(Math.abs(a - b) < 1e-9, `${a} ≈ ${b}`);
const within = (x: number, lo: number, hi: number, what = '') =>
  assert.ok(x >= lo && x <= hi, `${what} ${x} in [${lo}, ${hi}]`);

test('stars are the mean stat over four in halves, 0 to 5', () => {
  const step = 1 / STARS.steps;
  assert.equal(stars([LOW, LOW, LOW]), 0);
  assert.equal(stars([HIGH, HIGH, HIGH, HIGH, HIGH]), STARS.most);
  assert.equal(stars([STARS.perStar, STARS.perStar]), 1);
  assert.equal(stars([STARS.perStar * 1.5, STARS.perStar * 1.5]), 1 + step);
  assert.equal(stars([6, 5]), 1);
  assert.equal(stars([STARS.perStar * 2 - 1, STARS.perStar * 2]), 1 + step);
  assert.equal(stars([3, 4, 4, 5]), 1);
});

test('the shape sums to zero with largest magnitude one, or is all zero', () => {
  const z = shape([0.5, -0.2, 0.1, 0.9]);
  near(
    z.reduce((s, x) => s + x, 0),
    0
  );
  near(Math.max(...z.map(Math.abs)), 1);
  assert.deepEqual(shape([0.3, 0.3, 0.3]), [0, 0, 0]);
  assert.deepEqual(shape([-1, 1]), [-1, 1]);
});

test('a peak stat is L plus reach × k × z, rounded and clamped to 1 to 20', () => {
  assert.equal(peakStat(10, 1, 1), 10 + PERSON.reach);
  assert.equal(peakStat(10, 1, -1), 10 - PERSON.reach);
  assert.equal(peakStat(10, 0, 1), 10);
  assert.equal(peakStat(10.4, 0.5, 0), 10);
  assert.equal(peakStat(HIGH, 1, 1), HIGH);
  assert.equal(peakStat(LOW, 1, -1), LOW);
  assert.equal(peakStat(LOW - 5, 0, 0), LOW);
});

test('drawn peaks stay in the stat range and come from person keys', () => {
  for (const seed of SEEDS)
    for (const id of IDS) {
      const peak = drawnPeak(seed, id, 6, { lo: 3, hi: 17 });
      assert.equal(peak.length, 6);
      for (const stat of peak) {
        assert.ok(Number.isInteger(stat));
        within(stat, LOW, HIGH);
      }
      assert.ok(Math.max(...peak) <= 17 + PERSON.reach);
      assert.ok(Math.min(...peak) >= 3 - PERSON.reach);
      assert.deepEqual(drawnPeak(seed, id, 6, { lo: 3, hi: 17 }), peak);
    }
  assert.notDeepEqual(
    drawnPeak('test', 1, 6, { lo: 3, hi: 17 }),
    drawnPeak('test', 2, 6, { lo: 3, hi: 17 })
  );
});

test('form rises to the peak age, holds for the prime years, then declines', () => {
  const peakAge = 28;
  near(form(peakAge - 1, peakAge), 1 - AGEING.young.perYear);
  near(form(peakAge - 4, peakAge), 1 - 4 * AGEING.young.perYear);
  assert.equal(form(0, peakAge), AGEING.young.floor);
  assert.equal(form(peakAge, peakAge), 1);
  assert.equal(form(peakAge + AGEING.prime, peakAge), 1);
  near(form(peakAge + AGEING.prime + 1, peakAge), 1 - AGEING.old.perYear);
  near(form(peakAge + AGEING.prime + 5, peakAge), 1 - 5 * AGEING.old.perYear);
  assert.equal(form(peakAge + 100, peakAge), AGEING.old.floor);
});

test('current stats scale the peak by form, rounded and clamped', () => {
  const peakAge = 28;
  assert.deepEqual(currentStats([20, 10, 1], peakAge, peakAge), [20, 10, 1]);
  assert.deepEqual(currentStats([20, 10, 1], peakAge - 2, peakAge), [18, 9, 1]);
  assert.deepEqual(currentStats([20, 10, 1], 0, peakAge), [10, 5, 1]);
  assert.deepEqual(
    currentStats([20, 10, 1], peakAge + 100, peakAge),
    [6, 3, 1]
  );
  assert.deepEqual(currentStats([1, 1], peakAge + 100, peakAge), [LOW, LOW]);
});

test('ageing adds a year and recomputes the stats; retirement is at the retirement age', () => {
  const person = generatePerson('test', 5, 'designer', ORIGIN);
  const young = { ...person, age: person.peakAge - 3 };
  const older = aged(young);
  assert.equal(older.age, young.age + AGEING.perStop);
  assert.deepEqual(older.peak, young.peak);
  assert.deepEqual(
    older.stats,
    currentStats(young.peak, older.age, young.peakAge)
  );
  assert.equal(retires({ ...person, age: person.retireAge - 1 }), false);
  assert.equal(retires({ ...person, age: person.retireAge }), true);
  assert.equal(retires(aged({ ...person, age: person.retireAge - 1 })), true);
  const peaked = { ...person, age: person.peakAge + AGEING.prime - 1 };
  assert.deepEqual(aged(peaked).stats, person.peak);
  const declining = aged({ ...person, age: person.peakAge + AGEING.prime + 2 });
  assert.ok(declining.stats.every((s, i) => s <= person.peak[i]));
});

test('a person is generated with every field in its range', () => {
  for (const seed of SEEDS)
    for (const role of ROLES)
      for (const id of IDS) {
        const p = generatePerson(seed, id, role, ORIGIN);
        assert.equal(p.id, id);
        assert.equal(p.role, role);
        assert.equal(p.peak.length, STATS[role].length);
        assert.equal(p.stats.length, STATS[role].length);
        assert.deepEqual(p.stats, currentStats(p.peak, p.age, p.peakAge));
        for (const stat of [...p.peak, ...p.stats]) within(stat, LOW, HIGH);
        within(p.peakAge, PERSON.peakAge.lo, PERSON.peakAge.hi, 'peak age');
        within(p.retireAge, PERSON.retireAge.lo, PERSON.retireAge.hi, 'retire');
        within(p.age, ORIGIN.age.lo, ORIGIN.age.hi, 'age');
        assert.ok(p.age < p.retireAge);
        for (const n of [p.age, p.peakAge, p.retireAge, p.portrait])
          assert.ok(Number.isInteger(n));
        assert.equal(p.contract, null);
        assert.ok(p.name.length > 0);
        assert.deepEqual(generatePerson(seed, id, role, ORIGIN), p);
      }
});

test('an age at or above the retirement age is set to one below it', () => {
  for (const id of IDS) {
    const p = generatePerson('test', id, 'driver', {
      level: ORIGIN.level,
      age: { lo: PERSON.retireAge.hi, hi: PERSON.retireAge.hi },
    });
    assert.equal(p.age, p.retireAge - HEADCOUNT.belowRetirement);
  }
});

test('a rookie is 18 to 21', () => {
  for (const role of ROLES)
    for (const id of IDS) {
      const p = rookie('test', id, role);
      within(p.age, AGEING.rookieAge.lo, AGEING.rookieAge.hi, 'rookie age');
      assert.equal(p.role, role);
    }
});

test('what a person wants is drawn within its ranges and sums to 1', () => {
  assert.deepEqual(wantsOf(0.5, 0.3), {
    money: 0.5,
    standing: 0.3,
    security: 1 - 0.5 - 0.3,
  });
  for (const seed of SEEDS)
    for (const id of IDS) {
      const { wants, preferred, wageFactor } = drawnWants(seed, id);
      within(wants.money, WANTS.money.lo, WANTS.money.hi, 'money');
      within(
        wants.standing,
        WANTS.leastStanding,
        WANTS.standingAndMoney - wants.money,
        'standing'
      );
      near(wants.money + wants.standing + wants.security, 1);
      assert.ok(wants.security >= 1 - WANTS.standingAndMoney - 1e-9);
      assert.ok(WANTS.preferred.includes(preferred));
      within(wageFactor, WANTS.wageFactor.lo, WANTS.wageFactor.hi, 'factor');
    }
});

test('the asking wage is the wage share of income at the stars’ merit, split three ways, × f on the 10 grid', () => {
  for (let half = 0; half <= 2 * STARS.most; half++) {
    const starCount = half / 2;
    const share = (ECONOMY.wages * income(starMerit(starCount))) / ROLES.length;
    for (const f of [WANTS.wageFactor.lo, 1, WANTS.wageFactor.hi])
      assert.equal(
        askingWage(starCount, f),
        Math.round((share * f) / WANTS.askStep) * WANTS.askStep
      );
  }
  assert.deepEqual(
    [0, 1, 2, 3, 4, 5].map((starCount) => askingWage(starCount, 1)),
    [170, 270, 570, 1070, 1770, 2670]
  );
  assert.equal(askingWage(STARS.most, WANTS.wageFactor.hi), 3470);
  assert.ok(
    askingWage(STARS.most, WANTS.wageFactor.hi) <= NEGOTIATION.wage.most
  );
  const p = generatePerson('test', 3, 'mechanic', ORIGIN);
  assert.equal(ask(p), askingWage(stars(p.stats), p.wageFactor));
  for (const id of IDS) {
    const wage = ask(generatePerson('test', id, 'driver', ORIGIN));
    assert.equal(wage % WANTS.askStep, 0);
    within(wage, NEGOTIATION.wage.least, NEGOTIATION.wage.most);
  }
});

test('expected reputation, standing score and eligibility', () => {
  assert.equal(expectedReputation(0), WANTS.expectedWorst);
  assert.equal(
    expectedReputation(STARS.most),
    WANTS.expectedWorst - WANTS.expectedSpan
  );
  assert.equal(standingScore(0, 40), 1);
  assert.equal(standingScore(STARS.most, 40), WANTS.standingScore.lo);
  assert.equal(standingScore(0, 1), WANTS.standingScore.hi);
  near(standingScore(STARS.most, 11), 0.5);
  assert.equal(eligible(STARS.most, 11), true);
  assert.equal(eligible(STARS.most, 11.01), false);
  assert.equal(eligible(0, 40), true);
});

test('the standard clause is ten races of the wage, rounded up to 500', () => {
  const step = NEGOTIATION.clause.step;
  assert.equal(standardClause(0), 0);
  assert.equal(standardClause(10), step);
  assert.equal(standardClause(step / NEGOTIATION.standardClauseRaces), step);
  assert.equal(
    standardClause(step / NEGOTIATION.standardClauseRaces + 10),
    2 * step
  );
  assert.equal(standardClause(9750), 97500);
});

test('an owner has an id, a name, a portrait and six peak driver stats, and nothing else', () => {
  for (const seed of SEEDS)
    for (const id of IDS) {
      const owner = generateOwner(seed, id);
      assert.deepEqual(Object.keys(owner).sort(), [
        'id',
        'name',
        'portrait',
        'stats',
      ]);
      assert.equal(owner.id, id);
      assert.equal(owner.stats.length, DRIVER_STATS.length);
      for (const stat of owner.stats) within(stat, LOW, HIGH);
      assert.deepEqual(
        owner.stats,
        drawnPeak(seed, id, DRIVER_STATS.length, OWNERS.level)
      );
      assert.deepEqual(generateOwner(seed, id), owner);
    }
});
