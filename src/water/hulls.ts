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

const NEAREST = 4;
const INSET = 0.12;
const SHADE = 0.55,
  SHADE_REACH = 1.6;

const last = WATERLINE.half.length - 1;
const halves = uniformArray<'float'>(WATERLINE.half, 'float');

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
  const values = { at: slots(), fwd: slots(), up: slots() };
  const at = uniformArray<'vec4'>(values.at, 'vec4'),
    fwd = uniformArray<'vec4'>(values.fwd, 'vec4');
  const up = uniformArray<'vec4'>(values.up, 'vec4');
  const chosen = new Int32Array(NEAREST),
    nearness = new Float64Array(NEAREST);

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
    at(p: Vec3Node): { inside: BoolNode; glow: FloatNode } {
      const d = nearest(p);
      return {
        inside: d.lessThan(-INSET),
        glow: float(1).sub(exp(max(d, 0).div(-SHADE_REACH)).mul(SHADE)),
      };
    },
    update(ships: readonly { pose: ShipPose }[], eye: sphere.Vec3) {
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
