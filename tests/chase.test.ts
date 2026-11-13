// The chase camera (play/chase.ts): over her shoulder, the look held where it is left against the world, the middle of
// the screen its line of sight, never under the sea or in the land.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createChase, PITCH } from '../src/play/chase.ts';
import { onScreen } from '../src/play/lens.ts';
import { offSight } from '../src/sim/sight.ts';
import { shipAt } from '../src/sim/ship.ts';
import { R, add, along, cross, distance, dot, length, normalize, scale, transport, type Vec3 } from '../src/world/sphere.ts';

const up: Vec3 = normalize([0.3, 0.9, -0.2]);
const north = normalize(cross([1, 0, 0], up));
const flat = () => -30, calm = () => 0;
const deg = Math.PI / 180;
/** Her pose at `at`, heading `forward` (any vector; its part along the surface counts). */
const pose = (at: Vec3, forward: Vec3) => ({ position: scale(at, R), forward: normalize(add(forward, at, -dot(forward, at))), up: at });
/** `t` turned `a` radians to port about `u`. */
const turned = (t: Vec3, u: Vec3, a: number) => normalize(add(scale(t, Math.cos(a)), cross(u, t), Math.sin(a)));
const angle = (a: Vec3, b: Vec3) => Math.acos(Math.max(-1, Math.min(1, dot(normalize(a), normalize(b)))));
const still = { x: 0, y: 0 };

test('panned, the look stays where it is left: its bearing against the world, however she turns under it', () => {
  const chase = createChase(flat, calm);
  chase.reset(pose(up, north), 0);
  assert.ok(angle(chase.axes().ahead, north) < 1e-6, 'it starts along her heading');
  // dragged 90° to port, then let go for 5 s while she comes round through a whole turn and more
  chase.update(pose(up, north), { x: -Math.PI / 2 / 0.0056, y: 0 }, 1 / 30, 0);
  const west = turned(north, up, Math.PI / 2);
  assert.ok(angle(chase.axes().ahead, west) < 1e-6, 'turned 90° to port');
  const dir = chase.sight().dir;
  for (let i = 1; i <= 150; i++) chase.update(pose(up, turned(north, up, i * 0.05)), still, 1 / 30, i / 30);
  assert.ok(angle(chase.axes().ahead, west) < 1e-6, `held: ${(angle(chase.axes().ahead, west) / deg).toFixed(3)}° off`);
  assert.ok(angle(chase.sight().dir, dir) < 1e-6, 'its line of sight too');
});

test('as she sails on, the look is carried along with her over the sphere, its bearing kept', () => {
  const chase = createChase(flat, calm);
  chase.reset(pose(up, north), 0);
  let at = up, facing = north, heading = cross(north, up);
  for (let i = 1; i <= 300; i++) {
    // sailing east at 12 m/s, her look still north
    const next = along(at, heading, 12 / 30);
    facing = transport(facing, at, next.p);
    [at, heading] = [next.p, next.t];
    chase.update(pose(at, heading), still, 1 / 30, i / 30);
  }
  assert.ok(distance(at, up) > 100);
  assert.ok(angle(chase.axes().ahead, facing) < 1e-6, `${(angle(chase.axes().ahead, facing) / deg).toFixed(4)}° off`);
});

test('the middle of the screen is the line of sight, and it passes clear of her own ship', () => {
  const chase = createChase(flat, calm);
  for (const off of [0, 45, 90, 135, 180, 270]) {
    const heading = turned(north, up, off * deg);
    chase.reset(pose(up, north), 0);
    chase.update(pose(up, heading), still, 1 / 30, 0);
    const s = chase.sight(), p = add(s.from, s.dir, 100), q = onScreen(chase.eye(), normalize(p), 956, 440, length(p) - R)!;
    assert.ok(Math.abs(q.x - 478) < 1e-6 && Math.abs(q.y - 220) < 1e-6, `${q.x}, ${q.y}`);
    // her own body (hull and rig) is never on the line
    assert.ok(offSight(s, shipAt(up, heading))!.angle > 0, `her heading ${off}° off the look: the line on her`);
  }
  assert.ok(PITCH > 0.1 && PITCH < 0.3);
});

test('looked as high or as low as it goes, the eye stays over the sea; by a hill it is drawn in clear of it', () => {
  const chase = createChase(flat, calm);
  chase.reset(pose(up, north), 0);
  for (const y of [-5000, 5000]) {
    chase.update(pose(up, north), { x: 0, y }, 1 / 30, 0);
    const e = chase.eye().position;
    assert.ok(length(e) - R > 1.5, `${y}: ${(length(e) - R).toFixed(2)} m up`);
    assert.ok(dot(chase.sight().dir, normalize(e)) < 0.3, 'never looking far up into the sky');
  }
  // a hill 22 m high from 15 m behind her: the eye drawn in toward her, the look's way kept
  const south = scale(north, -1);
  const hill = (p: Vec3) => (dot(p, south) > Math.sin(15 / R) * 1 ? 22 : -30);
  const hilly = createChase(hill, calm);
  hilly.reset(pose(up, north), 0);
  const before = hilly.sight().dir;
  for (let i = 0; i < 60; i++) hilly.update(pose(up, north), still, 1 / 30, i / 30);
  const e = hilly.eye().position;
  assert.ok(length(e) - R > hill(normalize(e)) + 1.5, `${(length(e) - R).toFixed(1)} m up over ${hill(normalize(e))} m of land`);
  assert.ok(angle(hilly.sight().dir, before) < 1e-6, 'its look unchanged');
});
