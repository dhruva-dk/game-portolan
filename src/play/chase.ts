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
// It never goes under the waves, into the land or into the storm's cloud: where land stands between her and the eye,
// or the eye would be under the land, within CLEAR of the water or where the storm's cloud may stand (over the storm,
// or near it in the calm, higher than its lowest: sim/storm.ts CLOUD), the boom and the shoulder are drawn in together
// toward her (quickly), and let out again only slowly once clear, the look's way kept.
//
// The match's other shots are this camera given another boom (a Shot): at her end, sunk or won (finale.ts).
// Moving to another ship it flies there over `flight` seconds, round the planet rather than through it and lifting on
// a long way.

import { CLOUD, toEdge, type Cap } from '../sim/storm.ts';
import { AIR_FOV, type Eye } from '../snapshot.ts';
import type { ShipPose } from '../world/pose.ts';
import { smoother } from '../world/scalar.ts';
import {
  R, add, arc, cross, distance, length, normalize, place, rotateAbout, scale, tangent, transport, type Vec3,
} from '../world/sphere.ts';
import { lookAt, rotate, slerp, type Turn } from '../world/turn.ts';

/** The boom: metres back along the look from its focus, which stands FOCUS metres over the sea and SHOULDER metres to
 *  starboard of her as the look goes. The eye some 48 m up and 54 m astern of her, so she is seen whole from her
 *  trucks, level with the reticle and left of it, to her stern just above the screen's foot, and the look runs over
 *  her rig to what she fights and on to the round of the horizon. (At 40 m and 12 m up, an old boom, her rig stood
 *  over the middle of the screen and her stern was cut by its foot; at 70 m and 22 m up, another, she stood a fifth
 *  smaller.) */
export const BOOM = 60;
const FOCUS = 20, SHOULDER = 14;
/** The look's tilt below the level, radians: where it starts, and its highest and steepest. It starts on the sea about
 *  55 m ahead (the horizon, some 250 m off from the eye, an eighth of the screen above the middle), so a gun laid as it
 *  starts, a lobbed one above all, comes down where she sees it: at 0.17, an older start, the look passed over the
 *  horizon into the sky and a gun's fall was laid at its range, out of sight over the sea's curve. */
export const PITCH = 0.43;
const HIGHEST = -0.12, STEEPEST = 1.0;
/** Radians a CSS pixel of the look's drag, across and down: fixed, as the screen it is for is (the target's, the iPad
 *  Air's landscape 1180 × 820 CSS px: anchorage.ts VIEWPORT), so a drag is not scaled with the window. */
const TURN = 0.0056, TILT = 0.0046;
/** Clear of the land: metres over it along the boom; the boom's least share, the steps it is drawn in by, and how fast
 *  it is drawn in and let out (share a second). */
const ROOM = 1.5, LEAST = 0.15, STEPS = 0.05, IN = 6, OUT = 0.8;
/** The camera never comes closer than CLEAR to the water or the land. */
const CLEAR = 1.5;
/** Points along each leg of the boom tested for land. */
const SIGHT = 8;

/** Another boom for a moment of the match: this long in place of the chase's, turned `spin` radians to port about
 *  her, and the look tilted `tilt` radians further down (within its steepest). */
export interface Shot { boom?: number; spin?: number; tilt?: number }

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
  /** A flight under way: where the camera was when it began, how it looked and at what (the deck it followed), its
   *  length (s) and how far through it is (0…1). */
  let flight: { from: Vec3; look: Turn; aim: Vec3; span: number; done: number } | null = null;
  /** The boom's turn for the shot under way (radians to port). */
  let spin = 0;
  /** The storm's calm, as last given (none: no storm). */
  let storm: Cap | null = null;

  /** Whether the storm's cloud may stand at the eye (world metres): over it, or near it in the calm, higher than its
   *  lowest. The whole planet's calm has none. */
  const clouded = (eye: Vec3) => !!storm && storm.radius < Math.PI && length(eye) - R > CLOUD.lowest && toEdge(eye, storm) < CLOUD.out;

  /** The way the look faces along the surface at her. */
  const view = () => rotateAbout(facing, at, spin);

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
    const ahead = view(), right = cross(ahead, at), tilt = Math.min(STEEPEST, pitch + (shot.tilt ?? 0));
    const dir = normalize(add(scale(ahead, Math.cos(tilt)), at, -Math.sin(tilt)));
    const deck = place(at, FOCUS), boom = shot.boom ?? BOOM;
    /** The eye with the boom and shoulder `k` of the way out. */
    const eyeAt = (k: number) => add(add(deck, right, SHOULDER * k), dir, -boom * k);
    const clear = (k: number) => {
      const eye = eyeAt(k), under = normalize(eye);
      return length(eye) - R > Math.max(ground(under), sea(under, time)) + CLEAR && !clouded(eye)
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
    const dir = arc(scale(f.from, 1 / r0), scale(to, 1 / r1), s), angle = distance(f.from, to) / R;
    const lift = Math.sin(s * Math.PI) * Math.min(angle * R * 0.5, 600);
    position = scale(dir, Math.exp(Math.log(r0) * (1 - s) + Math.log(r1) * s) + lift);
    // turning from the look it left with to the one it arrives at, and on the way looking down at the sea between the
    // ship it left and the one it flies to, never up at the sky (its up its own up and forward together, which a
    // look down along the sky's up never runs along)
    const base = slerp(f.look, orientation, s), deck = place(at, FOCUS), r = length(f.aim);
    const between = scale(normalize(add(scale(f.aim, (1 - s) / r), deck, s / length(deck))), r + (length(deck) - r) * s);
    const up = normalize(add(rotate([0, 1, 0], base), rotate([0, 0, -1], base)));
    orientation = slerp(base, lookAt(position, between, up), Math.sin(Math.PI * s));
    if (f.done >= 1) flight = null;
  }

  /** Her place on the sea. */
  const level = (pose: ShipPose) => normalize(pose.position);

  return {
    /** Puts it over her shoulder looking along her heading, at the look's first tilt. */
    reset(pose: ShipPose, time: number, shot: Shot = {}) {
      at = level(pose);
      facing = normalize(tangent(pose.forward, at));
      pitch = PITCH;
      out = 1;
      flight = null;
      spin = shot.spin ?? 0;
      storm = null;
      put(time, 1, () => Infinity, shot);
    },
    /** From the next update, flies over `seconds` from where the camera is now to wherever it is then placed (1.6 s
     *  from one ship to another). */
    fly(seconds = 1.6) {
      flight = { from: position, look: orientation, aim: place(at, FOCUS), span: seconds, done: 0 };
    },
    /**
     * After a frame of dt seconds: her pose now (the ship it follows), the look's drag (pixels, right and down), the
     * world's clock, the storm's calm then, and the boom for the moment (the chase's own, unless given).
     */
    update(pose: ShipPose, look: { x: number; y: number }, dt: number, time: number, calm: Cap | null, shot: Shot = {}) {
      storm = calm;
      // the look carried along with her over the sphere, its bearing against the world kept
      const up = level(pose);
      facing = transport(facing, at, up);
      at = up;
      facing = normalize(tangent(facing, at));
      // dragged right, the look turns right; dragged down, it looks down
      facing = rotateAbout(facing, at, -look.x * TURN);
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
