// The chase camera: behind the ship and above her, swinging round after her heading with a lag; a drag of the right
// thumb turns it about her to look round, and when the thumb lifts it eases back behind her.
//
// It looks along a boom from a point over her deck. It never goes under the waves or into an island: where land
// stands between it and her deck, the boom is raised until it sees over (quickly), and lowered again only slowly
// once clear (as the old full game did, 0117 src/render/camera.ts); if raising it won't do, it is shortened.

import type { PerspectiveCamera } from 'three/webgpu';
import type { ShipPose } from '../world/pose';
import { add, along, cross, dot, normalize, place, scale, transport, type Vec3 } from '../world/sphere';

/** The boom: metres back and up from the point it turns on, which stands PIVOT metres over the sea at her. */
const BACK = 44, UP = 19, PIVOT = 2;
/** It looks at a point AIM_UP metres over the sea, AIM_AHEAD ahead of her. */
const AIM_UP = 3, AIM_AHEAD = 8;
/** How fast it swings round after her heading; how fast it eases back once the look has been let go EASE_AFTER s. */
const FOLLOW = 2.2, EASE = 1.5, EASE_AFTER = 0.4;
/** Radians a pixel of the look's drag, across and up; the boom's steepest and lowest as the look tilts it, and with the raise. */
const TURN = 0.0056, TILT = 0.0046, STEEPEST = 1.2, LOWEST = -0.3, TOP = 1.45;
/** Clear of the land: metres over it along the sight line; the raise's steps and most; how fast it rises and falls. */
const ROOM = 1.5, RAISE = 0.1, RAISED = 1.2, RISE = 6, FALL = 0.8;
/** The boom is never shortened below SHORTEST; the camera never comes closer than CLEAR to the water or the land. */
const SHORTEST = 6, CLEAR = 1.5;
/** Points along the sight line tested for land. */
const SIGHT = 10;

const BOOM = Math.hypot(BACK, UP), ELEVATION = Math.atan2(UP, BACK);

/** t turned `angle` radians to port about `up`. */
const turned = (t: Vec3, up: Vec3, angle: number) => normalize(add(scale(t, Math.cos(angle)), cross(up, t), Math.sin(angle)));

/** ground: metres above the sea at a point (negative under water); sea: the waves' height there at a time. */
export function createChase(camera: PerspectiveCamera, ground: (p: Vec3) => number, sea: (p: Vec3, time: number) => number) {
  /** Where she is, and the way the camera faces along the surface there before the look turns it (lagging her). */
  let at: Vec3 = [0, 1, 0], facing: Vec3 = [0, 0, -1];
  /** The look's turn about her (radians, to port) and tilt (steeper), and how long since it was last moved. */
  let turn = 0, tilt = 0, idle = Infinity;
  /** How far the boom is raised to see over the land. */
  let raised = 0;

  /** Where she is, and her heading along the surface there. */
  const level = (pose: ShipPose) => {
    const up = normalize(pose.position);
    return { up, ahead: normalize(add(pose.forward, up, -dot(pose.forward, up))) };
  };

  /** The way the camera looks along the surface at her. */
  const view = () => turned(facing, at, turn);

  /** Whether land stands within ROOM of the sight line from over her deck, along `back`, to a boom this long and steep. */
  const blocked = (back: Vec3, boom: number, elevation: number) => {
    for (let i = 1; i <= SIGHT; i++) {
      const f = i / SIGHT;
      if (ground(along(at, back, f * boom * Math.cos(elevation)).p) + ROOM > PIVOT + f * boom * Math.sin(elevation)) return true;
    }
    return false;
  };

  /** Places the camera: its boom raised toward what the land asks at `rate` per second (instantly if Infinity). */
  function put(pose: ShipPose, time: number, dt: number, rate: (rising: boolean) => number) {
    const back = scale(view(), -1), elevation = ELEVATION + tilt;
    let need = 0;
    while (need < RAISED && blocked(back, BOOM, elevation + need)) need += RAISE;
    raised += (need - raised) * (1 - Math.exp(-rate(need > raised) * dt));
    let boom = BOOM;
    while (boom > SHORTEST && blocked(back, boom, elevation + raised)) boom *= 0.85;
    const steep = Math.min(elevation + raised, TOP);
    const under = along(at, back, boom * Math.cos(steep)).p;
    const floor = Math.max(ground(under), sea(under, time)) + CLEAR;
    const eye = place(under, Math.max(PIVOT + boom * Math.sin(steep), floor));
    camera.position.set(...eye);
    camera.up.set(...normalize(eye));
    camera.lookAt(...place(along(at, level(pose).ahead, AIM_AHEAD).p, AIM_UP));
  }

  return {
    /** Puts it straight behind her, the look let go. */
    reset(pose: ShipPose, time: number) {
      ({ up: at, ahead: facing } = level(pose));
      turn = tilt = raised = 0;
      idle = Infinity;
      put(pose, time, 1, () => Infinity);
    },
    /** After a frame of dt seconds: her pose now, the look's drag (pixels, right and down), the world's clock. */
    update(pose: ShipPose, look: { x: number; y: number; held: boolean }, dt: number, time: number) {
      const her = level(pose);
      facing = normalize(transport(facing, at, her.up));
      at = her.up;
      // swing round after her heading, by a share of the angle between each frame
      const angle = Math.atan2(dot(cross(facing, her.ahead), at), dot(facing, her.ahead));
      facing = turned(facing, at, angle * (1 - Math.exp(-FOLLOW * dt)));
      // dragged right, the view turns right; dragged down, it looks down onto her
      idle = look.held || look.x !== 0 || look.y !== 0 ? 0 : idle + dt;
      turn = Math.atan2(Math.sin(turn - look.x * TURN), Math.cos(turn - look.x * TURN));
      tilt = Math.min(STEEPEST - ELEVATION, Math.max(LOWEST - ELEVATION, tilt + look.y * TILT));
      if (idle > EASE_AFTER) {
        const k = Math.exp(-EASE * dt);
        turn *= k;
        tilt *= k;
      }
      put(pose, time, dt, (rising) => (rising ? RISE : FALL));
    },
    /** The way the camera looks along the surface at her, and its right there: what the stick's up and right mean. */
    axes(): { ahead: Vec3; right: Vec3 } {
      const ahead = view();
      return { ahead, right: cross(ahead, at) };
    },
  };
}
