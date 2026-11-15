// The crewmate (#58 step 8.2): her stance's weights on her options, each call changing what she goes for, the delay
// before she notices a call falling with her Lookout, and a nervous captain breaking off an attack.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Call, Stance } from '../src/race.ts';
import { byTemper, mind, think, type Hand } from '../src/sim/bot.ts';
import type { Lead, Memory, Seen } from '../src/sim/captain.ts';
import { afloat } from '../src/sim/contact.ts';
import { noticeDelay, stanceOn } from '../src/sim/crewmate.ts';
import { SPEC } from '../src/sim/fit.ts';
import { CREWMATE } from '../src/sim/handling.ts';
import type { Holdings } from '../src/sim/claimer.ts';
import { shipAt, turned, type ShipState } from '../src/sim/ship.ts';
import { along, distance, frameAt, fromLatLon, type Vec3 } from '../src/world/sphere.ts';

const deep = () => 30;
const centre = fromLatLon(0.2, 0.3);
const lying = (c: Vec3, bearing: number): ShipState => {
  const s = shipAt(c, frameAt(c).east);
  return { ...s, heading: turned(s, bearing) };
};
const out = (c: Vec3, bearing: number, metres: number) => along(c, turned(lying(c, 0), bearing), metres).p;
/** Her side's water: a disc 50 m about `centre`. */
const water: Holdings = {
  ownerAt: (p) => (distance(p, centre) < 50 ? 0 : -1), sideAt: (p) => (distance(p, centre) < 50 ? 0 : -1),
  trail: () => ({ serial: 0, points: [] }),
};

/** Her (ship 1, side 0) 200 m off her water, ship one (0) 200 m beyond her, a foe (2) 130 m off and another (4) 180. */
const scene = () => {
  const her = afloat(1, lying(out(centre, 0, 200), 0), SPEC, 0);
  const one = afloat(0, lying(out(centre, 0, 400), 0), SPEC, 0);
  const near = afloat(2, lying(out(centre, 0.5, 260), Math.PI), SPEC, 1);
  const far = afloat(4, lying(out(centre, -0.6, 300), Math.PI), SPEC, 2);
  return { her, others: [one, near, far] as Seen[] };
};

/** `steps` of her thinking with `hand`, her memory from her water: her memory each step. */
function sail(hand: Hand, steps: number, sea = { depth: deep, holdings: water }): Memory[] {
  const { her, others } = scene();
  let m = mind(hand.seed, centre);
  const ms: Memory[] = [];
  for (let i = 0; i < steps; i++) {
    m = think(her, others, sea, m, hand).memory;
    ms.push(m);
  }
  return ms;
}
const lead = (call: Call, at = 4): Lead => ({ id: 0, target: 2, call, seq: 1, at });
const crew = (seed: number, more: Partial<Hand>): Hand => ({ ...byTemper(seed), ...more });

test("her stance's weights: hunt raises roaming and fighting, hold her water, loot looting and lowers fighting", () => {
  const on = (stance: Stance) => (mode: Parameters<typeof stanceOn>[1]) => stanceOn(stance, mode);
  assert.ok(on('hunt')('fight') > 1 && on('hunt')('roam') > 1);
  assert.ok(on('hold')('claim') > 1 && on('hold')('home') > 1);
  assert.ok(on('loot')('loot') > 1 && on('loot')('fight') < 1);
  assert.equal(on('shadow')('fight'), 1);
  assert.equal(stanceOn(undefined, 'fight'), 1);
});

test('a shadowing stance keeps her by ship one: she makes for her, and takes up the foe ship one fights', () => {
  const free = sail(crew(3, {}), 90), shadow = sail(crew(3, { stance: 'shadow', lead: { id: 0, target: 4, call: null, seq: 0, at: -1 } }), 90);
  assert.notEqual(free.at(-1)!.foe, 4);
  assert.equal(shadow.at(-1)!.foe, 4, 'ship one fights 4, so does she');
});

test('each call changes what she goes for: attack the ship named, with me, hold her water, free', () => {
  const steps = 150, seed = 3;
  const attack = sail(crew(seed, { lead: lead('attack', 4) }), steps).at(-1)!;
  assert.equal(attack.foe, 4);
  assert.equal(attack.mode, 'fight');
  const withMe = sail(crew(seed, { lead: { ...lead('withMe'), target: -1 } }), steps).at(-1)!;
  assert.equal(withMe.mode, 'shadow');
  const hold = sail(crew(seed, { lead: lead('hold') }), steps).at(-1)!;
  assert.equal(hold.mode, 'hold');
  assert.ok(distance(hold.goal!, centre) < 60, 'back to her water');
  const free = sail(crew(seed, { lead: lead('free') }), steps).at(-1)!;
  assert.equal(free.call, null);
  assert.deepEqual([free.mode, free.foe], [sail(crew(seed, {}), steps).at(-1)!.mode, sail(crew(seed, {}), steps).at(-1)!.foe]);
  // a call lapses after CREWMATE.lasts s
  const lapsed = sail(crew(seed, { lead: lead('hold') }), Math.round((CREWMATE.lasts + 3) * 30)).at(-1)!;
  assert.notEqual(lapsed.mode, 'hold');
});

test('she notices a call later the poorer her Lookout', () => {
  assert.ok(noticeDelay(0.35) > noticeDelay(0.9));
  assert.ok(Math.abs(noticeDelay(0.35) - 1.2 * CREWMATE.notice) < 1e-12);
  const first = (lookout: number) => {
    const base = byTemper(3), ms = sail({ ...base, t: { ...base.t, lookout }, lead: lead('hold') }, 120);
    return ms.findIndex((m) => m.mode === 'hold');
  };
  assert.ok(first(0.35) > first(0.9), `${first(0.35)} against ${first(0.9)}`);
});

test('an attack holds a steady captain losing her fight; one of Nerve below CREWMATE.breaks breaks off', () => {
  const { her, others } = scene();
  // the ship called on lies 100 m off her, her hull down to 5
  const beaten = { ...her, hull: 5 }, foe = afloat(4, lying(out(her.ship.at, 1, 100), Math.PI), SPEC, 2);
  others[2] = foe;
  const run = (nerve: number) => {
    let m = mind(3, centre);
    const hand = crew(3, { nerve, lead: lead('attack', 4) });
    for (let i = 0; i < 120; i++) m = think(beaten, others, { depth: deep, holdings: water }, m, hand).memory;
    return m.mode;
  };
  assert.equal(run(16), 'fight');
  assert.notEqual(run(4), 'fight');
});
