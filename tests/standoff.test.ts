// Joining others' fights (hunter.ts standoff, PLAN layer 4): a raider who
// hears guns stands off out of their reach while they ring, and falls on them
// once they fall silent; a hunter goes straight in.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mind, think } from '../src/sim/bot.ts';
import { PERSONAS, nature } from '../src/sim/persona.ts';
import type { Depth } from '../src/sim/shoal.ts';
import { shipAt } from '../src/sim/ship.ts';
import { along, distance, frameAt, fromLatLon } from '../src/world/sphere.ts';

const here = fromLatLon(0.2, 0.3),
  { north } = frameAt(here);
const deep: Depth = () => 20;
const own = { id: 1, ship: shipAt(here, north), hull: 100, armed: true };
const guns = along(here, north, 320).p;
const ringing = [{ at: guns, by: 5, t: 0 }];
type Persona = (typeof PERSONAS)[number];
const only = (p: Persona) =>
  Object.fromEntries(PERSONAS.map((q) => [q, q === p ? 1 : 0])) as Record<
    Persona,
    number
  >;

test('a raider stands off guns she hears while they ring, and falls on them when they fall silent; a hunter goes straight in', () => {
  let hunted = 0;
  for (let seed = 1; seed <= 24; seed++) {
    for (const p of ['raider', 'hunter'] as const) {
      const who = nature(seed, undefined, only(p));
      assert.equal(who.persona, p);
      let m = mind(seed, here);
      for (let k = 0; k < 12; k++)
        m = think(own, [], { depth: deep, gunfire: ringing }, m, who).memory;
      if (m.mode !== 'hunt') continue;
      if (p === 'raider') hunted++;
      const off = distance(m.goal, guns);
      if (p === 'raider')
        assert.ok(Math.abs(off - 250) < 1, `${seed}: ${off} m off`);
      else assert.ok(off < 1, `${seed} hunter: ${off} m off`);
      if (p === 'hunter') continue;
      // the guns fall silent: she falls on them
      for (let k = 0; k < 12; k++)
        m = think(own, [], { depth: deep, gunfire: [] }, m, who).memory;
      if (m.mode === 'hunt')
        assert.ok(distance(m.goal, guns) < 1, `${seed}: not falling on`);
    }
  }
  assert.ok(hunted >= 4, `only ${hunted} raiders hunted`);
});
