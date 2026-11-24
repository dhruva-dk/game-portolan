import { Vector4 } from 'three/webgpu';
import {
  If,
  acos,
  clamp,
  cross,
  dot,
  float,
  hash,
  int,
  length,
  max,
  normalize,
  smoothstep,
  sqrt,
  uint,
  uniform,
  uniformArray,
  vec2,
  vec3,
} from 'three/tsl';
import {
  FREQUENCY,
  anchors,
  band,
  cover,
  icosphere,
  near,
  type Anchor,
  type Likeness,
} from '../../world/lattice.ts';
import { R, distance, type Vec3 } from '../../world/sphere.ts';
import type { Wind } from '../../world/wind.ts';
import { chartNodes } from './view.ts';
import { loop, type FloatNode, type Vec2Node, type Vec3Node } from '../tsl.ts';

export interface Read {
  q: Vec2Node;
  e1: Vec3Node;
  e2: Vec3Node;
  w: FloatNode;
  dx: Vec2Node;
  dy: Vec2Node;
  dw: Vec3Node;
}

export type Charts = ReturnType<typeof createCharts>;

export function createCharts(span: number, alike: Likeness, wind: Wind) {
  const all: readonly Anchor[] = anchors(
    icosphere(FREQUENCY),
    wind,
    span,
    alike
  );
  const width = band(FREQUENCY);
  const margin = cover(FREQUENCY) + width;
  const centerValues = all.map(() => new Vector4()),
    axisValues = all.map(() => new Vector4());
  const centers = uniformArray<'vec4'>(centerValues, 'vec4');
  const axes = uniformArray<'vec4'>(axisValues, 'vec4');
  const count = uniform(3, 'int');
  const listed = new Int32Array(all.length);
  const nearest: number[] = [];

  const pick = (u: Vec3Node, gradients = false) => {
    const c = [float(-2).toVar(), float(-2).toVar(), float(-2).toVar()];
    const i = [int(0).toVar(), int(0).toVar(), int(0).toVar()];
    loop('anchor', count, (k) => {
      const d = dot(u, centers.element(k).xyz).toVar();
      If(d.greaterThan(c[0]), () => {
        c[2].assign(c[1]);
        i[2].assign(i[1]);
        c[1].assign(c[0]);
        i[1].assign(i[0]);
        c[0].assign(d);
        i[0].assign(k);
      })
        .ElseIf(d.greaterThan(c[1]), () => {
          c[2].assign(c[1]);
          i[2].assign(i[1]);
          c[1].assign(d);
          i[1].assign(k);
        })
        .ElseIf(d.greaterThan(c[2]), () => {
          c[2].assign(d);
          i[2].assign(k);
        });
    });
    const arc = c.map((x) => acos(clamp(x, -1, 1)).mul(R));
    const s = [
      float(1),
      smoothstep(width, 0, arc[1].sub(arc[0])),
      smoothstep(width, 0, arc[2].sub(arc[0])),
    ];
    const size = sqrt(s[0].add(s[1].mul(s[1])).add(s[2].mul(s[2])));
    const weight = s.map((x) => x.div(size).toVar());
    const none: Vec3Node[] = [];
    if (!gradients) return { index: i, weight, slope: none };
    const away = i.map((k, j) => {
      const t = u.mul(c[j]).sub(centers.element(k).xyz);
      return t.div(max(length(t), 1e-6));
    });
    const ds = [1, 2].map((j) => {
      const t = clamp(float(1).sub(arc[j].sub(arc[0]).div(width)), 0, 1);
      return away[j].sub(away[0]).mul(t.mul(float(1).sub(t)).mul(-6 / width));
    });
    const dsize = ds[0].mul(s[1]).add(ds[1].mul(s[2])).div(size);
    const slope = [vec3(0), ...ds].map((d, j) =>
      d.sub(dsize.mul(weight[j])).div(size)
    );
    return { index: i, weight, slope };
  };

  function each(
    p: Vec3Node,
    read: (r: Read, slot: number) => void,
    dp?: [Vec3Node, Vec3Node]
  ) {
    const u = normalize(p);
    const { index, weight, slope } = pick(u, dp !== undefined);
    index.forEach((k, slot) => {
      const run = () => {
        const C = centers.element(k),
          X = axes.element(k);
        const at = C.xyz,
          axis = X.xyz;
        const c = chartNodes(at, axis, cross(axis, at))(u);
        const grad = (d: Vec3Node | undefined) =>
          d ? vec2(dot(d, c.e1), dot(d, c.e2)) : vec2(0);
        const q = c.q.add(vec2(C.w, X.w));
        read(
          {
            q,
            e1: c.e1,
            e2: c.e2,
            w: weight[slot],
            dx: grad(dp?.[0]),
            dy: grad(dp?.[1]),
            dw: slope[slot] ?? vec3(0),
          },
          slot
        );
      };
      if (slot === 0) run();
      else If(weight[slot].greaterThan(0), run);
    });
  }

  function debug(p: Vec3Node): Vec3Node {
    const { index, weight } = pick(normalize(p));
    const shade = hash(uint(index[0])).mul(0.5).add(0.5);
    return vec3(weight[0], weight[1], weight[2]).mul(shade);
  }

  return {
    anchors: all,
    each,
    debug,
    update(eye: Vec3, reach: number) {
      const order = near(all, eye, Math.PI * R, nearest);
      let n = 0;
      while (
        n < order.length &&
        distance(all[order[n]].at, eye) <= reach + margin
      )
        n++;
      n = Math.max(3, n);
      let same = n === count.value;
      for (let k = 0; same && k < n; k++) same = order[k] === listed[k];
      if (same) return;
      for (let k = 0; k < n; k++) {
        const { at, axis, offset } = all[(listed[k] = order[k])];
        centerValues[k].set(at[0], at[1], at[2], offset[0]);
        axisValues[k].set(axis[0], axis[1], axis[2], offset[1]);
      }
      count.value = n;
    },
  };
}
