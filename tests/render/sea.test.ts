// The sea's geometry and its swell: the field cube is laid out the way a GL cube map reads it (so hardware filtering
// is seamless across the cube's edges), the TypeScript swell matches the surface the GPU draws and is continuous
// everywhere, and the camera-centred disc always reaches past the horizon.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { DISC_RINGS, discShape } from '../../src/render/sea.ts';
import { seaFieldFaces, Swell, type SwellSample } from '../../src/render/swell.ts';
import { cellOf, horizonDistance, R, TERRITORY } from '../../src/sim/sphere.ts';
import { buildGeography, heightAt } from '../../src/sim/world/geography.ts';

const geo = buildGeography();
let seed = 7;
const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const randomDir = (out: THREE.Vector3) => out.set(rand() * 2 - 1, rand() * 2 - 1, rand() * 2 - 1).normalize();

test('the sea-field cube holds each sim cell where a GL cube map looks it up', () => {
  const faces = seaFieldFaces(geo), n = TERRITORY.n, d = new THREE.Vector3();
  for (let k = 0; k < 4000; k++) {
    randomDir(d);
    // OpenGL ES 3.0 §8.13: the face and (sc, tc) a direction selects, then the shader's equal-angle warp
    const ax = Math.abs(d.x), ay = Math.abs(d.y), az = Math.abs(d.z);
    let f: number, sc: number, tc: number, ma: number;
    if (ax >= ay && ax >= az) [f, ma, sc, tc] = [d.x > 0 ? 0 : 1, ax, d.x > 0 ? -d.z : d.z, -d.y];
    else if (ay >= az) [f, ma, sc, tc] = [d.y > 0 ? 2 : 3, ay, d.x, d.y > 0 ? d.z : -d.z];
    else [f, ma, sc, tc] = [d.z > 0 ? 4 : 5, az, d.z > 0 ? d.x : -d.x, -d.y];
    const texel = (x: number) => Math.min(n - 1, Math.floor(((Math.atan(x / ma) * 4) / Math.PI + 1) * 0.5 * n));
    const got = THREE.DataUtils.fromHalfFloat(faces[f][(texel(tc) * n + texel(sc)) * 4]);
    const want = geo.heights[cellOf(TERRITORY, d)];
    assert.ok(Math.abs(got - want) <= Math.abs(want) * 1e-3 + 1e-3, `direction ${d.toArray()}: texel ${got}, cell ${want}`);
  }
});

const swell = new Swell(geo);
swell.setWind(new THREE.Vector3(0, 0, 1), new THREE.Vector3(0.6, 0.8, 0), 1);
const s: SwellSample = { height: 0, normal: new THREE.Vector3() };

test('sample finds the surface the sea mesh draws over a point, and a hull rides it', () => {
  const rest = new THREE.Vector3(), x = new THREE.Vector3(), p = new THREE.Vector3();
  const ride = { position: new THREE.Vector3(), up: new THREE.Vector3() };
  for (let k = 0; k < 300; k++) {
    const t = rand() * 600;
    swell.displace(randomDir(rest), t, x);
    swell.sample(p.copy(x).normalize(), t, s);
    assert.ok(Math.abs(R + s.height - x.length()) < 3e-3, `height ${s.height} vs drawn ${x.length() - R}`);
    assert.ok(Math.abs(s.normal.length() - 1) < 1e-9 && s.normal.dot(p) > 0.9);
    swell.ride(p, new THREE.Vector3(0, 1, 0).cross(p), 6, 2, t, ride);
    assert.ok(ride.up.dot(p) > 0.95 && Math.abs(ride.position.length() - R) < 1.5);
  }
});

test('the swell is continuous across a cube edge and over the pole, and calm over land', () => {
  const a = new THREE.Vector3(), p = new THREE.Vector3();
  const paths: [THREE.Vector3, THREE.Vector3][] = [
    [new THREE.Vector3(1, -0.2, 0.9).normalize(), new THREE.Vector3(0.9, -0.2, 1).normalize()], // across x = z
    [new THREE.Vector3(0.03, 1, 0).normalize(), new THREE.Vector3(-0.03, 1, 0).normalize()], // over the north pole
  ];
  for (const [from, to] of paths) {
    const steps = Math.ceil((from.angleTo(to) * R) / 0.02);
    let prev = NaN;
    for (let i = 0; i <= steps; i++) {
      swell.sample(p.copy(from).lerp(to, i / steps).normalize(), 42, s);
      if (i) assert.ok(Math.abs(s.height - prev) < 0.02, `jump of ${Math.abs(s.height - prev)} at step ${i}`);
      prev = s.height;
    }
  }
  let open = 0, land = 0;
  for (let k = 0; k < 3000; k++) {
    const h = heightAt(geo, randomDir(a)), y = Math.abs(swell.sample(a, rand() * 600, s).height);
    if (h < -30) open = Math.max(open, y);
    else if (h > 3) land = Math.max(land, y);
  }
  assert.ok(open > 0.2 && open < 1.2, `open-sea swell ${open}`);
  assert.ok(land < 0.2 * open, `swell over land ${land}`);
});

test('the sea disc reaches past the horizon at every height, its first ring a few % of the height out', () => {
  const shape = { reach: 0, k: 0, horizon: 0 };
  for (const h of [0.5, 2, 4, 10, 40, 150, 600]) {
    discShape(h, shape);
    assert.ok(shape.reach > Math.min(horizonDistance(h) * 1.1, Math.PI * R * 0.97), `reach ${shape.reach} at ${h}`);
    const first = (shape.reach * Math.expm1(shape.k / DISC_RINGS)) / Math.expm1(shape.k);
    assert.ok(first <= Math.max(0.1, 0.03 * h) * 1.01, `first ring ${first} at ${h}`);
  }
});
