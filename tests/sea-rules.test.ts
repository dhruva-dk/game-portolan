import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMatch, debugOf, type Match } from '../src/sim/engine.ts';
import { STILL, type Hands } from '../src/sim/hands.ts';
import { PLAYER } from '../src/sim/match.ts';
import type { ShipValues } from '../src/sim/setup.ts';
import { calm, type Storm } from '../src/sim/storm.ts';
import { watersAt } from '../src/sim/waters.ts';
import { SEED } from '../src/world/environment.ts';
import { landOf, planetOf } from '../src/world/land.ts';
import { scale } from '../src/world/sphere.ts';
import { EVEN_SHIP, TENDED, UNTENDED, setupOf } from './setups.ts';

const planet = planetOf(SEED, landOf(SEED)),
  waters = watersAt(planet);
const SECOND = 30;

const stormy =
  (until: number) =>
  (t: number): Storm => {
    const far = scale(planet.start.at, -1);
    return t < until
      ? {
          ...calm(far),
          radius: 1e-6,
          next: { center: far, radius: 1e-6 },
          damage: 0.1,
        }
      : calm(far);
  };

function duel(values: ShipValues = EVEN_SHIP, hurt = 0): Match {
  const m = createMatch(
    setupOf(SEED, { teams: 2, perTeam: 1, player: true, values }),
    waters
  );
  if (hurt > 0) debugOf(m).rig({ storm: stormy(hurt) });
  return m;
}

const sail = (m: Match, seconds: number, hands: Hands = STILL) => {
  for (let i = 0; i < Math.round(seconds * SECOND); i++) m.step(hands);
};

const crew = (m: Match) => m.view.crew(PLAYER);

test('Hands.heal uses the heal in that slot: the hull mends once its heal time is up; without it, none is used', () => {
  const hurt = () => {
    const m = duel(EVEN_SHIP, 2);
    sail(m, 2.5);
    debugOf(m).strew(m.view.mine()!.ship.at, ['epic']);
    m.step(STILL);
    assert.deepEqual(crew(m).hold.items, ['epic', null, null]);
    return m;
  };
  const idle = hurt(),
    before = crew(idle).health.hull;
  assert.ok(before < EVEN_SHIP.hullPoints);
  sail(idle, EVEN_SHIP.healTime + 1);
  assert.equal(crew(idle).health.hull, before);
  assert.deepEqual(crew(idle).hold.items, ['epic', null, null]);
  const used = hurt();
  used.step({ ...STILL, heal: 0 });
  assert.ok(crew(used).hold.using);
  sail(used, EVEN_SHIP.healTime - 0.2);
  assert.equal(crew(used).health.hull, before, 'not yet');
  sail(used, 0.4);
  assert.ok(crew(used).health.hull > before);
  assert.deepEqual(crew(used).hold.items, [null, null, null]);
});

test('at sea, its shield fills from nothing on its own water, faster for the best-tended ship than the worst-tended one', () => {
  const after = (values: ShipValues) => {
    const m = duel(values);
    assert.equal(crew(m).health.shield, 0);
    sail(m, 4);
    return crew(m).health.shield;
  };
  const slow = after(UNTENDED),
    quick = after(TENDED);
  assert.ok(slow > 0 && quick > slow, `${slow} ${quick}`);
});
