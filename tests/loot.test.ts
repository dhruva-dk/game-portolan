import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  battleOf,
  crewOf,
  stepBattle,
  weathered,
  type Crew,
} from '../src/sim/battle.ts';
import type { Vessel } from '../src/sim/contact.ts';
import { STEP } from '../src/sim/fixed.ts';
import { charging, gustOf, ready, spent, stepGust } from '../src/sim/gust.ts';
import { RARITIES, rankOf, type Rarity } from '../src/sim/kinds.ts';
import { GUST, SHIP } from '../src/sim/handling.ts';
import { SHIELD } from '../src/sim/tuning.ts';
import {
  begun,
  emptyHold,
  progress,
  restored,
  stepUse,
  stowed,
  useful,
  type Hold,
} from '../src/sim/hold.ts';
import {
  cargo,
  drifted,
  healSpots,
  laying,
  overboard,
  PIECE,
  rolled,
  swept,
  type Flotsam,
  type Loot,
} from '../src/sim/loot.ts';
import { asked, crewed, NOTHING, stored } from '../src/sim/stores.ts';
import { shipAt, step, type ShipState } from '../src/sim/ship.ts';
import type { Depth } from '../src/sim/shoal.ts';
import { HEAL } from '../src/sim/tuning.ts';
import { random } from '../src/world/random.ts';
import {
  R,
  add,
  along,
  distance,
  dot,
  frameAt,
  fromLatLon,
  normalize,
  scale,
  type Vec3,
} from '../src/world/sphere.ts';
import { EVEN_SHIP, TENDED, UNTENDED } from './setups.ts';

const deep: Depth = () => 30;
const c0 = fromLatLon(0.1, 0.2);
const east = frameAt(c0).east;
const at = (m: number) => along(c0, east, m).p;
const vessel = (id: number, p: Vec3): Vessel => ({
  id,
  ship: shipAt(p, frameAt(p).north),
  shove: [0, 0, 0],
  engaged: [],
});
const piece = (id: number, p: Vec3, heal: Rarity): Loot => ({
  id,
  at: p,
  heal,
  age: 10,
  way: [0, 0, 0],
});
const lying = (...pieces: Loot[]): Flotsam => ({ pieces, next: 100 });
const holding = (...items: (Rarity | null)[]): Hold => ({
  ...emptyHold(),
  items,
});
const hurt = (c: Crew, hull: number): Crew => ({
  ...c,
  health: { ...c.health, hull },
});

test('a gust spends a charge, blows its time, and the charges come back one at a time', () => {
  let g = gustOf();
  assert.ok(ready(g));
  g = spent(g).gust;
  assert.deepEqual([g.charges, g.blowing], [1, GUST.time]);
  assert.equal(spent(g).blew, false, 'not while one still blows');
  for (let t = 0; t < GUST.time + 0.1; t += STEP) g = stepGust(g, STEP);
  assert.equal(g.blowing, 0);
  const since = g.recharge;
  g = spent(g).gust;
  assert.equal(g.charges, 0);
  assert.equal(spent(g).blew, false, 'none left');
  let t = since;
  while (g.charges < 1) {
    g = stepGust(g, STEP);
    t += STEP;
  }
  assert.ok(
    Math.abs(t - GUST.recharge) < 2 * STEP,
    `the first back ${t} s after it was spent`
  );
  assert.ok(charging(g) < 0.05);
  while (g.charges < 2) {
    g = stepGust(g, STEP);
    t += STEP;
  }
  assert.ok(
    Math.abs(t - 2 * GUST.recharge) < 3 * STEP,
    'the second after the first'
  );
  assert.equal(charging(g), 1);
});

test('in a gust it runs well past its top and turns quicker; after it it sheds the speed back to its top', () => {
  let s: ShipState = { ...shipAt(c0, east), speed: EVEN_SHIP.topSpeed };
  const plain = step(
    s,
    { course: frameAt(c0).north, throttle: 1 },
    STEP,
    deep,
    EVEN_SHIP
  );
  for (let t = 0; t < GUST.time; t += STEP)
    s = step(
      s,
      { course: null, throttle: 1, gust: true },
      STEP,
      deep,
      EVEN_SHIP
    );
  assert.ok(s.speed > EVEN_SHIP.topSpeed + 0.9 * GUST.speed, `${s.speed}`);
  const quick = step(
    { ...shipAt(c0, east), speed: EVEN_SHIP.topSpeed },
    { course: frameAt(c0).north, throttle: 1, gust: true },
    STEP,
    deep,
    EVEN_SHIP
  );
  assert.ok(quick.turn > plain.turn * 1.3);
  for (let t = 0; t < 1; t += STEP)
    s = step(s, { course: null, throttle: 1 }, STEP, deep, EVEN_SHIP);
  assert.ok(
    s.speed > EVEN_SHIP.topSpeed + GUST.speed - GUST.shed * 1.1 &&
      s.speed < EVEN_SHIP.topSpeed + GUST.speed,
    'shed at its rate'
  );
  for (let t = 0; t < 5; t += STEP)
    s = step(s, { course: null, throttle: 1 }, STEP, deep, EVEN_SHIP);
  assert.ok(Math.abs(s.speed - EVEN_SHIP.topSpeed) < 1e-9);
});

test('a ball fired in a gust goes off wider', () => {
  const fleet = [vessel(1, c0), vessel(2, at(150))];
  const spreadOf = (blowing: number) => {
    let worst = 0;
    for (let seed = 0; seed < 40; seed++) {
      const b = battleOf(
        [
          {
            ...crewOf(1, EVEN_SHIP),
            gust: { charges: 1, recharge: 0, blowing },
          },
          crewOf(2, EVEN_SHIP),
        ],
        seed
      );
      const r = stepBattle(
        b,
        fleet,
        [
          {
            aim: { from: scale(c0, R + 20), dir: frameAt(c0).north },
            fire: true,
          },
          { aim: null, fire: false },
        ],
        [],
        STEP,
        deep
      );
      worst = Math.max(worst, Math.abs(dot(r.shots[0].dirs[0], east)));
    }
    return worst;
  };
  assert.ok(spreadOf(1) > spreadOf(0) * 1.3);
});

test('a heal restores its rarity’s share of the hull points times the heal factor, more for each rarer one', () => {
  const amounts = RARITIES.map((r) => restored(r, EVEN_SHIP));
  for (let i = 1; i < amounts.length; i++)
    assert.ok(amounts[i] > amounts[i - 1], RARITIES[i]);
  const plain = { hullPoints: 100, healFactor: 1 };
  assert.equal(restored('legendary', plain), 100, 'a legendary is all of it');
  assert.ok(
    restored('rare', { ...plain, hullPoints: 200 }) > restored('rare', plain),
    'a share of its own hull points'
  );
  assert.ok(
    restored('rare', { ...plain, healFactor: 1.5 }) > restored('rare', plain),
    'times its heal factor'
  );
});

test('its heal factor: the best-tended ship mends more with the same heal than the worst-tended one', () => {
  assert.ok(TENDED.healFactor > UNTENDED.healFactor);
  const mended = (values: typeof EVEN_SHIP) => {
    let c: Crew = hurt(
      { ...crewOf(1, values), hold: holding('common', null, null) },
      10
    );
    c = asked([c], new Map([[1, { ...NOTHING, heal: 0 }]])).crews[0];
    for (let t = 0; t < 3; t += STEP)
      c = stored([c], lying(), [], [], STEP, deep, 1).crews[0];
    return c.health.hull - 10;
  };
  assert.ok(mended(TENDED) > mended(UNTENDED));
});

test('one tap uses a heal: it takes the heal time, then mends and empties its slot; never past the hull points', () => {
  const values = { ...EVEN_SHIP, healTime: 1.5 };
  let h = begun(
    holding(null, 'rare', 'legendary'),
    1,
    { hull: 40, shield: 0, most: 140 },
    1.5
  );
  assert.deepEqual(h.using, { slot: 1, left: 1.5, of: 1.5 });
  let health = { hull: 40, shield: 0, most: values.hullPoints };
  for (let t = 0; t < 1.4; t += STEP)
    ({ hold: h, health } = stepUse(h, health, values, STEP));
  assert.ok(progress(h)! > 0.9 && h.using);
  assert.equal(health.hull, 40, 'nothing until it is done');
  let done: Rarity | null = null;
  for (let t = 0; t < 0.2 && !done; t += STEP)
    ({ hold: h, health, done } = stepUse(h, health, values, STEP));
  assert.equal(done, 'rare');
  assert.ok(Math.abs(health.hull - (40 + restored('rare', values))) < 1e-9);
  assert.deepEqual(h.items, [null, null, 'legendary']);
  assert.equal(h.using, null);
  h = begun(h, 2, health, 1.5);
  for (let t = 0; t < 2; t += STEP)
    ({ hold: h, health } = stepUse(h, health, values, STEP));
  assert.equal(health.hull, values.hullPoints, 'a legendary fills it, no more');
});

test('its heal time: the best-tended ship finishes a heal sooner than the worst-tended one', () => {
  assert.ok(TENDED.healTime < UNTENDED.healTime);
  const took = (values: typeof EVEN_SHIP) => {
    let c: Crew = hurt(
      { ...crewOf(1, values), hold: holding('rare', null, null) },
      10
    );
    c = asked([c], new Map([[1, { ...NOTHING, heal: 0 }]])).crews[0];
    let t = 0;
    while (c.hold.using) {
      c = stored([c], lying(), [], [], STEP, deep, 1).crews[0];
      t += STEP;
    }
    return t;
  };
  assert.ok(took(TENDED) < took(UNTENDED));
});

test('no heal is begun at full hull, sunk, from an empty slot, or while another is in use', () => {
  const h = holding('common', null, 'epic'),
    most = 100;
  assert.equal(useful({ hull: most, shield: 0, most }), false);
  assert.equal(begun(h, 0, { hull: most, shield: 0, most }, 1).using, null);
  assert.equal(begun(h, 0, { hull: 0, shield: 0, most }, 1).using, null);
  assert.equal(begun(h, 1, { hull: 50, shield: 0, most }, 1).using, null);
  const using = begun(h, 0, { hull: 50, shield: 0, most }, 1);
  assert.equal(using.using?.slot, 0);
  assert.equal(begun(using, 2, { hull: 50, shield: 0, most }, 1), using);
});

test('a hit does not break off a heal, nor does the storm', () => {
  const p = c0,
    q = at(60);
  const fleet = [vessel(1, p), vessel(2, q)];
  const h = begun(
    holding('epic', null, null),
    0,
    { hull: 50, shield: 0, most: 140 },
    5
  );
  let b = battleOf(
    [crewOf(1, EVEN_SHIP), { ...hurt(crewOf(2, EVEN_SHIP), 50), hold: h }],
    1
  );
  const aim = {
    from: scale(p, R + 20),
    dir: normalize(add(scale(q, R), scale(p, R + 20), -1)),
  };
  let struck = false;
  for (let i = 0; i < 60; i++) {
    const r = stepBattle(
      b,
      fleet,
      [
        { aim, fire: i === 0 },
        { aim: null, fire: false },
      ],
      [],
      STEP,
      deep
    );
    b = r.battle;
    struck ||= r.strikes.length > 0;
  }
  assert.ok(struck && b.crews[1].health.hull < 50);
  assert.ok(b.crews[1].hold.using, 'still at it');
  const out = { center: frameAt(c0).north, radius: 1, damage: 0.01 };
  const w = weathered(
    battleOf([{ ...hurt(crewOf(2, EVEN_SHIP), 50), hold: h }], 1),
    [vessel(2, q)],
    out,
    STEP
  );
  assert.ok(w.battle.crews[0].health.hull < 50 && w.battle.crews[0].hold.using);
});

test('while it uses a heal it sails at the share of the throttle asked', () => {
  const helm = { course: null, throttle: 1 };
  const c = {
    ...crewOf(1, EVEN_SHIP),
    hold: begun(
      holding('common', null, null),
      0,
      { hull: 50, shield: 0, most: 140 },
      1
    ),
  };
  assert.equal(crewed(helm, c).throttle, HEAL.using);
  assert.equal(crewed(helm, crewOf(1, EVEN_SHIP)).throttle, 1);
});

const held = (c: Crew) => [...c.hold.items];

test('it carries three heals, one a slot, and takes what it sails over while a slot is free', () => {
  assert.equal(emptyHold().items.length, HEAL.slots);
  const f = lying(
    piece(2, at(-5), 'common'),
    piece(3, at(4), 'epic'),
    piece(4, at(30), 'rare')
  );
  const r = swept(f, [crewOf(1, EVEN_SHIP)], [vessel(1, c0)]);
  assert.deepEqual(held(r.crews[0]), ['common', 'epic', null]);
  assert.deepEqual(
    r.flotsam.pieces.map((l) => l.id),
    [4],
    'out of reach: left'
  );
  assert.deepEqual(
    r.took.map((t) => [t.id, t.slot, t.heal]),
    [
      [2, 0, 'common'],
      [3, 1, 'epic'],
    ]
  );
});

test('its slots full, a rarer heal takes the place of its lowest, which goes over where it is; another is left', () => {
  const c = {
    ...crewOf(1, EVEN_SHIP),
    hold: holding('rare', 'common', 'epic'),
  };
  const r = swept(lying(piece(5, at(2), 'epic')), [c], [vessel(1, c0)]);
  assert.deepEqual(held(r.crews[0]), ['rare', 'epic', 'epic']);
  assert.equal(r.flotsam.pieces.length, 1);
  const dropped = r.flotsam.pieces[0];
  assert.equal(dropped.heal, 'common');
  assert.ok(distance(dropped.at, c0) < 1e-6, 'where the ship is');
  assert.equal(dropped.id, 100);
  const again = swept(r.flotsam, r.crews, [vessel(1, c0)]);
  assert.deepEqual(held(again.crews[0]), ['rare', 'epic', 'epic'], 'left');
  assert.deepEqual(again.took, []);
  const same = swept(lying(piece(6, at(2), 'common')), [c], [vessel(1, c0)]);
  assert.deepEqual(held(same.crews[0]), ['rare', 'common', 'epic']);
  assert.deepEqual(
    same.flotsam.pieces.map((l) => l.id),
    [6],
    'no rarer than its lowest: left'
  );
  assert.ok(stowed(c.hold, 'legendary'));
  assert.equal(stowed(c.hold, 'common'), null);
});

test('heals are found in their shares of rarity; a cache’s are never common', () => {
  const draw = random(7),
    n = 20000;
  const shares = (found: Readonly<Record<Rarity, number>>) => {
    const g = Array.from({ length: n }, () => rolled(draw, found));
    return RARITIES.map((r) => g.filter((x) => x === r).length / n);
  };
  const strewn = shares(HEAL.found),
    cached = shares(HEAL.cache.found);
  RARITIES.forEach((r, i) => {
    assert.ok(Math.abs(strewn[i] - HEAL.found[r]) < 0.02, `${r}: ${strewn[i]}`);
    assert.ok(Math.abs(cached[i] - HEAL.cache.found[r]) < 0.02, r);
  });
  assert.equal(cached[rankOf('common')], 0);
  for (let i = 1; i < RARITIES.length; i++)
    assert.ok(strewn[i] < strewn[i - 1], 'the rarer, the fewer');
});

test('the heals are strewn evenly over the planet, on open water only, the same for a seed', () => {
  const isle = fromLatLon(0, 0);
  const depth: Depth = (p) => (distance(p, isle) < 120 ? -5 : 20);
  const f = laying(5, depth, 3).strewn();
  assert.deepEqual(f, laying(5, depth, 3).strewn());
  assert.notDeepEqual(
    f.pieces.map((l) => l.at),
    laying(6, depth, 3)
      .strewn()
      .pieces.map((l) => l.at)
  );
  assert.ok(f.pieces.every((l) => depth(l.at) >= SHIP.draft + PIECE.open));
  assert.ok(f.pieces.some((l) => distance(l.at, isle) < 140));
  const cell = Math.sqrt((4 * Math.PI * R * R) / healSpots(3));
  const draw = random(3);
  for (let k = 0; k < 200; k++) {
    const p = fromLatLon(Math.asin(2 * draw() - 1), draw() * 2 * Math.PI);
    const near = Math.min(...f.pieces.map((l) => distance(p, l.at)));
    assert.ok(near < 1.2 * cell, `${near}`);
  }
});

test('more heal stars strew more heals: as many spots as the race’s heal count factor says', () => {
  assert.equal(healSpots(3), HEAL.spots);
  const counts = ([1, 2, 3, 4, 5] as const).map(
    (k) => laying(5, deep, k).strewn().pieces.length
  );
  for (let k = 1; k < counts.length; k++)
    assert.ok(counts[k] > counts[k - 1], `${counts}`);
  assert.ok(healSpots(1) < healSpots(3) && healSpots(5) > healSpots(3));
});

test('a ship sunk spills its unused heals where it lies, gone from it, kicked out to drift to a stop', () => {
  const c = { ...crewOf(1, EVEN_SHIP), hold: holding('common', null, 'epic') };
  const s = stored([c], lying(), [vessel(1, c0)], [1], STEP, deep, 9);
  assert.deepEqual(
    s.flotsam.pieces.map((l) => l.heal),
    ['common', 'epic']
  );
  assert.deepEqual(s.crews[0].hold.items, [null, null, null]);
  const heals = cargo(c);
  assert.equal(heals.length, 2);
  let f = overboard({ pieces: [], next: 0 }, c0, heals, 9);
  assert.ok(f.pieces.every((l) => Math.hypot(...l.way) >= PIECE.kick));
  for (let t = 0; t < 5; t += STEP) f = drifted(f, STEP, deep);
  const out = f.pieces.map((l) => distance(c0, l.at));
  assert.ok(
    out.every((d) => d > 0.5 && d < 4),
    `${out}`
  );
  assert.ok(f.pieces.every((l) => Math.hypot(...l.way) < 0.01));
});

test('a ship sunk takes nothing', () => {
  const f = lying(piece(1, c0, 'common'));
  const r = swept(
    f,
    [{ ...crewOf(1, EVEN_SHIP), health: { hull: 0, shield: 0, most: 100 } }],
    [vessel(1, c0)]
  );
  assert.deepEqual(r.crews[0].hold.items, [null, null, null]);
  assert.equal(SHIELD.start, 0, 'it puts to sea with no shield');
});
