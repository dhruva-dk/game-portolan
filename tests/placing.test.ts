import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mind, think } from '../src/sim/bot.ts';
import { afloat } from '../src/sim/contact.ts';
import { nature } from '../src/sim/persona.ts';
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

const centre = fromLatLon(0.2, 0.3),
  { north } = frameAt(centre);
const deep: Depth = () => 20;
const next: Cap = { centre, radius: 400 / R };
const storm = (secondsToNext: number): Storm => ({
  centre,
  radius: 900 / R,
  next,
  closing: false,
  secondsToNext,
  phase: 2,
  final: false,
  damage: 0.03,
});

test('it picks a place inside the next cap, keeps it, and makes for it when it is time', () => {
  const at = along(centre, north, 250).p,
    own = afloat(1, shipAt(at, north));
  for (const seed of [1, 2, 3, 4, 5, 6]) {
    const sea = { depth: deep, storm: storm(100) };
    let m = mind(seed, at);
    for (let k = 0; k < 7 * 12; k++)
      m = think(own, [], sea, m, nature(seed)).memory;
    const place = m.place;
    assert.ok(place, `${seed}: no place`);
    assert.ok(distance(place, centre) <= 400, `${seed}: outside the cap`);
    for (let k = 0; k < 7 * 12; k++)
      m = think(own, [], sea, m, nature(seed)).memory;
    assert.deepEqual(m.place, place, `${seed}: moved`);
    assert.equal(m.mode, 'roam');
    const late = { depth: deep, storm: storm(5) };
    for (let k = 0; k < 360; k++)
      m = think(own, [], late, m, nature(seed)).memory;
    assert.equal(m.mode, 'roam', `${seed}: ${m.mode}`);
    assert.ok(distance(m.goal, place) <= 50, `${seed}: not to its place`);
  }
});
