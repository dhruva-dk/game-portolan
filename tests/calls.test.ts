// A team's call (sim/called.ts): what it makes of a
// brain's weights, what each call does to her bots' own choosing over seeded
// races, and her hands changing her team's call as the race is sailed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SEED } from '../src/environment.ts';
import { raceOf, specField } from '../src/play/race.ts';
import { createState, debugOf } from '../src/play/state.ts';
import { CALLS, type Call, type RaceCard } from '../src/race.ts';
import { mind, think } from '../src/sim/bot.ts';
import { DEFAULT_BRAIN } from '../src/sim/brain.ts';
import { CALLED, called } from '../src/sim/called.ts';
import type { Mode, Seen } from '../src/sim/captain.ts';
import { STEP } from '../src/sim/fixed.ts';
import { SHIP } from '../src/sim/handling.ts';
import { nature, natureOf } from '../src/sim/persona.ts';
import { chart } from '../src/sim/route.ts';
import { shipAt, step } from '../src/sim/ship.ts';
import { berthing } from '../src/sim/spawn.ts';
import { NOTHING } from '../src/sim/stores.ts';
import { landOf, planetOf } from '../src/world/land.ts';
import {
  along,
  distance,
  frameAt,
  fromLatLon,
  type Vec3,
} from '../src/world/sphere.ts';
import { flat } from '../src/world/swell.ts';

test('a call biases the weights her brain chooses by, and nothing else of it; free is the brain itself', () => {
  for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
    const b = nature(seed).brain;
    assert.equal(called(b, 'free'), b);
    for (const call of ['attack', 'hold', 'form'] as const) {
      const c = called(b, call),
        by: Partial<Record<Mode, number>> = CALLED.weights[call];
      for (const mode of Object.keys(b.choice) as Mode[])
        assert.equal(c.choice[mode], b.choice[mode] * (by[mode] ?? 1));
      assert.notEqual(c.choice.hunt, b.choice.hunt, `${call} weighs the hunt`);
      // her pit stops are her own, and the storm is the storm
      assert.equal(c.choice.pit, b.choice.pit);
      assert.equal(c.choice.storm, b.choice.storm);
      assert.deepEqual(
        { ...c, choice: b.choice, roaming: b.roaming },
        b,
        'the rest of her brain as it was'
      );
      if (call !== 'form') assert.deepEqual(c.roaming, b.roaming);
      // made once, and kept; a call on a called brain starts from her own
      assert.equal(called(b, call), c);
      assert.equal(called(c, 'free'), b);
      assert.equal(called(c, 'hold'), called(b, 'hold'));
    }
    assert.deepEqual(called(b, 'form').roaming, {
      ...b.roaming,
      ...CALLED.form,
    });
  }
  const b = DEFAULT_BRAIN;
  assert.ok(called(b, 'attack').choice.hunt > b.choice.hunt);
  assert.ok(called(b, 'attack').choice.fight > b.choice.fight);
  assert.ok(called(b, 'hold').choice.claim > b.choice.claim);
  assert.ok(called(b, 'hold').choice.hunt < b.choice.hunt);
  assert.ok(called(b, 'form').choice.roam > b.choice.roam);
});

test("a card's driver sails under her team's call: her brain called, her temperament as it was", () => {
  const driver = specField(SEED, 1).ships[1].driver;
  assert.ok(driver);
  const free = natureOf(driver, 400);
  assert.deepEqual(free, nature(driver.seed));
  for (const call of CALLS) {
    const n = natureOf(driver, 400, DEFAULT_BRAIN, call);
    assert.equal(n.brain, called(free.brain, call));
    assert.deepEqual({ ...n, brain: free.brain }, free);
  }
});

// ------------------------------------------------------------------ form

const start = fromLatLon(0.2, 0.3);

test('form: with nothing else calling her, a mate keeps by the first ship of her team as she sails on; free, she roams as she will', () => {
  /** How far from her lead the mate lies over the last 30 s of 90, on average. */
  const apart = (seed: number, call: Call) => {
    const sea = { depth: () => 30 },
      who = natureOf(
        { ...nature(seed), stats: specField(1, 1).ships[1].driver!.stats },
        400,
        DEFAULT_BRAIN,
        call
      );
    const f = frameAt(start);
    let lead = { ...shipAt(start, f.east), speed: 6 },
      ship = shipAt(along(start, f.north, -300).p, f.north),
      m = mind(seed, ship.at),
      sum = 0,
      n = 0;
    for (let tick = 0; tick < 90 / STEP; tick++) {
      const own: Seen = { id: 1, ship, team: 0 },
        ahead: Seen = { id: 0, ship: lead, team: 0 };
      const r = think(own, [ahead], sea, m, who);
      m = r.memory;
      ship = step(ship, r.helm, STEP, sea.depth);
      lead = step(
        lead,
        { course: null, throttle: 6 / SHIP.top },
        STEP,
        sea.depth
      );
      if (tick * STEP < 60) continue;
      sum += distance(ship.at, lead.at);
      n++;
    }
    return sum / n;
  };
  for (let seed = 1; seed <= 8; seed++) {
    const formed = apart(seed, 'form'),
      free = apart(seed, 'free');
    assert.ok(formed < 110, `${seed}: formed, ${formed.toFixed(0)} m off`);
    assert.ok(free > formed + 150, `${seed}: free, ${free.toFixed(0)} m off`);
  }
  // the first ship of the team forms on no one: she roams as she will
  const sea = { depth: () => 30 },
    who = natureOf(
      specField(1, 1).ships[1].driver!,
      400,
      DEFAULT_BRAIN,
      'form'
    );
  const own: Seen = {
      id: 0,
      ship: shipAt(start, frameAt(start).north),
      team: 0,
    },
    mate: Seen = {
      id: 1,
      ship: shipAt(
        along(start, frameAt(start).east, 400).p,
        frameAt(start).north
      ),
      team: 0,
    };
  let m = mind(3, start);
  for (let k = 0; k < 12; k++) m = think(own, [mate], sea, m, who).memory;
  assert.ok(distance(m.goal, mate.ship.at) > 200, 'not to her mate');
});

// ------------------------------------------------------------------ races

const planet = planetOf(SEED, landOf(SEED)),
  depth = (p: Vec3) => -planet.height(p),
  waters = { chart: chart(depth), water: berthing(depth) };
const IDLE = {
  helm: { course: null, throttle: 0 },
  gun: { aim: null, fire: false },
};

test('over seeded races a team under attack hunts more, one holding leaves the hunt and keeps claiming, one in form roams by its lead: each bot still choosing for herself', () => {
  // four races of five teams, the storm twice as quick; in each, four of the
  // teams sail under the four calls, turned a place on from race to race, so
  // each call is sailed once by each of the four
  const shares = new Map<Call, Partial<Record<Mode, number>>>(),
    thinks = new Map<Call, number>();
  for (let k = 0; k < CALLS.length; k++) {
    const base = specField(SEED, 5),
      callOf = (team: number): Call =>
        team < CALLS.length ? CALLS[(team + k) % CALLS.length] : 'free',
      card: RaceCard = {
        ...base,
        rules: { ...base.rules, storm: 2 },
        ships: base.ships.map((s) => ({ ...s, call: callOf(s.team) })),
      };
    const match = raceOf(card, planet),
      state = createState(planet, flat, waters, match);
    state.start(match);
    for (let tick = 1; !state.result(); tick++) {
      state.advance(IDLE.helm, IDLE.gun);
      if (tick % 15 !== 0) continue;
      for (const id of state.alive()) {
        const team = card.ships[id].team,
          mode = debugOf(state).mindOf(id)?.mode;
        if (team >= CALLS.length || !mode) continue;
        const call = callOf(team),
          of = shares.get(call) ?? {};
        of[mode] = (of[mode] ?? 0) + 1;
        shares.set(call, of);
        thinks.set(call, (thinks.get(call) ?? 0) + 1);
      }
    }
  }
  const share = (call: Call, mode: Mode) =>
    (shares.get(call)?.[mode] ?? 0) / (thinks.get(call) ?? 1);
  console.log(
    CALLS.map(
      (c) =>
        `# ${c}: ` +
        (['hunt', 'fight', 'claim', 'roam', 'loot', 'storm'] as const)
          .map((m) => `${m} ${(100 * share(c, m)).toFixed(1)}%`)
          .join(', ')
    ).join('\n')
  );
  assert.ok(share('attack', 'hunt') > 1.5 * share('free', 'hunt'));
  assert.ok(share('attack', 'hunt') > 3 * share('hold', 'hunt'));
  assert.ok(share('hold', 'claim') > 2 * share('form', 'claim'));
  assert.ok(share('form', 'roam') > 5 * share('free', 'roam'));
  // and every call leaves her the storm, her stores and her fights
  for (const call of CALLS) {
    assert.ok(share(call, 'storm') > 0.2, `${call}: she minds the storm`);
    assert.ok(share(call, 'loot') > 0.03, `${call}: she takes up loot`);
  }
});

test("her hands change her team's call as the race is sailed: every bot of her team sails under it from that step, no other team's", () => {
  const card = specField(SEED, 3, true),
    match = raceOf(card, planet),
    state = createState(planet, flat, waters, match);
  state.start(match);
  const brains = () =>
    card.ships.map((s) => debugOf(state).natureOf(s.id)?.brain);
  const before = brains();
  for (let k = 0; k < 5; k++) state.advance(IDLE.helm, IDLE.gun);
  assert.deepEqual(brains(), before);
  state.advance(IDLE.helm, IDLE.gun, { ...NOTHING, call: 'attack' });
  brains().forEach((b, id) => {
    assert.ok(b && before[id]);
    if (id > 0 && card.ships[id].team === 0)
      assert.equal(b, called(before[id], 'attack'), `${id} attacks`);
    else if (id > 0) assert.equal(b, before[id], `${id} sails as she did`);
  });
  state.advance(IDLE.helm, IDLE.gun, { ...NOTHING, call: 'form' });
  assert.equal(brains()[2], called(before[2]!, 'form'));
  state.advance(IDLE.helm, IDLE.gun, { ...NOTHING, call: 'free' });
  for (let k = 0; k < 5; k++) state.advance(IDLE.helm, IDLE.gun);
  assert.deepEqual(brains(), before, 'and free again, as they were');
});
