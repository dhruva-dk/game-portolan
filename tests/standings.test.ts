import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SEED } from '../src/environment.ts';
import { raceOf, specField } from '../src/play/race.ts';
import { createState, debugOf, type Match } from '../src/play/state.ts';
import type { Race } from '../src/player.ts';
import { TEAM } from '../src/race.ts';
import { HEALTH } from '../src/sim/handling.ts';
import { PLAYER } from '../src/sim/match.ts';
import { chart } from '../src/sim/route.ts';
import { berthing } from '../src/sim/spawn.ts';
import { landOf, planetOf } from '../src/world/land.ts';
import type { Vec3 } from '../src/world/sphere.ts';
import { flat } from '../src/world/swell.ts';

const planet = planetOf(SEED, landOf(SEED)),
  depth = (p: Vec3) => -planet.height(p),
  waters = { chart: chart(depth), water: berthing(depth) };
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

test('a match with no card has no race to read', () => {
  const match: Match = { ...raceOf(specField(SEED, 3), planet) };
  delete match.card;
  const state = createState(planet, flat, waters, match);
  state.start(match);
  state.advance(IDLE.helm, IDLE.gun);
  assert.equal(state.race(PLAYER), null);
});

test('as a race begins: her team, her three teammates whole and afloat, every ship in the standings', () => {
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
    assert.notEqual(m.doing, 'sunk');
  }
  assert.ok(r.tower.every((p) => p.afloat && p.sinkings === 0));
  assert.deepEqual(
    r.tower.map((p) => p.team),
    r.tower.map((p) => Math.floor(p.id / TEAM))
  );
  assert.equal(state.race(PLAYER), r);
  const other = state.race(5);
  assert.ok(other);
  assert.equal(other.team, 1);
  assert.deepEqual(
    other.mates.map((m) => m.id),
    [4, 6, 7]
  );
});

test('a mate sunk, and the ship that sank her credited and placed first', () => {
  const { card, state } = begun();
  state.advance(IDLE.helm, IDLE.gun);
  debugOf(state).sink(2, 5);
  state.advance(IDLE.helm, IDLE.gun);
  const r = state.race(PLAYER);
  assert.ok(r);
  sound(r, card.ships.length);
  const mate = r.mates.find((m) => m.id === 2);
  assert.deepEqual(
    [mate?.doing, mate?.hull, mate?.place],
    ['sunk', 0, card.ships.length]
  );
  assert.deepEqual(r.tower[0], {
    id: 5,
    team: 1,
    place: 1,
    afloat: true,
    sinkings: 1,
  });
  assert.equal(r.tower[r.of - 1].id, 2);
});

test('through a whole race the standings hold, and at its end they are the result', () => {
  const { card, state } = begun();
  const seen = new Set<string>();
  for (let tick = 1; !state.result(); tick++) {
    state.advance(IDLE.helm, IDLE.gun);
    if (tick % 90 !== 0) continue;
    const r = state.race(PLAYER);
    assert.ok(r);
    sound(r, card.ships.length);
    for (const m of r.mates) seen.add(m.doing);
  }
  const r = state.race(PLAYER),
    result = state.result();
  assert.ok(r && result);
  sound(r, card.ships.length);
  assert.deepEqual(
    r.tower.map((p) => p.id),
    result.order
  );
  for (const p of r.tower)
    assert.equal(
      p.sinkings,
      result.sinkings.filter((s) => s.by === p.id).length
    );
  assert.ok(seen.has('sailing') && seen.size >= 3, [...seen].join(' '));
});
