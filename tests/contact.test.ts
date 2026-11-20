import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  afloat,
  gap,
  stepFleet,
  type Blow,
  type Vessel,
} from '../src/sim/contact.ts';
import { STEP } from '../src/sim/fixed.ts';
import { RAM, SHIP } from '../src/sim/handling.ts';
import { knocked, ride, settled } from '../src/sim/ride.ts';
import { clearance, hullAt, type Depth } from '../src/sim/shoal.ts';
import { shipAt, turned, type Helm, type ShipState } from '../src/sim/ship.ts';
import {
  R,
  along,
  cross,
  distance,
  dot,
  frameAt,
  fromLatLon,
  length,
  normalize,
  type Vec3,
} from '../src/world/sphere.ts';
import { flat } from '../src/world/swell.ts';

const deep: Depth = () => 30;
const deg = Math.PI / 180;
const add3 = (a: Vec3, b: Vec3, k: number): Vec3 => [
  a[0] + b[0] * k,
  a[1] + b[1] * k,
  a[2] + b[2] * k,
];
type Orders = (fleet: readonly Vessel[]) => Helm[];
/** Every ship holding her course (rudder amidships) at these throttles. */
const holding =
  (...throttles: number[]): Orders =>
  () =>
    throttles.map((throttle) => ({ course: null, throttle }));

/** The fleet sailed `seconds` under `orders`; the rams there were. */
const run = (
  fleet: Vessel[],
  orders: Orders,
  seconds: number,
  depth = deep,
  each?: (f: Vessel[]) => void
) => {
  const blows: Blow[] = [];
  for (let i = 0; i < Math.round(seconds / STEP); i++) {
    const r = stepFleet(fleet, orders(fleet), STEP, depth);
    fleet = r.fleet;
    blows.push(...r.blows);
    each?.(fleet);
  }
  return { fleet, blows };
};

/**
 * The open water between two hulls, measured apart from contact.ts: points
 * along each keel every half metre on the sphere, the least distance between
 * them less a beam.
 */
const KEEL = SHIP.length / 2 - SHIP.beam / 2;
const keel = (s: ShipState) =>
  Array.from({ length: Math.round((2 * KEEL) / 0.5) + 1 }, (_, i) =>
    hullAt(s.at, s.heading, [-KEEL + i * 0.5, 0])
  );
const between = (a: ShipState, b: ShipState) => {
  if (distance(a.at, b.at) > SHIP.length + 1) return Infinity;
  const ka = keel(a),
    kb = keel(b);
  let least = Infinity;
  for (const p of ka)
    for (const q of kb) least = Math.min(least, distance(p, q));
  return least - SHIP.beam;
};
/**
 * The least water between any two of a fleet, by contact.ts and by the keels
 * apart from it.
 */
const leastOf = (fleet: readonly Vessel[]) => {
  let module = Infinity,
    apart = Infinity;
  for (let i = 0; i < fleet.length; i++)
    for (let j = i + 1; j < fleet.length; j++) {
      const g = gap(fleet[i].ship, fleet[j].ship);
      module = Math.min(module, g);
      if (g < 0.5)
        apart = Math.min(apart, between(fleet[i].ship, fleet[j].ship));
    }
  return { module, apart };
};

const centre = fromLatLon(0.2, 0.3);
/** A ship heading `bearing` (radians to port of east at `c`) at `speed`. */
const lying = (c: Vec3, bearing: number, speed = 0): ShipState => {
  const f = frameAt(c),
    s = shipAt(c, f.east);
  return { ...s, heading: turned(s, bearing), speed };
};
/**
 * Two ships: the second lying at `c` heading east (or along `east`), making
 * `ahead` m/s; the first coming at `speed` from 45 m off, `angle` radians to
 * port of her heading, her keel's line through the point `aim` metres ahead of
 * the other's amidships and `across` to port.
 */
const approach = (
  angle: number,
  speed: number,
  aim = 0,
  ahead = 0,
  c = centre,
  east?: Vec3,
  across = 0
): Vessel[] => {
  const target = east
    ? { ...shipAt(c, east), speed: ahead }
    : lying(c, 0, ahead);
  const heading = turned(target, angle);
  const from = along(
    hullAt(target.at, target.heading, [aim, across]),
    heading,
    -45 - SHIP.length / 2
  );
  return [afloat(1, { ...shipAt(from.p, from.t), speed }), afloat(2, target)];
};

test('the same fleet under the same orders meets the same way, to the bit', () => {
  const four = (): Vessel[] =>
    [0, 1, 2, 3].map((k) => {
      const p = along(
        centre,
        turned(lying(centre, 0), (k * Math.PI) / 2 + 0.3),
        35
      ).p;
      return afloat(10 - k, {
        ...shipAt(p, add3(centre, p, -1)),
        speed: 4 + k,
      });
    });
  const orders: Orders = (f) =>
    f.map((v, i) => ({
      course: turned(v.ship, Math.sin(v.ship.speed * 3 + i) * 2),
      throttle: 0.6 + 0.4 * Math.sin(v.ship.turn * 50 + i),
    }));
  const a = run(four(), orders, 30),
    b = run(four(), orders, 30);
  assert.ok(a.blows.length > 0, 'they met');
  assert.deepEqual(a, b);
});

test('it makes no difference in which order the fleet is listed', () => {
  const three = (): Vessel[] =>
    [0, 1, 2].map((k) => {
      const p = along(
        centre,
        turned(lying(centre, 0), (k * 2 * Math.PI) / 3),
        30 + k
      ).p;
      return afloat(k + 1, { ...shipAt(p, add3(centre, p, -1)), speed: 9 + k });
    });
  // each ship's orders by her id, wherever she is listed
  const orders: Orders = (f) =>
    f.map((v) => ({
      course: turned(v.ship, 0.2 * Math.sin(v.id + v.ship.speed)),
      throttle: 1,
    }));
  const a = run(three(), orders, 20);
  for (const order of [
    [2, 0, 1],
    [1, 2, 0],
    [2, 1, 0],
  ]) {
    const b = run(
      order.map((i) => three()[i]),
      orders,
      20
    );
    assert.deepEqual(b.blows, a.blows);
    for (const v of b.fleet)
      assert.deepEqual(
        v,
        a.fleet.find((w) => w.id === v.id)
      );
  }
  assert.ok(a.blows.length > 0, 'they met');
});

test('hulls never overlap, from any angle, at any speed, wherever she is struck', () => {
  for (let angle = 0; angle < 360; angle += 30)
    for (const speed of [3, 12])
      for (const aim of [-10, 0, 10])
        for (const ahead of [0, 6]) {
          let least = { module: Infinity, apart: Infinity };
          const { blows } = run(
            approach(angle * deg, speed, aim, ahead),
            holding(speed / SHIP.top, ahead / SHIP.top),
            45 / speed + 4,
            deep,
            (f) => {
              const l = leastOf(f);
              least = {
                module: Math.min(least.module, l.module),
                apart: Math.min(least.apart, l.apart),
              };
            }
          );
          const what = `${angle}° at ${speed} m/s, aimed ${aim} m ahead, she making ${ahead}: ${least.module} m, ${least.apart} m apart`;
          assert.ok(least.module >= 0 && least.apart >= -1e-3, what);
          assert.ok(blows.length <= 1, `${what}: ${blows.length} rams`);
        }
});

test('a glancing blow slides along her and goes on, losing little way and doing no damage', () => {
  for (const angle of [10, 15, 20]) {
    // her line passing a beam to port of the other's amidships, closing on her side
    let touched = false;
    const { fleet, blows } = run(
      approach(-angle * deg, SHIP.top, 0, 0, centre, undefined, SHIP.beam),
      holding(1, 0),
      12,
      deep,
      (f) => {
        touched ||= gap(f[0].ship, f[1].ship) < RAM.skin;
      }
    );
    assert.ok(touched, `${angle}°: they met`);
    assert.equal(blows.length, 0, `${angle}°`);
    assert.ok(
      fleet[0].ship.speed > 0.95 * SHIP.top,
      `${angle}°: ${fleet[0].ship.speed} m/s`
    );
    // she has gone on past her bow
    const past =
      dot(add3(fleet[0].ship.at, fleet[1].ship.at, -1), fleet[1].ship.heading) *
      R;
    assert.ok(past > SHIP.length, `${angle}°: ${past} m on`);
  }
});

test('bow into her side: the struck ship takes far more than the striker', () => {
  const { blows } = run(approach(90 * deg, SHIP.top), holding(1, 0), 6);
  assert.equal(blows.length, 1);
  const [{ striker, struck, closing }] = blows;
  assert.deepEqual(
    [striker.id, striker.part, struck.id, struck.part],
    [1, 'bow', 2, 'side']
  );
  assert.ok(Math.abs(closing - SHIP.top) < 0.01, `${closing}`);
  // all the closing hers: she bears RAM.bear of it on her bow, the struck ship all of it on her side
  const whole = RAM.damage * (closing - RAM.past);
  assert.ok(
    Math.abs(striker.damage - whole * RAM.bear * RAM.bow) < 1e-9 &&
      Math.abs(struck.damage - whole * RAM.side) < 1e-9
  );
  assert.ok(
    struck.damage > 5 * striker.damage,
    `${struck.damage} against ${striker.damage}`
  );
  // and on her quarter or her bow the same, only less on her quarter
  for (const [aim, part] of [
    [9, 'side'],
    [-9, 'side'],
  ] as const) {
    const b = run(approach(90 * deg, SHIP.top, aim), holding(1, 0), 6).blows;
    assert.equal(b.length, 1);
    assert.deepEqual([b[0].striker.part, b[0].struck.part], ['bow', part]);
    assert.ok(b[0].struck.damage > 4 * b[0].striker.damage);
  }
  // her stern, struck from dead astern
  const s = run(approach(0, SHIP.top), holding(1, 0), 8).blows;
  assert.deepEqual([s[0].striker.part, s[0].struck.part], ['bow', 'stern']);
  assert.ok(s[0].struck.damage > 3 * s[0].striker.damage);
});

test('head on, both take it alike', () => {
  const { blows } = run(
    approach(180 * deg, SHIP.top, 0, SHIP.top),
    holding(1, 1),
    4
  );
  assert.equal(blows.length, 1);
  const [{ striker, struck, closing }] = blows;
  assert.ok(Math.abs(closing - 2 * SHIP.top) < 0.05, `${closing}`);
  assert.deepEqual([striker.part, struck.part], ['bow', 'bow']);
  assert.ok(
    Math.abs(striker.damage - struck.damage) < 1e-9 * struck.damage,
    `${striker.damage}, ${struck.damage}`
  );
  assert.ok(striker.damage > 10 && striker.damage <= RAM.most);
});

test('a nudge, or lying alongside and leaning on her, does no damage', () => {
  let touched = false;
  const nudge = run(
    approach(90 * deg, RAM.least - 0.3),
    holding((RAM.least - 0.3) / SHIP.top, 0),
    12,
    deep,
    (f) => {
      touched ||= gap(f[0].ship, f[1].ship) < RAM.skin;
    }
  );
  assert.ok(touched);
  assert.equal(nudge.blows.length, 0);
  // alongside her, half a metre off, and steering into her at full speed for half a minute
  const a = lying(centre, 0, SHIP.top),
    b = {
      ...shipAt(
        along(centre, cross(centre, a.heading), SHIP.beam + 0.5).p,
        a.heading
      ),
      speed: SHIP.top,
    };
  const fleet = [afloat(1, a), afloat(2, b)];
  const leaning: Orders = (f) => [
    { course: null, throttle: 1 },
    { course: turned(f[1].ship, -0.5), throttle: 1 },
  ];
  let least = Infinity;
  const side = run(fleet, leaning, 30, deep, (f) => {
    least = Math.min(least, leastOf(f).apart);
  });
  assert.equal(side.blows.length, 0);
  assert.ok(least >= -1e-3, `${least}`);
});

test('one ram, one blow, however long she presses on; drawn clear, she may ram again', () => {
  const first = run(approach(90 * deg, SHIP.top), holding(1, 0), 20);
  assert.equal(first.blows.length, 1);
  assert.deepEqual(
    first.fleet.map((v) => v.engaged),
    [[2], [1]]
  );
  // set back 45 m and coming on again: clear of her past RAM.rearm, and so a second ram
  const [, target] = first.fleet,
    again = approach(
      90 * deg,
      SHIP.top,
      0,
      0,
      target.ship.at,
      target.ship.heading
    );
  const second = run(
    [{ ...again[0], engaged: first.fleet[0].engaged }, target],
    holding(1, 0),
    8
  );
  assert.equal(second.blows.length, 1);
});

test('coming about alongside her, her stern swings clear of the other, never through', () => {
  for (const side of [-1, 1])
    for (const speed of [3, SHIP.top]) {
      // a lies 0.3 m off b's port side, both under way; a puts her helm over away from b, or toward
      const b = lying(centre, 0, speed),
        port = cross(centre, b.heading);
      const at = along(centre, port, SHIP.beam + 0.3).p;
      const a = { ...shipAt(at, b.heading), speed };
      let least = Infinity;
      const orders: Orders = (f) => [
        { course: turned(f[0].ship, side * 1.5), throttle: 1 },
        { course: null, throttle: speed / SHIP.top },
      ];
      run([afloat(1, a), afloat(2, b)], orders, 15, deep, (f) => {
        least = Math.min(least, leastOf(f).apart);
      });
      assert.ok(
        least >= -1e-3,
        `helm ${side > 0 ? 'toward port' : 'toward her'} at ${speed}: ${least}`
      );
    }
});

test('three driving into one another stay clear of each other, and settle', () => {
  const three = [0, 1, 2].map((k) => {
    const p = along(
      centre,
      turned(lying(centre, 0), (k * 2 * Math.PI) / 3),
      25
    ).p;
    return afloat(k + 1, {
      ...shipAt(p, add3(centre, p, -1)),
      speed: SHIP.top,
    });
  });
  let least = Infinity,
    fastest = 0;
  const track: Vec3[][] = [];
  const { blows } = run(three, holding(1, 1, 1), 30, deep, (f) => {
    least = Math.min(least, leastOf(f).apart, leastOf(f).module);
    for (const v of f)
      fastest = Math.max(fastest, v.ship.speed + length(v.shove));
    track.push(f.map((v) => v.ship.at));
  });
  assert.ok(blows.length >= 2, `${blows.length} rams`);
  assert.ok(least >= -1e-3, `${least}`);
  assert.ok(fastest <= SHIP.top + 1e-9, `${fastest} m/s`);
  // pressed together: in the last five seconds each moves smoothly, not a centimetre this way and that
  const last = track.slice(-150);
  for (let k = 0; k < 3; k++)
    for (let i = 2; i < last.length; i++) {
      const kick =
        length(add3(add3(last[i][k], last[i - 1][k], -2), last[i - 2][k], 1)) *
        R;
      assert.ok(kick < 0.005, `ship ${k}: ${kick} m`);
    }
});

// A straight shore, as in sailing.test.ts: the floor rises 1 m in 4 from the sea's 20 m and dries 6 m past `coast`.
const coast = along(centre, frameAt(centre).north, 120).p;
const seaward = frameAt(coast).east;
const offshore = (p: Vec3) => R * Math.asin(dot(normalize(p), seaward));
const shoal: Depth = (p) => Math.min(20, -6 + offshore(p) / 4);
const DRY = 4 * (6 + SHIP.draught);

test('pressed against the shore by another, she is neither set aground nor pushed through her', () => {
  for (const angle of [90, 60]) {
    // b lies along the shore, her keel a metre clear; a drives into her from seaward and holds on
    const at = along(coast, seaward, DRY + SHIP.beam / 2 + 4).p;
    const b = shipAt(at, frameAt(at).north);
    const heading = turned(b, angle * deg),
      from = along(at, heading, -40);
    const a = { ...shipAt(from.p, from.t), speed: SHIP.top };
    let least = Infinity,
      grounded = Infinity,
      fastest = 0;
    const track: Vec3[][] = [];
    const { blows } = run(
      [afloat(1, a), afloat(2, b)],
      holding(1, 0),
      30,
      shoal,
      (f) => {
        least = Math.min(least, leastOf(f).apart);
        grounded = Math.min(
          grounded,
          ...f.map((v) => clearance(v.ship.at, v.ship.heading, shoal).least)
        );
        for (const v of f)
          fastest = Math.max(fastest, v.ship.speed + length(v.shove));
        track.push(f.map((v) => v.ship.at));
      }
    );
    assert.equal(blows.length, 1, `${angle}°`);
    assert.ok(least >= -1e-3, `${angle}°: ${least} m between them`);
    assert.ok(grounded >= 0, `${angle}°: ${grounded} m under a keel`);
    assert.ok(fastest <= SHIP.top + 1e-9, `${angle}°: ${fastest} m/s`);
    // pinned: in the last five seconds they move smoothly or not at all
    const last = track.slice(-150);
    for (let k = 0; k < 2; k++)
      for (let i = 2; i < last.length; i++) {
        const kick =
          length(
            add3(add3(last[i][k], last[i - 1][k], -2), last[i - 2][k], 1)
          ) * R;
        assert.ok(kick < 0.005, `${angle}°, ship ${k}: ${kick} m`);
      }
  }
});

test('over the pole, the same ram as anywhere', () => {
  const here = run(approach(90 * deg, SHIP.top, 3), holding(1, 0), 6).blows;
  let least = Infinity;
  // the struck ship lying across the pole itself, the rammer coming over it from 45 m off
  const pole: Vec3 = [0, 1, 0];
  const there = run(
    approach(90 * deg, SHIP.top, 3, 0, pole, [1, 0, 0]),
    holding(1, 0),
    6,
    deep,
    (f) => {
      least = Math.min(least, leastOf(f).apart);
    }
  ).blows;
  assert.equal(there.length, 1);
  assert.ok(least >= -1e-3, `${least}`);
  assert.deepEqual(
    [there[0].striker.part, there[0].struck.part],
    [here[0].striker.part, here[0].struck.part]
  );
  for (const k of ['striker', 'struck'] as const) {
    assert.ok(
      Math.abs(there[0][k].damage - here[0][k].damage) < 1e-6,
      `${k}: ${there[0][k].damage}, ${here[0][k].damage}`
    );
  }
  assert.ok(distance(there[0].at, pole) < SHIP.length);
});

test('the ram scaled by top speed: a full-speed ram square into a still ship does what it did at a top of 14.5 m/s', () => {
  // first tuned for a top of 14.5 m/s: (14.5 − 5) × 2.2 = 20.9 to the struck ship
  const { blows } = run(approach(90 * deg, SHIP.top), holding(1, 0), 6);
  assert.ok(
    Math.abs(blows[0].struck.damage - (14.5 - 5) * 2.2) < 0.2,
    `${blows[0].struck.damage}`
  );
});

test('rammed square in her side, she heels away from the blow, a few degrees, and the rammer not at all', () => {
  let fleet = approach(90 * deg, SHIP.top);
  let rides = fleet.map((v) => settled(v.ship, flat, 0));
  let most = [0, 0];
  for (let i = 0; i < Math.round(8 / STEP); i++) {
    const r = stepFleet(fleet, holding(1, 0)(fleet), STEP, deep);
    fleet = r.fleet;
    rides = rides.map((m, k) =>
      ride(
        knocked(m, fleet[k].ship, r.jolts[k]),
        fleet[k].ship,
        flat,
        i * STEP,
        STEP
      )
    );
    most = most.map((x, k) =>
      Math.abs(rides[k].roll) > Math.abs(x) ? rides[k].roll : x
    );
  }
  // she was struck on her starboard side (the rammer came from her starboard), so heels to port: roll negative
  const struck = -most[1] / deg;
  assert.ok(struck > 4 && struck < 10, `${struck}°`);
  assert.ok(Math.abs(most[0]) < 1e-9, `${most[0] / deg}°`);
});
