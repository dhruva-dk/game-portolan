import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mind, think } from '../src/sim/bot.ts';
import { afloat } from '../src/sim/contact.ts';
import type { Depth } from '../src/sim/shoal.ts';
import { shipAt } from '../src/sim/ship.ts';
import type { Cap, Storm } from '../src/sim/storm.ts';
import {
  R,
  along,
  distance,
  frameAt,
  fromLatLon,
} from '../src/world/sphere.ts';
import { aboard, botOf } from './setups.ts';

const center = fromLatLon(0.2, 0.3),
  { north } = frameAt(center);
const deep: Depth = () => 20;
const next: Cap = { center, radius: 400 / R };
const storm = (secondsToNext: number): Storm => ({
  center,
  radius: 900 / R,
  next,
  closing: false,
  secondsToNext,
  secondsToShut: secondsToNext + 20,
  phase: 2,
  final: false,
  damage: 0.03,
});

test('it picks a place inside the next cap, keeps it, and makes for it when it is time', () => {
  const at = along(center, north, 250).p,
    own = afloat(1, shipAt(at, north));
  for (const seed of [1, 2, 3, 4, 5, 6]) {
    const sea = { depth: deep, storm: storm(100) };
    let m = mind(seed, at);
    for (let k = 0; k < 7 * 12; k++)
      m = think(aboard(own), [], sea, m, botOf(seed)).memory;
    const place = m.place;
    assert.ok(place, `${seed}: no place`);
    assert.ok(distance(place, center) <= 400, `${seed}: outside the cap`);
    for (let k = 0; k < 7 * 12; k++)
      m = think(aboard(own), [], sea, m, botOf(seed)).memory;
    assert.deepEqual(m.place, place, `${seed}: moved`);
    assert.equal(m.mode, 'roam');
    const late = { depth: deep, storm: storm(5) };
    for (let k = 0; k < 360; k++)
      m = think(aboard(own), [], late, m, botOf(seed)).memory;
    assert.equal(m.mode, 'roam', `${seed}: ${m.mode}`);
    assert.ok(distance(m.goal, place) <= 50, `${seed}: not to its place`);
  }
});
