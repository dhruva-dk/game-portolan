import { test } from 'node:test';
import assert from 'node:assert/strict';
import { healRating, planetName, stormRating } from '../src/career/fit.ts';
import { RACE_RATINGS } from '../src/career/tuning.ts';
import { lobbyView } from '../src/career/views/lobby.ts';
import { planetView } from '../src/career/views/planet.ts';
import { rehearsed, wintered } from '../src/app/rehearse.ts';

test('the planet of the next race with its ratings out of five stars', () => {
  for (const races of [0, 1, 6]) {
    const state = rehearsed('planet', races);
    const view = planetView(state);
    assert.equal(view.name, planetName(state));
    assert.equal(view.storm, stormRating(state));
    assert.equal(view.heals, healRating(state));
    assert.equal(view.stars, 5);
    assert.deepEqual(view.livery, state.teams[0].livery);
    assert.ok(RACE_RATINGS.includes(view.storm as 1));
    assert.ok(RACE_RATINGS.includes(view.heals as 1));
  }
});

test('the planet screen and the next-race slip name the same race', () => {
  for (const state of [
    rehearsed('planet', 3),
    rehearsed('planet', 10),
    wintered(rehearsed('planet', 10)),
  ]) {
    const { next } = lobbyView(state);
    const view = planetView(state);
    assert.deepEqual(
      { planet: view.name, storm: view.storm, heals: view.heals },
      next
    );
  }
});

test('the planet changes from race to race', () => {
  const names = new Set(
    [0, 1, 2, 3].map((races) => planetView(rehearsed('planet', races)).name)
  );
  assert.ok(names.size > 1);
});
