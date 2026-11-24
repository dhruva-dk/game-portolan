import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fleetOf, naturesOf } from '../src/play/fleet.ts';
import { createMatch, debugOf } from '../src/sim/engine.ts';
import { PLAYER } from '../src/sim/match.ts';
import { MIXED, PERSONAS, TYPES } from '../src/sim/persona.ts';
import { watersAt } from '../src/sim/waters.ts';
import { SEED } from '../src/world/environment.ts';
import { landOf, planetOf } from '../src/world/land.ts';
import { seedOf } from '../src/world/seeds.ts';
import { setupOf } from './setups.ts';

const raceOf = (seed: number) => setupOf(seed, { player: true });

test("the fleet the panel shows is the race's: its type, and every bot's nature as it is launched", () => {
  const planet = planetOf(SEED, landOf(SEED));
  const race = raceOf(SEED),
    match = createMatch(race, watersAt(planet));
  const natures = naturesOf(race),
    fleet = fleetOf(race);
  assert.equal(natures.size, race.ships.length - 1);
  assert.equal(natures.has(PLAYER), false, 'its ship is no bot');
  for (const [id, n] of natures)
    assert.deepEqual(debugOf(match).natureOf(id), n, `ship ${id}`);
  assert.equal(TYPES[fleet.type].name, MIXED.name);
  const launched = PERSONAS.map(
    (p) =>
      [...natures.keys()].filter(
        (id) => debugOf(match).natureOf(id)?.persona === p
      ).length
  );
  assert.deepEqual(fleet.counts, launched);
});

test('a fleet is the same for a seed every time, and its numbers hold together', () => {
  for (const name of ['dogdog', '3', 'saltgull', 'tarbrig', 'a long seed']) {
    const race = raceOf(seedOf(name)),
      fleet = fleetOf(race);
    assert.deepEqual(fleetOf(raceOf(seedOf(name.toUpperCase()))), fleet, name);
    assert.equal(TYPES[fleet.type].name, MIXED.name);
    assert.equal(
      fleet.counts.reduce((a, b) => a + b, 0),
      race.ships.length - 1
    );
    assert.equal(fleet.counts[fleet.common], Math.max(...fleet.counts));
    const natures = naturesOf(race);
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
  assert.notDeepEqual(
    fleetOf(raceOf(seedOf('dogdog'))),
    fleetOf(raceOf(seedOf('catcat')))
  );
});
