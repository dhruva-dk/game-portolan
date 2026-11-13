// The chase camera: behind the ship and above her, swinging round after her heading with a lag; a drag of the right
// thumb turns it about her to look round, and when the thumb lifts it eases back behind her.
//
// It looks along a boom from a point over her deck. It never goes under the waves or into an island: where land
// stands between it and her deck, the boom is raised until it sees over (quickly), and lowered again only slowly
// once clear (as the old full game did, 0117 src/render/camera.ts); if raising it won't do, it is shortened.
//
// The match's other shot is this camera given another boom (a Shot): drawn back and circling her on a win (shots.ts).
// Moving to another ship it flies there over `flight` seconds, round the planet rather than through it and lifting on
// a long way (0117 camera.ts's flight).

import { AIR_FOV, type Eye } from '../snapshot';
import type { ShipPose } from '../world/pose';
import { R, add, along, cross, dot, length, normalize, place, scale, transport, type Vec3 } from '../world/sphere';
import { lookAt, slerp, type Turn } from '../world/turn';

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

/** The chase's own boom: its length, metres, and how steeply it rises behind her, radians. */
export const BOOM = Math.hypot(BACK, UP), ELEVATION = Math.atan2(UP, BACK);

/** Another boom for a moment of the match: the pivot `height` metres higher, the boom this long and this steep in
 *  place of the chase's, and turned `spin` radians to port about her. */
export interface Shot { height?: number; boom?: number; elevation?: number; spin?: number }

/** t turned `angle` radians to port about `up`. */
const turned = (t: Vec3, up: Vec3, angle: number) => normalize(add(scale(t, Math.cos(angle)), cross(up, t), Math.sin(angle)));

/** Smoother step (0117 camera.ts). */
const smoother = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);

/** ground: metres above the sea at a point (negative under water); sea: the waves' height there at a time. */
export function createChase(ground: (p: Vec3) => number, sea: (p: Vec3, time: number) => number) {
  /** The camera: where it stands (world metres) and how it is turned (it looks down its −z). */
  let position: Vec3 = [0, 0, 0], orientation: Turn = [0, 0, 0, 1];
  /** Where she is, and the way the camera faces along the surface there before the look turns it (lagging her). */
  let at: Vec3 = [0, 1, 0], facing: Vec3 = [0, 0, -1];
  /** The look's turn about her (radians, to port) and tilt (steeper), and how long since it was last moved. */
  let turn = 0, tilt = 0, idle = Infinity;
  /** How far the boom is raised to see over the land. */
  let raised = 0;
  /** A flight under way: where the camera was when it began, its length (s) and how far through it is (0…1). */
  let flight: { from: Vec3; look: Turn; span: number; done: number } | null = null;
  /** The boom's turn for the shot under way (radians to port). */
  let spin = 0;

  /** Where she is, and her heading along the surface there. */
  const level = (pose: ShipPose) => {
    const up = normalize(pose.position);
    return { up, ahead: normalize(add(pose.forward, up, -dot(pose.forward, up))) };
  };

  /** The way the camera looks along the surface at her. */
  const view = () => turned(facing, at, turn + spin);

  /** Whether land stands within ROOM of the sight line from `pivot` metres over her, along `back`, to a boom this long
   *  and steep. */
  const blocked = (back: Vec3, boom: number, elevation: number, pivot: number) => {
    for (let i = 1; i <= SIGHT; i++) {
      const f = i / SIGHT;
      if (ground(along(at, back, f * boom * Math.cos(elevation)).p) + ROOM > pivot + f * boom * Math.sin(elevation)) return true;
    }
    return false;
  };

  /** Places the camera: its boom raised toward what the land asks at `rate` per second (instantly if Infinity). */
  function put(pose: ShipPose, time: number, dt: number, rate: (rising: boolean) => number, shot: Shot) {
    const back = scale(view(), -1), elevation = shot.elevation ?? ELEVATION + tilt, length = shot.boom ?? BOOM;
    const pivot = PIVOT + (shot.height ?? 0);
    let need = 0;
    while (need < RAISED && blocked(back, length, elevation + need, pivot)) need += RAISE;
    raised += (need - raised) * (1 - Math.exp(-rate(need > raised) * dt));
    let boom = length;
    while (boom > SHORTEST && blocked(back, boom, elevation + raised, pivot)) boom *= 0.85;
    const steep = Math.min(elevation + raised, TOP);
    const under = along(at, back, boom * Math.cos(steep)).p;
    const floor = Math.max(ground(under), sea(under, time)) + CLEAR;
    const eye = place(under, Math.max(pivot + boom * Math.sin(steep), floor));
    position = eye;
    const aim = place(along(at, level(pose).ahead, AIM_AHEAD).p, AIM_UP + (shot.height ?? 0));
    orientation = lookAt(eye, aim, normalize(eye));
    if (flight) fly(dt);
  }

  /** The flight from where the camera was toward where it now is placed: round the planet, climbing on a long way. */
  function fly(dt: number) {
    const f = flight!;
    f.done = Math.min(1, f.done + dt / f.span);
    const s = smoother(f.done), to = position, r0 = length(f.from), r1 = length(to);
    const d0 = scale(f.from, 1 / r0), d1 = scale(to, 1 / r1);
    const angle = Math.acos(Math.min(1, Math.max(-1, dot(d0, d1))));
    const dir = angle < 1e-4 ? d1 : scale(add(scale(d0, Math.sin((1 - s) * angle)), d1, Math.sin(s * angle)), 1 / Math.sin(angle));
    const lift = Math.sin(s * Math.PI) * Math.min(angle * R * 0.5, 600);
    position = scale(dir, Math.exp(Math.log(r0) * (1 - s) + Math.log(r1) * s) + lift);
    orientation = slerp(f.look, orientation, s);
    if (f.done >= 1) flight = null;
  }

  return {
    /** Puts it straight behind her, the look let go. */
    reset(pose: ShipPose, time: number, shot: Shot = {}) {
      ({ up: at, ahead: facing } = level(pose));
      turn = tilt = raised = 0;
      idle = Infinity;
      flight = null;
      spin = shot.spin ?? 0;
      put(pose, time, 1, () => Infinity, shot);
    },
    /** From the next update, flies over `seconds` from where the camera is now to wherever it is then placed (0117
     *  camera.ts glide: 1.6 s from one ship to another). */
    fly(seconds = 1.6) {
      flight = { from: position, look: orientation, span: seconds, done: 0 };
    },
    /**
     * After a frame of dt seconds: her pose now (the ship it follows), the look's drag (pixels, right and down), the
     * world's clock, and the boom for the moment (the chase's own, unless given).
     */
    update(pose: ShipPose, look: { x: number; y: number; held: boolean }, dt: number, time: number, shot: Shot = {}) {
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
      spin = shot.spin ?? 0;
      put(pose, time, dt, (rising) => (rising ? RISE : FALL), shot);
    },
    /** The way the camera looks along the surface at her, and its right there: what the stick's up and right mean. */
    axes(): { ahead: Vec3; right: Vec3 } {
      const ahead = view();
      return { ahead, right: cross(ahead, at) };
    },
    /** The eye the camera is now: where it stands and how it is turned. */
    eye(): Eye {
      return { kind: 'air', position, orientation, fov: AIR_FOV };
    },
  };
}

export type Chase = ReturnType<typeof createChase>;
