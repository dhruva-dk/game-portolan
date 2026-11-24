import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fleetOf, naturesOf } from '../src/play/fleet.ts';
import { createMatches } from '../src/play/setup.ts';
import { createState, debugOf } from '../src/play/state.ts';
import { PLAYER, SHIPS } from '../src/sim/match.ts';
import { PERSONAS, TYPES, dealt } from '../src/sim/persona.ts';
import { chart } from '../src/sim/route.ts';
import { berthing } from '../src/sim/spawn.ts';
import { SEED } from '../src/world/environment.ts';
import { landOf, planetOf } from '../src/world/land.ts';
import { seedOf } from '../src/world/seeds.ts';
import type { Vec3 } from '../src/world/sphere.ts';
import { flat } from '../src/world/swell.ts';

test("the fleet the panel shows is the race's: its type, and every bot's nature as it is launched", () => {
  const planet = planetOf(SEED, landOf(SEED));
  const depth = (p: Vec3) => -planet.height(p);
  const race = createMatches(SEED, planet, null, null).race();
  const state = createState(
    planet,
    flat,
    { chart: chart(depth), water: berthing(depth) },
    race
  );
  state.start(race);
  const natures = naturesOf(SEED),
    fleet = fleetOf(SEED);
  assert.equal(natures.size, SHIPS - 1);
  assert.equal(natures.has(PLAYER), false, 'her ship is no bot');
  for (const [id, n] of natures)
    assert.deepEqual(debugOf(state).natureOf(id), n, `ship ${id}`);
  assert.equal(TYPES[fleet.type], race.type);
  const launched = PERSONAS.map(
    (p) =>
      [...natures.keys()].filter(
        (id) => debugOf(state).natureOf(id)?.persona === p
      ).length
  );
  assert.deepEqual(fleet.counts, launched);
});

test('a fleet is the same for a seed every time, and its numbers hold together', () => {
  for (const name of ['dogdog', '3', 'saltgull', 'tarbrig', 'a long seed']) {
    const seed = seedOf(name),
      fleet = fleetOf(seed);
    assert.deepEqual(fleetOf(seedOf(name.toUpperCase())), fleet, name);
    assert.equal(TYPES[fleet.type], dealt(seed));
    assert.equal(
      fleet.counts.reduce((a, b) => a + b, 0),
      SHIPS - 1
    );
    assert.equal(fleet.counts[fleet.common], Math.max(...fleet.counts));
    const natures = naturesOf(seed);
    const skills = [...natures.values()].map((n) => n.temper.skill);
    assert.equal(fleet.sharpest.by, Math.max(...skills));
    assert.equal(
      natures.get(fleet.sharpest.id)?.persona,
      PERSONAS[fleet.sharpest.persona]
    );
    assert.ok(natures.has(fleet.reckless.id));
    for (const t of [
      fleet.skill,
      fleet.aggression,
      fleet.notice,
      fleet.margin,
      fleet.flee,
    ]) {
      assert.ok(Number.isFinite(t.mean) && t.mean > 0, name);
      assert.ok(t.spread >= 0 && t.spread < t.mean, name);
    }
    assert.ok(fleet.skill.mean <= 1 && fleet.aggression.mean <= 1);
  }
  assert.notDeepEqual(fleetOf(seedOf('dogdog')), fleetOf(seedOf('catcat')));
});
