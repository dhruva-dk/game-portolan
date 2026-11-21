// Damage as the player sees it: a fault's onset (player.ts worsened), the beat
// the camera, the sound and the HUD each give once.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SOUND, ZONES, worsened, type Faults } from '../src/player.ts';

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
