import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SHIP } from '../src/sim/handling.ts';
import { clearance, hullAt, type Depth } from '../src/sim/shoal.ts';
import { offCourse, shipAt, step, turned, type Helm, type ShipState } from '../src/sim/ship.ts';
import { STEP, fixedClock } from '../src/sim/fixed.ts';
import { R, along, cross, distance, dot, frameAt, fromLatLon, length, normalize, type Vec3 } from '../src/world/sphere.ts';

const deep: Depth = () => 30;
const run = (s: ShipState, helm: (s: ShipState) => Helm, seconds: number, depth = deep, each?: (s: ShipState) => void) => {
  for (let i = 0; i < Math.round(seconds / STEP); i++) {
    s = step(s, helm(s), STEP, depth);
    each?.(s);
  }
  return s;
};
const start = fromLatLon(0.2, 0.3);
const north = frameAt(start).north;
const deg = Math.PI / 180;

test('the same orders give the same voyage, to the bit', () => {
  const orders = (s: ShipState): Helm => ({ course: turned(s, Math.sin(length(s.at) + s.speed) * 2), throttle: (s.speed * 7) % 1 });
  const a = run(shipAt(start, north), orders, 40), b = run(shipAt(start, north), orders, 40);
  assert.deepEqual(a, b);
});

test('she gathers way to her top speed and no further, and turns no faster than her fastest', () => {
  let fastest = 0, quickest = 0;
  const s = run(shipAt(start, north), (s) => ({ course: turned(s, 2), throttle: 1 }), 60, deep, (s) => {
    fastest = Math.max(fastest, s.speed);
    quickest = Math.max(quickest, Math.abs(s.turn));
  });
  assert.ok(fastest <= SHIP.top + 1e-9 && s.speed > SHIP.top * 0.99, `${fastest}, ${s.speed}`);
  assert.ok(quickest <= SHIP.turn + 1e-9 && quickest > SHIP.turn * 0.99, `${quickest}`);
  // the throttle asks for a share of top speed; never astern
  const half = run(shipAt(start, north), () => ({ course: null, throttle: 0.5 }), 60);
  assert.ok(Math.abs(half.speed - SHIP.top / 2) < 0.05, `${half.speed}`);
  const astern = run(shipAt(start, north), () => ({ course: null, throttle: -1 }), 10);
  assert.equal(astern.speed, 0);
});

test('let go, she coasts and slows by her drag alone', () => {
  const s0: ShipState = { ...shipAt(start, north), speed: SHIP.top };
  let last = s0.speed;
  const s = run(s0, () => ({ course: null, throttle: 0 }), 5, deep, (s) => {
    assert.ok(s.speed < last);
    last = s.speed;
  });
  assert.ok(Math.abs(s.speed - SHIP.top * Math.exp(-SHIP.drag * 5)) < 1e-9, `${s.speed}`);
  // she runs on about top / drag metres in all
  const far = run(s0, () => ({ course: null, throttle: 0 }), 40);
  assert.ok(Math.abs(distance(start, far.at) - SHIP.top / SHIP.drag) < 0.5, `${distance(start, far.at)}`);
});

test('a straight course is a great circle: round the planet and back to the start', () => {
  const s0 = { ...shipAt(start, north), speed: SHIP.top };
  const plane = cross(s0.at, s0.heading);
  let off = 0;
  const s = run(s0, () => ({ course: null, throttle: 1 }), (2 * Math.PI * R) / SHIP.top, deep, (s) => {
    off = Math.max(off, Math.abs(dot(s.at, plane)) * R);
  });
  assert.ok(off < 1e-6, `strays ${off} m off the circle`);
  // (within the part of a step the circle's length leaves over)
  assert.ok(distance(s.at, start) < SHIP.top * STEP, `${distance(s.at, start)} m from the start`);
  assert.ok(dot(s.heading, north) > 1 - 1e-6);
});

test('over the pole: still on her great circle, her heading still a unit tangent, the distance still her speed', () => {
  const s0 = { ...shipAt(fromLatLon(85 * deg, 0.7), frameAt(fromLatLon(85 * deg, 0.7)).north), speed: SHIP.top };
  const plane = cross(s0.at, s0.heading);
  let travelled = 0, last = s0.at, most = -1;
  const s = run(s0, () => ({ course: null, throttle: 1 }), 30, deep, (s) => {
    travelled += distance(last, s.at);
    last = s.at;
    most = Math.max(most, s.at[1]);
    assert.ok(Math.abs(length(s.heading) - 1) < 1e-12 && Math.abs(dot(s.heading, s.at)) < 1e-12);
    assert.ok(Math.abs(dot(s.at, plane)) < 1e-9);
  });
  assert.ok(most > Math.cos(0.1 * deg), 'she passes over the pole');
  assert.ok(Math.abs(travelled - 30 * SHIP.top) < 1e-6, `${travelled}`);
  // and from the pole itself she comes round onto a course and holds it
  const away: Vec3 = [0, 0, -1];
  const pole = run({ ...shipAt([0, 1, 0], [1, 0, 0]), speed: 5 }, () => ({ course: away, throttle: 1 }), 20);
  assert.ok(Math.abs(offCourse(pole, away)) < 0.5 * deg && pole.at[2] < -0.2, `${offCourse(pole, away)}`);
});

test('she comes round onto a course without swinging past it', () => {
  for (const [angle, speed] of [[-90, SHIP.top], [150, SHIP.top], [30, 2], [-170, 1]] as const) {
    const s0 = { ...shipAt(start, north), speed };
    const course = turned(s0, angle * deg);
    let worst = 0, settled = Infinity;
    run(s0, () => ({ course, throttle: speed / SHIP.top }), 60, deep, (s) => {
      // past the course: the error's sign has flipped
      worst = Math.max(worst, -Math.sign(angle) * offCourse(s, course));
      if (Math.abs(offCourse(s, course)) > 0.5 * deg) settled = Infinity;
      else settled = Math.min(settled, 0);
    });
    assert.ok(worst < 0.2 * deg, `${angle}°: swings ${worst / deg}° past`);
    assert.equal(settled, 0, `${angle}°: not settled`);
  }
});

// A straight shore: the great circle through `coast` across `seaward`; the floor rises 1 m in 4 toward it from the
// sea's 20 m and dries 6 m past it.
const coast = along(start, north, 120).p;
const seaward = frameAt(coast).east;
const offshore = (p: Vec3) => R * Math.asin(dot(normalize(p), seaward));
const shoal: Depth = (p) => Math.min(20, -6 + offshore(p) / 4);
/** How far off the shore the draught's contour lies. */
const DRY = 4 * (6 + SHIP.draught);

test('she never sails into water shallower than her draught, at any angle, and slides along the shore', () => {
  for (const angle of [0, 20, 45, 70]) {
    // from 80 m off the contour, her course `angle` off straight at the shore
    const from = along(coast, seaward, DRY + 80).p;
    const s0 = shipAt(from, frameAt(from).east.map((x) => -x) as unknown as Vec3);
    const course = turned(s0, angle * deg);
    let least = Infinity;
    const helm = () => ({ course, throttle: 1 });
    const sail = (s: ShipState, seconds: number) => run(s, helm, seconds, shoal, (s) => {
      least = Math.min(least, clearance(s.at, s.heading, shoal).least);
    });
    // at the shore by 30 s; then how fast she makes her way along it
    const a = sail(s0, 30), b = sail(a, 30);
    assert.ok(least >= 0, `${angle}°: ${least} m under her keel`);
    const off = offshore(b.at) - DRY, rate = distance(a.at, b.at) / 30;
    assert.ok(off < 15, `${angle}°: ${off} m off the contour`);
    assert.ok(rate >= [0, 0.5, 1.5, 3.5][[0, 20, 45, 70].indexOf(angle)] && (angle > 0 || rate < 0.5), `${angle}°: ${rate} m/s`);
  }
});

test('set down in the shallows, she can work her way out to deep water', () => {
  const from = along(coast, seaward, DRY - 6).p;
  const s0 = shipAt(from, frameAt(from).north);
  let last = clearance(s0.at, s0.heading, shoal).least;
  assert.ok(last < 0);
  const s = run(s0, () => ({ course: seaward, throttle: 1 }), 30, shoal, (s) => {
    const c = clearance(s.at, s.heading, shoal).least;
    assert.ok(c >= Math.min(last, 0) - 1e-9);
    last = c;
  });
  assert.ok(clearance(s.at, s.heading, shoal).least > 5);
});

/** The least water under any of her hull, metres past her draught: her keel from sternpost to forefoot every metre,
 * and her quarters. */
const underHull = (s: ShipState, depth: Depth) => {
  let least = Infinity;
  for (let a = -0.4 * SHIP.length; a <= 0.4 * SHIP.length + 1e-9; a += 0.4 * SHIP.length / 10) least = Math.min(least, depth(hullAt(s.at, s.heading, [a, 0])));
  for (const side of [-1, 1]) least = Math.min(least, depth(hullAt(s.at, s.heading, [-0.3 * SHIP.length, side * 0.3 * SHIP.beam])));
  return least - SHIP.draught;
};

test('coming about close along the shore, her stern swings clear of it, not onto it', () => {
  for (const off of [1, 3, 6]) for (const away of [90, 135]) {
    // sailing along the contour `off` metres outside it, then put about `away` degrees to seaward
    const from = along(coast, seaward, DRY + off).p;
    let s = run(shipAt(from, frameAt(from).north), () => ({ course: frameAt(from).north, throttle: 1 }), 5, shoal);
    const course = turned(s, -away * deg);
    let least = Infinity;
    s = run(s, () => ({ course, throttle: 1 }), 20, shoal, (s) => { least = Math.min(least, underHull(s, shoal)); });
    assert.ok(least >= -1e-6, `${off} m off, ${away}°: ${least} m under her hull`);
    assert.ok(Math.abs(offCourse(s, course)) < 2 * deg, `${off} m off, ${away}°: she came about (${offCourse(s, course) / deg}° to go)`);
  }
});

test('however she meets the shore, steered away she gets off it, her whole hull clear all the while', () => {
  for (const angle of [0, 30, 60, 89]) for (const side of [-1, 1]) {
    // into the shore `angle` off square to it, until she lies against it
    const from = along(coast, seaward, DRY + 40).p;
    const s0 = shipAt(from, frameAt(from).east.map((x) => -x) as unknown as Vec3);
    const course = turned(s0, side * angle * deg);
    let least = Infinity;
    const watch = (s: ShipState) => { least = Math.min(least, underHull(s, shoal)); };
    const a = run(s0, () => ({ course, throttle: 1 }), 40, shoal, watch);
    assert.ok(offshore(a.at) - DRY < 16, `${angle}° ${side}: she reached the shore`);
    // then put about for the open sea
    const b = run(a, () => ({ course: seaward, throttle: 1 }), 40, shoal, watch);
    assert.ok(least >= -1e-6, `${angle}° ${side}: ${least} m under her hull`);
    assert.ok(offshore(b.at) - DRY > 150, `${angle}° ${side}: only ${offshore(b.at) - DRY} m off`);
  }
});

test('fixed steps: as many as the frames add up to, whatever the frame rate', () => {
  for (const fps of [30, 40, 60, 120]) {
    const clock = fixedClock();
    let steps = 0;
    for (let i = 0; i < fps * 10; i++) steps += clock(1 / fps).steps;
    assert.ok(Math.abs(steps - 300) <= 1, `${fps} fps: ${steps}`);
  }
});
