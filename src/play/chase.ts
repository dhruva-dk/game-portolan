// The chase camera: over her shoulder, looking where the player last left it. A drag of the right thumb turns the look
// about her and tilts it; let go, it stays: the look holds its bearing against the world (carried along with her over
// the sphere), not against her heading, however she turns under it. Nothing swings it back behind her, ever. The stick
// steers by the screen (game.ts), so a look that followed her heading would turn the stick's meaning under the thumb
// while she turned; held to the world, pushing the stick up sails her where the camera looks, and a gun laid along the
// look stays laid while she comes round.
//
// The look is the gun's line of sight (sim/sight.ts): the middle of the screen, where the reticle stands. So the eye
// stands back along the look from a point over her (FOCUS m up) and out to her starboard as the look goes (SHOULDER
// m), and her hull and rig stand left of the middle, clear of the line: a third-person shooter's over-the-shoulder
// view. The look tilts from a little above the level to steeply down onto the sea about her.
//
// It never goes under the waves or into an island: where land stands between her and the eye, or the eye would be
// under the land or within CLEAR of the water, the boom and the shoulder are drawn in together toward her (quickly),
// and let out again only slowly once clear (as the old full game did, 0117 src/render/camera.ts), the look's way kept.
//
// The match's other shot is this camera given another boom (a Shot): drawn back and circling her on a win (shots.ts).
// Moving to another ship it flies there over `flight` seconds, round the planet rather than through it and lifting on
// a long way (0117 camera.ts's flight).

import { AIR_FOV, type Eye } from '../snapshot.ts';
import type { ShipPose } from '../world/pose.ts';
import { R, add, cross, dot, length, normalize, place, scale, transport, type Vec3 } from '../world/sphere.ts';
import { lookAt, rotate, slerp, type Turn } from '../world/turn.ts';

/** The boom: metres back along the look from its focus, which stands FOCUS metres over the sea and SHOULDER metres to
 *  starboard of her as the look goes. */
export const BOOM = 40;
const FOCUS = 12, SHOULDER = 15;
/** The look's tilt below the level, radians: where it starts (the ships about her, 60–150 m off, across the middle of
 *  the screen; the sea's horizon a little below it), and its highest and steepest. */
export const PITCH = 0.17;
const HIGHEST = -0.12, STEEPEST = 1.0;
/** Radians a pixel of the look's drag, across and down. */
const TURN = 0.0056, TILT = 0.0046;
/** Clear of the land: metres over it along the boom; the boom's least share, the steps it is drawn in by, and how fast
 *  it is drawn in and let out (share a second). */
const ROOM = 1.5, LEAST = 0.15, STEPS = 0.05, IN = 6, OUT = 0.8;
/** The camera never comes closer than CLEAR to the water or the land. */
const CLEAR = 1.5;
/** Points along each leg of the boom tested for land. */
const SIGHT = 8;

/** Another boom for a moment of the match: this long in place of the chase's, and turned `spin` radians to port about
 *  her. */
export interface Shot { boom?: number; spin?: number }

/** t turned `angle` radians to port about `up`. */
const turned = (t: Vec3, up: Vec3, angle: number) => normalize(add(scale(t, Math.cos(angle)), cross(up, t), Math.sin(angle)));

/** Smoother step (0117 camera.ts). */
const smoother = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);

/** ground: metres above the sea at a point (negative under water); sea: the waves' height there at a time. */
export function createChase(ground: (p: Vec3) => number, sea: (p: Vec3, time: number) => number) {
  /** The camera: where it stands (world metres) and how it is turned (it looks down its −z). */
  let position: Vec3 = [0, 0, 0], orientation: Turn = [0, 0, 0, 1];
  /** Where she is, and the way the look faces along the surface there (held against the world). */
  let at: Vec3 = [0, 1, 0], facing: Vec3 = [0, 0, -1];
  /** The look's tilt below the level, radians. */
  let pitch = PITCH;
  /** How far out the boom and shoulder stand (1: all the way; less, drawn in clear of the land). */
  let out = 1;
  /** A flight under way: where the camera was when it began, its length (s) and how far through it is (0…1). */
  let flight: { from: Vec3; look: Turn; span: number; done: number } | null = null;
  /** The boom's turn for the shot under way (radians to port). */
  let spin = 0;

  /** The way the look faces along the surface at her. */
  const view = () => turned(facing, at, spin);

  /** Whether the land stands within ROOM of the straight line from a to b (metres, from the centre). */
  const blocked = (a: Vec3, b: Vec3) => {
    for (let i = 1; i <= SIGHT; i++) {
      const p = add(a, add(b, a, -1), i / SIGHT);
      if (ground(normalize(p)) + ROOM > length(p) - R) return true;
    }
    return false;
  };

  /** Places the camera: its boom drawn in toward what the land and the sea ask, at `rate` per second (instantly if
   *  Infinity). */
  function put(time: number, dt: number, rate: (drawing: boolean) => number, shot: Shot) {
    const ahead = view(), right = cross(ahead, at);
    const dir = normalize(add(scale(ahead, Math.cos(pitch)), at, -Math.sin(pitch)));
    const deck = place(at, FOCUS), boom = shot.boom ?? BOOM;
    /** The eye with the boom and shoulder `k` of the way out. */
    const eyeAt = (k: number) => add(add(deck, right, SHOULDER * k), dir, -boom * k);
    const clear = (k: number) => {
      const eye = eyeAt(k), under = normalize(eye);
      return length(eye) - R > Math.max(ground(under), sea(under, time)) + CLEAR
        && !blocked(deck, add(deck, right, SHOULDER * k)) && !blocked(add(deck, right, SHOULDER * k), eye);
    };
    let need = 1;
    while (need > LEAST && !clear(need)) need -= STEPS;
    out += (need - out) * (1 - Math.exp(-rate(need < out) * dt));
    position = eyeAt(out);
    orientation = lookAt(position, add(position, dir), normalize(position));
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

  /** Her place on the sea. */
  const level = (pose: ShipPose) => normalize(pose.position);

  return {
    /** Puts it over her shoulder looking along her heading, at the look's first tilt. */
    reset(pose: ShipPose, time: number, shot: Shot = {}) {
      at = level(pose);
      facing = normalize(add(pose.forward, at, -dot(pose.forward, at)));
      pitch = PITCH;
      out = 1;
      flight = null;
      spin = shot.spin ?? 0;
      put(time, 1, () => Infinity, shot);
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
    update(pose: ShipPose, look: { x: number; y: number }, dt: number, time: number, shot: Shot = {}) {
      // the look carried along with her over the sphere, its bearing against the world kept
      const up = level(pose);
      facing = transport(facing, at, up);
      at = up;
      facing = normalize(add(facing, at, -dot(facing, at)));
      // dragged right, the look turns right; dragged down, it looks down
      facing = turned(facing, at, -look.x * TURN);
      pitch = Math.min(STEEPEST, Math.max(HIGHEST, pitch + look.y * TILT));
      spin = shot.spin ?? 0;
      put(time, dt, (drawing) => (drawing ? IN : OUT), shot);
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
    /** The line through the middle of the screen: where the eye stands and the way it looks (sim/sight.ts). */
    sight: () => ({ from: position, dir: rotate([0, 0, -1], orientation) }),
  };
}

export type Chase = ReturnType<typeof createChase>;
