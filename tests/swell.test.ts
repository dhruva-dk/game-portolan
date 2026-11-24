import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BANDS, CASCADES, FETCH, PERIOD, SIZE } from '../src/world/cascades.ts';
import { initialSpectrum, seaState } from '../src/world/spectrum.ts';
import {
  createSwell,
  longModes,
  type Hull,
  type Surface,
} from '../src/world/swell.ts';
import { STEP } from '../src/sim/fixed.ts';
import { pose, ride, settled, RIDE, type Ride } from '../src/sim/ride.ts';
import { shipAt, type ShipState } from '../src/sim/ship.ts';
import { FREQUENCY, anchors, icosphere } from '../src/world/lattice.ts';
import {
  R,
  along,
  bearingAt,
  cross,
  dot,
  frameAt,
  fromLatLon,
  length,
  type Vec3,
} from '../src/world/sphere.ts';
import { createWind } from '../src/world/wind.ts';

const all = anchors(icosphere(FREQUENCY), createWind(3), CASCADES[0]);
const open = () => -40;
const rms = (xs: number[]) =>
  Math.sqrt(xs.reduce((s, x) => s + x * x, 0) / xs.length);
const places = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    p: fromLatLon(Math.asin(2 * ((i * 0.618) % 1) - 1), i * 2.4),
    t: i * 1.37,
  }));
const DEG = Math.PI / 180;

test('the modes kept hold nearly all the long waves', () => {
  for (const [wind, share] of [
    [7.6, 0.9],
    [10, 0.94],
    [15, 0.97],
  ]) {
    let total = 0;
    CASCADES.forEach((L, c) => {
      for (const v of initialSpectrum(
        SIZE,
        L,
        { wind, fetch: FETCH },
        c + 1,
        BANDS[c]
      ))
        total += v * v;
    });
    const m = longModes(wind);
    let kept = 0;
    for (let i = 0; i < m.length; i += 8)
      kept +=
        2 * (m[i + 4] ** 2 + m[i + 5] ** 2 + m[i + 6] ** 2 + m[i + 7] ** 2);
    assert.ok(kept / total > share, `wind ${wind}: ${kept / total}`);
  }
});

test('under a hull the kept modes read as all of them do, to a few centimeters', () => {
  const every = createSwell(all, open, 10, { count: Infinity }).at,
    kept = createSwell(all, open, 10).at;
  const err: number[] = [],
    height: number[] = [];
  for (const { p, t } of places(150)) {
    const f = frameAt(p);
    const under = [
      along(p, f.north, 10).p,
      along(p, f.north, -10).p,
      along(p, f.east, 3).p,
      along(p, f.east, -3).p,
    ];
    const mean = (s: Surface) => under.reduce((sum, q) => sum + s(q, t), 0) / 4;
    const truth = mean(every);
    err.push(truth - mean(kept));
    height.push(truth);
  }
  assert.ok(
    rms(err) < 0.1 && rms(err) < 0.2 * rms(height),
    `${rms(err)} m of ${rms(height)} m`
  );
});

test('the swell is as high as the sea state, repeats every PERIOD, and is cut by the depth', () => {
  const swell = createSwell(all, open, 10).at;
  const h = places(300).map(({ p, t }) => swell(p, t));
  assert.ok(
    Math.abs(rms(h) / (seaState(10, FETCH).hs / 4) - 0.95) < 0.12,
    `${rms(h)}`
  );
  for (const { p, t } of places(20))
    assert.ok(Math.abs(swell(p, t) - swell(p, t + PERIOD)) < 1e-6);
  const shallow = createSwell(all, () => -0.5, 10).at;
  for (const { p, t } of places(20)) {
    assert.ok(
      Math.abs(shallow(p, t)) <=
        Math.abs(swell(p, t)) * ((0.5 * 0.78) / seaState(10, FETCH).hs) + 0.05
    );
  }
});

const pointwise =
  (sea: Surface): Hull =>
  (at, heading, reach, rail, time) => {
    const port = cross(at, heading),
      read = (t: Vec3, m: number) => sea(along(at, t, m).p, time);
    return {
      bow: read(heading, reach),
      stern: read(heading, -reach),
      port: read(port, rail),
      starboard: read(port, -rail),
    };
  };

test('the hull read is the surface at its four points, but for the waves too short for it and the move read once', () => {
  const swell = createSwell(all, open, 10, { shortest: RIDE.shortest }),
    points = pointwise(swell.at);
  const err: number[] = [],
    height: number[] = [];
  for (const { p, t } of places(200)) {
    const heading = frameAt(p).north,
      a = swell.hull(p, heading, RIDE.reach, RIDE.rail, t);
    const got = [a.bow, a.stern, a.port, a.starboard];
    const b = points(p, heading, RIDE.reach, RIDE.rail, t);
    [b.bow, b.stern, b.port, b.starboard].forEach((h, i) => {
      err.push(got[i] - h);
      height.push(h);
    });
  }
  assert.ok(rms(err) < 0.05 * rms(height), `${rms(err)} m of ${rms(height)} m`);
});

function voyages(sea: Hull, every: number, seconds: number) {
  return Array.from({ length: 6 }, (_, k) => {
    const p = fromLatLon(Math.asin(2 * ((k * 0.618) % 1) - 1) * 0.9, k * 2.4),
      b = k * 1.1;
    let s: ShipState = { ...shipAt(p, bearingAt(p, b)), speed: 2 + 2.5 * k };
    let r: Ride = settled(s, sea, 0, k, every);
    const out: number[][] = [];
    for (let i = 1; i < seconds / STEP; i++) {
      const on = along(s.at, s.heading, s.speed * STEP);
      s = { ...s, at: on.p, heading: on.t };
      r = ride(r, s, sea, i * STEP, STEP);
      out.push([r.heave, r.pitch, r.roll]);
    }
    return out;
  });
}

test(
  'its ride on the hull read, five times a second, is its ride on the whole surface read every step: ' +
    'to a few cm and a fraction of a degree',
  () => {
    for (const wind of [7.6, 15]) {
      const swell = createSwell(all, open, wind, { shortest: RIDE.shortest });
      const got = voyages(swell.hull, RIDE.every, 30);
      const truth = voyages(pointwise(createSwell(all, open, wind).at), 1, 30);
      const err: number[][] = [[], [], []],
        size: number[][] = [[], [], []];
      got.forEach((ship, k) =>
        ship.forEach((x, i) =>
          x.forEach((v, j) => {
            err[j].push(v - truth[k][i][j]);
            size[j].push(truth[k][i][j]);
          })
        )
      );
      const [heave, pitch, roll] = err.map(rms),
        worst = err.map((e) => Math.max(...e.map(Math.abs)));
      const hs = seaState(wind, FETCH).hs;
      assert.ok(
        heave < 0.02 && worst[0] < 0.04 * hs,
        `wind ${wind}: heave off by ${heave} m (worst ${worst[0]}) of ${rms(size[0])}`
      );
      assert.ok(
        pitch < 0.15 * DEG && worst[1] < 0.7 * DEG,
        `wind ${wind}: pitch off by ${pitch / DEG}° (worst ${worst[1] / DEG}°)`
      );
      assert.ok(
        roll < 0.15 * DEG && worst[2] < 0.7 * DEG,
        `wind ${wind}: roll off by ${roll / DEG}° (worst ${worst[2] / DEG}°)`
      );
    }
  }
);

test('the hull rides the swell: its level follows the water under it, its pitch and roll its slope', () => {
  for (const wind of [10, 15]) {
    const swell = createSwell(all, open, wind, {
      shortest: RIDE.shortest,
    }).hull;
    const s = shipAt(fromLatLon(0.3, 1.1), frameAt(fromLatLon(0.3, 1.1)).north);
    let r = settled(s, swell, 0);
    const level: number[] = [],
      miss: number[] = [],
      pitch: number[] = [],
      pitchMiss: number[] = [],
      roll: number[] = [],
      rolled: number[] = [];
    for (let i = 1; i < 60 / STEP; i++) {
      const t = i * STEP;
      r = ride(r, s, swell, t, STEP);
      const { bow, stern, port, starboard } = swell(
        s.at,
        s.heading,
        RIDE.reach,
        RIDE.rail,
        t
      );
      const under = (bow + stern + port + starboard) / 4;
      roll.push(Math.atan2(port - starboard, 2 * RIDE.rail));
      rolled.push(r.roll);
      level.push(under);
      miss.push(r.heave - under);
      const slope = Math.atan2(bow - stern, 2 * RIDE.reach);
      pitch.push(slope);
      pitchMiss.push(r.pitch - slope);
    }
    assert.ok(
      rms(miss) < 0.3 * rms(level),
      `wind ${wind}: level off by ${rms(miss)} m of ${rms(level)} m`
    );
    assert.ok(
      Math.max(...miss.map(Math.abs)) < 0.25 * seaState(wind, FETCH).hs,
      `wind ${wind}: ${Math.max(...miss.map(Math.abs))} m at worst`
    );
    assert.ok(
      rms(pitchMiss) < 0.5 * rms(pitch),
      `wind ${wind}: pitch off by ${rms(pitchMiss)} of ${rms(pitch)}`
    );
    assert.ok(
      rms(rolled) < rms(roll) && rms(rolled) > 0.5 * rms(roll),
      `wind ${wind}: rolls ${rms(rolled)} on ${rms(roll)}`
    );
    const placed = pose(s, r);
    assert.ok(
      Math.abs(dot(placed.forward, placed.up)) < 1e-12 &&
        Math.abs(length(placed.up) - 1) < 1e-12
    );
    assert.ok(Math.abs(length(placed.position) - R - r.heave) < 1e-9);
  }
});

test('the hull read answers in one object of its own, read after read', () => {
  const swell = createSwell(all, open, 10, { shortest: RIDE.shortest });
  const p = fromLatLon(0.2, 0.4),
    h = frameAt(p).north;
  const first = swell.hull(p, h, RIDE.reach, RIDE.rail, 0);
  assert.equal(swell.hull(p, h, RIDE.reach, RIDE.rail, 1), first);
});
