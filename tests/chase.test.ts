// The chase camera (play/chase.ts): over her shoulder, the look held where it is left against the world, the middle of
// the screen its line of sight, never under the sea or in the land.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createChase, PITCH } from '../src/play/chase.ts';
import { finale } from '../src/play/finale.ts';
import { placed } from '../src/play/lens.ts';
import { CLOUD, toEdge } from '../src/sim/storm.ts';
import { GUNS } from '../src/sim/handling.ts';
import { offSight } from '../src/sim/sight.ts';
import { shipAt } from '../src/sim/ship.ts';
import type { Eye } from '../src/snapshot.ts';
import { R, add, along, cross, distance, dot, length, normalize, scale, transport, type Vec3 } from '../src/world/sphere.ts';

const up: Vec3 = normalize([0.3, 0.9, -0.2]);
const north = normalize(cross([1, 0, 0], up));
const flat = () => -30, calm = () => 0;
const deg = Math.PI / 180;
/** Where p, `up` m over the sea, falls through `e` on a view `width` × `height`: placed, into a point of its own. */
const onScreen = (e: Eye, p: Vec3, width: number, height: number, up = 0) => placed({ x: 0, y: 0 }, e, p, up, { width, height });
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
  chase.update(pose(up, north), { x: -Math.PI / 2 / 0.0056, y: 0 }, 1 / 30, 0, null);
  const west = turned(north, up, Math.PI / 2);
  assert.ok(angle(chase.axes().ahead, west) < 1e-6, 'turned 90° to port');
  const dir = chase.sight().dir;
  for (let i = 1; i <= 150; i++) chase.update(pose(up, turned(north, up, i * 0.05)), still, 1 / 30, i / 30, null);
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
    chase.update(pose(at, heading), still, 1 / 30, i / 30, null);
  }
  assert.ok(distance(at, up) > 100);
  assert.ok(angle(chase.axes().ahead, facing) < 1e-6, `${(angle(chase.axes().ahead, facing) / deg).toFixed(4)}° off`);
});

test('the middle of the screen is the line of sight, and it passes clear of her own ship', () => {
  const chase = createChase(flat, calm);
  for (const off of [0, 45, 90, 135, 180, 270]) {
    const heading = turned(north, up, off * deg);
    chase.reset(pose(up, north), 0);
    chase.update(pose(up, heading), still, 1 / 30, 0, null);
    const s = chase.sight(), p = add(s.from, s.dir, 100), q = onScreen(chase.eye(), normalize(p), 956, 440, length(p) - R)!;
    assert.ok(Math.abs(q.x - 478) < 1e-6 && Math.abs(q.y - 220) < 1e-6, `${q.x}, ${q.y}`);
    // her own body (hull and rig) is never on the line
    assert.ok(offSight(s, shipAt(up, heading))!.angle > 0, `her heading ${off}° off the look: the line on her`);
  }
  assert.ok(PITCH > 0.1 && PITCH < 0.5);
});

test('as it starts, she is seen whole, low and left in the frame, her trucks about level with the reticle and her stern above the foot',
  () => {
  const chase = createChase(flat, calm);
  chase.reset(pose(up, north), 0);
  const right = cross(north, up);
  /** Where a point of her stands on the 956×440 screen: `fwd` m ahead of her middle, `high` m up, `side` m to starboard. */
  const seen = (fwd: number, high: number, side = 0) => {
    const p = add(add(scale(up, R + high), north, fwd), right, side);
    return onScreen(chase.eye(), normalize(p), 956, 440, length(p) - R)!;
  };
  const truck = seen(0, 21.5), stern = seen(-9.5, 4), bow = seen(12, 4);
  assert.ok(truck.y > 220 - 12, `her mainmast's truck at ${truck.y.toFixed(0)}, over the reticle`);
  assert.ok(stern.y < 380,`her stern at ${stern.y.toFixed(0)}, cut by the foot`);
  assert.ok(stern.y - truck.y < 0.4 * 440, `she stands ${(stern.y - truck.y).toFixed(0)} px tall`);
  for (const q of [truck, stern, bow]) assert.ok(q.x > 100 && q.x < 478 - 40, `${q.x.toFixed(0)}: left of the reticle, on the screen`);
});

test('as it starts, the look meets the sea within a lobbed gun\'s reach, and where it meets it is on the screen', () => {
  const chase = createChase(flat, calm);
  chase.reset(pose(up, north), 0);
  const s = chase.sight(), b = dot(s.from, s.dir), c = dot(s.from, s.from) - R * R;
  assert.ok(b * b - c > 0, 'the look meets the sea, not the sky');
  const hit = add(s.from, s.dir, -b - Math.sqrt(b * b - c)), off = R * angle(hit, up);
  assert.ok(off > GUNS.mortar.least + 10 && off < 90, `the sea met ${off.toFixed(0)} m from her`);
  const q = onScreen(chase.eye(), normalize(hit), 956, 440, 0);
  assert.ok(q && q.y > 0 && q.y < 440, 'on the screen');
});

test('looked as high or as low as it goes, the eye stays over the sea; by a hill it is drawn in clear of it', () => {
  const chase = createChase(flat, calm);
  chase.reset(pose(up, north), 0);
  for (const y of [-5000, 5000]) {
    chase.update(pose(up, north), { x: 0, y }, 1 / 30, 0, null);
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
  for (let i = 0; i < 60; i++) hilly.update(pose(up, north), still, 1 / 30, i / 30, null);
  const e = hilly.eye().position;
  assert.ok(length(e) - R > hill(normalize(e)) + 1.5, `${(length(e) - R).toFixed(1)} m up over ${hill(normalize(e))} m of land`);
  assert.ok(angle(hilly.sight().dir, before) < 1e-6, 'its look unchanged');
});

test('by the storm, looked as low as it goes or in her sunk shot, the eye stays under its cloud; in the calm it is not drawn in', () => {
  /** A calm `metres` round a centre that far from her, along her look's line (so the eye, astern, is farther out). */
  const calmOf = (metres: number, ahead: number) => ({ centre: along(up, north, ahead).p, radius: metres / R });
  const height = (c: ReturnType<typeof createChase>) => length(c.eye().position) - R;
  const settle = (c: ReturnType<typeof createChase>, cap: ReturnType<typeof calmOf> | null, y = 0, shot = {}) => {
    for (let i = 0; i < 90; i++) c.update(pose(up, north), { x: 0, y: i === 0 ? y : 0 }, 1 / 30, i / 30, cap, shot);
  };
  // her at the last cap's middle (75 m), the eye some 50 m astern in reach of the cloud's front: as it starts, looked
  // as low as it goes, and in her sunk shot; and her out in the storm
  for (const [cap, y, shot] of [
    [calmOf(75, 0), 0, {}], [calmOf(75, 0), 5000, {}], [calmOf(75, 0), 0, finale('sunk', 10)], [calmOf(20, 60), 0, {}]
  ] as const) {
    const chase = createChase(flat, calm);
    chase.reset(pose(up, north), 0);
    settle(chase, cap, y, shot);
    // under its lowest, or farther into the calm than its front stands out
    const inside = toEdge(chase.eye().position, cap);
    assert.ok(height(chase) < CLOUD.lowest || inside > CLOUD.out, `${height(chase).toFixed(1)} m up, ${inside.toFixed(1)} m into the calm`);
  }
  // far from it, looked as low as it goes, it stands as high as the boom takes it
  const far = createChase(flat, calm);
  far.reset(pose(up, north), 0);
  settle(far, calmOf(400, 0), 5000);
  assert.ok(height(far) > CLOUD.lowest + 10, `${height(far).toFixed(1)} m up`);
});
