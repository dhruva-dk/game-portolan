// The race as its HUD reads it (player.ts Race, play/standings.ts): her teammates, the standings, her pit and her team's call, as
// plain data off the state of a carded race.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SEED } from '../src/environment.ts';
import { raceOf, specField } from '../src/play/race.ts';
import { createState, debugOf, type Match } from '../src/play/state.ts';
import { JOBS, type Race } from '../src/player.ts';
import { TEAM } from '../src/race.ts';
import { HEALTH } from '../src/sim/handling.ts';
import { PLAYER } from '../src/sim/match.ts';
import { PIT } from '../src/sim/pit.ts';
import { chart } from '../src/sim/route.ts';
import { berthing } from '../src/sim/spawn.ts';
import { NOTHING } from '../src/sim/stores.ts';
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
/** A race of three teams begun, her hands on ship 0, her pit crew twice as slow as spec and never slipping. */
function begun(storm = 3) {
  const base = specField(SEED, 3, true),
    card = {
      ...base,
      rules: { ...base.rules, storm },
      ships: base.ships.map((s) =>
        s.id === 0 ? { ...s, pit: { pace: 2, slip: 0 } } : s
      ),
    };
  const match = raceOf(card, planet),
    state = createState(planet, flat, waters, match);
  state.start(match);
  return { card, state };
}
const kit = JOBS.indexOf('kit');
/** What every reading holds to. */
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

test('as a race begins: her team and its call, her three teammates whole and afloat, every ship in the standings, her pit open at her berth', () => {
  const { card, state } = begun();
  state.advance(IDLE.helm, IDLE.gun);
  const r = state.race(PLAYER);
  assert.ok(r);
  sound(r, card.ships.length);
  assert.deepEqual([r.team, r.call], [0, 'free']);
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
  // her berth is her team's water: a stop may be asked; whole, with her gust
  // in hand, only a kit is to be had, at her own crew's pace
  assert.equal(r.pit.open, true);
  assert.equal(r.pit.stop, null);
  assert.deepEqual(
    r.pit.costs,
    JOBS.map((job) => (job === 'kit' ? PIT.kit * 2 : 0))
  );
  // one object, refilled: asked again in the step, the same
  assert.equal(state.race(PLAYER), r);
  // and read for another ship, hers
  const other = state.race(5);
  assert.ok(other);
  assert.equal(other.team, 1);
  assert.deepEqual(
    other.mates.map((m) => m.id),
    [4, 6, 7]
  );
  assert.equal(other.pit.costs[kit], PIT.kit);
});

test('her stop as she is served: the job in hand, the seconds left, and done', () => {
  const { state } = begun();
  state.advance(IDLE.helm, IDLE.gun, { ...NOTHING, pit: ['rigging', 'kit'] });
  let r = state.race(PLAYER);
  assert.ok(r?.pit.stop);
  assert.equal(r.pit.open, false, 'being served, no new stop');
  // (her rigging has nothing to do: passed over, the kit in hand)
  assert.deepEqual(
    [r.pit.stop.jobs, r.pit.stop.at, r.pit.stop.done, r.pit.stop.slips],
    [['rigging', 'kit'], 1, 0, 0]
  );
  assert.ok(Math.abs(r.pit.stop.left - (PIT.kit * 2 - 1 / 30)) < 1e-6);
  for (let k = 0; k < 150; k++) state.advance(IDLE.helm, IDLE.gun);
  r = state.race(PLAYER);
  assert.ok(r?.pit.stop);
  assert.ok(Math.abs(r.pit.stop.left - (PIT.kit * 2 - 151 / 30)) < 1e-6);
  for (let k = 0; k < 150; k++) state.advance(IDLE.helm, IDLE.gun);
  r = state.race(PLAYER);
  assert.ok(r);
  assert.equal(r.pit.stop, null, 'done');
  assert.equal(r.pit.open, true);
  assert.equal(state.crew(PLAYER).hold.items[0]?.kind, 'repairKit');
});

test("her team's call as she changes it; a mate sunk, and the ship that sank her credited and placed first", () => {
  const { card, state } = begun();
  state.advance(IDLE.helm, IDLE.gun, { ...NOTHING, call: 'hold' });
  let r = state.race(PLAYER);
  assert.equal(r?.call, 'hold');
  assert.equal(state.race(5)?.call, 'free', "another team's is its own");
  debugOf(state).sink(2, 5);
  state.advance(IDLE.helm, IDLE.gun);
  r = state.race(PLAYER);
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
