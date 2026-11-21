// Damage as the player sees it: a fault's onset (player.ts worsened), the beat
// the camera, the sound and the HUD each give once; the vitals slip's wash of a
// zone by its share, and the zone a blow struck (ui/vitals.ts).

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SOUND, ZONES, worsened, type Faults } from '../src/player.ts';
import { edgeAt } from '../src/ui/hits.ts';
import { PAPER, WASH } from '../src/ui/ink.ts';
import { struckZone, washOf } from '../src/ui/vitals.ts';

test("vitals: a zone's wash runs paper, ochre, vermilion, and darkens as its share grows", () => {
  assert.equal(washOf(0), PAPER);
  assert.equal(washOf(0.3), WASH.ochre);
  assert.equal(washOf(0.6), WASH.vermilion);
  assert.equal(washOf(1), WASH.vermilion);
  const light = (hex: string) =>
    [1, 3, 5].reduce((a, i) => a + parseInt(hex.slice(i, i + 2), 16), 0);
  for (let s = 0; s < 0.6; s += 0.05)
    assert.ok(light(washOf(s + 0.05)) < light(washOf(s)), `darker past ${s}`);
});

test('vitals: the zone a blow struck is the one whose share rose most; none when no share rose by a 20th', () => {
  assert.equal(struckZone([0, 0, 0, 0], [0, 0, 1, 0]), 2);
  // shares are of the damage taken: one zone's rise is the others' fall
  assert.equal(struckZone([0.5, 0.5, 0, 0], [0.4, 0.6, 0, 0]), 1);
  assert.equal(struckZone([0.5, 0.5, 0, 0], [0.5, 0.5, 0, 0]), -1);
  assert.equal(struckZone([0.5, 0.5, 0, 0], [0.51, 0.49, 0, 0]), -1);
  assert.equal(struckZone([0.4, 0.2, 0.2, 0.2], [0.3, 0.15, 0.15, 0.4]), 3);
});

test('a blow from off the screen: its arc where the line from the middle toward its dealer meets the edge', () => {
  const near = (p: { x: number; y: number }, x: number, y: number) =>
    assert.ok(Math.hypot(p.x - x, p.y - y) < 1e-6, `${p.x}, ${p.y}`);
  near(edgeAt(0, 1180, 820, 20), 590, 20);
  near(edgeAt(Math.PI / 2, 1180, 820, 20), 1160, 410);
  near(edgeAt(Math.PI, 1180, 820, 20), 590, 800);
  near(edgeAt(-Math.PI / 2, 1180, 820, 20), 20, 410);
  // toward a corner, the nearer side of the screen takes it
  const p = edgeAt(Math.PI / 4, 1180, 820, 20);
  near(p, 590 + 390, 20);
});

test('zones: rigging, rudder, waterline, deck, in that order', () => {
  assert.deepEqual(ZONES, ['rigging', 'rudder', 'waterline', 'deck']);
});

test('a fault worsens when any zone goes up a grade, never when one mends or moves', () => {
  const minor: Faults = [0, 0, 1, 0],
    major: Faults = [0, 0, 2, 0];
  assert.equal(worsened(SOUND, minor), true);
  assert.equal(worsened(minor, major), true);
  assert.equal(worsened(major, minor), false);
  assert.equal(worsened(minor, minor), false);
  // the worst zone moving from one to another is a new fault where it lands
  assert.equal(worsened([1, 0, 0, 0], [0, 1, 0, 0]), true);
  assert.equal(worsened(major, SOUND), false);
});
