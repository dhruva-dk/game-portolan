import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mind, rammed, think, type Memory } from '../src/sim/bot.ts';
import {
  afloat,
  stepFleet,
  type Blow,
  type Vessel,
} from '../src/sim/contact.ts';
import { STEP } from '../src/sim/fixed.ts';
import { clearance, type Depth } from '../src/sim/shoal.ts';
import { shipAt, type Helm } from '../src/sim/ship.ts';
import { toEdge, type Cap, type Storm } from '../src/sim/storm.ts';
import {
  R,
  along,
  bearingAt,
  distance,
  dot,
  frameAt,
  fromLatLon,
  normalize,
  type Vec3,
} from '../src/world/sphere.ts';
import { EVEN_SHIP, WORST, aboard, botOf, statsWith } from './setups.ts';
import type { DriverStats, ShipValues } from '../src/sim/setup.ts';

const deg = Math.PI / 180;
const start = fromLatLon(0.2, 0.3);
const north = frameAt(start).north;
const deep: Depth = () => 30;

const coast = along(start, north, 120).p;
const seaward = frameAt(coast).north;
const offshore = (p: Vec3) => -R * Math.asin(dot(normalize(p), seaward));
const isle = along(start, frameAt(start).east, 150).p;
const shores: Depth = (p) =>
  Math.min(20, -6 + offshore(p) / 4, (distance(p, isle) - 70) / 3);

function sail(
  fleet: Vessel[],
  seeds: (number | null)[],
  seconds: number,
  depth: Depth,
  held?: (v: Vessel, fleet: Vessel[]) => Helm,
  each?: (f: Vessel[], t: number) => void,
  storm?: (t: number) => Storm,
  values: ShipValues = EVEN_SHIP,
  stats: DriverStats = statsWith()
) {
  let minds: (Memory | null)[] = fleet.map((v, i) =>
    seeds[i] === null ? null : mind(seeds[i]!, v.ship.at)
  );
  const blows: Blow[] = [];
  for (let n = 0; n < Math.round(seconds / STEP); n++) {
    const helms = fleet.map((v, i) => {
      const m = minds[i];
      if (!m) return held!(v, fleet);
      const r = think(
        aboard(v, values),
        fleet.filter((o) => o.id !== v.id).map((o) => aboard(o, values)),
        { depth, storm: storm?.(n * STEP) },
        m,
        botOf(seeds[i]!, stats)
      );
      minds[i] = r.memory;
      return r.helm;
    });
    const r = stepFleet(
      fleet,
      helms,
      STEP,
      depth,
      fleet.map(() => values)
    );
    fleet = r.fleet;
    for (const b of r.blows) {
      blows.push(b);
      minds = minds.map((m, i) =>
        m && fleet[i].id === b.struck.id ? rammed(m, b.striker.id) : m
      );
    }
    each?.(fleet, (n + 1) * STEP);
  }
  return { fleet, minds, blows };
}

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

test('the same bots from the same places sail the same voyage, to the bit', () => {
  const fleet = () =>
    [0, 1, 2, 3, 4, 5].map((k) => placed(k, k * 1.1, 40 + 25 * k, k * 0.7));
  const a = sail(fleet(), [1, 2, 3, 4, 5, 6], 60, shores),
    b = sail(fleet(), [1, 2, 3, 4, 5, 6], 60, shores);
  assert.deepEqual(a, b);
  const storm = closing(along(start, north, -150).p, 220, 80, 10, 30);
  const c = sail(
      fleet(),
      [1, 2, 3, 4, 5, 6],
      60,
      shores,
      undefined,
      undefined,
      storm
    ),
    d = sail(
      fleet(),
      [1, 2, 3, 4, 5, 6],
      60,
      shores,
      undefined,
      undefined,
      storm
    );
  assert.deepEqual(c, d);
  assert.notDeepEqual(a.fleet, c.fleet);
});

test('a bot never grounds nor lies pinned on a shore over a long voyage round the shoals', () => {
  for (const seed of [3, 17, 41, 99]) {
    let least = Infinity,
      pinned = 0,
      made = 0,
      last = start;
    const r = sail(
      [placed(1, 0, 0, seed)],
      [seed],
      300,
      shores,
      undefined,
      (f) => {
        const s = f[0].ship,
          c = clearance(s.at, s.heading, shores).least;
        least = Math.min(least, c);
        if (c < 1 && s.speed < 2) pinned += STEP;
        made += distance(last, s.at);
        last = s.at;
      }
    );
    console.log(
      `# seed ${seed}: ${pinned.toFixed(1)} s pinned, ${made.toFixed(0)} m made, least ${least.toFixed(2)} m under it`
    );
    assert.ok(least >= 0, `${seed}: ${least} m under its keel`);
    assert.ok(pinned < 10, `${seed}: ${pinned.toFixed(1)} s pinned`);
    assert.ok(
      made > 300 * EVEN_SHIP.topSpeed * 0.6,
      `${seed}: made ${made.toFixed(0)} m`
    );
    assert.ok(r.minds[0]!.mode === 'roam');
  }
});

test('the same seed sails the same way; different seeds, different ways', () => {
  const track = (seed: number) => {
    const points: Vec3[] = [];
    sail([placed(1, 0, 0, 1)], [seed], 40, shores, undefined, (f) =>
      points.push(f[0].ship.at)
    );
    return points;
  };
  const apart = (a: Vec3[], b: Vec3[]) =>
    Math.max(...a.map((p, i) => distance(p, b[i])));
  assert.equal(apart(track(5), track(5)), 0);
  for (const [a, b] of [
    [5, 6],
    [7, 8],
    [9, 10],
  ])
    assert.ok(
      apart(track(a), track(b)) > 30,
      `${a}, ${b}: ${apart(track(a), track(b))} m`
    );
});

test('a bot answering a ram takes less of it than a ship holding its course', () => {
  const sharp = [1, 2, 3],
    deft = statsWith({ helm: 20, nerve: 1 });
  let answered = 0,
    holding = 0;
  for (const from of [60, 90, 120])
    for (const seed of sharp) {
      const victim = placed(2, 0, 0, 0, 4),
        rammer = placed(
          1,
          from * deg,
          80,
          (from + 180) * deg,
          EVEN_SHIP.topSpeed
        );
      const chase = (v: Vessel, f: Vessel[]): Helm => {
        if (v.id === 2) return { course: null, throttle: 1 / 3 };
        const t = f.find((o) => o.id === 2)!.ship.at;
        return {
          course: [
            t[0] - v.ship.at[0],
            t[1] - v.ship.at[1],
            t[2] - v.ship.at[2],
          ],
          throttle: 1,
        };
      };
      const taken = (blows: Blow[]) =>
        blows.reduce(
          (sum, b) =>
            sum +
            (b.struck.id === 2
              ? b.struck.damage
              : b.striker.id === 2
                ? b.striker.damage
                : 0),
          0
        );
      answered += taken(
        sail(
          [rammer, victim],
          [null, seed],
          20,
          deep,
          chase,
          undefined,
          undefined,
          EVEN_SHIP,
          deft
        ).blows
      );
      holding += taken(
        sail([rammer, victim], [null, null], 20, deep, chase).blows
      );
    }
  console.log(
    `# ram damage taken: answering ${answered.toFixed(0)}, holding course ${holding.toFixed(0)}`
  );
  assert.ok(
    holding > 0 && answered < 0.75 * holding,
    `answering ${answered.toFixed(0)}, holding ${holding.toFixed(0)}`
  );
});

test('16 bots for five minutes keep clear of the shores', () => {
  const fleet = Array.from({ length: 16 }, (_, k) =>
    placed(k, k * 0.39, 30 + 12 * k, k * 1.3)
  );
  const t0 = performance.now();
  const r = sail(
    fleet,
    fleet.map((_, k) => 100 + k),
    300,
    shores
  );
  const ms = (performance.now() - t0) / (300 / STEP);
  console.log(
    `# 16 bots: ${ms.toFixed(3)} ms a step (bots and fleet), ${r.blows.length} rams in 5 min`
  );
  for (const v of r.fleet)
    assert.ok(clearance(v.ship.at, v.ship.heading, shores).least >= 0);
});

function closing(
  center: Vec3,
  from: number,
  to: number,
  wait: number,
  close: number
): (t: number) => Storm {
  const next: Cap = { center, radius: to / R };
  return (t) => {
    const f = Math.min(1, Math.max(0, (t - wait) / close)),
      done = t >= wait + close;
    return {
      center,
      radius: (from + (to - from) * f) / R,
      next,
      closing: t >= wait && !done,
      secondsToNext: t < wait ? wait - t : done ? Infinity : wait + close - t,
      secondsToShut: done ? Infinity : wait + close - t,
      phase: done ? 7 : 0,
      final: done,
      damage: 0.05,
    };
  };
}
const captains: readonly (readonly [number, DriverStats])[] = [
  [1, statsWith({ stormcraft: 1, helm: 1 })],
  [2, statsWith({ stormcraft: 1, helm: 1 })],
  [3, statsWith({ stormcraft: 1 })],
  [4, statsWith({ stormcraft: 20, helm: 20 })],
  [5, statsWith({ stormcraft: 20, helm: 20 })],
  [6, statsWith({ stormcraft: 20 })],
  [7, statsWith()],
  [8, statsWith()],
  [9, statsWith({ lookout: 1, nerve: 1 })],
  [10, statsWith({ lookout: 20, nerve: 20 })],
];

test('a bot outside the next cap makes for it in time, and is never caught outside the closing one', () => {
  for (const [k, [seed, stats]] of captains.entries()) {
    const center = along(start, bearingAt(start, k * 0.9), 400).p,
      storm = closing(center, 600, 120, 20, 70);
    let worst = Infinity;
    const r = sail(
      [placed(1, k * 0.7, 30, k * 1.9)],
      [seed],
      100,
      deep,
      undefined,
      (f, t) => {
        worst = Math.min(worst, toEdge(f[0].ship.at, storm(t)));
      },
      storm,
      WORST,
      stats
    );
    const inside = toEdge(r.fleet[0].ship.at, storm(100).next);
    console.log(
      `# seed ${seed} (Stormcraft ${stats.stormcraft}, Helm ${stats.helm}):` +
        ` ${inside.toFixed(0)} m inside, never less than ${worst.toFixed(0)} m inside the closing cap`
    );
    assert.ok(worst > 0, `${seed}: caught ${(-worst).toFixed(0)} m outside`);
    assert.ok(
      inside > 0,
      `${seed}: ${(-inside).toFixed(0)} m outside the next cap`
    );
  }
  const free = sail(
    [placed(1, 0, 30, 0)],
    [captains[0][0]],
    70,
    deep,
    undefined,
    undefined,
    undefined,
    WORST,
    captains[0][1]
  );
  assert.ok(
    toEdge(free.fleet[0].ship.at, {
      center: along(start, bearingAt(start, 0), 400).p,
      radius: 120 / R,
    }) < 0
  );
});

test('a bot inside the cap never leaves it, roaming or with the next one closing round it', () => {
  for (const [seed, stats] of captains) {
    const holding = closing(start, 260, 260, Infinity, 1),
      shrinking = closing(start, 260, 200, 0, 30);
    for (const storm of [holding, shrinking]) {
      let worst = Infinity;
      sail(
        [placed(1, seed, 40, seed * 2.3)],
        [seed],
        180,
        deep,
        undefined,
        (f, t) => {
          worst = Math.min(worst, toEdge(f[0].ship.at, storm(t)));
        },
        storm,
        WORST,
        stats
      );
      assert.ok(worst > 0, `${seed}: ${(-worst).toFixed(0)} m outside`);
    }
  }
  let out = 0;
  for (const [seed, stats] of captains) {
    sail(
      [placed(1, seed, 40, seed * 2.3)],
      [seed],
      180,
      deep,
      undefined,
      (f) => {
        if (toEdge(f[0].ship.at, { center: start, radius: 260 / R }) < 0) out++;
      },
      undefined,
      WORST,
      stats
    );
  }
  assert.ok(out > 0);
});
