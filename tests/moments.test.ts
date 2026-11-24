import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PLAYER_SHIP,
  HOTBAR,
  LIFT,
  LIVERY,
  type Deed,
} from '../src/play/player.ts';
import {
  KEEP,
  bearingFrom,
  deedsOf,
  kept,
  seenOf,
  type Done,
} from '../src/play/moments.ts';
import {
  CAMERA,
  answerTo,
  createShake,
  envelope,
  noise,
} from '../src/play/shake.ts';
import { STOPS, createStops, stopFor } from '../src/play/stops.ts';
import { createState, debugOf, type Match } from '../src/play/state.ts';
import { lookOf } from '../src/play/colors.ts';
import { PLAYER } from '../src/sim/match.ts';
import { chart } from '../src/sim/route.ts';
import { MIXED } from '../src/sim/persona.ts';
import { berthing } from '../src/sim/spawn.ts';
import { calm } from '../src/sim/storm.ts';
import { BIG, SAFE, capped, heartbeat, lowHull } from '../src/ui/sea/flash.ts';
import { landOf, planetOf } from '../src/world/land.ts';
import { SEED } from '../src/world/environment.ts';
import {
  R,
  bearingAt,
  normalize,
  scale,
  type Vec3,
} from '../src/world/sphere.ts';
import { flat } from '../src/world/swell.ts';
import { lookAt } from '../src/world/turn.ts';

const at: Vec3 = [0, 0, 1];
const none: Done = {
  shots: [],
  splashes: [],
  strikes: [],
  sunk: [],
  took: [],
  mended: [],
  blew: [],
  cues: [],
  own: at,
};
const counter = () => {
  let n = 0;
  return () => ++n;
};

test("its id in the deeds is the match's player", () => {
  assert.equal(PLAYER_SHIP, PLAYER);
});

test(
  "a step's deeds: numbered in order, swapped, fired (by kind), wound and reloaded, fell, struck, sank, then its stores; " +
    "others' stores and reloads unreported",
  () => {
    const done: Done = {
      ...none,
      shots: [
        {
          shooter: 2,
          from: scale(at, R + 3),
          dirs: [[1, 0, 0]],
          gun: 'scatter',
        },
      ],
      splashes: [{ shooter: 2, at, land: false, gun: 'scatter' }],
      strikes: [
        {
          shooter: 0,
          struck: 2,
          damage: 30,
          shield: 10,
          hull: 20,
          broke: true,
          at,
          ram: false,
          gun: 'scatter',
        },
      ],
      sunk: [{ id: 2, by: 0, at }],
      took: [
        { id: 1, ship: 0, goods: { kind: 'harpoon', rarity: 3 }, at, slot: 1 },
        {
          id: 2,
          ship: 0,
          goods: { kind: 'smallShield', count: 3 },
          at,
          slot: 2,
        },
        { id: 3, ship: 5, goods: { kind: 'repairKit', count: 1 }, at, slot: 1 },
      ],
      mended: [
        { ship: 0, use: 'bigShield' },
        { ship: 5, use: 'repairKit' },
      ],
      blew: [0, 5],
      cues: [
        { ship: 0, at, kind: 'reloaded', gun: 'cannon' },
        { ship: 5, at, kind: 'reloading', gun: 'cannon' },
        { ship: 5, at, kind: 'winding', gun: 'mortar' },
        { ship: 0, at, kind: 'swapped', gun: 'harpoon' },
      ],
    };
    const d = deedsOf(done, 0, counter(), 12);
    assert.deepEqual(
      d.map((x) => [x.seq, x.kind, x.ship]),
      [
        [1, 'swapped', 0],
        [2, 'fired', 2],
        [3, 'reloaded', 0],
        [4, 'winding', 5],
        [5, 'fell', 2],
        [6, 'struck', 2],
        [7, 'sank', 2],
        [8, 'took', 0],
        [9, 'took', 0],
        [10, 'mended', 0],
        [11, 'gust', 0],
      ]
    );
    assert.ok(d.every((x) => x.time === 12));
    assert.ok(
      d[1].kind === 'fired' &&
        d[1].gun === 'scatter' &&
        d[3].kind === 'winding' &&
        d[3].gun === 'mortar'
    );
    const struck = d[5];
    assert.ok(
      struck.kind === 'struck' &&
        struck.by === 0 &&
        struck.shield === 10 &&
        struck.hull === 20 &&
        struck.broke,
      'the blow carried'
    );
    const [gun, stores] = [d[7], d[8]];
    assert.ok(
      gun.kind === 'took' &&
        gun.piece === 'harpoon' &&
        gun.rarity === 3 &&
        gun.slot === 1
    );
    assert.ok(
      stores.kind === 'took' &&
        stores.piece === 'smallShield' &&
        stores.slot === HOTBAR.guns + 1
    );
    assert.deepEqual(
      deedsOf({ ...done, own: null }, 0, counter(), 12).map((x) => x.kind),
      [
        'swapped',
        'fired',
        'reloaded',
        'winding',
        'fell',
        'struck',
        'sank',
        'took',
        'took',
      ]
    );
  }
);

test('kept: the last KEEP seconds, then the fresh; nothing new and nothing stale keeps the same list', () => {
  const deed = (seq: number, time: number): Deed => ({
    seq,
    time,
    at,
    ship: 1,
    kind: 'fired',
    gun: 'cannon',
  });
  const old = [deed(1, 0), deed(2, 0.5)];
  assert.deepEqual(
    kept(old, [deed(3, 1.2)], 1.2).map((d) => d.seq),
    [2, 3]
  );
  assert.deepEqual(
    kept(old, [], 0.9).map((d) => d.seq),
    [1, 2]
  );
  assert.deepEqual(
    kept(old, [], 0.5 + KEEP).map((d) => d.seq),
    []
  );
});

test('as she sees it: the bearing clockwise from the look, its distance, and on her screen when ahead', () => {
  const position = scale(at, R + 10),
    north: Vec3 = [0, 1, 0];
  const eye = {
    kind: 'air' as const,
    position,
    orientation: lookAt(position, scale(normalize([0, 0.1, 1]), R), at),
    fov: 50,
  };
  const ahead = normalize([0, 0.1, 1]),
    right = normalize([0.1, 0, 1]),
    behind = normalize([0, -0.1, 1]);
  assert.ok(Math.abs(bearingFrom(eye, scale(ahead, R))) < 0.2);
  assert.ok(
    Math.abs(bearingFrom(eye, scale(right, R)) - Math.PI / 2) < 0.3,
    `${bearingFrom(eye, scale(right, R))}`
  );
  assert.ok(
    Math.abs(Math.abs(bearingFrom(eye, scale(behind, R))) - Math.PI) < 0.2
  );
  const d: Deed = {
    seq: 1,
    time: 0,
    at: ahead,
    ship: 3,
    kind: 'fell',
    land: false,
  };
  const seen = seenOf(d, eye, 956, 440);
  assert.ok(
    seen.seen && seen.seen.x > 400 && seen.seen.x < 556,
    JSON.stringify(seen.seen)
  );
  assert.ok(
    Math.abs(
      seen.meters -
        Math.hypot(...[0, 1, 2].map((i) => scale(ahead, R)[i] - position[i]))
    ) < 1e-6
  );
  assert.equal(seenOf({ ...d, at: behind }, eye, 956, 440).seen, null);
  void north;
  const blow: Deed = {
    seq: 2,
    time: 0,
    at: ahead,
    ship: PLAYER_SHIP,
    kind: 'struck',
    by: 4,
    shield: 0,
    hull: 10,
    broke: false,
    ram: false,
  };
  for (const by of [ahead, right, behind])
    assert.ok(
      Math.abs(
        (seenOf(blow, eye, 956, 440, by).whence ?? NaN) -
          bearingFrom(eye, scale(by, R + LIFT.struck))
      ) < 1e-9
    );
  assert.ok(
    Math.abs(
      Math.abs(seenOf(blow, eye, 956, 440, behind).whence ?? 0) - Math.PI
    ) < 0.2
  );
  assert.equal(seenOf(blow, eye, 956, 440).whence, null);
});

test('the match records its deeds: a ship sunk is told once, with a sink blast to draw', () => {
  const planet = planetOf(SEED, landOf(SEED)),
    depth = (p: Vec3) => -planet.height(p),
    start = planet.start;
  const match: Match = {
    seed: 1,
    type: MIXED,
    gun: null,
    storm: () => calm(start.at),
  };
  const state = createState(
    planet,
    flat,
    { chart: chart(depth), water: berthing(depth) },
    match
  );
  const before = state.deeds().at(-1)?.seq ?? 0;
  const there = normalize([start.at[0] + 0.05, start.at[1], start.at[2]]);
  debugOf(state).atSea(start, [
    {
      at: there,
      heading: bearingAt(there, 0),
      look: lookOf(LIVERY),
      lashed: null,
    },
  ]);
  const other = state.vessels().find((v) => v.id !== PLAYER)!.id;
  debugOf(state).sink(other, PLAYER);
  const sank = state.deeds().filter((d) => d.seq > before && d.kind === 'sank');
  assert.equal(sank.length, 1);
  assert.ok(
    sank[0].kind === 'sank' && sank[0].ship === other && sank[0].by === PLAYER
  );
  assert.ok(state.blasts().some((b) => b.kind === 'sink'));
  state.advance({ course: null, throttle: 0 }, { aim: null, fire: false });
  assert.equal(
    state.deeds().filter((d) => d.kind === 'sank').length,
    1,
    'told once'
  );
});

test("the camera answers: its blows, the blows on it, its sinking of one; others' blows on others not at all", () => {
  const struck = (
    by: number,
    ship: number,
    shield: number,
    hull: number,
    broke = false
  ): Deed => ({
    seq: 1,
    time: 0,
    at,
    ship,
    kind: 'struck',
    by,
    shield,
    hull,
    broke,
    ram: false,
  });
  assert.equal(answerTo(struck(0, 2, 0, 20), 0)?.answer, CAMERA.hit);
  assert.equal(answerTo(struck(0, 2, 20, 0), 0)?.answer, CAMERA.shieldHit);
  assert.equal(
    answerTo(struck(0, 2, 10, 10, true), 0)?.answer,
    CAMERA.shieldBreak
  );
  assert.equal(answerTo(struck(2, 0, 0, 20), 0)?.answer, CAMERA.hurt);
  assert.equal(
    answerTo(struck(2, 0, 10, 10, true), 0)?.answer,
    CAMERA.shieldLost
  );
  assert.equal(answerTo(struck(2, 3, 0, 20), 0), null);
  assert.equal(
    answerTo({ seq: 1, time: 0, at, ship: 2, kind: 'sank', by: 0 }, 0)?.answer,
    CAMERA.sink
  );
  assert.equal(
    answerTo({ seq: 1, time: 0, at, ship: 2, kind: 'fired', gun: 'cannon' }, 0),
    null
  );
  assert.equal(stopFor(struck(0, 2, 0, 30), 0)?.stop, STOPS.hit);
  assert.equal(stopFor(struck(2, 3, 0, 30), 0), null);
});

test('shake: trauma drains, the shake is bounded and at rest after; a pulse rises, holds and falls to nothing', () => {
  const s = createShake(7);
  s.play(CAMERA.sink, 1);
  let most = 0;
  for (let i = 0; i < 120; i++) {
    s.update(1 / 60);
    const o = s.offset();
    most = Math.max(most, Math.abs(o.roll), Math.abs(o.pitch));
    assert.ok(o.fov <= 0 && o.fov >= -6.0001, `${o.fov}`);
  }
  assert.ok(most > 0.05 && most < 5, `${most}`);
  for (let i = 0; i < 120; i++) s.update(1 / 60);
  const o = s.offset();
  assert.equal(s.trauma().hit, 0);
  assert.ok(
    Math.abs(o.roll) < 0.01 && Math.abs(o.fov) < 1e-9,
    JSON.stringify(o)
  );
  const p = { deg: -2, attack: 0.05, hold: 0.1, release: 0.3 };
  assert.equal(envelope(p, 0), 0);
  assert.equal(envelope(p, 0.1), 1);
  assert.ok(envelope(p, 0.3) > 0 && envelope(p, 0.3) < 1);
  assert.equal(envelope(p, 0.5), 0);
  for (let x = 0; x < 20; x += 0.37) assert.ok(Math.abs(noise(x, 3)) <= 1.01);
  const far = createShake(1);
  far.play(CAMERA.near, 1, 0, 400);
  assert.equal(far.trauma().rumble, 0);
});

test("hit-stop: held, then eased back; a sinking's outlasts a hit's; a run of hits is budgeted", () => {
  const s = createStops();
  s.request(STOPS.hit);
  assert.ok(s.update(1 / 60) < 0.1 / 60);
  let t = 0;
  for (let i = 0; i < 30; i++) t += s.update(1 / 60);
  assert.ok(Math.abs(s.update(1 / 60) - 1 / 60) < 1e-9, 'back to full speed');
  const k = createStops();
  let frozen = 0;
  for (let i = 0; i < 60; i++) {
    if (i % 3 === 0) k.request(STOPS.shieldBreak);
    frozen += 1 / 60 - k.update(1 / 60);
  }
  assert.ok(frozen < 0.35, `${frozen}`);
  void t;
});

test('flashes: no more than BIG strong ones a second; the heartbeat from 30% of its hull, quicker the lower', () => {
  assert.equal(capped(0.28, BIG - 1), 0.28);
  assert.equal(capped(0.28, BIG), SAFE);
  assert.equal(capped(0.08, BIG), 0.08);
  assert.equal(lowHull(0.5).k, 0);
  assert.ok(lowHull(0.2).k > 0 && lowHull(0.06).bpm > lowHull(0.2).bpm);
  assert.equal(lowHull(0).k, 0, 'sunk, none');
  const beats = Array.from({ length: 120 }, (_, i) =>
    heartbeat(i / 60, 72, 0.15)
  );
  assert.ok(Math.max(...beats) > 0.9 && Math.min(...beats) === 0);
});
