import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mind, rammed, think, type Memory } from '../src/sim/bot.ts';
import { temper } from '../src/sim/temper.ts';
import { afloat, stepFleet, type Blow, type Vessel } from '../src/sim/contact.ts';
import { STEP } from '../src/sim/fixed.ts';
import { RAM, SHIP } from '../src/sim/handling.ts';
import { clearance, type Depth } from '../src/sim/shoal.ts';
import { shipAt, type Helm } from '../src/sim/ship.ts';
import { R, add, along, distance, dot, frameAt, fromLatLon, normalize, scale, type Vec3 } from '../src/world/sphere.ts';

const deg = Math.PI / 180;
const start = fromLatLon(0.2, 0.3);
const north = frameAt(start).north;
const deep: Depth = () => 30;

// sailing.test.ts's straight shore, here 120 m north of the start, the floor rising 1 in 4 from 20 m and drying 6 m
// past it (so the draught's contour lies 87 m north of the start); and a round island 140 m across, its floor rising
// 1 in 3, 150 m east of the start.
const coast = along(start, north, 120).p;
const seaward = frameAt(coast).north;
const offshore = (p: Vec3) => -R * Math.asin(dot(normalize(p), seaward));
const isle = along(start, frameAt(start).east, 150).p;
const shores: Depth = (p) => Math.min(20, -6 + offshore(p) / 4, (distance(p, isle) - 70) / 3);

/** Bots `seeds` (null: a ship holding `held`'s orders) sailed `seconds` from `fleet`; the rams there were, told to the struck. */
function sail(fleet: Vessel[], seeds: (number | null)[], seconds: number, depth: Depth, held?: (v: Vessel, fleet: Vessel[]) => Helm, each?: (f: Vessel[]) => void) {
  let minds: (Memory | null)[] = fleet.map((v, i) => (seeds[i] === null ? null : mind(seeds[i]!, v.ship.at)));
  const blows: Blow[] = [];
  for (let n = 0; n < Math.round(seconds / STEP); n++) {
    const helms = fleet.map((v, i) => {
      const m = minds[i];
      if (!m) return held!(v, fleet);
      const r = think(v, fleet.filter((o) => o.id !== v.id), depth, m, seeds[i]!);
      minds[i] = r.memory;
      return r.helm;
    });
    const r = stepFleet(fleet, helms, STEP, depth);
    fleet = r.fleet;
    for (const b of r.blows) {
      blows.push(b);
      minds = minds.map((m, i) => (m && fleet[i].id === b.struck.id ? rammed(m, b.striker.id) : m));
    }
    each?.(fleet);
  }
  return { fleet, minds, blows };
}

/** A ship `metres` from the start on a bearing (radians clockwise from north), heading `heading` likewise. */
const way = (p: Vec3, bearing: number): Vec3 => {
  const f = frameAt(p);
  return add(scale(f.north, Math.cos(bearing)), f.east, Math.sin(bearing));
};
const placed = (id: number, bearing: number, metres: number, heading: number, speed = 0): Vessel => {
  const at = along(start, way(start, bearing), metres).p;
  return afloat(id, { ...shipAt(at, way(at, heading)), speed });
};
/** Seeds whose temper passes `ok`. */
const seedsWhere = (ok: (t: ReturnType<typeof temper>) => boolean, n: number) => {
  const out: number[] = [];
  for (let s = 1; out.length < n; s++) if (ok(temper(s))) out.push(s);
  return out;
};

test('the same bots from the same places sail the same voyage, to the bit', () => {
  const fleet = () => [0, 1, 2, 3, 4, 5].map((k) => placed(k, k * 1.1, 40 + 25 * k, k * 0.7));
  const a = sail(fleet(), [1, 2, 3, 4, 5, 6], 60, shores), b = sail(fleet(), [1, 2, 3, 4, 5, 6], 60, shores);
  assert.deepEqual(a, b);
});

test('a bot never grounds nor lies pinned on a shore over a long voyage round the shoals', () => {
  for (const seed of [3, 17, 41, 99]) {
    let least = Infinity, pinned = 0, made = 0, last = start;
    const r = sail([placed(1, 0, 0, seed)], [seed], 300, shores, undefined, (f) => {
      const s = f[0].ship, c = clearance(s.at, s.heading, shores).least;
      least = Math.min(least, c);
      if (c < 1 && s.speed < 2) pinned += STEP;
      made += distance(last, s.at);
      last = s.at;
    });
    console.log(`# seed ${seed}: ${pinned.toFixed(1)} s pinned, ${made.toFixed(0)} m made, least ${least.toFixed(2)} m under her`);
    assert.ok(least >= 0, `${seed}: ${least} m under her keel`);
    assert.ok(pinned < 10, `${seed}: ${pinned.toFixed(1)} s pinned`);
    assert.ok(made > 300 * SHIP.top * 0.6, `${seed}: made ${made.toFixed(0)} m`);
    assert.ok(r.minds[0]!.mode === 'roam');
  }
});

test('a hunter rams a steady ship on her side, above the ram threshold, from ahead, abeam or astern of her', () => {
  const bold = seedsWhere((t) => t.fight > 0.7, 3);
  for (const seed of bold) for (const from of [20, 90, 160]) {
    // the target heads north at 6 m/s; the hunter lies 140 m off, `from` degrees round from her bow
    const target = placed(2, 0, 0, 0, 6), hunter = placed(1, from * deg, 140, (from + 180) * deg);
    const r = sail([hunter, target], [seed, null], 60, deep, () => ({ course: null, throttle: 0.5 }));
    const first = r.blows.find((b) => b.striker.id === 1);
    assert.ok(first, `${seed} from ${from}°: no ram`);
    assert.ok(first.closing > RAM.least, `${seed} from ${from}°: closing ${first.closing}`);
    assert.equal(first.struck.part, 'side', `${seed} from ${from}°: struck her ${first.struck.part}`);
  }
});

test('the same seed sails the same way; different seeds, different ways', () => {
  const track = (seed: number) => {
    const points: Vec3[] = [];
    sail([placed(1, 0, 0, 1)], [seed], 40, shores, undefined, (f) => points.push(f[0].ship.at));
    return points;
  };
  const apart = (a: Vec3[], b: Vec3[]) => Math.max(...a.map((p, i) => distance(p, b[i])));
  assert.equal(apart(track(5), track(5)), 0);
  for (const [a, b] of [[5, 6], [7, 8], [9, 10]]) assert.ok(apart(track(a), track(b)) > 30, `${a}, ${b}: ${apart(track(a), track(b))} m`);
  // and their temperaments differ
  const tempers = Array.from({ length: 16 }, (_, s) => temper(s));
  assert.ok(new Set(tempers.map((t) => t.notice.toFixed(1))).size === 16);
});

test('a bot answering a ram takes less of it than a ship holding her course', () => {
  const sharp = seedsWhere((t) => t.skill > 0.8 && t.fight < 0.4, 3);
  let answered = 0, holding = 0;
  for (const from of [60, 90, 120]) for (const seed of sharp) {
    // a rammer drives at her from 80 m off `from` degrees round from her bow at full speed, steering for her
    const victim = placed(2, 0, 0, 0, 4), rammer = placed(1, from * deg, 80, (from + 180) * deg, SHIP.top);
    const chase = (v: Vessel, f: Vessel[]): Helm => {
      if (v.id === 2) return { course: null, throttle: 1 / 3 };
      const t = f.find((o) => o.id === 2)!.ship.at;
      return { course: [t[0] - v.ship.at[0], t[1] - v.ship.at[1], t[2] - v.ship.at[2]], throttle: 1 };
    };
    const taken = (blows: Blow[]) => blows.reduce((sum, b) => sum + (b.struck.id === 2 ? b.struck.damage : b.striker.id === 2 ? b.striker.damage : 0), 0);
    answered += taken(sail([rammer, victim], [null, seed], 20, deep, chase).blows);
    holding += taken(sail([rammer, victim], [null, null], 20, deep, chase).blows);
  }
  console.log(`# ram damage taken: answering ${answered.toFixed(0)}, holding course ${holding.toFixed(0)}`);
  assert.ok(holding > 0 && answered < 0.75 * holding, `answering ${answered.toFixed(0)}, holding ${holding.toFixed(0)}`);
});

test('16 bots for five minutes step well inside real time', () => {
  const fleet = Array.from({ length: 16 }, (_, k) => placed(k, k * 0.39, 30 + 12 * k, k * 1.3));
  const t0 = performance.now();
  const r = sail(fleet, fleet.map((_, k) => 100 + k), 300, shores);
  const ms = (performance.now() - t0) / (300 / STEP);
  console.log(`# 16 bots: ${ms.toFixed(3)} ms a step (bots and fleet), ${r.blows.length} rams in 5 min`);
  assert.ok(ms < 5, `${ms} ms a step`);
  for (const v of r.fleet) assert.ok(clearance(v.ship.at, v.ship.heading, shores).least >= 0);
});
