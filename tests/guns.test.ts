// The five guns (sim/handling.ts GUNS) as they fight (sim/battle.ts): how long
// each takes to sink a ship at its best range, its magazine, interval, reload
// and wind-up, the time to take one up, the fall-off of its bite, the mortar's
// burst, the scatter's cut rigging, and the same fight every time. (What is dropped on a sinking:
// loot.test.ts; a bot's choice by range: gunner.test.ts.)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  battleOf,
  crewOf,
  stepBattle,
  type Battle,
  type Cue,
  type Crew,
  type Order,
} from '../src/sim/battle.ts';
import { afloat, type Vessel } from '../src/sim/contact.ts';
import { STEP } from '../src/sim/fixed.ts';
import { falloff, gunOf } from '../src/sim/gun.ts';
import { KINDS, type GunKind } from '../src/kinds.ts';
import { EQUIP, FALLOFF, GUNS, RIGGING } from '../src/sim/handling.ts';
import { crewed, stored } from '../src/sim/stores.ts';
import { LOOT, isArms, laying } from '../src/sim/loot.ts';
import { toEdge } from '../src/sim/storm.ts';
import { loosed } from '../src/sim/shot.ts';
import type { Depth } from '../src/sim/shoal.ts';
import { shipAt, turned, type ShipState } from '../src/sim/ship.ts';
import {
  R,
  along,
  frameAt,
  fromLatLon,
  normalize,
  scale,
  type Vec3,
} from '../src/world/sphere.ts';

const deep: Depth = () => 30;
const centre = fromLatLon(0.2, 0.3);
/** A ship at `c` heading `bearing` (radians to port of east), still. */
const lying = (c: Vec3, bearing: number): ShipState => {
  const s = shipAt(c, frameAt(c).east);
  return { ...s, heading: turned(s, bearing), speed: 0 };
};
/** The point `metres` east of the centre. */
const east = (metres: number) =>
  along(centre, lying(centre, 0).heading, metres).p;
/** Each kind's best range, m: inside its fall-off's hold, the scatter close. */
const BEST: Record<GunKind, number> = {
  cannon: 100,
  scatter: 30,
  repeater: 80,
  harpoon: 150,
  mortar: 100,
};

/**
 * The still fleet fought for `seconds` (or till `until`), ship 1 holding her
 * trigger with no spread, laid along her heading (the assist on what stands
 * there); each step's shots, cues and sinkings, timed.
 */
function fight(
  crews: Crew[],
  fleet: Vessel[],
  seconds: number,
  until: (sunk: number[]) => boolean = () => false,
  order: Order = { aim: null, fire: true, spread: 0 }
) {
  let b: Battle = battleOf(crews, 7);
  const shots: number[] = [],
    cues: { t: number; cue: Cue }[] = [];
  for (let i = 0; i < Math.round(seconds / STEP); i++) {
    const r = stepBattle(
      b,
      fleet,
      fleet.map((v) => (v.id === 1 ? order : { aim: null, fire: false })),
      [],
      STEP,
      deep
    );
    b = r.battle;
    // (each at the step's end)
    shots.push(...r.shots.map(() => (i + 1) * STEP));
    cues.push(...r.cues.map((cue) => ({ t: (i + 1) * STEP, cue })));
    if (until(r.sunk)) return { battle: b, shots, cues, time: (i + 1) * STEP };
  }
  return { battle: b, shots, cues, time: Infinity };
}

/**
 * Seconds a common gun of `kind` takes to sink a still ship of 100 hull and
 * `shield` lying across its line at its best range.
 */
function ttk(kind: GunKind, shield: number) {
  const target = { ...crewOf(2), health: { hull: 100, shield } };
  return fight(
    [crewOf(1, gunOf(kind, 0)), target],
    [
      afloat(1, lying(centre, 0)),
      afloat(2, lying(east(BEST[kind]), Math.PI / 2)),
    ],
    20,
    (s) => s.includes(2)
  ).time;
}

// Every ball home, the flight counted: the scatter quickest close, the repeater
// quickest through a shield, the harpoon and the mortar slowest (the one
// out-ranging all, the other bursting over several and lobbing over land).
test('each gun sinks a ship at its best range in a band: 1–5 s against her hull, 2.5–10 s against hull and shield', () => {
  const rows = KINDS.map((k) => [k, ttk(k, 0), ttk(k, 100)] as const);
  console.log(
    rows
      .map(
        ([k, a, b]) =>
          `${k.padEnd(9)} ${BEST[k]} m  100: ${a.toFixed(2)} s  100+100: ${b.toFixed(2)} s`
      )
      .join('\n')
  );
  for (const [k, hull, both] of rows) {
    assert.ok(
      hull >= 0.9 && hull <= 5,
      `${k} against 100: ${hull.toFixed(2)} s`
    );
    assert.ok(
      both >= 2.5 && both <= 10,
      `${k} against 100+100: ${both.toFixed(2)} s`
    );
  }
  // none takes more than three and a half times another's through a shield
  const both = rows.map((r) => r[2]);
  assert.ok(Math.max(...both) / Math.min(...both) < 3.5);
});

test("a scatter's grape cuts the rigging of the ship it strikes: she sails at RIGGING of the speed she asks till it is mended; a cannon's ball cuts none", () => {
  const struck = (kind: GunKind) =>
    fight(
      [crewOf(1, gunOf(kind, 0)), crewOf(2)],
      [
        afloat(1, lying(centre, 0)),
        afloat(2, lying(east(BEST.scatter), Math.PI / 2)),
      ],
      0.5
    ).battle.crews[1];
  assert.equal(struck('cannon').cut, 0);
  const c = struck('scatter');
  assert.ok(c.cut > 0 && c.cut <= GUNS.scatter.cuts, `${c.cut}`);
  const helm = { course: null, throttle: 0.8 };
  assert.equal(crewed(helm, c).throttle, 0.8 * RIGGING);
  // mended after the fighting, as the seconds pass
  let crews = [c];
  for (let i = 0; i < Math.ceil(GUNS.scatter.cuts / STEP); i++)
    crews = stored(
      crews,
      { pieces: [], next: 0 },
      [],
      new Map(),
      [],
      STEP,
      deep,
      1
    ).crews;
  assert.equal(crews[0].cut, 0);
  assert.equal(crewed(helm, crews[0]).throttle, 0.8);
});

/** Ship 1 alone with a common gun of `kind` (more given after it), her trigger held for `seconds`, out at sea. */
const alone = (kind: GunKind, seconds: number, crew: Partial<Crew> = {}) =>
  fight(
    [{ ...crewOf(1, gunOf(kind, 0)), ...crew }],
    [afloat(1, lying(centre, 0))],
    seconds,
    undefined,
    { aim: null, fire: true }
  );

test('held, a gun fires its magazine at its interval, reloads, and fires again', () => {
  for (const k of ['cannon', 'scatter', 'repeater'] as const) {
    const g = GUNS[k],
      { shots, cues } = alone(k, g.interval * g.mag + g.reload + 0.3);
    assert.equal(shots[0], STEP, `${k}: the first at once`);
    for (let i = 1; i < g.mag; i++) {
      assert.ok(
        Math.abs(shots[i] - shots[i - 1] - g.interval) < STEP + 1e-9,
        `${k}: shot ${i} after ${(shots[i] - shots[i - 1]).toFixed(3)} s`
      );
    }
    const gap = shots[g.mag] - shots[g.mag - 1];
    assert.ok(
      gap >= g.reload && gap <= g.reload + 2 * STEP + 1e-9,
      `${k}: the reload ${gap.toFixed(3)} s`
    );
    assert.deepEqual(
      cues.map((c) => c.cue.kind),
      ['reloading', 'reloaded'],
      k
    );
  }
});

test('the harpoon and the mortar wind up before each shot, seen as a cue; their magazines are one and two', () => {
  for (const k of ['harpoon', 'mortar'] as const) {
    const g = GUNS[k],
      { shots, cues } = alone(k, 5);
    assert.equal(cues[0].cue.kind, 'winding');
    assert.ok(
      Math.abs(shots[0] - cues[0].t - g.windup) <= STEP + 1e-9,
      `${k}: the first ${(shots[0] - cues[0].t).toFixed(3)} s after the trigger`
    );
    const reloads = cues.filter((c) => c.cue.kind === 'reloading').length,
      windings = cues.filter((c) => c.cue.kind === 'winding').length;
    assert.equal(
      windings,
      shots.length + (cues.at(-1)!.cue.kind === 'winding' ? 1 : 0),
      `${k}: a wind-up for every shot`
    );
    assert.ok(reloads >= Math.floor(shots.length / g.mag), k);
  }
  const h = alone('harpoon', 5).shots;
  assert.ok(
    h[1] - h[0] >= GUNS.harpoon.reload + GUNS.harpoon.windup,
    'the harpoon reloads after every bolt'
  );
});

test('a gun just taken up fires only after EQUIP', () => {
  const { shots } = alone('cannon', 1, { equip: EQUIP });
  assert.ok(
    shots[0] >= EQUIP - 1e-9 && shots[0] <= EQUIP + STEP,
    `${shots[0]}`
  );
});

test("a ball's bite holds to 60% of its range, then falls to half at full range; the harpoon's and the mortar's hold", () => {
  for (const k of ['cannon', 'scatter', 'repeater'] as const) {
    const r = GUNS[k].range;
    assert.equal(falloff(k, 0.3 * r), 1);
    assert.equal(falloff(k, FALLOFF.hold * r), 1);
    assert.ok(Math.abs(falloff(k, 0.8 * r) - 0.75) < 1e-9);
    assert.ok(Math.abs(falloff(k, r) - FALLOFF.floor) < 1e-9);
    assert.ok(Math.abs(falloff(k, 2 * r) - FALLOFF.floor) < 1e-9, 'never less');
  }
  for (const k of ['harpoon', 'mortar'] as const)
    assert.equal(falloff(k, GUNS[k].range), 1);
});

test("a mortar's fall mark is drawn its splash's size (gunfire/marks.ts MARK, which may not import the sim)", () => {
  const text = readFileSync(
    new URL('../src/gunfire/marks.ts', import.meta.url),
    'utf8'
  );
  assert.equal(
    Number(/\bMARK = (\d+(?:\.\d+)?)/.exec(text)?.[1]),
    GUNS.mortar.splash
  );
});

test("a mortar's shell bursts over its splash: the ship struck takes all of it, one beside her less, the shooter none", () => {
  // laid on ship 2 at 80 m; ship 3 lies 7 m beyond her, ship 4 well clear
  const fleet = [
    afloat(1, lying(centre, 0)),
    afloat(2, lying(east(80), Math.PI / 2)),
    afloat(3, lying(east(87), Math.PI / 2)),
    afloat(4, lying(east(110), Math.PI / 2)),
  ];
  const crews = [
    crewOf(1, gunOf('mortar', 0)),
    ...[2, 3, 4].map((id) => ({
      ...crewOf(id),
      health: { hull: 100, shield: 100 },
    })),
  ];
  const { battle } = fight(crews, fleet, 4, undefined, {
    aim: null,
    fire: true,
    spread: 0,
  });
  const lost = (id: number) => {
    const c = battle.crews.find((x) => x.id === id)!;
    return 200 - c.health.hull - c.health.shield;
  };
  assert.equal(
    lost(2) % GUNS.mortar.damage,
    0,
    `ship 2 struck whole: ${lost(2)}`
  );
  assert.ok(
    lost(2) > 0 && lost(3) > 0 && lost(3) < lost(2),
    `${lost(2)} ${lost(3)}`
  );
  assert.equal(lost(4), 0);
  // a shell dropped beside the shooter herself: the other ship by her takes it, she none
  const by = (m: number) => along(centre, frameAt(centre).north, m).p;
  const ball = loosed(
    1,
    'mortar',
    scale(by(6), R + 15),
    scale(normalize(by(6)), -1),
    3,
    GUNS.mortar.damage
  );
  const near = [afloat(1, lying(centre, 0)), afloat(2, lying(by(12), 0))];
  let b: Battle = { ...battleOf([crewOf(1), crewOf(2)], 1), balls: [ball] };
  for (let i = 0; i < 90; i++)
    b = stepBattle(
      b,
      near,
      [
        { aim: null, fire: false },
        { aim: null, fire: false },
      ],
      [],
      STEP,
      deep
    ).battle;
  assert.equal(b.crews[0].health.hull, 100, 'the shooter is spared');
  assert.ok(b.crews[1].health.hull < 100, 'the other is not');
});

test('the same guns fight the same way, to the bit', () => {
  const run = () => {
    const fleet = KINDS.map((_, i) =>
      afloat(i + 1, lying(east(i * 40), i % 2 ? Math.PI / 2 : 0))
    );
    let b: Battle = battleOf(
      KINDS.map((k, i) => crewOf(i + 1, gunOf(k, i % 5))),
      3
    );
    for (let i = 0; i < 180; i++) {
      b = stepBattle(
        b,
        fleet,
        fleet.map(() => ({ aim: null, fire: true, spread: 1.5 })),
        [],
        STEP,
        deep
      ).battle;
    }
    return b;
  };
  assert.deepEqual(run(), run());
});

test('the sea is strewn with some 400–480 pieces, two in five of them guns, the cannon the commonest, the harpoon and the mortar the rarest', () => {
  const f = laying(5, deep).strewn(),
    guns = f.pieces.map((p) => p.goods).filter(isArms);
  // some 1.4 a spot, from 320 spots
  assert.ok(
    f.pieces.length > 400 &&
      f.pieces.length < 480 &&
      f.pieces.length < (1 + LOOT.second + 0.1) * LOOT.spots,
    `${f.pieces.length}`
  );
  const count = (k: GunKind) => guns.filter((g) => g.kind === k).length;
  assert.ok(
    Math.abs(guns.length / f.pieces.length - LOOT.gun) < 0.08,
    `${guns.length} of ${f.pieces.length}`
  );
  assert.ok(KINDS.every((k) => k === 'cannon' || count('cannon') > count(k)));
  assert.ok(
    count('harpoon') < count('scatter') && count('mortar') < count('repeater')
  );
});

test("a phase's cache is dropped in the heart of the next cap, rare and the same for the same seed", () => {
  const lay = laying(5, deep),
    f = lay.strewn(),
    cap = { centre: [0, 1, 0] as Vec3, radius: 150 / R };
  const a = lay.cached(f, cap, 3),
    b = laying(5, deep).cached(f, cap, 3);
  assert.deepEqual(a, b);
  assert.notDeepEqual(a, lay.cached(f, cap, 4));
  const drop = a.pieces.slice(f.pieces.length);
  assert.equal(drop.length, LOOT.cache.pieces);
  assert.equal(a.next, f.next + drop.length);
  assert.deepEqual(
    drop.map((l) => l.id),
    drop.map((_, i) => f.next + i)
  );
  for (const l of drop) {
    // within its share of the cap's radius of the centre
    assert.ok(toEdge(l.at, cap) >= (1 - LOOT.cache.within) * 150 - 1e-6);
    assert.ok(
      isArms(l.goods)
        ? l.goods.rarity >= 2
        : l.goods.kind === 'bigShield' || l.goods.kind === 'fullRepair'
    );
  }
});
