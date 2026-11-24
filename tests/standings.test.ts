import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SEED } from '../src/world/environment.ts';
import { createState, debugOf } from '../src/play/state.ts';
import type { Race } from '../src/play/player.ts';
import { STILL } from '../src/sim/hands.ts';
import { SHIELD } from '../src/sim/tuning.ts';
import { PLAYER } from '../src/sim/match.ts';
import { watersAt } from '../src/sim/waters.ts';
import { LIVERY } from '../src/world/livery.ts';
import { landOf, planetOf } from '../src/world/land.ts';
import { setupOf, EVEN_SHIP } from './setups.ts';

const planet = planetOf(SEED, landOf(SEED)),
  waters = watersAt(planet);
function begun() {
  const race = setupOf(SEED, { teams: 6, player: true }),
    state = createState(waters, planet.start, EVEN_SHIP);
  state.start(race, [LIVERY]);
  return { race, state };
}
function sound(r: Race, ships: number) {
  assert.equal(r.of, ships);
  const places = [r.place, ...r.mates.map((m) => m.place)];
  assert.equal(new Set(places).size, places.length);
  assert.ok(places.every((p) => p >= 1 && p <= ships));
  for (const m of r.mates) assert.ok(m.hull >= 0 && m.hull <= m.hullMax);
}

test('at anchor there is no race to read', () => {
  const state = createState(waters, planet.start, EVEN_SHIP);
  state.step(STILL);
  assert.equal(state.race(PLAYER), null);
});

test('as a race begins: its team, its mate whole', () => {
  const { race, state } = begun();
  state.step(STILL);
  const r = state.race(PLAYER);
  assert.ok(r);
  sound(r, race.ships.length);
  assert.equal(r.team, 0);
  assert.deepEqual(
    r.mates.map((m) => m.id),
    [1]
  );
  for (const m of r.mates) {
    assert.deepEqual(
      [m.hull, m.hullMax, m.shieldMax],
      [EVEN_SHIP.hullPoints, EVEN_SHIP.hullPoints, SHIELD.most]
    );
  }
  assert.equal(state.race(PLAYER), r);
  const other = state.race(5);
  assert.ok(other);
  assert.equal(other.team, 2);
  assert.deepEqual(
    other.mates.map((m) => m.id),
    [4]
  );
});

test('a mate sunk: no hull, and placed last', () => {
  const { race, state } = begun();
  state.step(STILL);
  debugOf(state).sink(1, 5);
  state.step(STILL);
  const r = state.race(PLAYER);
  assert.ok(r);
  sound(r, race.ships.length);
  const mate = r.mates.find((m) => m.id === 1);
  assert.deepEqual([mate?.hull, mate?.place], [0, race.ships.length]);
});

test('through a whole race the standings hold, and at its end they are the result', () => {
  const { race, state } = begun();
  for (let tick = 1; !state.done(); tick++) {
    state.step(STILL);
    if (tick % 90 !== 0) continue;
    const r = state.race(PLAYER);
    assert.ok(r);
    sound(r, race.ships.length);
  }
  const r = state.race(PLAYER),
    result = state.result();
  assert.ok(r);
  sound(r, race.ships.length);
  assert.equal(r.place, result.ships[PLAYER].place);
  for (const m of r.mates) assert.equal(m.place, result.ships[m.id].place);
});
