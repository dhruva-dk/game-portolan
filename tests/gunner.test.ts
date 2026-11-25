import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { GunKind } from '../src/sim/kinds.ts';
import { SHIELD } from '../src/sim/tuning.ts';
import {
  battleOf,
  crewOf,
  stepBattle,
  type Battle,
  type Order,
} from '../src/sim/battle.ts';
import { mind, shot, think, type Memory } from '../src/sim/bot.ts';
import { afloat, stepFleet, type Vessel } from '../src/sim/contact.ts';
import { STEP } from '../src/sim/fixed.ts';
import { asked, type Ask } from '../src/sim/stores.ts';
import { spreadBy } from '../src/sim/gunner.ts';
import { driver } from '../src/sim/driver.ts';
import type { DriverStats } from '../src/sim/setup.ts';
import type { Depth } from '../src/sim/shoal.ts';
import { shipAt, type Helm } from '../src/sim/ship.ts';
import { along, bearingAt, distance, fromLatLon } from '../src/world/sphere.ts';
import { sunk } from '../src/sim/health.ts';
import type { Storm } from '../src/sim/storm.ts';
import { WORST, botOf, statsWith } from './setups.ts';

const deep: Depth = () => 30;
const start = fromLatLon(0.2, 0.3);
const deg = Math.PI / 180;
const placed = (
  id: number,
  bearing: number,
  meters: number,
  heading: number,
  speed = 0
): Vessel => {
  const at = along(start, bearingAt(start, bearing), meters).p;
  return afloat(id, { ...shipAt(at, bearingAt(at, heading)), speed });
};
const bold = [1, 2, 3],
  BOLD = statsWith({ nerve: 20 });

function battle(
  fleet: Vessel[],
  seeds: (number | null)[],
  seconds: number,
  held: Helm = { course: null, throttle: 0 },
  {
    storm,
    fire = false,
    stats = BOLD,
  }: { storm?: Storm; fire?: boolean; stats?: DriverStats } = {}
) {
  const minds: (Memory | null)[] = fleet.map((v, i) =>
    seeds[i] === null ? null : mind(seeds[i]!, v.ship.at)
  );
  let b: Battle = battleOf(
    fleet.map((v) => ({
      ...crewOf(v.id, WORST),
      health: {
        hull: WORST.hullPoints,
        shield: SHIELD.most,
        most: WORST.hullPoints,
      },
    })),
    7
  );
  const fired: { t: number; id: number; gun: GunKind }[] = [],
    ranges: number[] = [];
  let strikes = 0,
    blows = 0;
  for (let n = 0; n < Math.round(seconds / STEP); n++) {
    const seen = fleet.map((v) => {
      const c = b.crews.find((k) => k.id === v.id)!;
      return { ...v, hull: c.health.hull, shield: c.health.shield, crew: c };
    });
    const helms: Helm[] = [],
      orders: Order[] = [],
      asks = new Map<number, Ask>();
    fleet.forEach((v, i) => {
      const m = minds[i];
      if (!m) {
        helms.push(held);
        orders.push({ aim: null, fire });
        return;
      }
      const r = think(
        seen[i],
        seen.filter((o) => o.id !== v.id),
        { depth: deep, storm },
        m,
        botOf(seeds[i]!, stats)
      );
      minds[i] = r.memory;
      helms.push(r.helm);
      orders.push(r.order);
      asks.set(v.id, r.ask);
    });
    b = { ...b, crews: asked(b.crews, asks).crews };
    const met = stepFleet(
      fleet,
      helms,
      STEP,
      deep,
      fleet.map(() => WORST)
    );
    fleet = met.fleet;
    blows += met.blows.length;
    const f = stepBattle(b, fleet, orders, met.blows, STEP, deep);
    b = f.battle;
    for (const s of f.shots)
      fired.push({ t: n * STEP, id: s.shooter, gun: s.gun });
    strikes += f.strikes.filter((s) => !s.ram).length;
    for (const s of f.strikes) {
      const k = fleet.findIndex((v) => v.id === s.struck);
      if (!s.ram && minds[k]) minds[k] = shot(minds[k]!, s.shooter);
    }
    if (fleet.length > 1)
      ranges.push(distance(fleet[0].ship.at, fleet[1].ship.at));
  }
  return { fleet, battle: b, minds, fired, strikes, blows, ranges };
}

test("an armed bot holds off at its gun's range and shoots a steady ship, rather than ramming it", () => {
  for (const seed of bold) {
    const r = battle(
      [placed(0, 0, 0, 90 * deg), placed(1, 0, 150, 0)],
      [seed, null],
      40,
      { course: null, throttle: 0.4 }
    );
    const later = r.ranges.slice(Math.round(10 / STEP));
    const near = Math.min(...later),
      far = Math.max(...later);
    console.log(
      `# seed ${seed}: ${r.fired.length} shots, ${r.strikes} hits,` +
        ` range ${near.toFixed(0)}–${far.toFixed(0)} m, ${r.blows} rams`
    );
    assert.equal(r.blows, 0, `${seed}: rammed`);
    assert.ok(near > 20, `${seed}: closed to ${near.toFixed(0)} m`);
    assert.ok(r.fired.length >= 6, `${seed}: ${r.fired.length} shots`);
    assert.ok(r.strikes >= 3, `${seed}: ${r.strikes} hits`);
  }
});

test('an armed bot holds its fire till it has got over first seeing its foe', () => {
  for (const seed of bold) {
    const r = battle(
      [placed(0, 0, 0, 0), placed(1, 0, 120, 90 * deg)],
      [seed, null],
      10
    );
    assert.ok(r.fired.length > 0, `${seed}: never fired`);
    assert.ok(
      r.fired[0].t >= driver(BOLD).react - 0.25,
      `${seed}: fired at ${r.fired[0].t.toFixed(2)} s`
    );
  }
});

test('two armed bots fight it out, the same every time, till one is sunk', () => {
  const fight = () =>
    battle(
      [placed(0, 0, 0, 30 * deg), placed(1, 40 * deg, 160, 200 * deg)],
      [bold[0], bold[1]],
      120
    );
  const a = fight(),
    b = fight();
  assert.deepEqual(a.battle, b.battle);
  assert.deepEqual(a.fired, b.fired);
  assert.ok(
    a.battle.crews.some((c) => sunk(c.health)),
    `none sunk: ${a.battle.crews.map((c) => c.health.hull.toFixed(0))}`
  );
});

const stormIn = (phase: number): Storm => ({
  center: start,
  radius: Math.PI,
  next: { center: start, radius: Math.PI },
  closing: false,
  secondsToNext: phase < 7 ? 60 : Infinity,
  secondsToShut: phase < 7 ? 80 : Infinity,
  phase,
  final: phase >= 7,
  damage: 0,
});
const mild = [1, 2, 3],
  MILD = statsWith({ nerve: 1 });

test('early in a match a mild armed bot keeps out of a fight it would take up late in it', () => {
  for (const seed of mild) {
    const fights = (phase: number) =>
      battle(
        [placed(0, 0, 0, 0), placed(1, 0, 110, 90 * deg)],
        [seed, null],
        30,
        undefined,
        { storm: stormIn(phase), stats: MILD }
      );
    const early = fights(0),
      late = fights(7);
    console.log(
      `# seed ${seed}: ${early.fired.length} shots early, ${late.fired.length} late`
    );
    assert.equal(early.fired.length, 0, `${seed}: fired early`);
    assert.ok(late.fired.length > 0, `${seed}: never fired late`);
  }
});

test('holding back, it still fires back at a ship close by that is shooting it', () => {
  for (const seed of mild) {
    const r = battle(
      [placed(0, 0, 0, 90 * deg), placed(1, 0, 70, 180 * deg)],
      [seed, null],
      30,
      undefined,
      { storm: stormIn(0), fire: true, stats: MILD }
    );
    const back = r.fired.filter((f) => f.id === 0).length;
    console.log(`# seed ${seed}: ${back} shots back`);
    assert.ok(back > 0, `${seed}: never fired back`);
  }
});

test("a green bot's balls spread wider than a sharp one's, and hit less", () => {
  const seeds = [1, 2, 3, 4, 5, 6, 7, 8],
    green = statsWith({ nerve: 20, gunnery: 1 }),
    sharp = statsWith({ nerve: 20, gunnery: 20 });
  assert.ok(
    spreadBy(driver(green).gunnery) > 2 * spreadBy(1) && spreadBy(1) === 1
  );
  const share = (stats: DriverStats) => {
    const rs = seeds.map((seed) =>
      battle(
        [placed(0, 0, 0, 90 * deg), placed(1, 0, 150, 0)],
        [seed, null],
        15,
        { course: null, throttle: 0.4 },
        { stats }
      )
    );
    return (
      rs.reduce((n, r) => n + r.strikes, 0) /
      Math.max(
        1,
        rs.reduce((n, r) => n + r.fired.length, 0)
      )
    );
  };
  const g = share(green),
    s = share(sharp);
  console.log(
    `# balls striking a steady ship 150 m off in 15 s: green ${(100 * g).toFixed(0)}%, sharp ${(100 * s).toFixed(0)}%`
  );
  assert.ok(g < s - 0.15, `green ${g}, sharp ${s}`);
});
