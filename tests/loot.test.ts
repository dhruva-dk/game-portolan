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
import { reloadOf } from '../src/sim/gun.ts';
import { charging, gustOf, ready, spent, stepGust } from '../src/sim/gust.ts';
import { STORES } from '../src/sim/kinds.ts';
import { GUST, HEALTH, SHIP } from '../src/sim/handling.ts';
import {
  begun,
  emptyHold,
  progress,
  roomFor,
  stepUse,
  stowed,
  tapped,
  useful,
  USES,
} from '../src/sim/hold.ts';
import {
  cargo,
  drifted,
  laying,
  LOOT,
  offered,
  overboard,
  PIECE,
  rolled,
  swept,
  type Flotsam,
  type Loot,
} from '../src/sim/loot.ts';
import { asked, NOTHING, stored } from '../src/sim/stores.ts';
import { shipAt, step, type ShipState } from '../src/sim/ship.ts';
import type { Depth } from '../src/sim/shoal.ts';
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
import { EVEN_SHIP } from './setups.ts';

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
const piece = (
  id: number,
  p: Vec3,
  goods: Loot['goods'],
  from = -1,
  age = 10
): Loot => ({ id, at: p, goods, from, age, way: [0, 0, 0] });
const lying = (...pieces: Loot[]): Flotsam => ({ pieces, next: 100 });

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

test('stacks fill up to their most, then empty slots; what does not fit is left over', () => {
  let h = emptyHold();
  h = stowed(h, 'smallShield', 3).hold;
  h = stowed(h, 'smallShield', 3).hold;
  assert.deepEqual(h.items, [{ kind: 'smallShield', count: 6 }, null, null]);
  const r = stowed(h, 'smallShield', 2);
  assert.deepEqual(r.hold.items[1], { kind: 'smallShield', count: 2 });
  h = stowed(stowed(r.hold, 'repairKit', 4).hold, 'bigShield', 1).hold;
  assert.equal(roomFor(h, 'bigShield'), -1);
  assert.equal(roomFor(h, 'repairKit'), 2);
  assert.equal(stowed(h, 'fullRepair', 1).left, 1);
});

test('a tap chooses a slot; a tap on the chosen begins it; done, it mends to its cap and one is gone', () => {
  const hurt = { hull: 40, shield: 0, most: 100 };
  let h = stowed(
    stowed(emptyHold(), 'smallShield', 2).hold,
    'repairKit',
    1
  ).hold;
  h = tapped(h, 1, hurt);
  assert.deepEqual([h.chosen, h.using], [1, null]);
  h = tapped(h, 1, hurt);
  assert.deepEqual(h.using, { slot: 1, left: USES.smallShield.time });
  let health = hurt;
  for (let t = 0; t < USES.smallShield.time - 0.1; t += STEP)
    ({ hold: h, health } = stepUse(h, health, STEP));
  assert.ok(progress(h)! > 0.8 && h.using);
  for (let t = 0; t < 0.2; t += STEP)
    ({ hold: h, health } = stepUse(h, health, STEP));
  assert.deepEqual(health, { hull: 40, shield: 25, most: 100 });
  assert.deepEqual(h.items[0], { kind: 'smallShield', count: 1 });
  assert.equal(h.using, null);
  health = { hull: 40, shield: 40, most: 100 };
  h = begun(h, 1, health);
  for (let t = 0; t < 1.1; t += STEP)
    ({ hold: h, health } = stepUse(h, health, STEP));
  assert.equal(health.shield, 50);
  assert.equal(h.items[0], null, 'the last one gone empties the slot');
  health = { hull: 70, shield: 0, most: 100 };
  h = tapped(tapped(h, 2, health), 2, health);
  for (let t = 0; t < 2; t += STEP)
    ({ hold: h, health } = stepUse(h, health, STEP));
  assert.equal(health.hull, 75);
});

test('nothing is begun that would do nothing, and choosing another slot breaks it off', () => {
  const h = stowed(emptyHold(), 'smallShield', 1).hold;
  assert.equal(
    useful({ hull: 100, shield: 50, most: 100 }, 'smallShield'),
    false
  );
  assert.equal(begun(h, 1, { hull: 100, shield: 50, most: 100 }).using, null);
  assert.equal(
    begun(h, 1, { hull: 0, shield: 0, most: 100 }).using,
    null,
    'not when sunk'
  );
  const using = begun(h, 1, { hull: 100, shield: 0, most: 100 });
  assert.ok(using.using);
  assert.equal(
    tapped(using, 0, { hull: 100, shield: 0, most: 100 }).using,
    null
  );
});

test('a blow breaks off what it is mending with; the storm does not', () => {
  const p = c0,
    q = at(60);
  const fleet = [vessel(1, p), vessel(2, q)];
  const h = begun(stowed(emptyHold(), 'bigShield', 1).hold, 1, {
    hull: 100,
    shield: 0,
    most: 100,
  });
  let b = battleOf(
    [
      { ...crewOf(1, EVEN_SHIP), health: { hull: 100, shield: 0, most: 100 } },
      { ...crewOf(2, EVEN_SHIP), hold: h },
    ],
    1
  );
  const aim = {
    from: scale(p, R + 20),
    dir: normalize(add(scale(q, R), scale(p, R + 20), -1)),
  };
  let broke = false;
  for (let i = 0; i < 60 && !broke; i++) {
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
    if (r.strikes.length) broke = b.crews[1].hold.using === null;
  }
  assert.ok(broke);
  const out = { center: frameAt(c0).north, radius: 1, damage: 0.01 };
  const w = weathered(
    battleOf(
      [
        {
          ...crewOf(2, EVEN_SHIP),
          health: { hull: 100, shield: 0, most: 100 },
          hold: h,
        },
      ],
      1
    ),
    [vessel(2, q)],
    out,
    STEP
  );
  assert.ok(
    w.battle.crews[0].health.hull < 100 && w.battle.crews[0].hold.using
  );
});

test('the pieces drawn come in their shares of stores, each in its count', () => {
  const draw = random(7),
    n = 20000;
  const g = Array.from({ length: n }, () => rolled(draw));
  for (const kind of STORES) {
    const of = g.filter((x) => x.kind === kind);
    assert.ok(
      Math.abs(of.length / n - LOOT.shares[kind]) < 0.02,
      `${kind}: ${of.length / n}`
    );
    assert.ok(of.every((x) => x.count === LOOT.counts[kind]));
  }
});

test('the loot is strewn evenly over the planet, on open water only, the same for a seed', () => {
  const isle = fromLatLon(0, 0);
  const depth: Depth = (p) => (distance(p, isle) < 120 ? -5 : 20);
  const f = laying(5, depth).strewn();
  assert.deepEqual(f, laying(5, depth).strewn());
  assert.notDeepEqual(
    f.pieces.map((l) => l.at),
    laying(6, depth)
      .strewn()
      .pieces.map((l) => l.at)
  );
  assert.ok(f.pieces.every((l) => depth(l.at) >= SHIP.draft + PIECE.open));
  assert.ok(
    f.pieces.length > LOOT.spots * 1.3 && f.pieces.length < LOOT.spots * 1.5,
    `${f.pieces.length}`
  );
  assert.ok(f.pieces.some((l) => distance(l.at, isle) < 140));
  const cell = Math.sqrt((4 * Math.PI * R * R) / LOOT.spots);
  const draw = random(3);
  for (let k = 0; k < 200; k++) {
    const p = fromLatLon(Math.asin(2 * draw() - 1), draw() * 2 * Math.PI);
    const near = Math.min(...f.pieces.map((l) => distance(p, l.at)));
    assert.ok(near < 1.2 * cell, `${near}`);
  }
});

const stowedOf = (c: Crew) =>
  c.hold.items.map((k) => k && `${k.kind} ${k.count}`);

test('it takes what fits within reach: stacks into its slots', () => {
  const f = lying(
    piece(2, at(-5), { kind: 'repairKit', count: 4 }),
    piece(3, at(30), { kind: 'bigShield', count: 1 })
  );
  const r = swept(f, [crewOf(1, EVEN_SHIP)], [vessel(1, c0)], new Map(), 1);
  assert.deepEqual(r.crews[0].hold.items[0], { kind: 'repairKit', count: 4 });
  assert.deepEqual(
    r.flotsam.pieces.map((l) => l.id),
    [3]
  );
});

test('asked, it swaps the stack in hand for the one offered, and its own goes over the side and lies until it is clear', () => {
  let h = emptyHold();
  for (const k of ['smallShield', 'repairKit', 'bigShield'] as const)
    h = stowed(h, k, 1).hold;
  const full = { ...crewOf(1, EVEN_SHIP), hold: { ...h, chosen: 2 } };
  const f = lying(piece(4, at(3), { kind: 'fullRepair', count: 1 }));
  const r = swept(f, [full], [vessel(1, c0)], new Map([[1, 2]]), 1);
  assert.deepEqual(
    stowedOf(r.crews[0]),
    ['smallShield 1', 'fullRepair 1', 'bigShield 1'],
    'into the slot in hand'
  );
  assert.equal(r.flotsam.pieces.length, 1);
  const old = r.flotsam.pieces[0];
  assert.deepEqual([old.goods, old.from], [{ kind: 'repairKit', count: 1 }, 1]);
  const bare = {
    ...r.crews[0],
    hold: {
      ...r.crews[0].hold,
      items: [r.crews[0].hold.items[0], null, r.crews[0].hold.items[2]],
    },
  };
  let fl = drifted(r.flotsam, 2, deep);
  assert.deepEqual(
    stowedOf(swept(fl, [bare], [vessel(1, c0)], new Map(), 1).crews[0]),
    ['smallShield 1', null, 'bigShield 1'],
    'not while it is over it'
  );
  fl = swept(fl, [bare], [vessel(1, at(40))], new Map(), 1).flotsam;
  assert.deepEqual(
    stowedOf(swept(fl, [bare], [vessel(1, c0)], new Map(), 1).crews[0]),
    ['smallShield 1', 'repairKit 1', 'bigShield 1']
  );
});

test('a tap on its gun reloads it, if it is not full; with stores in hand, it takes the gun in hand', () => {
  const c = crewOf(1, EVEN_SHIP);
  const ask = (crew: Crew) =>
    asked(
      [crew],
      [vessel(1, c0)],
      lying(),
      new Map([[1, { ...NOTHING, tap: 0 }]])
    );
  const spent = { ...c, gun: { ...c.gun, rounds: 3 } };
  const b = ask(spent);
  assert.ok(
    Math.abs(
      b.crews[0].gun.reload - reloadOf('cannon', EVEN_SHIP.reloadFactor)
    ) < 1e-9
  );
  assert.deepEqual(
    b.cues.map((k) => k.kind),
    ['reloading']
  );
  assert.deepEqual(ask(c).cues, []);
  const chose = ask({ ...spent, hold: { ...spent.hold, chosen: 2 } });
  assert.deepEqual(
    [chose.crews[0].hold.chosen, chose.crews[0].gun.reload, chose.cues],
    [0, 0, []]
  );
});

test('with its slots full, a take swaps the stack in hand for what is offered', () => {
  let h = emptyHold();
  for (const k of ['smallShield', 'repairKit', 'bigShield'] as const)
    h = stowed(h, k, 1).hold;
  const c = { ...crewOf(1, EVEN_SHIP), hold: h };
  const f = lying(piece(5, at(2), { kind: 'fullRepair', count: 1 }));
  assert.equal(offered(c, c0, f)?.id, 5);
  const r = swept(f, [c], [vessel(1, c0)], new Map([[1, 2]]), 1);
  assert.deepEqual(r.crews[0].hold.items[1], { kind: 'fullRepair', count: 1 });
  assert.deepEqual(
    r.flotsam.pieces.map((l) => l.goods),
    [{ kind: 'repairKit', count: 1 }]
  );
});

test('a ship sunk spills all its stores where it lies, gone from it, kicked out to drift to a stop', () => {
  const c = {
    ...crewOf(1, EVEN_SHIP),
    hold: stowed(stowed(emptyHold(), 'smallShield', 4).hold, 'repairKit', 2)
      .hold,
  };
  const s = stored(
    [c],
    lying(),
    [vessel(1, c0)],
    new Map(),
    [1],
    STEP,
    deep,
    9
  );
  assert.deepEqual(
    s.flotsam.pieces.map((l) => l.goods),
    [
      { kind: 'smallShield', count: 4 },
      { kind: 'repairKit', count: 2 },
    ]
  );
  assert.deepEqual(s.crews[0].hold.items, [null, null, null]);
  const goods = cargo(c);
  assert.equal(goods.length, 2);
  let f = overboard({ pieces: [], next: 0 }, c0, goods, 1, 9);
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
  const f = lying(piece(1, c0, { kind: 'repairKit', count: 1 }));
  const r = swept(
    f,
    [{ ...crewOf(1, EVEN_SHIP), health: { hull: 0, shield: 0, most: 100 } }],
    [vessel(1, c0)],
    new Map(),
    1
  );
  assert.deepEqual(r.crews[0].hold.items, [null, null, null]);
  assert.equal(
    HEALTH.start,
    0,
    'it puts to sea with no shield, filled from loot'
  );
});
