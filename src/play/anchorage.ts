// The lobby's camera on her at anchor: standing off her starboard bow on the
// quarter, a little above her, looking down its boom at her mainsail's foot so
// the hull sits low and the sails stand whole, and drifting slowly round her
// and back. A finger dragged anywhere off the lobby's controls turns it round
// her (freely) and tilts its boom (within ORBIT.pitch, so never under the sea);
// let go, it eases back to its rest. While her livery folio is open it comes
// round to her broadside, and back once it closes (BROADSIDE).
//
// Pure: the orbit is a value turned by the look's drag and eased by the
// seconds; the eye is worked out from her pose, the orbit and the world's
// clock. Each is written into an out if one is given (the game's, kept), else
// made.

import { AIR_FOV, type Eye } from '../snapshot.ts';
import type { PartType } from '../race.ts';
import type { ShipPose } from '../world/pose.ts';
import { clamp, lerp, smoother, wrapAngle } from '../world/scalar.ts';
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
 * The camera on her broadside, while the livery folio is open: square off her
 * beam, on a longer boom, looking at a point `height` metres over the sea at her
 * (lower than at rest, so she stands higher on the screen, clear of the folio
 * docked at its foot), not drifting; turned to it or back with what is left of
 * the way shrinking by e^−ease a second (at 2.4, nine tenths of it gone in a
 * second), the turn smoothed at both ends as the eye takes it.
 */
export const BROADSIDE = {
  quarter: Math.PI / 2,
  boom: 44,
  height: 4,
  ease: 2.4,
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
 * What the camera at anchor looks at on her and from where: a point `ahead`
 * metres along her from her middle (aft, less than 0) and `height` metres over
 * the sea, from `quarter` radians round from dead ahead on a boom `boom` metres
 * long rising `pitch` radians; drifting `drift` radians either way round her.
 */
interface Focus {
  ahead: number;
  height: number;
  quarter: number;
  boom: number;
  pitch: number;
  drift: number;
}
/** The lobby's own focus: the whole of her, drifting (LOBBY). */
export const LOOSE: Readonly<Focus> = {
  ahead: 0,
  height: LOBBY.height,
  quarter: LOBBY.quarter,
  boom: LOBBY.boom,
  pitch: LOBBY.pitch,
  drift: LOBBY.drift,
};
/**
 * The camera on each of her six parts, still: her sails whole from off the bow;
 * her foremast's shrouds and stays from ahead, looking up; her rudder from the
 * quarter, low; her hull square off the beam; her keel along the waterline;
 * her gun's mount from above the waist.
 */
export const FOCI: Readonly<Record<PartType, Readonly<Focus>>> = {
  sails: {
    ahead: 0.5,
    height: 12,
    quarter: 1.25,
    boom: 29,
    pitch: 0.12,
    drift: 0,
  },
  rigging: {
    ahead: 4,
    height: 12,
    quarter: 0.55,
    boom: 24,
    pitch: 0.3,
    drift: 0,
  },
  rudder: {
    ahead: -9,
    height: 1.2,
    quarter: 2.55,
    boom: 13,
    pitch: 0.18,
    drift: 0,
  },
  hull: {
    ahead: 0,
    height: 2,
    quarter: Math.PI / 2,
    boom: 30,
    pitch: 0.06,
    drift: 0,
  },
  keel: {
    ahead: 1,
    height: 0.2,
    quarter: 1.9,
    boom: 16,
    pitch: 0.02,
    drift: 0,
  },
  mounts: {
    ahead: -1.4,
    height: 2.6,
    quarter: 1.2,
    boom: 11,
    pitch: 0.55,
    drift: 0,
  },
};
/** A focus closes this share of the way to another each second, as e^−FOCUSED. */
const FOCUSED = 3;

/** `a` eased toward `to` over dt seconds (written over). */
export function focused(a: Focus, to: Readonly<Focus>, dt: number): Focus {
  const k = 1 - Math.exp(-FOCUSED * dt);
  a.ahead += (to.ahead - a.ahead) * k;
  a.height += (to.height - a.height) * k;
  a.quarter += (to.quarter - a.quarter) * k;
  a.boom += (to.boom - a.boom) * k;
  a.pitch += (to.pitch - a.pitch) * k;
  a.drift += (to.drift - a.drift) * k;
  return a;
}

/**
 * Where a finger has taken the camera off its rest: its turn round her
 * (radians, to port, within ±π) and its boom's tilt (radians, up); and how far
 * it has come round to her broadside (0 at rest, 1 there: BROADSIDE).
 */
export interface Orbit {
  yaw: number;
  pitch: number;
  broadside: number;
}

export const REST: Orbit = { yaw: 0, pitch: 0, broadside: 0 };

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
  out.broadside = o.broadside;
  return out;
};

/**
 * The orbit eased over dt seconds toward her broadside (`on`) or back to its
 * rest, smoothly at both ends (into `out`, which may be o).
 */
export const turned = (
  o: Orbit,
  on: boolean,
  dt: number,
  out: Orbit = { ...o }
): Orbit => {
  out.yaw = o.yaw;
  out.pitch = o.pitch;
  const to = on ? 1 : 0;
  out.broadside = to + (o.broadside - to) * Math.exp(-BROADSIDE.ease * dt);
  if (Math.abs(out.broadside - to) < 1e-4) out.broadside = to;
  return out;
};

/**
 * How the office frames what the camera looks at: where on the screen it is
 * drawn (snapshot.ts Eye.centre: right and down of the middle, in half-widths
 * and half-heights), and how large (Eye.size: 1 as the lobby has it, filling
 * the screen; less, that share of the screen high).
 */
export interface Framing {
  centre: [number, number];
  size: number;
}
/** The lobby's own framing: in the middle, filling the screen. */
export const WHOLE: Readonly<Framing> = { centre: [0, 0], size: 1 };
/** A framing closes this share of the way to another each second, as e^−FRAMED. */
const FRAMED = 5;

/** `f` eased toward `to` over dt seconds (written over). */
export function framed(f: Framing, to: Readonly<Framing>, dt: number): Framing {
  const k = 1 - Math.exp(-FRAMED * dt);
  f.centre[0] += (to.centre[0] - f.centre[0]) * k;
  f.centre[1] += (to.centre[1] - f.centre[1]) * k;
  f.size += (to.size - f.size) * k;
  return f;
}

/** An eye written into (anchorageEye's `out`). */
type EyeOut = Eye & {
  position: Out3;
  orientation: Out4;
  centre: [number, number];
  size: number;
};
/** An eye to be written into. */
export const eyeOut = (): EyeOut => ({
  kind: 'air',
  position: [0, 0, 0],
  orientation: [0, 0, 0, 1],
  fov: AIR_FOV,
  centre: [0, 0],
  size: 1,
});

/**
 * anchorageEye's working vectors: up at her, ahead of her, the boom's way back,
 * where it ends, and what it looks at.
 */
const up: Out3 = [0, 0, 0],
  ahead: Out3 = [0, 0, 0],
  way: Out3 = [0, 0, 0],
  at: Out3 = [0, 0, 0];
const end: CourseOut = { p: [0, 0, 0], t: [0, 0, 0] },
  pivot: CourseOut = { p: [0, 0, 0], t: [0, 0, 0] };

/**
 * The eye on her at anchor: her pose as drawn, how it is turned (the orbit)
 * and on what of her (the focus), the world's clock (s, for the drift) and the
 * floor under a point (metres over the mean sea of the higher of the land and
 * the waves there), which the eye stays CLEAR above (into `out`, whose framing
 * is left as it is).
 */
export function anchorageEye(
  pose: ShipPose,
  on: { orbit: Readonly<Orbit>; focus: Readonly<Focus> },
  clock: number,
  floor: (p: Vec3) => number,
  out = eyeOut()
): Eye {
  const { orbit: o, focus } = on;
  normalize(pose.position, up);
  normalize(tangent(pose.forward, up, ahead), ahead);
  // (the broadside's share of the turn, eased in and out)
  const b = smoother(clamp(o.broadside));
  const yaw =
    Math.PI -
    lerp(focus.quarter, BROADSIDE.quarter, b) +
    (1 - b) * focus.drift * Math.sin((clock / LOBBY.period) * Math.PI * 2) +
    o.yaw;
  // the pivot, `ahead` along her; the boom runs from it back along `boom`'s
  // way, rising at `pitch`
  const pitch = focus.pitch + o.pitch,
    boom = lerp(focus.boom, BROADSIDE.boom, b),
    height = lerp(focus.height, BROADSIDE.height, b);
  const middle = along(up, ahead, focus.ahead, pivot).p;
  const under = along(
    middle,
    scale(rotateAbout(ahead, up, yaw, way), -1, way),
    boom * Math.cos(pitch),
    end
  ).p;
  const position = place(
    under,
    Math.max(focus.height + boom * Math.sin(pitch), floor(under) + CLEAR),
    out.position
  );
  lookAt(
    position,
    place(middle, height, at),
    normalize(position, way),
    out.orientation
  );
  out.kind = 'air';
  out.fov = AIR_FOV;
  return out;
}
