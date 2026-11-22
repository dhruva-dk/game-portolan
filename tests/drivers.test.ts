// A driver's stats on her bot (sim/driven.ts, MANAGER.md 3 point 6): ten in
// every stat is today's bot of her seed and persona; and, a test a stat, two
// drivers alike but for that stat at 4 and at 16 differ the expected way: over
// seeded races where a race's result shows it (gunnery, nerve), over seeded
// encounters on the sim where it does not (helm, lookout, stormcraft), and by
// the arithmetic alone where the stat is one number's (stamina, seamanship).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SEED } from '../src/environment.ts';
import { fitted } from '../src/play/fitted.ts';
import { runRace, specField } from '../src/play/race.ts';
import {
  STATS,
  type Driver,
  type DriverStats,
  type RaceCard,
  type Stat,
} from '../src/race.ts';
import { crewOf } from '../src/sim/battle.ts';
import { mind, think, type Memory } from '../src/sim/bot.ts';
import {
  afloat,
  stepFleet,
  type Blow,
  type Vessel,
} from '../src/sim/contact.ts';
import { faultsIn } from '../src/sim/faults.ts';
import { STEP } from '../src/sim/fixed.ts';
import { spreadBy } from '../src/sim/gunner.ts';
import { SHIP } from '../src/sim/handling.ts';
import { eye } from '../src/sim/lookout.ts';
import { PERSONAS, nature, natureOf, type Nature } from '../src/sim/persona.ts';
import { chart } from '../src/sim/route.ts';
import type { Depth } from '../src/sim/shoal.ts';
import { shipAt, type Helm } from '../src/sim/ship.ts';
import { berthing } from '../src/sim/spawn.ts';
import { toEdge, type Storm } from '../src/sim/storm.ts';
import { tempered } from '../src/sim/temper.ts';
import { landOf, planetOf } from '../src/world/land.ts';
import { hash } from '../src/world/random.ts';
import {
  R,
  along,
  bearingAt,
  frameAt,
  fromLatLon,
  type Vec3,
} from '../src/world/sphere.ts';

const TENS: DriverStats = specField(1, 1).ships[1].driver!.stats;
/** The seconds a race's storm has closed by, for these tests. */
const LENGTH = 400;
/** The driver of `seed`, of the persona her seed deals, ten in every stat but `over`. */
const driver = (seed: number, over: Partial<DriverStats> = {}): Driver => ({
  seed,
  persona: nature(seed).persona,
  stats: { ...TENS, ...over },
});
/** Her nature with `stat` at `value`. */
const with1 = (seed: number, stat: Stat, value: number): Nature =>
  natureOf(driver(seed, { [stat]: value }), LENGTH);

test("ten in every stat is today's bot of that seed and persona, to the bit; her persona is her card's whatever her seed", () => {
  for (let seed = 1; seed <= 60; seed++) {
    assert.deepEqual(natureOf(driver(seed), LENGTH), nature(seed), `${seed}`);
    for (const stat of STATS)
      for (const v of [4, 16]) {
        const n = with1(seed, stat, v);
        assert.equal(n.persona, nature(seed).persona);
        assert.equal(n.brain, nature(seed).brain);
      }
  }
  for (const persona of PERSONAS) {
    const n = natureOf({ seed: 7, persona, stats: TENS }, LENGTH);
    assert.equal(n.persona, persona);
  }
  // consistency and feedback are the career's: the sim reads neither
  for (const stat of ['consistency', 'feedback'] as const)
    assert.deepEqual(with1(3, stat, 16), with1(3, stat, 4));
});

// ------------------------------------------------------------------ races

const planet = planetOf(SEED, landOf(SEED)),
  depth = (p: Vec3) => -planet.height(p),
  waters = { chart: chart(depth), water: berthing(depth) };

/**
 * Seeded races of sixteen ships in four teams, the storm three times as
 * quick: ships 0 to 7 have `stat` at 16, ships 8 to 15 at 4, and ship k + 8 is
 * driven by ship k's own driver otherwise (her seed, her persona, tens). What
 * each half did, summed over the races.
 */
function halves(stat: Stat, races: number) {
  const sums = [16, 4].map(() => ({ fired: 0, landed: 0, dealt: 0 }));
  for (let k = 0; k < races; k++) {
    const base = specField(SEED + 7 * k, 4),
      card: RaceCard = {
        ...base,
        rules: { ...base.rules, storm: 3 },
        ships: base.ships.map((s) => ({
          ...s,
          driver: driver(hash(base.seed, s.id % 8), {
            [stat]: s.id < 8 ? 16 : 4,
          }),
        })),
      };
    for (const h of runRace(card, planet, waters).hits) {
      const sum = sums[h.id < 8 ? 0 : 1];
      sum.fired += h.fired;
      sum.landed += h.landed;
      sum.dealt += h.dealt;
    }
  }
  return { high: sums[0], low: sums[1] };
}

test('gunnery: over seeded races the 16s land more of their shots than the 4s', () => {
  const { high, low } = halves('gunnery', 4);
  const rate = (s: typeof high) => s.landed / s.fired;
  console.log(
    `# gunnery 16: ${high.landed}/${high.fired}; 4: ${low.landed}/${low.fired}`
  );
  assert.ok(high.fired > 50 && low.fired > 50, 'both fired');
  assert.ok(rate(high) > rate(low) + 0.05, `${rate(high)} to ${rate(low)}`);
});

test('nerve: over seeded races the 16s fight more than the 4s: more shots fired', () => {
  const { high, low } = halves('nerve', 4);
  console.log(`# nerve 16: ${high.fired} fired; 4: ${low.fired}`);
  assert.ok(high.fired > low.fired * 1.1, `${high.fired} to ${low.fired}`);
  // and by the arithmetic: readier to fight, in a hotter mood, running later
  for (let seed = 1; seed <= 20; seed++) {
    const a = with1(seed, 'nerve', 16).temper,
      b = with1(seed, 'nerve', 4).temper;
    assert.ok(a.fight >= b.fight && a.aggro > b.aggro && a.run < b.run);
  }
});

// ------------------------------------------------------------------ encounters

const deg = Math.PI / 180;
const start = fromLatLon(0.2, 0.3);
const deep: Depth = () => 30;
/** A ship `metres` from the start on a bearing, heading `heading` (radians clockwise from north). */
const placed = (
  id: number,
  bearing: number,
  metres: number,
  heading: number,
  speed = 0
): Vessel => {
  const at = along(start, bearingAt(start, bearing), metres).p;
  return afloat(id, { ...shipAt(at, bearingAt(at, heading)), speed });
};

/**
 * The fleet sailed `seconds`, each ship by her nature's bot (null: by `held`);
 * the rams there were, told to the struck; `each` told the fleet every step.
 */
function sail(
  fleet: Vessel[],
  who: (Nature | null)[],
  seconds: number,
  held?: (v: Vessel, fleet: Vessel[]) => Helm,
  each?: (f: Vessel[], t: number) => void,
  storm?: (t: number) => Storm
) {
  const minds: (Memory | null)[] = fleet.map((v, i) =>
    who[i] ? mind(who[i].seed, v.ship.at) : null
  );
  const blows: Blow[] = [];
  for (let n = 0; n < Math.round(seconds / STEP); n++) {
    const helms = fleet.map((v, i) => {
      const m = minds[i],
        n1 = who[i];
      if (!m || !n1) return held!(v, fleet);
      const r = think(
        v,
        fleet.filter((o) => o.id !== v.id),
        { depth: deep, storm: storm?.(n * STEP) },
        m,
        n1
      );
      minds[i] = r.memory;
      return r.helm;
    });
    const r = stepFleet(fleet, helms, STEP, deep);
    fleet = r.fleet;
    blows.push(...r.blows);
    each?.(fleet, (n + 1) * STEP);
  }
  return { fleet, minds, blows };
}

test('helm: with a rammer driving at them in seeded encounters, fewer of the 16s are struck than of the 4s', () => {
  // a rammer drives at her at full speed from 80 m off, steering for her,
  // from five quarters: whether it has struck her 12 s on
  const rammed = (helm: number) => {
    let rams = 0;
    for (const from of [30, 60, 90, 120, 150])
      for (let seed = 1; seed <= 24; seed++) {
        const victim = placed(2, 0, 0, 0, 4),
          rammer = placed(1, from * deg, 80, (from + 180) * deg, SHIP.top);
        const chase = (v: Vessel, f: Vessel[]): Helm => {
          const t = f.find((o) => o.id === 2)!.ship.at,
            a = v.ship.at;
          return {
            course: [t[0] - a[0], t[1] - a[1], t[2] - a[2]],
            throttle: 1,
          };
        };
        const who = [null, with1(seed, 'helm', helm)];
        if (sail([rammer, victim], who, 12, chase).blows.length > 0) rams++;
      }
    return rams;
  };
  const high = rammed(16),
    low = rammed(4);
  console.log(`# struck, of 120 encounters: helm 16 ${high}, 4 ${low}`);
  assert.ok(low > 10 && high <= 0.8 * low, `${high} to ${low}`);
  // and by the arithmetic: her helm is the sharper
  for (let seed = 1; seed <= 20; seed++)
    assert.ok(
      with1(seed, 'helm', 16).temper.helm > with1(seed, 'helm', 4).temper.helm
    );
});

test('lookout: a ship lying where a ten would just miss her, the 16s have in their eye and the 4s have not', () => {
  // (captains whose eye is well short of the furthest any lookout sees)
  const seeds: number[] = [];
  for (let s = 1; seeds.length < 12; s++)
    if (eye(nature(s).temper) < 170) seeds.push(s);
  for (const seed of seeds) {
    const far = eye(nature(seed).temper) * 1.04;
    const sees = (lookout: number) => {
      const north = frameAt(start).north,
        own = { id: 1, ship: shipAt(start, north) },
        other = { id: 2, ship: shipAt(along(start, north, far).p, north) };
      const who = with1(seed, 'lookout', lookout);
      let m = mind(seed, start);
      for (let k = 0; k < 20; k++)
        m = think(own, [other], { depth: deep }, m, who).memory;
      return m.foe;
    };
    assert.equal(sees(16), 2, `${seed}: 16 sees her at ${far.toFixed(0)} m`);
    assert.equal(sees(10), -1, `${seed}: 10 does not`);
    assert.equal(sees(4), -1, `${seed}: 4 does not`);
    const a = with1(seed, 'lookout', 16).temper,
      b = with1(seed, 'lookout', 4).temper;
    assert.ok(a.lookout > b.lookout && a.notice > b.notice);
    assert.ok(eye(a) > eye(b) * 1.3);
  }
});

test('stormcraft: making for the next cap as it closes in seeded voyages, the 16s end further inside it than the 4s', () => {
  // the next cap, 120 m round a point 400 m off; it starts to close from 600
  // m in 20 s, over 70 s
  const inside = (stormcraft: number) => {
    let sum = 0;
    for (let seed = 1; seed <= 12; seed++) {
      const centre = along(start, bearingAt(start, seed * 0.9), 400).p,
        next = { centre, radius: 120 / R };
      const storm = (t: number): Storm => {
        const f = Math.min(1, Math.max(0, (t - 20) / 70)),
          done = t >= 90;
        return {
          centre,
          radius: (600 - 480 * f) / R,
          next,
          closing: t >= 20 && !done,
          secondsToNext: t < 20 ? 20 - t : done ? Infinity : 90 - t,
          phase: done ? 7 : 0,
          final: done,
          damage: 0.05,
        };
      };
      const r = sail(
        [placed(1, seed * 0.7, 30, seed * 1.9)],
        [with1(seed, 'stormcraft', stormcraft)],
        100,
        undefined,
        undefined,
        storm
      );
      sum += toEdge(r.fleet[0].ship.at, next);
    }
    return sum / 12;
  };
  const high = inside(16),
    low = inside(4);
  console.log(
    `# inside the next cap, mean: stormcraft 16 ${high.toFixed(1)} m, 4 ${low.toFixed(1)} m`
  );
  assert.ok(low > 0 && high > low + 3, `${high} to ${low}`);
  for (let seed = 1; seed <= 20; seed++)
    assert.ok(
      with1(seed, 'stormcraft', 16).temper.margin >
        with1(seed, 'stormcraft', 4).temper.margin * 1.5
    );
});

test('stamina: alike till the midpoint of the race; by its end the 16s shoot and steer sharper than the 4s, the tens as ever', () => {
  for (let seed = 1; seed <= 20; seed++) {
    const a = with1(seed, 'stamina', 16).temper,
      b = with1(seed, 'stamina', 4).temper,
      ten = nature(seed).temper;
    for (const t of [0, 100, LENGTH / 2]) {
      assert.equal(tempered(a, t), a);
      assert.equal(tempered(a, t).gunnery, tempered(b, t).gunnery);
    }
    assert.equal(tempered(ten, LENGTH), ten);
    let was = 0;
    for (const t of [LENGTH * 0.6, LENGTH * 0.8, LENGTH, LENGTH * 2]) {
      const gap = tempered(a, t).gunnery - tempered(b, t).gunnery;
      assert.ok(gap >= was && gap > 0, `${seed} at ${t}: ${gap}`);
      assert.ok(tempered(a, t).helm > tempered(b, t).helm);
      was = gap;
    }
    const end = (n: typeof a) => tempered(n, LENGTH);
    assert.ok(end(a).gunnery > ten.gunnery && ten.gunnery > end(b).gunnery);
    assert.deepEqual(tempered(a, LENGTH * 2), end(a), 'and stays there');
    // her gunner's hand: the same gun's spread
    assert.ok(spreadBy(end(a).gunnery) < spreadBy(end(b).gunnery));
  }
});

test('seamanship: the same blows on the same ship fault the 4s where the 16s hold', () => {
  const ship = specField(5, 1).ships[1];
  const worn = (seamanship: number, hull: number) => {
    const c = fitted(crewOf(1), { ...ship, driver: driver(9, { seamanship }) });
    return faultsIn({
      ...c,
      health: { ...c.health, hull },
      wear: { zones: [0, 0, 30, 10], quiet: 0, mending: false },
    });
  };
  // the tables fault her waterline at 40 and majorly under 25: a 16 holds
  // till 34 and 21.25, a 4 goes at 46 and 28.75
  assert.deepEqual(worn(10, 42), [0, 0, 0, 0]);
  assert.deepEqual(worn(4, 42), [0, 0, 1, 0]);
  assert.deepEqual(worn(16, 38), [0, 0, 0, 0]);
  assert.deepEqual(worn(10, 38), [0, 0, 1, 0]);
  assert.deepEqual(worn(16, 27), [0, 0, 1, 0]);
  assert.deepEqual(worn(4, 27), [0, 0, 2, 1]);
  let high = 0,
    low = 0;
  for (let hull = 100; hull > 0; hull -= 1) {
    high += worn(16, hull).reduce((a: number, b) => a + b, 0);
    low += worn(4, hull).reduce((a: number, b) => a + b, 0);
  }
  assert.ok(high < low, 'over a whole hull lost, the 16 is the less faulted');
});
