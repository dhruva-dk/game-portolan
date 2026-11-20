// The hulls standing in the sea, as the sea's shader sees them: for the few
// ships nearest the eye, where the water lies against each one's waterline
// (ship/waterline.ts), in her own frame as she heaves, pitches and rolls.
//
// There is no water inside a hull, so the sea's surface is cut away there:
// else, as she rides down into a trough or rolls, the crests of the short waves
// the hull doesn't follow would show through her deck. Only the nearest few
// need it: further off a crest through her deck is too small to see. The cut is
// the waterline's outline (her sides are near upright about it) brought in a
// hand's breadth, so no water is ever cut away outside her: a sliver left
// inside is hidden under her deck and behind her sides.
//
// Beside her, the hull shades the water: it hides half the sky from the water
// against it, and the water under her from the light, so the sea glows less
// there, a dark band hugging her that fades within a couple of metres.
//
// The ships are handed over each frame nearest first; the slots past the last
// are parked far off the planet.

import { Vector4 } from 'three/webgpu';
import {
  abs,
  clamp,
  cross,
  dot,
  exp,
  float,
  floor,
  int,
  length,
  max,
  min,
  mix,
  select,
  uniformArray,
  vec2,
} from 'three/tsl';
import { WATERLINE } from '../ship/waterline.ts';
import type { ShipPose } from '../world/pose.ts';
import * as sphere from '../world/sphere.ts';
import {
  minInt,
  type BoolNode,
  type FloatNode,
  type Vec3Node,
} from '../tsl.ts';

/** The ships nearest the eye whose hulls the sea fits round. */
const NEAREST = 4;
/** The cut is brought in this far from the waterline, metres. */
const INSET = 0.12;
/**
 * The shade beside her: how much of the sea's glow she takes away against her
 * side, and how fast it fades out, metres.
 */
const SHADE = 0.55,
  SHADE_REACH = 1.6;

const last = WATERLINE.half.length - 1;
const halves = uniformArray<'float'>(WATERLINE.half, 'float');

/**
 * How far outside her waterline a point lies in her frame (across: metres to
 * port, along: metres forward of her middle): the distance to the outline,
 * negative inside it (then the distance in from her side, near enough).
 */
export function outside(across: FloatNode, along: FloatNode): FloatNode {
  const t = clamp(
    along.sub(WATERLINE.stern).div(WATERLINE.stem - WATERLINE.stern),
    0,
    1
  ).mul(last);
  const i = int(floor(t)),
    j = minInt(i.add(1), last);
  const half = mix(halves.element(i), halves.element(j), t.sub(floor(t)));
  const side = abs(across).sub(half);
  const beyond = max(
    float(WATERLINE.stern).sub(along),
    along.sub(WATERLINE.stem)
  );
  return select(
    beyond.greaterThan(0),
    length(vec2(max(side, 0), beyond)),
    side
  );
}

export function createHulls() {
  const slots = () => Array.from({ length: NEAREST }, () => new Vector4());
  /** The three uniform arrays' values, a slot each. */
  const values = { at: slots(), fwd: slots(), up: slots() };
  const at = uniformArray<'vec4'>(values.at, 'vec4'),
    fwd = uniformArray<'vec4'>(values.fwd, 'vec4');
  const up = uniformArray<'vec4'>(values.up, 'vec4');
  /**
   * The nearest ships' indices and their nearness (minus the eye's dot with
   * them: least is nearest), kept between frames.
   */
  const chosen = new Int32Array(NEAREST),
    nearness = new Float64Array(NEAREST);

  /** The least of each hull's `outside` at world position p, metres. */
  const nearest = (p: Vec3Node): FloatNode => {
    let d: FloatNode = float(1e4);
    for (let k = 0; k < NEAREST; k++) {
      const o = p.sub(at.element(k).xyz),
        f = fwd.element(k).xyz,
        u = up.element(k).xyz;
      d = min(d, outside(dot(o, cross(u, f)), dot(o, f)));
    }
    return d;
  };

  return {
    /**
     * Whether world position p lies inside a hull (cut it away), and how much
     * of the sea's glow is left there, 0…1.
     */
    at(p: Vec3Node): { inside: BoolNode; glow: FloatNode } {
      const d = nearest(p);
      return {
        inside: d.lessThan(-INSET),
        glow: float(1).sub(exp(max(d, 0).div(-SHADE_REACH)).mul(SHADE)),
      };
    },
    /**
     * Each frame: the ships, and the eye (world, metres), the nearest NEAREST
     * taken.
     */
    update(ships: readonly { pose: ShipPose }[], eye: sphere.Vec3) {
      // the nearest NEAREST, nearest first, by insertion into a short list
      let taken = 0;
      for (let i = 0; i < ships.length; i++) {
        const d = -sphere.dot(ships[i].pose.position, eye);
        if (taken === NEAREST && d >= nearness[taken - 1]) continue;
        let k = taken < NEAREST ? taken++ : taken - 1;
        for (; k > 0 && nearness[k - 1] > d; k--) {
          nearness[k] = nearness[k - 1];
          chosen[k] = chosen[k - 1];
        }
        nearness[k] = d;
        chosen[k] = i;
      }
      for (let k = 0; k < NEAREST; k++) {
        // the empty slots parked far off, square, so nothing lies inside them
        if (k < taken) {
          const { position, forward, up } = ships[chosen[k]].pose;
          values.at[k].set(position[0], position[1], position[2], 0);
          values.fwd[k].set(forward[0], forward[1], forward[2], 0);
          values.up[k].set(up[0], up[1], up[2], 0);
        } else {
          values.at[k].set(1e6, 0, 0, 0);
          values.fwd[k].set(1, 0, 0, 0);
          values.up[k].set(0, 1, 0, 0);
        }
      }
    },
  };
}
