import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mind, think } from '../src/sim/bot.ts';
import type { Depth } from '../src/sim/shoal.ts';
import { shipAt } from '../src/sim/ship.ts';
import { along, frameAt, fromLatLon } from '../src/world/sphere.ts';
import { aboard, botOf } from './setups.ts';

const here = fromLatLon(0.2, 0.3),
  { north } = frameAt(here);
const deep: Depth = () => 20;
const own = { id: 1, ship: shipAt(here, north), hull: 100 };
const seenAt = along(here, north, 90).p,
  goneTo = along(here, north, 900).p;
const weak = (at: typeof here) => ({
  id: 2,
  ship: shipAt(at, north),
  hull: 20,
  shield: 0,
});

test('a wounded ship it saw and lost, it goes back for, to where it saw that ship; not one it ran from', () => {
  for (const seed of [1, 2, 3, 4, 5]) {
    let m = mind(seed, here);
    for (let k = 0; k < 12; k++)
      m = think(
        aboard(own),
        [weak(seenAt)],
        { depth: deep },
        m,
        botOf(seed)
      ).memory;
    assert.ok(
      m.log.some((s) => s.id === 2 && s.strength === 20),
      `${seed}: not noted`
    );
    for (let k = 0; k < 30 * 6; k++)
      m = think(
        aboard(own),
        [weak(goneTo)],
        { depth: deep },
        m,
        botOf(seed)
      ).memory;
    assert.equal(m.foe, -1, `${seed}: still in its eye`);
    assert.deepEqual(m.hunt, seenAt, `${seed}: not back for it`);
    let ran = mind(seed, here);
    for (let k = 0; k < 12; k++)
      ran = think(
        aboard(own),
        [weak(seenAt)],
        { depth: deep },
        { ...ran, mode: 'flee' },
        botOf(seed)
      ).memory;
    for (let k = 0; k < 30 * 6; k++)
      ran = think(
        aboard(own),
        [weak(goneTo)],
        { depth: deep },
        ran,
        botOf(seed)
      ).memory;
    assert.equal(ran.hunt, null, `${seed}: back for one it ran from`);
  }
});
