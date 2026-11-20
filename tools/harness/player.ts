// A stand-in for a player (PLAN H7): a bot of the match whose gun is laid as a
// player lays hers, so the assist's help to a player can be set beside what the
// bots hit (tools/harness/aim.ts). Her bot sails her and chooses when to fire;
// this eye chooses where (play/orders.ts Sighter, set by state.ts debugOf
// standIn). It measures fairness, not feel: feel needs hands on an iPad.
//
// A player lays her gun with the chase camera (play/chase.ts): the look runs
// through the middle of the screen, from an eye BOOM m back along it from a
// point FOCUS m over her and SHOULDER m to starboard. She turns it onto her foe
// and holds the reticle on the foe's body (its middle, as sim/sight.ts
// measures it), and leads her not at all: that is the assist's to do. Her
// thumb is not the bot's hand:
// - she sees where the foe was LAG s ago, the eye and the thumb's own delay;
// - the reticle wanders off the foe's middle by up to WANDER radians, to a new
//   point every `every` s, following it at FOLLOW a second.
// (WANDER: a thumb steady to some 7 CSS px, at chase.ts TURN 0.0056 rad a px:
// about the assist's cone, 0.06–0.1 rad, so what the assist gives shows.)
//
// Deterministic for its seed: the same match, the same shots.
//
// Node only (tools/).

import type { Sighter } from '../../src/play/orders.ts';
import { STEP } from '../../src/sim/fixed.ts';
import { SHIP } from '../../src/sim/handling.ts';
import type { Sight } from '../../src/sim/sight.ts';
import { random } from '../../src/world/random.ts';
import {
  add,
  cross,
  normalize,
  place,
  toward,
  type Vec3,
} from '../../src/world/sphere.ts';

/** The chase camera's boom (play/chase.ts BOOM, FOCUS, SHOULDER), metres. */
const BOOM = 60,
  FOCUS = 20,
  SHOULDER = 14;
/**
 * Her eye and thumb: their delay (s, LAG), the reticle's wander (radians,
 * WANDER), by name: `steady` as above, `sloppy` a thumb half as steady again
 * and slower, to show how far what she hits hangs on them.
 */
export const THUMBS = {
  steady: { lag: 0.2, wander: 0.04 },
  sloppy: { lag: 0.3, wander: 0.07 },
} as const;
export type Thumb = keyof typeof THUMBS;
const isThumb = (name: string): name is Thumb => name in THUMBS;

/** The thumb of this name, or an error naming those there are. */
export function thumbNamed(name: string): Thumb {
  if (!isThumb(name))
    throw new Error(`no thumb "${name}" (${Object.keys(THUMBS).join(', ')})`);
  return name;
}
/** The reticle moves on every `EVERY` s, following at FOLLOW a second. */
const EVERY: readonly [number, number] = [0.4, 1.0],
  FOLLOW = 3;

/**
 * A stand-in's eye, drawing from `seed`, with a `thumb` of THUMBS: each step,
 * the line of sight her gun is laid along.
 */
export function standIn(seed: number, thumb: Thumb = 'steady'): Sighter {
  const { lag: LAG, wander: WANDER } = THUMBS[thumb];
  const draw = random(seed >>> 0);
  /** Where her foe was over the last LAG s, the oldest first. */
  const seen: Vec3[] = [];
  let foeId = -1;
  // the wander: where the reticle is off her middle and where it goes
  // (radians, across and up), and seconds till it moves on
  let off: [number, number] = [0, 0],
    to: [number, number] = [0, 0],
    t = 0;
  const lagged = Math.max(1, Math.round(LAG / STEP));

  return (own, foe): Sight => {
    const deck = place(own.ship.at, FOCUS);
    if (!foe) {
      foeId = -1;
      seen.length = 0;
      return { from: deck, dir: own.ship.heading };
    }
    if (foe.id !== foeId) {
      foeId = foe.id;
      seen.length = 0;
    }
    seen.push(foe.ship.at);
    if (seen.length > lagged) seen.shift();
    // the middle of her body, as she was LAG s ago
    const mark = place(seen[0], SHIP.rig / 2);
    t -= STEP;
    if (t <= 0) {
      t = EVERY[0] + (EVERY[1] - EVERY[0]) * draw();
      const a = 2 * Math.PI * draw(),
        r = WANDER * Math.sqrt(draw());
      to = [r * Math.cos(a), r * Math.sin(a)];
    }
    const k = Math.min(1, FOLLOW * STEP);
    off = [off[0] + (to[0] - off[0]) * k, off[1] + (to[1] - off[1]) * k];
    // the camera turned onto her: its eye back along the look and out to
    // starboard of it, the look through the reticle
    const up = own.ship.at,
      ahead = toward(up, seen[0]) ?? own.ship.heading,
      right = cross(ahead, up);
    const look = normalize(add(mark, deck, -1)),
      eye = add(add(deck, right, SHOULDER), look, -BOOM);
    const on = normalize(add(mark, eye, -1)),
      across = normalize(cross(on, normalize(eye))),
      lift = cross(across, on);
    return {
      from: eye,
      dir: normalize(add(add(on, across, off[0]), lift, off[1])),
    };
  };
}
