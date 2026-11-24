import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SEED } from '../src/world/environment.ts';
import { createState, debugOf } from '../src/play/state.ts';
import type { Race } from '../src/play/player.ts';
import { STILL } from '../src/sim/hands.ts';
import { HEALTH } from '../src/sim/handling.ts';
import { PLAYER } from '../src/sim/match.ts';
import { watersAt } from '../src/sim/waters.ts';
import { LIVERY } from '../src/world/livery.ts';
import { landOf, planetOf } from '../src/world/land.ts';
import { setupOf } from './setups.ts';

const planet = planetOf(SEED, landOf(SEED)),
  waters = watersAt(planet);
function begun() {
  const race = setupOf(SEED, { teams: 6, player: true }),
    state = createState(waters, planet.start);
  state.start(race, [LIVERY]);
  return { race, state };
}
function sound(r: Race, ships: number) {
  assert.equal(r.of, ships);
  assert.deepEqual(
    r.tower.map((p) => p.place),
    Array.from({ length: ships }, (_, i) => i + 1)
  );
  assert.equal(new Set(r.tower.map((p) => p.id)).size, ships);
  const first = r.tower.findIndex((p) => !p.afloat);
  assert.ok(
    first < 0 || r.tower.slice(first).every((p) => !p.afloat),
    'the afloat first'
  );
  assert.equal(r.tower.find((p) => p.id === PLAYER)?.place, r.place);
  for (const m of r.mates) {
    assert.equal(r.tower[m.place - 1].id, m.id);
    assert.equal(m.doing === 'sunk', !r.tower[m.place - 1].afloat);
    assert.ok(m.hull >= 0 && m.hull <= m.hullMax);
  }
}

test('at anchor there is no race to read', () => {
  const state = createState(waters, planet.start);
  state.step(STILL);
  assert.equal(state.race(PLAYER), null);
});

test('as a race begins: its team, its mate whole and afloat, every ship in the standings', () => {
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
      [HEALTH.hull, HEALTH.hull, HEALTH.shield]
    );
    assert.notEqual(m.doing, 'sunk');
  }
  assert.ok(r.tower.every((p) => p.afloat && p.sinkings === 0));
  assert.deepEqual(
    r.tower.map((p) => p.team),
    r.tower.map((p) => race.ships[p.id].team)
  );
  assert.equal(state.race(PLAYER), r);
  const other = state.race(5);
  assert.ok(other);
  assert.equal(other.team, 2);
  assert.deepEqual(
    other.mates.map((m) => m.id),
    [4]
  );
});

test('a mate sunk, and the ship that sank it credited and placed first', () => {
  const { race, state } = begun();
  state.step(STILL);
  debugOf(state).sink(1, 5);
  state.step(STILL);
  const r = state.race(PLAYER);
  assert.ok(r);
  sound(r, race.ships.length);
  const mate = r.mates.find((m) => m.id === 1);
  assert.deepEqual(
    [mate?.doing, mate?.hull, mate?.place],
    ['sunk', 0, race.ships.length]
  );
  assert.deepEqual(r.tower[0], {
    id: 5,
    team: 2,
    place: 1,
    afloat: true,
    sinkings: 1,
  });
  assert.equal(r.tower[r.of - 1].id, 1);
});

test('through a whole race the standings hold, and at its end they are the result', () => {
  const { race, state } = begun();
  const seen = new Set<string>();
  for (let tick = 1; !state.done(); tick++) {
    state.step(STILL);
    if (tick % 90 !== 0) continue;
    const r = state.race(PLAYER);
    assert.ok(r);
    sound(r, race.ships.length);
    for (const m of r.mates) seen.add(m.doing);
  }
  const r = state.race(PLAYER),
    result = state.result();
  assert.ok(r);
  sound(r, race.ships.length);
  assert.deepEqual(
    r.tower.map((p) => p.place),
    r.tower.map((p) => result.ships[p.id].place)
  );
  for (const p of r.tower)
    assert.equal(p.sinkings, result.ships[p.id].sinkings);
  assert.ok(seen.has('sailing') && seen.size >= 3, [...seen].join(' '));
});
