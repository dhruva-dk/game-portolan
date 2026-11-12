import { test } from 'node:test';
import assert from 'node:assert/strict';
import { R, add, along, cross, distance, dot, frameAt, fromLatLon, length, normalize, scale, type Vec3 } from '../src/world/sphere.ts';
import { createPlanet } from '../src/world/planet.ts';
import { random } from '../src/world/random.ts';
import { sunAt, sunAtOrigin, sunInSky, sunPlaces, sunPole } from '../src/world/sun.ts';

const SEEDS = [1, 2, 3, 4, 5];
const planets = new Map(SEEDS.map((s) => [s, createPlanet(s)]));
const angle = (a: Vec3, b: Vec3) => Math.atan2(length(cross(a, b)), dot(a, b));
const degrees = Math.PI / 180;

/** Points spread evenly over the sphere (a Fibonacci lattice), and both poles. */
const points = (n: number): Vec3[] => [
  [0, 1, 0], [0, -1, 0],
  ...Array.from({ length: n }, (_, i) => {
    const y = 1 - (2 * (i + 0.5)) / n, r = Math.sqrt(1 - y * y), a = i * Math.PI * (3 - Math.sqrt(5));
    return [r * Math.cos(a), y, r * Math.sin(a)] as Vec3;
  }),
];

test('the sun stands as high over every place, the poles too, as the hour says', () => {
  for (const seed of SEEDS) {
    const places = sunPlaces(planets.get(seed)!.islands), pole = sunPole(places);
    for (const hours of [7, 12, 15, 17.5]) {
      const height = sunInSky(hours)[1];
      for (const p of points(4000)) {
        if (angle(p, pole) < 1e-6) continue;
        const s = sunAt(places, hours, scale(p, R + 20));
        assert.ok(Math.abs(length(s) - 1) < 1e-12);
        assert.ok(Math.abs(dot(s, p) - height) < 1e-9, `seed ${seed} at ${p}: ${dot(s, p)} not ${height}`);
      }
    }
  }
});

test('at the start the sun is where the compass puts it: at 15:00 in the west, 40–50° up; highest at noon', () => {
  const places = sunPlaces(planets.get(3)!.islands), f = frameAt(places.anchor);
  const s = sunAt(places, 15, places.anchor), local = [dot(s, f.east), dot(s, f.up), dot(s, f.north)];
  assert.deepEqual(local.map((x) => x.toFixed(9)), sunInSky(15).map((x) => x.toFixed(9)));
  assert.ok(local[0] < -0.5, 'west');
  const elevation = Math.asin(local[1]) / degrees;
  assert.ok(elevation > 40 && elevation < 50, `${elevation}°`);
  for (const h of [9, 11, 13, 15]) assert.ok(sunInSky(h)[1] < sunInSky(12)[1]);
});

test('the sun depends on the match (its islands, the hour) and the place alone', () => {
  for (const seed of SEEDS) {
    const a = sunPlaces(planets.get(seed)!.islands), b = sunPlaces(createPlanet(seed).islands);
    assert.deepEqual(a, b);
    for (const p of points(200)) assert.deepEqual(sunAt(a, 15, p), sunAt(b, 15, p));
    assert.ok(angle(sunAt(a, 15, a.origin), sunAtOrigin(a, 15)) < 1e-12);
  }
});

test('the one place the bearing is undefined is on land, far from the start', () => {
  for (const seed of SEEDS) {
    const planet = planets.get(seed)!, places = sunPlaces(planet.islands), pole = sunPole(places);
    const island = planet.islands.find((s) => distance(s.chart.at, pole) < 1e-6);
    assert.ok(island, `seed ${seed}: an island's centre`);
    assert.ok(planet.height(pole) > 2, `seed ${seed}: ${planet.height(pole)} m`);
    assert.ok(distance(pole, places.anchor) > 1000, `seed ${seed}: ${distance(pole, places.anchor)} m from the start`);
  }
});

/**
 * Sails `metres` from p along a path that turns `turn(i)` radians each metre, checking each metre's change of the sun
 * against the curve's own (a metre turns the up 1/R) and the field's turning across the great circles from the
 * origin (tan(θ/2) of the curve's, θ from the origin): never more than 5 times the curve's 300 m and more from the
 * undefined point (the island round it is about 150 m to its apron's edge).
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
  for (const seed of SEEDS) {
    const places = sunPlaces(planets.get(seed)!.islands), pole = sunPole(places);
    // round the planet over both poles, along and across the great circles from the origin
    for (const lon of [0, 45, 90, 135]) {
      const p = fromLatLon(0, lon * degrees);
      sail(places, p, frameAt(p).north, Math.round(2 * Math.PI * R), () => 0);
    }
    // wandering paths, kept off the island round the one undefined point
    for (let k = 0; k < 20; k++) {
      let p = normalize([rand() * 2 - 1, rand() * 2 - 1, rand() * 2 - 1]);
      if (distance(p, pole) < 600) p = scale(p, -1);
      const f = frameAt(p), a = rand() * 2 * Math.PI;
      const bend = rand() * 0.01;
      sail(places, p, add(scale(f.east, Math.cos(a)), f.north, Math.sin(a)), 1500, (i) => (i % 400 < 200 ? bend : -bend));
    }
  }
});

test('a lap of the planet comes back to the same sun', () => {
  const places = sunPlaces(planets.get(3)!.islands), p = fromLatLon(-6.7 * degrees, -11.6 * degrees);
  let at = p, t = frameAt(p).east;
  for (let i = 0; i < Math.round(2 * Math.PI * R); i++) ({ p: at, t } = along(at, t, 1));
  assert.ok(angle(sunAt(places, 15, at), sunAt(places, 15, p)) < 1e-3);
});
