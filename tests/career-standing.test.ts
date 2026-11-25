import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newCareer } from '../src/career/apply.ts';
import {
  placePoints,
  racesDone,
  reputation,
  reputationOf,
  reputations,
  shipPoints,
  standingOf,
  standingOrder,
  standings,
  teamPoints,
  type Table,
} from '../src/career/rules/standing.ts';
import type { CareerState } from '../src/career/state.ts';
import { LEAGUE, POINTS, STANDING } from '../src/career/tuning.ts';

const SHIPS = LEAGUE.teams * LEAGUE.shipsPerTeam;
const STATE = newCareer({
  seed: 'test',
  name: 'Gull Racing',
  livery: { dye: 0, pattern: 0 },
  emblem: 0,
});

test('place points follow their table at every edge', () => {
  assert.equal(placePoints(1), POINTS.podium[0]);
  assert.equal(placePoints(2), POINTS.podium[1]);
  assert.equal(placePoints(3), POINTS.podium[2]);
  assert.equal(placePoints(4), POINTS.scoringFrom - 4);
  assert.equal(placePoints(4), 37);
  assert.equal(placePoints(POINTS.lastScoring), 1);
  assert.equal(placePoints(POINTS.lastScoring + 1), 0);
  assert.equal(placePoints(SHIPS), 0);
  for (let place = 1; place < SHIPS; place++)
    assert.ok(placePoints(place) >= placePoints(place + 1), `${place}`);
});

test('each sinking scores two more, and a team sums both ships', () => {
  assert.equal(shipPoints({ place: 1, sinkings: 0 }), POINTS.podium[0]);
  assert.equal(
    shipPoints({ place: 1, sinkings: 3 }),
    POINTS.podium[0] + 3 * POINTS.perSinking
  );
  assert.equal(shipPoints({ place: SHIPS, sinkings: 1 }), POINTS.perSinking);
  assert.equal(
    teamPoints([
      { place: 2, sinkings: 1 },
      { place: 40, sinkings: 0 },
    ]),
    POINTS.podium[1] + POINTS.perSinking + 1
  );
  assert.equal(teamPoints([]), 0);
});

const table = (
  points: number[],
  bestPlace: number[],
  previousStanding: number[]
): Table => ({ points, bestPlace, previousStanding });

test('a new career stands in the generated order, yours 40th', () => {
  assert.deepEqual(standings(STATE), STATE.previousStanding);
  assert.equal(standingOf(STATE, 0), LEAGUE.teams);
  assert.equal(standingOf(STATE, 1), 1);
  assert.deepEqual(standingOrder(STATE), [
    ...STATE.teams.map((_, t) => t).slice(1),
    0,
  ]);
});

test('standing is by points, then best place, then last season, in that order', () => {
  const none = STANDING.noRaceYet;
  assert.deepEqual(
    standings(table([10, 20, 30], [1, 1, 1], [1, 2, 3])),
    [3, 2, 1]
  );
  assert.deepEqual(
    standings(table([30, 30, 30], [5, 2, 9], [1, 2, 3])),
    [2, 1, 3]
  );
  assert.deepEqual(
    standings(table([30, 30, 30], [4, 4, 4], [3, 1, 2])),
    [3, 1, 2]
  );
  assert.deepEqual(
    standings(table([31, 30, 30], [40, 1, 1], [3, 2, 1])),
    [1, 3, 2]
  );
  assert.deepEqual(
    standings(table([0, 0, 0], [none, 80, none], [1, 3, 2])),
    [2, 1, 3]
  );
  assert.deepEqual(standings(table([0, 0], [none, none], [2, 1])), [2, 1]);
});

test('reputation moves from last season toward the standing by races done over ten', () => {
  assert.equal(reputation(40, 1, 0), 40);
  assert.equal(reputation(40, 1, LEAGUE.racesPerSeason), 1);
  assert.equal(reputation(40, 20, 5), 30);
  assert.equal(reputation(10, 30, 1), 12);
  assert.equal(reputation(7, 7, 4), 7);
});

test('races done is race − 1 ashore and at sea, and ten in the off-season', () => {
  assert.equal(racesDone({ race: 1, phase: 'lobby' }), 0);
  assert.equal(racesDone({ race: 3, phase: 'racing' }), 2);
  assert.equal(racesDone({ race: LEAGUE.racesPerSeason, phase: 'lobby' }), 9);
  assert.equal(
    racesDone({ race: LEAGUE.racesPerSeason, phase: 'offseason' }),
    LEAGUE.racesPerSeason
  );
});

test('every team in a new career has its generated standing as reputation', () => {
  assert.deepEqual(reputations(STATE), STATE.previousStanding);
  assert.equal(reputationOf(STATE, 0), LEAGUE.teams);
  const points = STATE.points.map((_, t) => (t === 0 ? 100 : 0));
  const climbed = { ...STATE, points, race: 6 };
  assert.equal(standingOf(climbed, 0), 1);
  assert.equal(reputationOf(climbed, 0), reputation(LEAGUE.teams, 1, 5));
  const finished: CareerState = { ...climbed, phase: 'offseason' };
  assert.equal(reputationOf(finished, 0), 1);
});
