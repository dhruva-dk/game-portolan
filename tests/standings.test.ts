import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SEED } from '../src/world/environment.ts';
import { raceOf, specField } from '../src/sim/racing.ts';
import { createState, debugOf } from '../src/play/state.ts';
import type { Match } from '../src/sim/engine.ts';
import type { Race } from '../src/play/player.ts';
import { HEALTH } from '../src/sim/handling.ts';
import { PLAYER } from '../src/sim/match.ts';
import { watersAt } from '../src/sim/waters.ts';
import { landOf, planetOf } from '../src/world/land.ts';
import type { Vec3 } from '../src/world/sphere.ts';
import { flat } from '../src/world/swell.ts';

const planet = planetOf(SEED, landOf(SEED)),
  depth = (p: Vec3) => -planet.height(p),
  waters = watersAt(depth);
const IDLE = {
  helm: { course: null, throttle: 0 },
  gun: { aim: null, fire: false },
};
function begun(storm = 3) {
  const base = specField(SEED, 3, true),
    card = { ...base, rules: { ...base.rules, storm } };
  const match = raceOf(card, planet),
    state = createState(planet, flat, waters, match);
  state.start(match);
  return { card, state };
}
function sound(r: Race, ships: number) {
  assert.equal(r.of, ships);
  const places = [r.place, ...r.mates.map((m) => m.place)];
  assert.equal(new Set(places).size, places.length);
  assert.ok(places.every((p) => p >= 1 && p <= ships));
  for (const m of r.mates) assert.ok(m.hull >= 0 && m.hull <= m.hullMax);
}

test('a match with no card has no race to read', () => {
  const match: Match = { ...raceOf(specField(SEED, 3), planet) };
  delete match.card;
  const state = createState(planet, flat, waters, match);
  state.start(match);
  state.advance(IDLE.helm, IDLE.gun);
  assert.equal(state.race(PLAYER), null);
});

test('as a race begins: its team, its three teammates whole', () => {
  const { card, state } = begun();
  state.advance(IDLE.helm, IDLE.gun);
  const r = state.race(PLAYER);
  assert.ok(r);
  sound(r, card.ships.length);
  assert.equal(r.team, 0);
  assert.deepEqual(
    r.mates.map((m) => m.id),
    [1, 2, 3]
  );
  for (const m of r.mates) {
    assert.deepEqual(
      [m.hull, m.hullMax, m.shieldMax],
      [HEALTH.hull, HEALTH.hull, HEALTH.shield]
    );
  }
  assert.equal(state.race(PLAYER), r);
  const other = state.race(5);
  assert.ok(other);
  assert.equal(other.team, 1);
  assert.deepEqual(
    other.mates.map((m) => m.id),
    [4, 6, 7]
  );
});

test('a mate sunk: no hull, and placed last', () => {
  const { card, state } = begun();
  state.advance(IDLE.helm, IDLE.gun);
  debugOf(state).sink(2, 5);
  state.advance(IDLE.helm, IDLE.gun);
  const r = state.race(PLAYER);
  assert.ok(r);
  sound(r, card.ships.length);
  const mate = r.mates.find((m) => m.id === 2);
  assert.deepEqual([mate?.hull, mate?.place], [0, card.ships.length]);
});

test('through a whole race the standings hold, and at its end they are the result', () => {
  const { card, state } = begun();
  for (let tick = 1; !state.result(); tick++) {
    state.advance(IDLE.helm, IDLE.gun);
    if (tick % 90 !== 0) continue;
    const r = state.race(PLAYER);
    assert.ok(r);
    sound(r, card.ships.length);
  }
  const r = state.race(PLAYER),
    result = state.result();
  assert.ok(r && result);
  sound(r, card.ships.length);
  assert.equal(r.place, result.order.indexOf(PLAYER) + 1);
  for (const m of r.mates)
    assert.equal(m.place, result.order.indexOf(m.id) + 1);
});
