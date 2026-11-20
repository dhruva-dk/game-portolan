// The lobby's camera on her at anchor: standing off her starboard bow on the
// quarter, a little above her, looking down its boom at her mainsail's foot so
// the hull sits low and the sails stand whole, and drifting slowly round her
// and back. A finger dragged anywhere off the lobby's controls turns it round
// her (freely) and tilts its boom (within ORBIT.pitch, so never under the sea);
// let go, it eases back to its rest.
//
// Pure: the orbit is a value turned by the look's drag and eased by the
// seconds; the eye is worked out from her pose, the orbit and the world's
// clock. Each is written into an out if one is given (the game's, kept), else
// made.

import { AIR_FOV, type Eye } from '../snapshot.ts';
import type { ShipPose } from '../world/pose.ts';
import { clamp, wrapAngle } from '../world/scalar.ts';
import {
  along,
  normalize,
  place,
  rotateAbout,
  scale,
  tangent,
  type CourseOut,
  type Out3,
  type Vec3,
} from '../world/sphere.ts';
import { lookAt, type Out4 } from '../world/turn.ts';

/**
 * The camera at rest: off her bow by `quarter` radians round from dead ahead,
 * on a boom `boom` metres long rising `pitch` radians from a point `height`
 * metres over the sea at her; drifting `drift` radians either way round her, a
 * sweep each `period` seconds.
 */
export const LOBBY = {
  quarter: 0.95,
  boom: 30,
  pitch: 0.1,
  height: 7,
  drift: 0.26,
  period: 90,
} as const;

/**
 * The screen the drags are measured for, CSS px: the target's, the iPad Air's
 * in landscape.
 */
const VIEWPORT = { width: 1180, height: 820 } as const;

/**
 * How far a finger takes it: the boom's tilt either way (radians); radians a
 * pixel of drag across and up (a swipe across VIEWPORT turns her 1.5π, and down
 * it tilts 1.2); the share of the way back to rest closed a second once let go.
 */
export const ORBIT = {
  pitch: [-0.07, 0.42],
  turn: (Math.PI * 1.5) / VIEWPORT.width,
  tilt: 1.2 / VIEWPORT.height,
  back: 0.9,
} as const;

/**
 * The camera never comes nearer the sea or the land under it than this, metres.
 */
const CLEAR = 1.5;

/**
 * Where a finger has taken the camera off its rest: its turn round her
 * (radians, to port, within ±π) and its boom's tilt (radians, up).
 */
export interface Orbit {
  yaw: number;
  pitch: number;
}

export const REST: Orbit = { yaw: 0, pitch: 0 };

/**
 * The orbit after a drag of the look (CSS px: right and down): dragged right,
 * the camera goes round her toward her stern on the side it stands; dragged
 * down, it rises to look down onto her (into `out`, which may be o).
 */
export const dragged = (
  o: Orbit,
  look: { x: number; y: number },
  out: Orbit = { ...o }
): Orbit => {
  out.yaw = wrapAngle(o.yaw - look.x * ORBIT.turn);
  out.pitch = clamp(
    o.pitch + look.y * ORBIT.tilt,
    ORBIT.pitch[0],
    ORBIT.pitch[1]
  );
  return out;
};

/**
 * The orbit eased back toward its rest over dt seconds, the short way round
 * (into `out`, which may be o).
 */
export const relaxed = (o: Orbit, dt: number, out: Orbit = { ...o }): Orbit => {
  const k = Math.exp(-ORBIT.back * dt);
  out.yaw = o.yaw * k;
  out.pitch = o.pitch * k;
  return out;
};

/** An eye written into (anchorageEye's `out`). */
type EyeOut = Eye & { position: Out3; orientation: Out4 };
/** An eye to be written into. */
export const eyeOut = (): EyeOut => ({
  kind: 'air',
  position: [0, 0, 0],
  orientation: [0, 0, 0, 1],
  fov: AIR_FOV,
});

/**
 * anchorageEye's working vectors: up at her, ahead of her, the boom's way back,
 * where it ends, and what it looks at.
 */
const up: Out3 = [0, 0, 0],
  ahead: Out3 = [0, 0, 0],
  way: Out3 = [0, 0, 0],
  at: Out3 = [0, 0, 0];
const end: CourseOut = { p: [0, 0, 0], t: [0, 0, 0] };

/**
 * The eye on her at anchor: her pose as drawn, the orbit, the world's clock (s,
 * for the drift) and the floor under a point (metres over the mean sea of the
 * higher of the land and the waves there), which the eye stays CLEAR above
 * (into `out`).
 */
export function anchorageEye(
  pose: ShipPose,
  o: Orbit,
  clock: number,
  floor: (p: Vec3) => number,
  out = eyeOut()
): Eye {
  normalize(pose.position, up);
  normalize(tangent(pose.forward, up, ahead), ahead);
  const yaw =
    Math.PI -
    LOBBY.quarter +
    LOBBY.drift * Math.sin((clock / LOBBY.period) * Math.PI * 2) +
    o.yaw;
  // the boom runs from the pivot back along `boom`'s way, rising at `pitch`
  const pitch = LOBBY.pitch + o.pitch;
  const under = along(
    up,
    scale(rotateAbout(ahead, up, yaw, way), -1, way),
    LOBBY.boom * Math.cos(pitch),
    end
  ).p;
  const position = place(
    under,
    Math.max(LOBBY.height + LOBBY.boom * Math.sin(pitch), floor(under) + CLEAR),
    out.position
  );
  lookAt(
    position,
    place(up, LOBBY.height, at),
    normalize(position, way),
    out.orientation
  );
  out.kind = 'air';
  out.fov = AIR_FOV;
  return out;
}
