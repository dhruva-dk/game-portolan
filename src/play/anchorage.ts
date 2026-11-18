// The lobby's camera on her at anchor (0117 app.ts drawWorld, scenes.ts LOBBY_CAMERA, screens/lobby.ts LOBBY_ORBIT):
// standing off her starboard bow on the quarter, a little above her, looking down its boom at her mainsail's foot so
// the hull sits low and the sails stand whole, and drifting slowly round her and back. A finger dragged anywhere off
// the lobby's controls turns it round her (freely) and tilts its boom (within ORBIT.pitch, so never under the sea);
// let go, it eases back to its rest.
//
// Pure: the orbit is a value turned by the look's drag and eased by the seconds; the eye is worked out from her pose,
// the orbit and the world's clock.

import { AIR_FOV, type Eye } from '../snapshot.ts';
import type { ShipPose } from '../world/pose.ts';
import { add, along, cross, dot, normalize, place, scale, type Vec3 } from '../world/sphere.ts';
import { lookAt } from '../world/turn.ts';

/** The camera at rest: off her bow by `quarter` radians round from dead ahead, on a boom `boom` metres long rising
 *  `pitch` radians from a point `height` metres over the sea at her; drifting `drift` radians either way round her,
 *  a sweep each `period` seconds (0117 LOBBY_CAMERA). */
export const LOBBY = { quarter: 0.95, boom: 30, pitch: 0.1, height: 7, drift: 0.26, period: 90 } as const;

/** How far a finger takes it: the boom's tilt either way (radians); radians a pixel of drag across and up (0117: a
 *  swipe across the screen turns her 1.5π, and down it tilts 1.2: the iPad's 1180 × 820 px); the share of the way back
 *  to rest closed a second once let go. */
export const ORBIT = { pitch: [-0.07, 0.42], turn: (Math.PI * 1.5) / 1180, tilt: 1.2 / 820, back: 0.9 } as const;

/** The camera never comes nearer the sea or the land under it than this, metres. */
const CLEAR = 1.5;

/** Where a finger has taken the camera off its rest: its turn round her (radians, to port, within ±π) and its boom's
 *  tilt (radians, up). */
export interface Orbit { yaw: number; pitch: number }

export const REST: Orbit = { yaw: 0, pitch: 0 };

/** An angle brought within ±π. */
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

/** The orbit after a drag of the look (CSS px: right and down), as 0117's lobby turned it: dragged right, the camera
 *  goes round her toward her stern on the side it stands; dragged down, it rises to look down onto her. */
export const dragged = (o: Orbit, look: { x: number; y: number }): Orbit => ({
  yaw: wrap(o.yaw - look.x * ORBIT.turn),
  pitch: Math.min(ORBIT.pitch[1], Math.max(ORBIT.pitch[0], o.pitch + look.y * ORBIT.tilt)),
});

/** The orbit eased back toward its rest over dt seconds, the short way round. */
export const relaxed = (o: Orbit, dt: number): Orbit => {
  const k = Math.exp(-ORBIT.back * dt);
  return { yaw: o.yaw * k, pitch: o.pitch * k };
};

/** t turned `angle` radians to port about `up`. */
const turned = (t: Vec3, up: Vec3, angle: number) => normalize(add(scale(t, Math.cos(angle)), cross(up, t), Math.sin(angle)));

/**
 * The eye on her at anchor: her pose as drawn, the orbit, the world's clock (s, for the drift) and the floor under a
 * point (metres over the mean sea of the higher of the land and the waves there), which the eye stays CLEAR above.
 */
export function anchorageEye(pose: ShipPose, o: Orbit, clock: number, floor: (p: Vec3) => number): Eye {
  const up = normalize(pose.position);
  const ahead = normalize(add(pose.forward, up, -dot(pose.forward, up)));
  const yaw = Math.PI - LOBBY.quarter + LOBBY.drift * Math.sin((clock / LOBBY.period) * Math.PI * 2) + o.yaw;
  // the boom runs from the pivot back along `boom`'s way, rising at `pitch`
  const way = turned(ahead, up, yaw), pitch = LOBBY.pitch + o.pitch;
  const under = along(up, scale(way, -1), LOBBY.boom * Math.cos(pitch)).p;
  const position = place(under, Math.max(LOBBY.height + LOBBY.boom * Math.sin(pitch), floor(under) + CLEAR));
  return { kind: 'air', position, orientation: lookAt(position, place(up, LOBBY.height), normalize(position)), fov: AIR_FOV };
}
