import { Vector3, type Storage3DTexture, type UniformNode } from 'three/webgpu';
import {
  Fn,
  If,
  abs,
  clamp,
  dot,
  exp,
  float,
  interleavedGradientNoise,
  max,
  min,
  mx_noise_float,
  normalize,
  screenCoordinate,
  select,
  smoothstep,
  sqrt,
  uniform,
  vec3,
} from 'three/tsl';
import type { StormDraw } from '../snapshot.ts';
import type { View } from '../view/view.ts';
import { R, type Vec3 } from '../../world/sphere.ts';
import { createBolt } from './storm-bolt.ts';
import { BASE, TOP, createStormField, type FieldLight } from './storm-field.ts';
import type { BoolNode, FloatNode, Vec3Node } from '../tsl.ts';

const SOFT = 25;
const SIGMA = 1 / 60,
  FAR_LIGHT = 0.7;
const MIRROR_SIGMA = 1 / 30,
  MIRROR_LIGHT = 0.8;
const STREAK = 220,
  STREAK_LONG = 3.5,
  STREAK_FALL = 1.6,
  STREAK_LEAN = 0.3,
  STREAK_LIGHT = 0.4;

export interface StormLight {
  air: Vec3Node;
  sun: Vec3Node;
  toward: Vec3Node;
}

export function createStormLook(
  view: View,
  shape: Storage3DTexture,
  held: boolean
) {
  const center = uniform(new Vector3(0, 1, 0));
  const radius = uniform(Math.PI);
  const outerCosine = uniform(-1);
  const clock = uniform(0),
    whole = uniform(1);
  const across: [UniformNode<'vec3', Vector3>, UniformNode<'vec3', Vector3>] = [
    uniform(new Vector3(1, 0, 0)),
    uniform(new Vector3(0, 0, 1)),
  ];
  const size = uniform(R);
  const field = createStormField(
    { center, radius, whole, clock, across, size },
    shape
  );
  const bolt = createBolt(held);

  const edge = (p: Vec3Node): FloatNode => field.edge(normalize(p));
  const depth = (p: Vec3Node): FloatNode => smoothstep(0, SOFT, edge(p));

  const span = (
    dir: Vec3Node,
    meters: FloatNode
  ): { enter: FloatNode; leave: FloatNode } => {
    const o = view.position,
      d = dir,
      k = outerCosine;
    const a = dot(o, center),
      b = dot(d, center),
      oo = dot(o, o),
      od = dot(o, d),
      k2 = k.mul(k);
    const h = od.mul(od).sub(oo.sub((R + TOP) * (R + TOP)));
    const half = sqrt(max(h, 0));
    const lo = max(od.negate().sub(half), 0);
    const hi = select(
      h.lessThan(0),
      lo,
      max(min(od.negate().add(half), meters), lo)
    );
    const A = b.mul(b).sub(k2),
      B = a.mul(b).sub(k2.mul(od)).mul(2),
      C = a.mul(a).sub(k2.mul(oo));
    const disc = B.mul(B).sub(A.mul(C).mul(4));
    const A2 = select(abs(A).lessThan(1e-7), float(1e-7), A).mul(2),
      root = sqrt(max(disc, 0));
    const r1 = B.negate().sub(root).div(A2),
      r2 = B.negate().add(root).div(A2);
    const t1 = select(disc.lessThan(0), hi, clamp(min(r1, r2), lo, hi));
    const t2 = select(disc.lessThan(0), hi, clamp(max(r1, r2), lo, hi));
    const outside = (t: FloatNode): BoolNode =>
      field.edge(normalize(o.add(d.mul(t)))).greaterThan(field.OUTERMOST);
    const first = (a: FloatNode, b: FloatNode, then: FloatNode): FloatNode =>
      select(outside(a.add(b).mul(0.5)), a, then);
    const enter = first(lo, t1, first(t1, t2, first(t2, hi, hi)));
    return { enter, leave: select(whole.greaterThan(0), enter, hi) };
  };

  const through = (
    c: Vec3Node,
    dir: Vec3Node,
    meters: FloatNode,
    light: StormLight
  ): Vec3Node =>
    Fn(() => {
      const seen = c.toVar();
      const { enter, leave } = span(dir, meters);
      If(leave.greaterThan(enter), () => {
        const o = view.position;
        const lit: FieldLight = {
          ...light,
          glow: (q) => bolt.glow(light.air, q),
        };
        const mark = bolt.nearest(o, dir);
        const jitter = interleavedGradientNoise(screenCoordinate);
        const m = field.march(o, dir, enter, leave, jitter, mark, lit);
        const end = o.add(dir.mul(m.reached));
        const rest = exp(
          max(leave.sub(m.reached), 0).mul(depth(end)).mul(-SIGMA)
        );
        const far = light.air.mul(FAR_LIGHT).add(bolt.glow(light.air, end));
        const T = m.T.mul(rest);
        seen.assign(
          c
            .mul(T)
            .add(m.light)
            .add(far.mul(m.T.mul(float(1).sub(rest))))
        );
        If(bolt.flash.greaterThan(0), () => {
          seen.addAssign(bolt.channel(light.air, o, dir, meters, m.atMark));
        });
      });
      return seen;
    })();

  const veil = (
    c: Vec3Node,
    dir: Vec3Node,
    meters: FloatNode,
    light: StormLight
  ): Vec3Node => {
    const seen = through(c, dir, meters, light);
    const d = view.toSky(dir);
    const down = d.y
      .add(d.x.mul(STREAK_LEAN))
      .mul(STREAK_LONG)
      .add(clock.mul(STREAK_FALL));
    const fall = mx_noise_float(vec3(d.x.mul(STREAK), down, d.z.mul(STREAK)));
    const under = smoothstep(BASE, BASE * 0.6, view.height);
    const streaks = smoothstep(0.45, 0.8, fall)
      .mul(depth(view.position))
      .mul(under)
      .mul(STREAK_LIGHT);
    return seen.add(
      light.air.add(bolt.glow(light.air, view.position)).mul(streaks)
    );
  };

  const dim = (c: Vec3Node, dir: Vec3Node, light: StormLight): Vec3Node => {
    const { enter, leave } = span(dir, float(1e5));
    const deep = max(
      depth(view.position.add(dir.mul(leave.add(enter).mul(0.5)))),
      0.3
    );
    const T = exp(leave.sub(enter).mul(deep).mul(-MIRROR_SIGMA));
    return c.mul(T).add(light.air.mul(MIRROR_LIGHT).mul(float(1).sub(T)));
  };

  return {
    depth,
    edge,
    veil,
    dim,
    deck: through,
    update(cap: StormDraw, seconds: number, eye: Vec3) {
      center.value.fromArray(cap.center);
      radius.value = cap.radius;
      const [one, two] = across;
      one.value.set(0, 1, 0).cross(center.value);
      if (one.value.lengthSq() < 1e-6)
        one.value.set(1, 0, 0).cross(center.value);
      one.value.normalize();
      two.value.crossVectors(center.value, one.value);
      size.value = R * Math.sin(Math.min(cap.radius, Math.PI - 0.01));
      const all = cap.radius >= Math.PI - 0.01;
      whole.value = all ? 1 : 0;
      outerCosine.value = Math.cos(
        Math.max(0, Math.min(Math.PI, cap.radius + field.OUTERMOST / R))
      );
      clock.value = seconds;
      bolt.update(cap, seconds, eye, all);
    },
  };
}
