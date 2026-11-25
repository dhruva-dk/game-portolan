import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  STANDINGS,
  income,
  leagueIncome,
  levelMerit,
  parLevel,
  parStars,
  placeMerit,
  standingMerit,
  starMerit,
} from '../src/career/rules/money.ts';
import { ECONOMY, LEAGUE, SHIPS, STARS } from '../src/career/tuning.ts';

const close = (actual: number, expected: number, within: number, note = '') =>
  assert.ok(
    Math.abs(actual - expected) <= within,
    `${note} ${actual} is not within ${within} of ${expected}`
  );

test('the four income shares sum to 1', () => {
  const { place, season, sponsors, deeds } = ECONOMY.shares;
  close(place + season + sponsors + deeds, 1, 1e-12);
});

test('the four merits run from 0 to 1 at their ends', () => {
  const ships = LEAGUE.teams * LEAGUE.shipsPerTeam;
  assert.equal(standingMerit(LEAGUE.teams), 0);
  assert.equal(standingMerit(1), 1);
  assert.equal(placeMerit(ships), 0);
  assert.equal(placeMerit(1), 1);
  assert.equal(starMerit(0), 0);
  assert.equal(starMerit(STARS.most), 1);
  assert.equal(levelMerit(SHIPS.leastLevel), 0);
  assert.equal(levelMerit(ECONOMY.parTop), 1);
});

test('par is the merit read back as stars and as a level', () => {
  for (const standing of STANDINGS) {
    const merit = standingMerit(standing);
    close(starMerit(parStars(merit)), merit, 1e-12);
    close(levelMerit(parLevel(merit)), merit, 1e-12);
  }
});

test('income runs from the floor at merit 0 to the floor and rise at merit 1, rising with every standing', () => {
  const { floor, rise } = ECONOMY.income;
  assert.equal(income(0), floor);
  assert.equal(income(1), floor + rise);
  for (const standing of STANDINGS.slice(1))
    assert.ok(
      income(standingMerit(standing)) < income(standingMerit(standing - 1))
    );
});

test('league income is the sum of income over the standings', () => {
  const sum = STANDINGS.reduce(
    (total, standing) => total + income(standingMerit(standing)),
    0
  );
  close(leagueIncome(), sum, 1e-9);
  close(leagueIncome(), 242564, 1);
});
