import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildShip, type Packed } from '../src/ship/build.ts';
import { DETAILS, SLACK, chooseDetail, reach } from '../src/ship/detail.ts';
import { buildHull } from '../src/ship/hull.ts';
import { Acc } from '../src/ship/kit.ts';
import { GUN_MOUNT, toWorld } from '../src/ship/mount.ts';
import { buildRig } from '../src/ship/rig.ts';
import { buildSails } from '../src/ship/sails.ts';
import {
  R,
  add,
  dot,
  frameAt,
  length,
  normalize,
  type Vec3,
} from '../src/world/sphere.ts';

const BUDGET = [40000, 12000, 3000, 300];
const ships = DETAILS.map((_, k) => buildShip(k));
const parts = (k: number): [string, Packed][] => [
  ['body', ships[k].body],
  ['cloth', ships[k].cloth],
  ['ropes', ships[k].ropes],
];

test('the galleon builds the same at every level, every time', () => {
  for (const D of DETAILS) {
    const once = () => {
      const body = new Acc(),
        ropes = new Acc(),
        cloth = new Acc();
      buildHull(body, D);
      buildRig(body, ropes, D);
      buildSails(cloth, D);
      return [body, ropes, cloth].map((a) => [a.p, a.n, a.uv, a.a, a.i]);
    };
    assert.deepEqual(once(), once());
  }
});

test('each level keeps to its triangle budget, and each is lighter than the one before', () => {
  ships.forEach((s, k) => {
    assert.ok(
      s.triangles <= BUDGET[k],
      `L${k}: ${s.triangles} triangles, budget ${BUDGET[k]}`
    );
    if (k > 0)
      assert.ok(
        s.triangles < ships[k - 1].triangles / 2.5,
        `L${k} not much lighter than L${k - 1}`
      );
  });
});

test('the packed meshes are whole: finite positions, unit normals, indices in range', () => {
  for (let k = 0; k < ships.length; k++)
    for (const [name, p] of parts(k)) {
      assert.equal(p.position.length, p.vertices * 3);
      for (const v of p.position)
        assert.ok(Number.isFinite(v), `L${k} ${name}: a position is ${v}`);
      for (let i = 0; i < p.vertices; i++) {
        const n =
          Math.hypot(
            p.normal[i * 4],
            p.normal[i * 4 + 1],
            p.normal[i * 4 + 2]
          ) / 127;
        assert.ok(
          n > 0.9 && n < 1.1,
          `L${k} ${name}: normal ${i} has length ${n}`
        );
      }
      assert.equal(p.index.length, p.triangles * 3);
      for (const i of p.index)
        assert.ok(
          i < p.vertices,
          `L${k} ${name}: index ${i} past ${p.vertices}`
        );
    }
});

test('she is a galleon at 0.6×: about 26 m from beak to taffrail, the mainmast 21 m up, 2 m of draught', () => {
  for (const s of ships) {
    const { min, max } = s.bounds;
    const length = max[2] - min[2],
      height = max[1],
      draught = -min[1];
    assert.ok(length > 24 && length < 28, `length ${length}`);
    assert.ok(height > 19.5 && height < 23, `height ${height}`);
    assert.ok(draught > 1.6 && draught < 2.6, `draught ${draught}`);
    assert.ok(
      max[0] < 6 && min[0] > -6,
      `breadth with the yards ${min[0]}…${max[0]}`
    );
  }
});

test('every sail and pennant is a whole grid of the cloth, in order, the whole of it, its grid marked on each vertex', () => {
  ships.forEach((s, k) => {
    let next = 0;
    s.sails.forEach((g, n) => {
      assert.equal(g.first, next, `L${k} ${g.name}`);
      next += (g.columns + 1) * (g.rows + 1);
      for (let i = g.first; i < next; i++)
        assert.equal(
          s.cloth.normal[i * 4 + 3],
          n,
          `L${k} ${g.name}: vertex ${i}'s grid`
        );
    });
    assert.equal(next, s.cloth.vertices);
    assert.deepEqual(
      s.sails.map((g) => g.name).slice(0, 5),
      ships[0].sails.map((g) => g.name).slice(0, 5)
    );
    assert.equal(s.sails.length, k < 3 ? 8 : 5);
  });
  const course = ships[0].sails.find((g) => g.name === 'main course')!;
  assert.deepEqual([course.columns, course.rows], [14, 9]);
});

test('a ship changes level at its reach, and near a boundary stays where she was', () => {
  const px = 0.0026;
  assert.equal(chooseDetail(-1, 10, px), 0);
  assert.equal(chooseDetail(-1, 1e4, px), DETAILS.length - 1);
  for (let k = 1; k < DETAILS.length; k++) {
    const edge = reach(k, px);
    assert.equal(chooseDetail(-1, edge * 0.99, px), k - 1);
    assert.equal(chooseDetail(-1, edge * 1.01, px), k);
    assert.equal(chooseDetail(k - 1, edge * 1.05, px), k - 1);
    assert.equal(chooseDetail(k, edge * 0.95, px), k);
    assert.equal(chooseDetail(k - 1, edge * SLACK * 1.01, px), k);
    assert.equal(chooseDetail(k, (edge / SLACK) * 0.99, px), k - 1);
  }
});

test('the gun mount stands on her waist, carried with her pose', () => {
  assert.equal(GUN_MOUNT[0], 0);
  assert.ok(
    GUN_MOUNT[1] > 1.5 && GUN_MOUNT[1] < 3,
    `mount ${GUN_MOUNT[1]} m up`
  );
  assert.ok(
    Math.abs(GUN_MOUNT[2]) < 4,
    `mount ${GUN_MOUNT[2]} m from amidships`
  );
  const up = normalize([0.3, 0.9, -0.2]),
    { east } = frameAt(up);
  const pose = {
    position: [up[0] * R, up[1] * R, up[2] * R] as Vec3,
    forward: east,
    up,
  };
  const m = toWorld(pose, GUN_MOUNT);
  assert.ok(
    Math.abs(length(add(m, pose.position, -1)) - Math.hypot(...GUN_MOUNT)) <
      1e-9
  );
  assert.ok(Math.abs(dot(m, up) - (R + GUN_MOUNT[1])) < 1e-9);
  assert.ok(
    Math.abs(
      dot(toWorld(pose, [0, 0, 5]), east) - dot(pose.position, east) - 5
    ) < 1e-9
  );
});
