import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Race, Status } from '../src/play/player.ts';
import { vitalsOf } from '../src/ui/sea/vitals.ts';
import { seaShown, seaTenths, wingmanOf } from '../src/ui/sea/readings.ts';

const status = (over: Partial<Status>): Status =>
  ({
    hull: 140,
    hullMax: 140,
    shield: 60,
    shieldMax: 100,
    refilling: false,
    sunk: false,
    ...over,
  }) as Status;

test('the vitals read the shield and hull as whole points and shares', () => {
  const v = vitalsOf(status({ shield: 59.6, hull: 70.2 }));
  assert.deepEqual(
    [v.shield, v.hull, v.shieldShare, v.hullShare],
    [60, 70, 0.6, 0.5]
  );
  assert.equal(v.low, false);
  assert.equal(v.broken, false);
});

test('a hull at a quarter or less is low; a sunk ship is not', () => {
  assert.equal(vitalsOf(status({ hull: 35 })).low, true);
  assert.equal(vitalsOf(status({ hull: 36 })).low, false);
  assert.equal(vitalsOf(status({ hull: 0 })).low, false);
});

test('a shield at nothing is broken; refilling is the engine’s word', () => {
  assert.equal(vitalsOf(status({ shield: 0.3 })).broken, true);
  assert.equal(vitalsOf(status({ refilling: true })).refilling, true);
});

test('the sea share is a percentage: tenths below 10%, whole above, held between 0 and 100', () => {
  assert.equal(seaShown(0.0034), '0.3%');
  assert.equal(seaShown(0.0991), '9.9%');
  assert.equal(seaShown(0.374), '37%');
  assert.equal(seaShown(1.2), '100%');
  assert.equal(seaShown(-0.1), '0.0%');
  assert.equal(seaTenths(0.0034), 3);
  assert.ok(seaTenths(0.375) > seaTenths(0.374));
});

test('the wingman is the first mate: its hull share, and sunk at no hull', () => {
  assert.equal(wingmanOf(null), null);
  const race = (hull: number): Race => ({
    team: 0,
    place: 1,
    of: 20,
    mates: [{ id: 1, hull, hullMax: 140, shield: 0, shieldMax: 100, place: 2 }],
  });
  assert.deepEqual(wingmanOf(race(105)), { id: 1, share: 0.75, sunk: false });
  assert.deepEqual(wingmanOf(race(0)), { id: 1, share: 0, sunk: true });
  assert.equal(wingmanOf({ ...race(1), mates: [] }), null);
});
