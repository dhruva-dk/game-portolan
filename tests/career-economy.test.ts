import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCost,
  designGain,
  focusedRate,
  unfocusedRate,
  wintered,
  winteredFitted,
} from '../src/career/rules/development.ts';
import { askingWage } from '../src/career/rules/hiring.ts';
import {
  STANDINGS,
  income,
  leagueIncome,
  levelMerit,
  parLevel,
  parSea,
  parSinkings,
  parStars,
  placeMerit,
  placePrize,
  seaMoney,
  seasonPrize,
  sinkingMoney,
  sponsorBonus,
  sponsorFee,
  standingMerit,
  starMerit,
} from '../src/career/rules/money.ts';
import { LINES, ROLES } from '../src/career/state.ts';
import {
  BUILD,
  ECONOMY,
  LEAGUE,
  LEVEL_SPAN,
  RACE_MONEY,
  SHIPS,
  SPONSORS,
  STARS,
  STAT_SPAN,
  WANTS,
} from '../src/career/tuning.ts';

const SHIP_COUNT = LEAGUE.teams * LEAGUE.shipsPerTeam;
const PLACES = Array.from({ length: SHIP_COUNT }, (_, index) => index + 1);
const LEVELS = Array.from(
  { length: LEVEL_SPAN.most - SHIPS.leastLevel + 1 },
  (_, index) => SHIPS.leastLevel + index
);
const UPKEEPS = [
  null,
  ...Array.from(
    { length: STAT_SPAN.most - STAT_SPAN.least + 1 },
    (_, index) => STAT_SPAN.least + index
  ),
];
const parSkill = (merit: number): number => STAT_SPAN.most * merit;

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
  assert.equal(standingMerit(LEAGUE.teams), 0);
  assert.equal(standingMerit(1), 1);
  assert.equal(placeMerit(SHIP_COUNT), 0);
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

test('two ships at a place’s merit earn the place share of income, at every place', () => {
  for (const place of PLACES)
    close(
      LEAGUE.shipsPerTeam * placePrize(place),
      ECONOMY.shares.place * income(placeMerit(place)),
      LEAGUE.shipsPerTeam / 2,
      `place ${place}`
    );
});

test('ten races of the season share equal the season prize, at every standing', () => {
  for (const standing of STANDINGS)
    close(
      seasonPrize(standing),
      LEAGUE.racesPerSeason *
        ECONOMY.shares.season *
        income(standingMerit(standing)),
      0.5,
      `standing ${standing}`
    );
});

test('the whole sea and a race’s every sinking each pay half the deeds share of league income', () => {
  const half = (ECONOMY.shares.deeds * leagueIncome()) / 2;
  const whole = Array.from({ length: RACE_MONEY.seaSamples }, () => 1);
  close(seaMoney(whole), half, 0.5, 'sea');
  const sinkings = SHIP_COUNT - 1;
  close(sinkingMoney(sinkings), half, sinkings / 2, 'sinkings');
  close(seaMoney(whole) + sinkingMoney(sinkings), 2 * half, sinkings / 2 + 1);
});

test('three people of par stars at wage factor 1 ask the wage share of income, at every standing', () => {
  for (const standing of STANDINGS) {
    const merit = standingMerit(standing);
    close(
      ROLES.length * askingWage(parStars(merit), 1),
      ECONOMY.wages * income(merit),
      (ROLES.length * WANTS.askStep) / 2,
      `standing ${standing}`
    );
  }
});

test('ten races of unfocused gain from a designer of par skill equal winter’s design loss at par, and the focused line holds twice the height', () => {
  for (const standing of STANDINGS) {
    const merit = standingMerit(standing);
    const level = parLevel(merit);
    close(
      LEAGUE.racesPerSeason * designGain(parSkill(merit), unfocusedRate()),
      level - wintered(level, ECONOMY.winter),
      1e-9,
      `standing ${standing}`
    );
    const twice = SHIPS.leastLevel + 2 * (level - SHIPS.leastLevel);
    close(
      LEAGUE.racesPerSeason * designGain(parSkill(merit), focusedRate()),
      twice - wintered(twice, ECONOMY.winter),
      1e-9,
      `focused, standing ${standing}`
    );
  }
});

test('a build costs the same in one step as in two, within the rounding up of each step', () => {
  for (const fitted of LEVELS)
    for (const design of LEVELS.filter((level) => level > fitted)) {
      const middle = Math.floor((fitted + design) / 2);
      const split =
        buildCost(design, middle, null) + buildCost(middle, fitted, null);
      const whole = buildCost(design, fitted, null);
      assert.ok(
        split >= whole && split <= whole + 1,
        `${fitted} to ${design} through ${middle}`
      );
    }
});

test('one level costs the level-cost share of a race’s income at its merit, within the curve’s change over that level', () => {
  for (const level of LEVELS.slice(1)) {
    const cost = buildCost(level, level - 1, null);
    const below = ECONOMY.levelCost * income(levelMerit(level - 1));
    const at = ECONOMY.levelCost * income(levelMerit(level));
    assert.ok(cost >= below && cost <= Math.ceil(at), `level ${level}`);
  }
  close(buildCost(ECONOMY.parTop, SHIPS.leastLevel, null), 5100, 0);
});

test('a build’s cost falls by the thrift cut for each point of Thrift', () => {
  for (const design of LEVELS)
    for (let thrift = STAT_SPAN.least; thrift <= STAT_SPAN.most; thrift++) {
      const full = buildCost(design, SHIPS.leastLevel, null);
      close(
        buildCost(design, SHIPS.leastLevel, thrift),
        full * (1 - BUILD.thriftCut * thrift),
        1,
        `level ${design}, Thrift ${thrift}`
      );
    }
});

test('after winter no fitted level is above its design level, for every Upkeep and for none', () => {
  for (const design of LEVELS)
    for (const fitted of LEVELS)
      for (const upkeep of UPKEEPS)
        assert.ok(
          winteredFitted(fitted, design, upkeep) <=
            wintered(design, ECONOMY.winter),
          `fitted ${fitted}, design ${design}, Upkeep ${upkeep}`
        );
});

test('refitting winter’s loss with par staff, plus par wages, leaves a margin of at least 0.29 at every standing', () => {
  const ships = LEAGUE.shipsPerTeam * LINES.length;
  for (const standing of STANDINGS) {
    const merit = standingMerit(standing);
    const level = parLevel(merit);
    const upkeep = STARS.perStar * parStars(merit);
    const refit =
      (ships * buildCost(level, winteredFitted(level, level, upkeep), null)) /
      LEAGUE.racesPerSeason;
    const wages = ROLES.length * askingWage(parStars(merit), 1);
    const margin = 1 - (refit + wages) / income(merit);
    assert.ok(margin >= 0.29, `standing ${standing}: margin ${margin}`);
  }
});

test('three sponsors of wealth 1, each met half the time, pay the sponsors share of income, at every standing', () => {
  const { slots, bonus, step } = SPONSORS;
  for (const standing of STANDINGS) {
    const fee = sponsorFee(standing, 1);
    close(
      slots * (fee + ECONOMY.met * sponsorBonus(fee)),
      ECONOMY.shares.sponsors * income(standingMerit(standing)),
      (slots * (1 + bonus * ECONOMY.met) * step) / 2,
      `standing ${standing}`
    );
  }
});

test('the par figures of sinkings and sea, before rounding, sum over the standings to a race’s sinkings and the whole sea', () => {
  const sum = (f: (merit: number) => number) =>
    STANDINGS.reduce(
      (total, standing) => total + f(standingMerit(standing)),
      0
    );
  const sinkings = SHIP_COUNT - 1;
  close(sum(parSinkings), sinkings, 0.02 * sinkings, 'sinkings');
  close(sum(parSea), 100, 0.02 * 100, 'sea');
});
