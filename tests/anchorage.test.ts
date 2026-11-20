// The lobby's camera (play/anchorage.ts): off her bow on the quarter, above the
// sea, turned and tilted by a drag within its limits, and eased home once let
// go.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  LOBBY,
  ORBIT,
  REST,
  anchorageEye,
  dragged,
  relaxed,
} from '../src/play/anchorage.ts';
import {
  R,
  add,
  cross,
  dot,
  length,
  normalize,
  scale,
  type Vec3,
} from '../src/world/sphere.ts';
import { rotate } from '../src/world/turn.ts';

const up: Vec3 = normalize([0.3, 0.9, -0.2]);
const forward = normalize(cross(up, [1, 0, 0]));
const pose = { position: scale(up, R), forward, up };
const flat = () => 0;
/**
 * The eye's place round her: its bearing off her bow (radians, to starboard)
 * and its height over the sea.
 */
const where = (p: Vec3) => {
  const d = normalize(add(p, scale(up, -dot(p, up))));
  return {
    off: Math.atan2(dot(d, cross(forward, up)), dot(d, forward)),
    height: length(p) - R,
  };
};

test('at rest it stands off her starboard bow on the quarter, a little above her, and looks at her', () => {
  const e = anchorageEye(pose, REST, 0, flat),
    w = where(e.position);
  assert.ok(Math.abs(w.off - LOBBY.quarter) < 0.01, `${w.off}`);
  assert.ok(
    w.height > LOBBY.height && w.height < LOBBY.height + 6,
    `${w.height}`
  );
  // it looks down its −z at the pivot over her
  const look = rotate([0, 0, -1], e.orientation),
    to = normalize(add(scale(up, R + LOBBY.height), e.position, -1));
  assert.ok(dot(look, to) > 0.9999);
  assert.equal(e.kind, 'air');
});

test('a drag turns it freely round her, and tilts it only within its limits', () => {
  let o = REST;
  for (let i = 0; i < 40; i++) o = dragged(o, { x: 120, y: 0 });
  assert.ok(Math.abs(o.yaw) <= Math.PI);
  // a whole turn's drag brings it back where it was
  const turn = dragged(REST, { x: (Math.PI * 2) / ORBIT.turn, y: 0 });
  assert.ok(Math.abs(turn.yaw) < 1e-9);
  assert.equal(dragged(REST, { x: 0, y: 1e4 }).pitch, ORBIT.pitch[1]);
  assert.equal(dragged(REST, { x: 0, y: -1e4 }).pitch, ORBIT.pitch[0]);
  // dragged right, it goes round to her port side of where it was
  const before = where(anchorageEye(pose, REST, 0, flat).position).off,
    after = where(
      anchorageEye(pose, dragged(REST, { x: 100, y: 0 }), 0, flat).position
    ).off;
  assert.ok(after > before);
});

test('it never goes under the sea or into the land, at any turn and tilt', () => {
  for (let yaw = -Math.PI; yaw <= Math.PI; yaw += 0.3) {
    for (const pitch of ORBIT.pitch) {
      assert.ok(
        where(anchorageEye(pose, { yaw, pitch }, 37, flat).position).height >
          1.5
      );
      // a hill under it: it stands over it
      assert.ok(
        where(anchorageEye(pose, { yaw, pitch }, 37, () => 20).position)
          .height >=
          21.5 - 1e-9
      );
    }
  }
});

test('let go, it eases home, the short way round', () => {
  let o = dragged(REST, { x: -3 / ORBIT.turn, y: 80 });
  assert.ok(o.yaw > 3 - 1e-9 - Math.PI * 2 && o.yaw <= Math.PI);
  for (let i = 0; i < 300; i++) o = relaxed(o, 1 / 30);
  assert.ok(
    Math.abs(o.yaw) < 0.01 && Math.abs(o.pitch) < 0.01,
    JSON.stringify(o)
  );
});
