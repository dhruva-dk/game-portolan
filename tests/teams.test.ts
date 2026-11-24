import { test } from 'node:test';
import assert from 'node:assert/strict';
import { KINDS } from '../src/sim/kinds.ts';
import { createTally, finishing } from '../src/sim/tally.ts';
import {
  battleOf,
  crewOf,
  marksOf,
  stepBattle,
  type Battle,
  type Strike,
} from '../src/sim/battle.ts';
import { mind, think } from '../src/sim/bot.ts';
import { RACE, mates, over } from '../src/sim/teams.ts';
import { afloat, stepFleet, type Vessel } from '../src/sim/contact.ts';
import { STEP } from '../src/sim/fixed.ts';
import { gunOf, laid } from '../src/sim/gun.ts';
import { HEALTH, SHIP } from '../src/sim/handling.ts';
import { startMatch, stepMatch, type Report } from '../src/sim/match.ts';
import { nature } from '../src/sim/persona.ts';
import type { Depth } from '../src/sim/shoal.ts';
import { shipAt, turned } from '../src/sim/ship.ts';
import { loosed, type Ball } from '../src/sim/shot.ts';
import type { Cap } from '../src/sim/storm.ts';
import { TERRITORY, createTerritory } from '../src/sim/territory.ts';
import {
  R,
  add,
  along,
  distance,
  frameAt,
  fromLatLon,
  normalize,
  scale,
  type Vec3,
} from '../src/world/sphere.ts';

const deep: Depth = () => 30;
const center = fromLatLon(0.2, 0.3),
  { east, north } = frameAt(center);
const at = (x: number, y: number): Vec3 =>
  normalize(add(add(center, east, x / R), north, y / R));
const lying = (id: number, x: number, y: number): Vessel => {
  const p = at(x, y);
  return afloat(id, shipAt(p, frameAt(p).east));
};
const still = (f: readonly Vessel[]) =>
  f.map(() => ({ aim: null, fire: false }));

const TEAMS = [9, 0, 0, 1];

function fired(
  kind: 'cannon' | 'mortar',
  fleet: Vessel[],
  on: Vessel,
  teams?: readonly number[]
) {
  const from = scale(fleet[0].ship.at, R + 20);
  const lay = laid(
    fleet[0],
    gunOf(kind, 0),
    {
      from,
      dir: normalize(add(scale(on.ship.at, R + SHIP.rig / 2), from, -1)),
    },
    [fleet[0], on],
    { seed: 7, depth: deep, spread: 0 }
  );
  assert.equal(lay.target, on.id, 'laid on it');
  const ball: Ball = loosed(1, kind, lay.from, lay.dirs[0], lay.speed, 40);
  let b: Battle = {
    ...battleOf(
      fleet.map((v) => crewOf(v.id)),
      0,
      undefined,
      teams
    ),
    balls: [ball],
  };
  const strikes: Strike[] = [];
  let splashes = 0;
  for (let i = 0; i < 300 && b.balls.length; i++) {
    const r = stepBattle(b, fleet, still(fleet), [], STEP, deep);
    b = r.battle;
    strikes.push(...r.strikes);
    splashes += r.splashes.length;
  }
  assert.equal(b.balls.length, 0, 'the ball is spent');
  return { strikes, splashes, hull: hulls(b) };
}
const hulls = (b: Battle) =>
  new Map(b.crews.map((c) => [c.id, c.health.hull + c.health.shield]));
const WHOLE = HEALTH.hull + HEALTH.start;

test('mates: ships of one team, never a ship and itself, and none with no teams', () => {
  assert.equal(mates(TEAMS, 1, 2), true);
  assert.equal(mates(TEAMS, 2, 3), false);
  assert.equal(mates(TEAMS, 1, 1), false);
  assert.equal(mates(undefined, 1, 2), false);
});

test("a ball that meets a mate's hull stops there and harms nothing; another team's it strikes", () => {
  const fleet = [lying(1, 0, 0), lying(2, 90, 40)];
  const foe = fired('cannon', fleet, fleet[1], [9, 0, 1]);
  assert.deepEqual(
    foe.strikes.map((s) => [s.shooter, s.struck]),
    [[1, 2]]
  );
  assert.ok(foe.hull.get(2)! < WHOLE);
  const mate = fired('cannon', fleet, fleet[1], TEAMS);
  assert.deepEqual(mate.strikes, [], 'no strike on a mate');
  assert.equal(mate.hull.get(2), WHOLE, 'it is whole');
  assert.equal(mate.splashes, 0, 'and the ball went no further: no splash');
});

test("a shell's burst spares its team, and still takes the other ships within it", () => {
  const fleet = [lying(1, 0, 0), lying(2, 120, 0), lying(3, 120, 9)];
  const free = fired('mortar', fleet, fleet[1]);
  assert.deepEqual(
    free.strikes.map((s) => s.struck).sort(),
    [2, 3],
    'with no teams, both take it'
  );
  const r = fired('mortar', fleet, fleet[1], TEAMS);
  assert.deepEqual(
    r.strikes.map((s) => [s.shooter, s.struck]),
    [[1, 3]]
  );
  assert.equal(r.hull.get(2), WHOLE, 'its mate is whole');
  assert.ok(r.hull.get(3)! < WHOLE, 'the other is not');
});

test('a ram between mates harms neither, and their hulls still part; between teams it harms both', () => {
  const rammed = (teams: readonly number[]) => {
    const target = lying(2, 0, 0).ship;
    const from = along(
      target.at,
      turned(target, Math.PI / 2),
      -45 - SHIP.length / 2
    );
    let fleet = [
      afloat(1, { ...shipAt(from.p, from.t), speed: SHIP.top }),
      afloat(2, target),
    ];
    let b = battleOf([crewOf(1), crewOf(2)], 1, undefined, teams),
      blows = 0;
    const strikes: Strike[] = [];
    for (let i = 0; i < 6 / STEP; i++) {
      const met = stepFleet(
        fleet,
        [
          { course: null, throttle: 1 },
          { course: null, throttle: 0 },
        ],
        STEP,
        deep
      );
      fleet = met.fleet;
      blows += met.blows.length;
      const r = stepBattle(b, fleet, still(fleet), met.blows, STEP, deep);
      b = r.battle;
      strikes.push(...r.strikes);
    }
    return { blows, strikes, hull: hulls(b) };
  };
  const foes = rammed([9, 0, 1]);
  assert.equal(foes.blows, 1);
  assert.equal(foes.strikes.length, 2);
  assert.ok(foes.hull.get(1)! < WHOLE && foes.hull.get(2)! < WHOLE);
  const ours = rammed(TEAMS);
  assert.equal(ours.blows, 1, 'the hulls met, and parted as hulls do');
  assert.deepEqual(ours.strikes, []);
  assert.deepEqual([ours.hull.get(1), ours.hull.get(2)], [WHOLE, WHOLE]);
});

test("the gun's assist never lays on a mate: its marks are every ship but its team's", () => {
  const fleet = [lying(1, 0, 0), lying(2, 80, 0), lying(3, 140, 0)];
  const b = battleOf([], 0, undefined, TEAMS);
  assert.deepEqual(
    marksOf(b, 1, fleet).map((v) => v.id),
    [1, 3]
  );
  assert.equal(marksOf(battleOf([], 0), 1, fleet), fleet, 'no teams: all');
  const from = scale(fleet[0].ship.at, R + 20),
    sight = {
      from,
      dir: normalize(add(scale(fleet[1].ship.at, R + 2), from, -1)),
    },
    opts = { seed: 3, depth: deep, spread: 0, cone: 0.2 };
  assert.equal(
    laid(fleet[0], gunOf('cannon', 4), sight, fleet, opts).target,
    2
  );
  assert.equal(
    laid(fleet[0], gunOf('cannon', 4), sight, marksOf(b, 1, fleet), opts)
      .target,
    3
  );
});

test('a bot never takes a mate for its foe, nor notes it in its log; a ship of another team it does', () => {
  const own = (team: number) => ({
    id: 1,
    ship: shipAt(center, north),
    hull: 100,
    armed: true,
    team,
  });
  const other = {
    id: 2,
    ship: shipAt(along(center, north, 70).p, north),
    hull: 20,
    shield: 0,
    armed: true,
    team: 0,
  };
  for (const seed of [1, 2, 3, 4, 5]) {
    let foe = mind(seed, center),
      mate = mind(seed, center);
    for (let k = 0; k < 12; k++) {
      foe = think(own(1), [other], { depth: deep }, foe, nature(seed)).memory;
      mate = think(own(0), [other], { depth: deep }, mate, nature(seed)).memory;
    }
    assert.equal(foe.foe, 2, `${seed}: another team's ship is in its eye`);
    assert.ok(foe.log.some((s) => s.id === 2));
    assert.equal(mate.foe, -1, `${seed}: its mate is not`);
    assert.deepEqual(mate.log, [], `${seed}: nor in its log`);
  }
});

const CALM: Cap = { center: [0, 1, 0], radius: Math.PI };
type Sea = ReturnType<typeof createTerritory>;
function sail(t: Sea, id: number, ...points: Vec3[]) {
  const claimed: number[] = [];
  for (let k = 1; k < points.length; k++) {
    const a = points[k - 1],
      b = points[k],
      n = Math.ceil(distance(a, b) / 0.4);
    let from = a;
    for (let i = 1; i <= n; i++) {
      const to = normalize(add(scale(a, 1 - i / n), b, i / n));
      for (const c of t.step([{ id, from, to }], 0, CALM).claimed)
        claimed.push(c.meters);
      from = to;
    }
  }
  return claimed;
}

test("a mate crossing its water takes none of it; another team's strip does", () => {
  for (const teams of [[0, 0], undefined]) {
    const t = createTerritory(2, teams);
    t.begin([at(0, 0), at(70, 0)], 0);
    const theirs = t.share(1);
    sail(t, 0, at(0, 0), at(140, 0));
    if (teams) {
      assert.equal(t.ownerAt(at(70, 0)), 1, "its mate's patch is its mate's");
      assert.equal(t.share(1), theirs, 'all of it');
      assert.equal(t.ownerAt(at(125, 0)), 0, 'beyond it, it paints its own');
      assert.equal(t.teamAt(at(70, 0)), 0);
      assert.equal(t.teamAt(at(125, 0)), 0);
      assert.equal(t.teamAt(at(0, 300)), -1, 'open sea is no team’s');
      assert.equal(t.teamShare(0), t.share(0) + t.share(1));
      assert.equal(t.teamShare(1), t.teamShare(0));
    } else {
      assert.equal(t.ownerAt(at(70, 0)), 0);
      assert.ok(t.share(1) < theirs);
      assert.equal(t.teamAt(at(70, 0)), 0, 'with no teams, it is its own');
      assert.equal(t.teamShare(0), t.share(0));
    }
  }
});

test("its strip coming against its mate's water closes its loop, fenced by its team's water; the mate's stays its own", () => {
  for (const teams of [[0, 0], undefined]) {
    const t = createTerritory(2, teams);
    t.begin([at(0, -100), at(0, 0)], 0);
    sail(t, 1, at(0, 0), at(160, 0));
    const strip = t.share(1);
    const claimed = sail(
      t,
      0,
      at(0, -100),
      at(0, 60),
      at(140, 60),
      at(140, -TERRITORY.brush)
    );
    if (teams) {
      assert.equal(claimed.length, 1, 'one loop closed');
      assert.ok(
        claimed[0] > 0.5 * 140 * 60 && claimed[0] < 140 * 60,
        `it took ${claimed[0].toFixed(0)} m²`
      );
      assert.equal(t.ownerAt(at(70, 30)), 0, 'what it fences off is its own');
      assert.equal(t.ownerAt(at(70, 0)), 1, "its mate's strip is its mate's");
      assert.equal(t.share(1), strip);
    } else {
      assert.deepEqual(claimed, [], 'with no teams, no loop');
      assert.equal(t.ownerAt(at(70, 30)), -1);
      assert.ok(t.share(1) < strip, 'and its strip cut the other’s');
    }
  }
});

test('a race is over when every ship afloat is of one team, or none is; or called on its overtime', () => {
  const teams = [0, 0, 1, 1, 2, 2];
  assert.equal(over(teams, [0, 1, 2, 3, 4, 5], -400), false);
  assert.equal(over(teams, [1, 2], 0), false, 'two teams afloat');
  assert.equal(over(teams, [2, 3], -400), true, 'one team, both ships');
  assert.equal(over(teams, [5], -400), true);
  assert.equal(over(teams, [], -400), true, 'none afloat');
  assert.equal(over(teams, [1, 2], RACE.overtime - STEP), false);
  assert.equal(over(teams, [1, 2], RACE.overtime), true, 'called');
});

test('the finishing order: the afloat by sinkings, then share, then id; the sunk, last sunk first', () => {
  const sunk = [
    { id: 7, by: 2 },
    { id: 4, by: null },
    { id: 5, by: 2 },
    { id: 0, by: 6 },
  ];
  const share = (id: number) => (id === 3 ? 0.2 : 0.1);
  assert.deepEqual(
    finishing([1, 2, 3, 6], sunk, share),
    [2, 6, 3, 1, 0, 5, 4, 7]
  );
  assert.deepEqual(finishing([], sunk, share), [0, 5, 4, 7]);
});

test("a race's tally: shots fired and landed (a ram is no shot), damage dealt and taken (a ram's too), the places", () => {
  const teams = [0, 0, 0, 0, 1, 1, 1, 1];
  const tally = () => createTally(teams, 400),
    t = tally();
  assert.deepEqual(t.teams, teams);
  const strike = (shooter: number, struck: number, ram: boolean): Strike => ({
    shooter,
    struck,
    damage: 10,
    shield: 4,
    hull: 6,
    broke: false,
    at: center,
    ram,
    gun: ram ? null : KINDS[0],
  });
  const shot = { shooter: 1, gun: KINDS[0], from: center, dirs: [], target: 4 };
  const standing = (alive: number[], loot: number) => () => ({
    seconds: 61,
    alive,
    fleet: [],
    crews: [],
    sunk: [
      { id: 6, by: null, cause: 'storm' as const, gun: null, time: 30 },
      { id: 5, by: 1, cause: 'shot' as const, gun: KINDS[0], time: 40 },
      { id: 7, by: null, cause: 'storm' as const, gun: null, time: 55 },
      { id: 4, by: 1, cause: 'ram' as const, gun: null, time: 60 },
    ].filter((s) => !alive.includes(s.id)),
    loot,
    share: (id: number) => id / 100,
  });
  t.settle(
    [shot, shot, { ...shot, shooter: 4 }],
    [strike(1, 4, false)],
    standing([0, 1, 2, 3, 4], 9)
  );
  assert.equal(t.made(), null, 'two teams afloat: the race is on');
  const last = [strike(4, 1, true), strike(1, 4, true), strike(1, 5, false)];
  t.settle([], last, standing([0, 1, 2, 3], 9));
  const r = t.made();
  assert.ok(r, 'one team afloat: over, and its result made');
  t.settle([shot], last, standing([0], 2));
  assert.equal(t.made(), r, 'nothing more is tallied once it is over');
  assert.deepEqual(
    r.ships.map((s) => s.place),
    [4, 1, 3, 2, 5, 7, 8, 6]
  );
  assert.deepEqual(
    r.ships.map((s) => [s.sunkAt, s.sunkBy]),
    [
      [null, null],
      [null, null],
      [null, null],
      [null, null],
      [60, 1],
      [40, 1],
      [30, null],
      [55, null],
    ]
  );
  assert.equal(r.ships[1].sinkings, 2);
  const tallied = (id: number) => {
    const s = r.ships[id];
    return [s.shotsFired, s.shotsLanded, s.damageDealt, s.damageTaken];
  };
  assert.deepEqual(tallied(1), [2, 2, 30, 10]);
  assert.deepEqual(tallied(4), [1, 0, 10, 20]);
  assert.deepEqual(tallied(5), [0, 0, 0, 10]);
  assert.deepEqual(tallied(6), [0, 0, 0, 0]);
  assert.equal(r.seconds, 61);
  assert.match(r.hash, /^[0-9a-f]{8}$/);
  const hashOf = (loot: number) => {
    const again = tally();
    again.settle([], [], standing([0, 1, 2, 3], loot));
    return again.made()?.hash;
  };
  assert.equal(hashOf(9), r.hash);
  assert.notEqual(hashOf(8), r.hash);
  const late = createTally(teams, 61 - RACE.overtime);
  late.settle([], [], standing([0, 1, 2, 3, 4], 9));
  assert.deepEqual(
    late
      .made()
      ?.ships.slice(0, 5)
      .map((s) => s.place),
    [5, 1, 4, 3, 2]
  );
});

test("a race's flow: afloat as it ends it has its place there; sunk, it watches a mate first; it is over when the game says", () => {
  const teams = [0, 0, 1, 1, 2, 2];
  const race = (o: boolean, place = 0) => ({ teams, over: o, place });
  let m = startMatch();
  const on: Report = {
    sinkings: [],
    alive: [0, 1, 2, 3, 4, 5],
    race: race(false),
  };
  m = stepMatch(m, on, STEP);
  assert.deepEqual([m.phase, m.over], ['fighting', false]);
  const sunk = [2, 3, 4, 5].map((id) => ({
    id,
    by: 1,
    cause: 'shot' as const,
    gun: KINDS[0],
  }));
  m = stepMatch(
    m,
    { sinkings: sunk, alive: [0, 1], race: race(true, 2) },
    STEP
  );
  assert.deepEqual([m.phase, m.place, m.over], ['won', 2, true]);
  let s = stepMatch(startMatch(), on, STEP);
  const playerSinking = { id: 0, by: 4, cause: 'shot' as const, gun: KINDS[0] };
  s = stepMatch(
    s,
    { sinkings: [playerSinking], alive: [1, 2, 3, 4, 5], race: race(false) },
    STEP
  );
  assert.deepEqual([s.phase, s.place, s.over], ['spectating', 6, false]);
  assert.equal(s.watch, 1, 'it watches its mate, not the ship that sank it');
  const mate = { id: 1, by: 3, cause: 'ram' as const, gun: null };
  s = stepMatch(
    s,
    { sinkings: [playerSinking, mate], alive: [2, 3, 4, 5], race: race(false) },
    STEP
  );
  assert.deepEqual([s.watch, s.over], [3, false]);
  s = stepMatch(
    s,
    { sinkings: [playerSinking, mate], alive: [2, 3], race: race(true, 5) },
    STEP
  );
  assert.equal(s.over, true, 'one team afloat: over, though two ships are');
  assert.equal(s.place, 6, 'its place is as it sank');
});
