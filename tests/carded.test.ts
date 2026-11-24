// A race's card as the sim reads it (sim/carded.ts): its ships checked, their
// teams, and which of them put to sea.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { RaceCard, RaceShip } from '../src/race.ts';
import { checked, entered, teamsOf } from '../src/sim/carded.ts';

const SPEC = { performance: 1, reliability: 0.5 };
const ship = (id: number, over: Partial<RaceShip> = {}): RaceShip => ({
  id,
  team: Math.floor(id / 2),
  colours: { dye: 0, pattern: 0 },
  parts: {
    sails: SPEC,
    rigging: SPEC,
    rudder: SPEC,
    hull: SPEC,
    keel: SPEC,
    mounts: SPEC,
  },
  driver: {
    seed: id + 1,
    persona: 'hunter',
    stats: {
      gunnery: 10,
      helm: 10,
      seamanship: 10,
      nerve: 10,
      consistency: 10,
      stormcraft: 10,
      stamina: 10,
      feedback: 10,
      lookout: 10,
    },
  },
  forfeit: false,
  ...over,
});
const card = (ships: RaceShip[]): RaceCard => ({
  seed: 7,
  tier: 3,
  round: 1,
  rules: {
    storm: 1,
    banned: [],
    spec: [],
    pointsPerSinking: 1,
    seaHeldPoint: true,
    prizeSpread: 1,
    inspection: 0,
  },
  ships,
});

test('carded: a ship’s team is the card’s, by her id; a forfeit does not put to sea', () => {
  const c = card([
    ship(0, { driver: null }),
    ship(1),
    ship(2, { forfeit: true }),
    ship(3),
  ]);
  assert.equal(checked(c), c);
  assert.deepEqual(teamsOf(c), [0, 0, 1, 1]);
  assert.deepEqual(entered(c), [0, 1, 3]);
});

test('carded: a card whose ships are out of order, or that leaves any but the first without a driver, is refused', () => {
  assert.throws(
    () => checked(card([ship(1), ship(0)])),
    /ship 0 is numbered 1/
  );
  assert.throws(
    () => checked(card([ship(0), ship(1, { driver: null })])),
    /ship 1 has no driver/
  );
});
