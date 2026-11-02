// What captains learn of the player's way with the Storm, and what they do with it: the habit is kept in seconds out
// in the Storm each time it catches the player, and a captain sure of a player who lingers waits at the edge for them.
// And whole matches of captains alone: how long they last, and that no captain sits aground.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { think } from '../../src/sim/captains/brain.ts';
import { watch } from '../../src/sim/captains/learning.ts';
import { aground } from '../../src/sim/environment.ts';
import { createMatch, over, step } from '../../src/sim/match.ts';
import { v3 } from '../../src/sim/math.ts';
import { draftOf } from '../../src/sim/sailing.ts';
import { along, surfaceDistance, tangentAt } from '../../src/sim/sphere.ts';
import { PHASE, PLAYER, SHIPS, TICK, copy, type MatchState } from '../../src/sim/state.ts';
import { calmNow, inStorm } from '../../src/sim/storm.ts';
import { ITEM } from '../../src/sim/tables.ts';
import { quietMatch } from './fixture.ts';

/** Puts ship i `d` metres from the calm's centre (past its edge when d is more than its radius), on bearing b: open water across the edge for seed 5. */
function atEdge(state: MatchState, i: number, d: number, b = 4.6): void {
  const calm = calmNow(state), T = v3(), ship = state.ships[i];
  tangentAt(calm.at, b, T);
  along(calm.at, T, d, ship.pos);
  copy(ship.was, ship.pos);
}

/** Ship 1 as a hunting captain with a cannon, the player 40 m out in the Storm and the captain 70 m inside its edge. */
function standoff(storm: { value: number; confidence: number }): MatchState {
  const state = quietMatch({ seed: 5 });
  // everyone else far round the planet, out of sight
  for (let i = 2; i < state.ships.length; i++) atEdge(state, i, 4000 + 300 * i, 2.5);
  const c = state.ships[1].captain;
  Object.assign(c, { on: true, watches: true, temperament: 0, skill: 0.9, aggro: 1, gentle: false, think: 1, storm: { ...storm } });
  state.ships[1].slots[0] = { ...state.ships[1].slots[0], kind: ITEM.cannon, n: 1 };
  const r = calmNow(state).r;
  atEdge(state, PLAYER, r + 40);
  atEdge(state, 1, r - 70);
  return state;
}

test('a captain learns how long the player stays out in the Storm, in seconds', () => {
  const state = quietMatch({ seed: 5 }), c = state.ships[1].captain;
  Object.assign(c, { on: true, watches: true });
  const r = calmNow(state).r, out = (s: number) => {
    atEdge(state, PLAYER, r + 30);
    assert.ok(inStorm(state, state.ships[PLAYER].pos));
    for (let k = 0; k < s / TICK; k++, state.tick++) watch(state, 1);
    atEdge(state, PLAYER, r - 30);
    for (let k = 0; k < 1 / TICK; k++, state.tick++) watch(state, 1);
  };
  out(8);
  assert.ok(Math.abs(c.storm.value - 8) <= 0.5, `first stretch: ${c.storm.value} s`);
  out(8);
  out(8);
  assert.ok(Math.abs(c.storm.value - 8) <= 0.5 && c.storm.confidence > 0.5, `sure of it: ${c.storm.value} s at ${c.storm.confidence.toFixed(2)}`);
});

test('a captain sure the player lingers in the Storm waits at its edge; one who is not chases them out into it', () => {
  const r0 = calmNow(standoff({ value: 0, confidence: 0 })).r;
  const goal = (storm: { value: number; confidence: number }) => {
    const state = standoff(storm);
    think(state, 1);
    const c = state.ships[1].captain;
    assert.equal(c.foe, PLAYER, 'it has seen the player');
    return { inside: !inStorm(state, c.goal), toPlayer: surfaceDistance(c.goal, state.ships[PLAYER].pos), fromCentre: surfaceDistance(c.goal, calmNow(state).at) };
  };
  const chases = goal({ value: 0, confidence: 0 });
  assert.ok(!chases.inside && chases.toPlayer < 1, 'a captain who knows nothing sails at the player');
  const quick = goal({ value: 1, confidence: 1 });
  assert.ok(!quick.inside, 'nor does one who knows the player is quick out of the Storm wait for them');
  const waits = goal({ value: 12, confidence: 0.8 });
  assert.ok(waits.inside, 'one sure the player lingers waits inside the calm');
  assert.ok(waits.fromCentre > r0 - 30 && waits.toPlayer < 80, `at the edge on the player's side (${waits.toPlayer.toFixed(0)} m from them, ${waits.fromCentre.toFixed(0)} of ${r0.toFixed(0)} m from the centre)`);
});

test('whole matches of captains last 8 to 14 minutes, and no captain stays aground for more than 10 s', (t) => {
  // seeds that once ran short, or left a captain on a flat, a beach or in a pool the tide closed round her
  for (const seed of [11, 14, 25, 47]) {
    const state = createMatch({ seed, fleet: Array.from({ length: SHIPS }, () => ({ captain: true })) });
    const ground = new Float64Array(SHIPS);
    let worst = 0;
    while (!over(state) && state.tick * TICK < 20 * 60) {
      step(state);
      for (let i = 0; i < SHIPS; i++) {
        const ship = state.ships[i];
        ground[i] = ship.phase === PHASE.sea && aground(state, ship.pos, draftOf(ship)) ? ground[i] + TICK : 0;
        worst = Math.max(worst, ground[i]);
      }
    }
    const minutes = (state.tick * TICK) / 60;
    t.diagnostic(`seed ${seed}: ${minutes.toFixed(1)} min, longest aground ${worst.toFixed(1)} s`);
    assert.ok(over(state) && minutes >= 8 && minutes <= 14, `seed ${seed} ends between 8 and 14 minutes in`);
    assert.ok(worst <= 10, `no captain in seed ${seed} sits aground for more than 10 s`);
  }
});
