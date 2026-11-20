import { test } from 'node:test';
import assert from 'node:assert/strict';
import { R, add, along, cross, distance, dot, frameAt, fromLatLon, length, normalize, scale, type Vec3 } from '../src/world/sphere.ts';
import { CELLS, centreOf } from '../src/world/cells.ts';
import { landOf, planetOf } from '../src/world/land.ts';
import { SEED } from '../src/environment.ts';
import { random } from '../src/world/random.ts';
import { sunAt, sunAtOrigin, sunInSky, sunPlaces, type SunPlaces } from '../src/world/sun.ts';
import { between, locate, taps } from '../src/world/terrain-grid.ts';

const land = landOf(SEED), planet = planetOf(SEED, land);
const places = sunPlaces(planet.start.at, planet.heart);
/** Some other places it might be set: a start anywhere, and its heart anywhere a quarter of the way round or more. */
const others: SunPlaces[] = Array.from({ length: 4 }, (_, k) => {
  const draw = random(k + 11), start = normalize([draw() - 0.5, draw() - 0.5, draw() - 0.5]);
  let heart = normalize([draw() - 0.5, draw() - 0.5, draw() - 0.5]);
  if (dot(heart, start) > 0) heart = scale(heart, -1);
  return sunPlaces(start, heart);
});
const angle = (a: Vec3, b: Vec3) => Math.atan2(length(cross(a, b)), dot(a, b));
const degrees = Math.PI / 180;
/** The point where the sun's bearing is undefined: the origin's antipode. */
const sunPole = (places: SunPlaces): Vec3 => scale(normalize(places.origin), -1);

/** Points spread evenly over the sphere (a Fibonacci lattice), and both poles. */
const points = (n: number): Vec3[] => [
  [0, 1, 0], [0, -1, 0],
  ...Array.from({ length: n }, (_, i) => {
    const y = 1 - (2 * (i + 0.5)) / n, r = Math.sqrt(1 - y * y), a = i * Math.PI * (3 - Math.sqrt(5));
    return [r * Math.cos(a), y, r * Math.sin(a)] as Vec3;
  }),
];

test('the sun stands as high over every place, the poles too, as the hour says', () => {
  for (const [k, set] of [places, ...others].entries()) {
    const pole = sunPole(set);
    for (const hours of [7, 12, 15, 17.5]) {
      const height = sunInSky(hours)[1];
      for (const p of points(4000)) {
        if (angle(p, pole) < 1e-6) continue;
        const s = sunAt(set, hours, scale(p, R + 20));
        assert.ok(Math.abs(length(s) - 1) < 1e-12);
        assert.ok(Math.abs(dot(s, p) - height) < 1e-9, `places ${k} at ${p}: ${dot(s, p)} not ${height}`);
      }
    }
  }
});

test('at the start the sun is where the compass puts it: at 15:00 in the west, 40–50° up; highest at noon', () => {
  const f = frameAt(places.anchor);
  assert.deepEqual(places.anchor, planet.start.at);
  const s = sunAt(places, 15, places.anchor), local = [dot(s, f.east), dot(s, f.up), dot(s, f.north)];
  assert.deepEqual(local.map((x) => x.toFixed(9)), sunInSky(15).map((x) => x.toFixed(9)));
  assert.ok(local[0] < -0.5, 'west');
  const elevation = Math.asin(local[1]) / degrees;
  assert.ok(elevation > 40 && elevation < 50, `${elevation}°`);
  for (const h of [9, 11, 13, 15]) assert.ok(sunInSky(h)[1] < sunInSky(12)[1]);
});

test('the sun depends on the match (its planet, the hour) and the place alone', () => {
  const again = planetOf(SEED, land), b = sunPlaces(again.start.at, again.heart);
  assert.deepEqual(places, b);
  for (const p of points(200)) assert.deepEqual(sunAt(places, 15, p), sunAt(b, 15, p));
  for (const set of [places, ...others]) assert.ok(angle(sunAt(set, 15, set.origin), sunAtOrigin(set, 15)) < 1e-12);
});

test('the one place the bearing is undefined is on land, far in from the coast and far from the start', () => {
  const pole = sunPole(places), at = taps();
  assert.ok(distance(pole, planet.heart) < 1e-9);
  locate(pole, at);
  const inland = -between(land.shore, at);
  console.log(`# the sun's undefined point: ${inland.toFixed(0)} m in from the coast, ${planet.height(pole).toFixed(1)} m up`);
  assert.ok(planet.height(pole) > 0 && inland > 40, `${planet.height(pole)} m up, ${inland} m in`);
  const away = angle(pole, places.anchor);
  assert.ok(away >= Math.PI / 2 - 1e-9, `${away / degrees}° from the start`);
  // no land on that side of the planet farther in
  for (let c = 0; c < CELLS; c += 7) {
    if (!land.water[c] && dot(centreOf(c), places.anchor) <= 0) assert.ok(land.shore[c] >= -inland - 0.01, `cell ${c}`);
  }
});

/**
 * Sails `metres` from p along a path that turns `turn(i)` radians each metre, checking each metre's change of the sun
 * against the curve's own (a metre turns the up 1/R) and the field's turning across the great circles from the
 * origin (tan(θ/2) of the curve's, θ from the origin): never more than 5 times the curve's 300 m and more from the
 * undefined point.
 */
function sail(places: ReturnType<typeof sunPlaces>, p: Vec3, t: Vec3, metres: number, turn: (i: number) => number) {
  let s = sunAt(places, 15, p);
  const pole = sunPole(places);
  for (let i = 0; i < metres; i++) {
    const a = turn(i), u = normalize(p);
    t = normalize(add(scale(t, Math.cos(a)), cross(u, t), Math.sin(a)));
    ({ p, t } = along(p, t, 1));
    const next = sunAt(places, 15, p), change = angle(s, next);
    const theta = angle(normalize(p), normalize(places.origin));
    assert.ok(change <= (1 + Math.tan(theta / 2)) / R * 1.01 + 1e-9, `${change * R} of the curve's at θ ${theta / degrees}°`);
    if (distance(p, pole) > 300) assert.ok(change * R < 5, `${change * R} of the curve's ${distance(p, pole)} m from the pole`);
    s = next;
  }
}

test('sailing anywhere, over the poles too, the sun turns smoothly: never a flip', () => {
  const rand = random(7);
  for (const set of [places, ...others]) {
    const pole = sunPole(set);
    // round the planet over both poles, along and across the great circles from the origin
    for (const lon of [0, 45, 90, 135]) {
      const p = fromLatLon(0, lon * degrees);
      sail(set, p, frameAt(p).north, Math.round(2 * Math.PI * R), () => 0);
    }
    // wandering paths, kept off the land round the one undefined point
    for (let k = 0; k < 20; k++) {
      let p = normalize([rand() * 2 - 1, rand() * 2 - 1, rand() * 2 - 1]);
      if (distance(p, pole) < 600) p = scale(p, -1);
      const f = frameAt(p), a = rand() * 2 * Math.PI;
      const bend = rand() * 0.01;
      sail(set, p, add(scale(f.east, Math.cos(a)), f.north, Math.sin(a)), 1500, (i) => (i % 400 < 200 ? bend : -bend));
    }
  }
});

test('a lap of the planet comes back to the same sun', () => {
  const p = fromLatLon(-6.7 * degrees, -11.6 * degrees);
  let at = p, t = frameAt(p).east;
  for (let i = 0; i < Math.round(2 * Math.PI * R); i++) ({ p: at, t } = along(at, t, 1));
  assert.ok(angle(sunAt(places, 15, at), sunAt(places, 15, p)) < 1e-3);
});
