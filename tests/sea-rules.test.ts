import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMatch, debugOf, type Match } from '../src/sim/engine.ts';
import { STILL, type Hands } from '../src/sim/hands.ts';
import { PLAYER } from '../src/sim/match.ts';
import type { ShipValues } from '../src/sim/setup.ts';
import { STEP } from '../src/sim/fixed.ts';
import type { Rarity } from '../src/sim/kinds.ts';
import { rulesOf } from '../src/sim/rules.ts';
import { calm, closings, planStorm, type Storm } from '../src/sim/storm.ts';
import { HEAL } from '../src/sim/tuning.ts';
import { watersAt } from '../src/sim/waters.ts';
import { SEED } from '../src/world/environment.ts';
import { landOf, planetOf } from '../src/world/land.ts';
import { along, bearingAt, scale } from '../src/world/sphere.ts';
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

test('Hands.gust is a tap: one turns it on and the ship runs faster on its meter, the next turns it off', () => {
  const ahead = (m: Match): Hands => ({
    ...STILL,
    course: m.view.mine()!.ship.heading,
    throttle: 1,
  });
  const speedAfter = (taps: number) => {
    const m = duel();
    sail(m, 3);
    for (let i = 0; i < taps; i++) {
      m.step({ ...ahead(m), gust: true });
      m.step(ahead(m));
    }
    for (let i = 0; i < SECOND; i++) m.step(ahead(m));
    return { m, speed: m.view.mine()!.ship.speed };
  };
  const plain = speedAfter(0),
    on = speedAfter(1),
    off = speedAfter(2);
  assert.ok(
    crew(on.m).gust.on && !crew(off.m).gust.on && !crew(plain.m).gust.on
  );
  assert.ok(on.speed > plain.speed + 1, `${on.speed} ${plain.speed}`);
  assert.ok(crew(on.m).gust.meter < EVEN_SHIP.gustCapacity - 0.9);
  assert.equal(crew(plain.m).gust.meter, EVEN_SHIP.gustCapacity);
});

test('a cache of eight heals drops at the start of each storm phase after the first, and none when the final ring closes', () => {
  const setup = setupOf(SEED, { teams: 2, perTeam: 1, player: true, storm: 5 }),
    m = createMatch(setup, waters),
    table = rulesOf(setup.storm).storm,
    closed = closings(table),
    heart = planStorm(setup.match, waters.depth, table).at(-1)!,
    rim = 0.9 * table.phases.at(-1)!.radius,
    berth = (a: number) => along(heart, bearingAt(heart, a), rim).p;
  const debug = debugOf(m);
  debug.atSea({ at: berth(0), bearing: Math.PI / 2 }, [
    {
      at: berth(Math.PI),
      heading: bearingAt(berth(Math.PI), Math.PI / 2),
      lashed: { course: null, throttle: 0 },
    },
  ]);
  const full: Rarity[] = Array.from({ length: HEAL.slots }, () => 'legendary');
  for (const a of [0, Math.PI]) debug.strew(berth(a), full);
  m.step(STILL);
  assert.deepEqual(
    m.view.crews().map((c) => c.hold.items),
    [full, full],
    'holds full of the rarest, so nothing more is swept up'
  );
  const drops: { time: number; heals: Rarity[] }[] = [];
  let took = 0;
  while (m.view.time() < closed.at(-1)! + 20) {
    const before = m.view.loot().next;
    m.step(STILL);
    took += m.view.last().took.length;
    const fresh = m.view.loot().pieces.filter((l) => l.id >= before);
    assert.equal(fresh.length, m.view.loot().next - before);
    if (fresh.length > 0)
      drops.push({ time: m.view.time(), heals: fresh.map((l) => l.heal) });
  }
  assert.equal(took, 0, 'nothing swept up');
  assert.equal(m.view.alive().length, 2, 'nothing sunk, so nothing spilled');
  assert.deepEqual(
    drops.map((d) => d.heals.length),
    closed.slice(0, -1).map(() => HEAL.cache.count),
    'eight a phase, six phases'
  );
  drops.forEach((d, k) => {
    assert.ok(
      d.time > closed[k] && d.time <= closed[k] + 2 * STEP + 1e-9,
      `cache ${k + 1} at ${d.time} s, as phase ${k + 1} begins at ${closed[k]} s`
    );
    assert.ok(d.heals.every((h) => h !== 'common'));
  });
});
