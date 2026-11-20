// Where a point falls on the screen through an eye (play/lens.ts), as the frame's camera draws it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { placed } from '../src/play/lens.ts';
import { AIR_FOV, type Eye } from '../src/snapshot.ts';
import { R, add, along, normalize, scale, type Vec3 } from '../src/world/sphere.ts';
import { lookAt } from '../src/world/turn.ts';

const W = 956, H = 440;
const at: Vec3 = [0, 1, 0], north: Vec3 = [0, 0, -1];

/** Where p, `up` m over the sea, falls through `e` on a view `width` × `height`: placed, into a point of its own. */
const onScreen = (e: Eye, p: Vec3, width: number, height: number, up = 0) => placed({ x: 0, y: 0 }, e, p, up, { width, height });

/** An eye `up` m over the sea at `at`, looking at the sea `ahead` m north, its field of view `fov` degrees. */
function eye(up: number, ahead: number, fov = AIR_FOV): Eye {
  const position = scale(at, R + up), mark = scale(along(at, north, ahead).p, R);
  return { kind: 'air', position, orientation: lookAt(position, mark, normalize(position)), fov };
}

test('what the eye looks at falls in the middle of the view; behind it, or past the horizon, nowhere', () => {
  const e = eye(20, 60), mark = along(at, north, 60).p;
  const p = onScreen(e, mark, W, H)!;
  assert.ok(Math.abs(p.x - W / 2) < 1e-6 && Math.abs(p.y - H / 2) < 1e-6, `${p.x}, ${p.y}`);
  assert.equal(onScreen(e, along(at, north, -60).p, W, H), null);
  assert.equal(onScreen(e, along(at, north, 30000).p, W, H), null);
});

test('a point half the eye\'s field of view above its look falls on the view\'s top edge, whatever the field', () => {
  for (const fov of [AIR_FOV, 30, 70]) {
    // looking level along the sea from 40 m up, at a point 60 m off raised fov / 2 above the look
    const position = scale(at, R + 40), a = (fov * Math.PI) / 360;
    const e: Eye = { kind: 'air', position, orientation: lookAt(position, add(position, north, 1), normalize(position)), fov };
    const q = add(add(position, north, 60 * Math.cos(a)), at, 60 * Math.sin(a)), d = Math.hypot(...q);
    const p = onScreen(e, scale(q, 1 / d), W, H, d - R)!;
    assert.ok(Math.abs(p.y) < 1e-6 && Math.abs(p.x - W / 2) < 1e-6, `fov ${fov}: ${p.x}, ${p.y}`);
  }
});
