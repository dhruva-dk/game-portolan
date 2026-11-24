import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mind, think } from '../src/sim/bot.ts';
import { afloat } from '../src/sim/contact.ts';
import { nature } from '../src/sim/persona.ts';
import { building, chart, fieldAt } from '../src/sim/route.ts';
import type { Depth } from '../src/sim/shoal.ts';
import { shipAt } from '../src/sim/ship.ts';
import type { Cap, Storm } from '../src/sim/storm.ts';
import {
  R,
  along,
  distance,
  dot,
  frameAt,
  fromLatLon,
} from '../src/world/sphere.ts';
import { aboard } from './setups.ts';

const center = fromLatLon(0.2, 0.3),
  { north, east } = frameAt(center);
const offsets = (p: readonly number[]) => ({
  n: R * Math.asin(dot(p as [number, number, number], north)),
  e: R * Math.asin(dot(p as [number, number, number], east)),
});
const walled: Depth = (p) => {
  const { n, e } = offsets(p);
  return Math.abs(n - 200) < 15 && Math.abs(e) < 350 ? -4 : 20;
};
const ch = chart(walled);
const next: Cap = { center, radius: 300 / R },
  heart = 0.6 * 300;
const found = building(ch, (p) => distance(p, center) <= heart);
while (!found.build(1e6));
const storm: Storm = {
  center,
  radius: 900 / R,
  next,
  closing: false,
  secondsToNext: 10,
  phase: 2,
  final: false,
  damage: 0.03,
};

test('a bot behind a wall inside the next cap reckons itself outside it by water, and makes down the way in', () => {
  const at = along(center, north, 240).p;
  const sea = {
    depth: walled,
    chart: ch,
    storm,
    calm: { cap: next, field: found.field, heart },
  };
  for (const seed of [1, 2, 3, 4, 5]) {
    const own = afloat(1, shipAt(at, north));
    let m = mind(seed, at);
    for (let k = 0; k < 7; k++)
      m = think(aboard(own), [], sea, m, nature(seed)).memory;
    assert.equal(m.mode, 'storm', `${seed}: ${m.mode}`);
    const here = fieldAt(ch, found.field, at),
      there = fieldAt(ch, found.field, m.goal);
    assert.ok(there < here - 100, `${seed}: ${here} -> ${there}`);
    let free = mind(seed, at);
    for (let k = 0; k < 7; k++)
      free = think(
        aboard(own),
        [],
        { depth: walled, chart: ch, storm },
        free,
        nature(seed)
      ).memory;
    assert.notEqual(free.mode, 'storm');
  }
});
