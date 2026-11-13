// The sea's charts as the shaders see them (their CPU half is world/lattice.ts): at a point, the three anchors
// nearest it, their weights, and for each one that weighs in, where the point lies on its chart and the chart's axes
// carried there (view.ts's chartNodes, the one place the shaders do a chart's arithmetic).
//
// The anchors that can matter on screen — those within the drawn sea's reach of the eye, and a cell and a band past
// it — are uploaded nearest first to a uniform array each frame (two vec4 each: centre and axis, the offset in their
// w). A uniform array rather than a data texture: a few hundred floats, indexed directly with no sampler. Each vertex
// and pixel walks the list with one dot product per anchor, keeping the three nearest. The choice and the weights
// depend on the point alone, never on the eye (the list only bounds the search): the sea is a function of place and
// time.
//
// Reads are skipped where a chart has no weight: the second and third charts' work happens inside an `if` on their
// weight, so in a cell's interior (where only the nearest weighs in) their texture reads never run. Inside the `if`,
// fragment reads must not use implicit derivatives (WGSL forbids them in non-uniform control flow, and the chart
// coordinates jump where the nearest anchor changes), so each chart hands its reads the gradients of its own
// coordinates across the pixel, worked out from the world position's: dq = (dp·e1, dp·e2).

import { Vector4 } from 'three/webgpu';
import { If, Loop, acos, clamp, cross, dot, float, fract, int, length, max, normalize, sin, smoothstep, sqrt, uniform, uniformArray, vec2, vec3 } from 'three/tsl';
import { FREQUENCY, anchors, band, cover, icosphere, near, type Anchor, type Likeness } from '../world/lattice';
import { R, type Vec3 } from '../world/sphere';
import type { Wind } from '../world/wind';
import { chartNodes } from './view';
import type { FloatNode, Vec2Node, Vec3Node } from '../tsl';

/** One chart's read at a point: where on the patches (metres, offset included), its axes there, and its weight. */
export interface Read {
  q: Vec2Node; e1: Vec3Node; e2: Vec3Node; w: FloatNode;
  /** q's change across the pixel, right and down (fragment stage only, when asked for). */
  dx: Vec2Node; dy: Vec2Node;
  /** w's gradient over the sphere, per metre (a world vector; with dx, dy only). */
  dw: Vec3Node;
}

export type Charts = ReturnType<typeof createCharts>;

/**
 * span: the width of the largest patch, metres, over which the anchors' offsets are spread; alike: how alike two
 * reads of the patches are, for choosing offsets that make neighbouring charts' seas independent (lattice.anchors);
 * wind: the prevailing wind, along which each chart's x axis is laid.
 */
export function createCharts(span: number, alike: Likeness, wind: Wind) {
  const all = anchors(icosphere(FREQUENCY), wind, span, alike);
  const width = band(FREQUENCY);
  /** Past the drawn sea, the furthest an anchor can lie and still weigh in somewhere on it. */
  const margin = cover(FREQUENCY) + width;
  const centreValues = all.map(() => new Vector4()), axisValues = all.map(() => new Vector4());
  const centres = uniformArray<'vec4'>(centreValues, 'vec4');
  const axes = uniformArray<'vec4'>(axisValues, 'vec4');
  const count = uniform(3, 'int');
  let listed = '';

  /**
   * The three anchors nearest the unit vector u (indices into the list) and their weights, Σw² = 1; and if asked,
   * the weights' gradients over the sphere, per metre. Each weight is s/|s| with s = smoothstep(width, 0, arc − arc₀)
   * of the arcs to the anchors, and an arc's gradient is the unit tangent pointing away from its anchor.
   */
  const pick = (u: Vec3Node, gradients = false) => {
    const c = [float(-2).toVar(), float(-2).toVar(), float(-2).toVar()];
    const i = [int(0).toVar(), int(0).toVar(), int(0).toVar()];
    Loop({ start: int(0), end: count, type: 'int', condition: '<' }, ({ i: k }) => {
      const d = dot(u, centres.element(k).xyz).toVar();
      If(d.greaterThan(c[0]), () => {
        c[2].assign(c[1]); i[2].assign(i[1]);
        c[1].assign(c[0]); i[1].assign(i[0]);
        c[0].assign(d); i[0].assign(k);
      }).ElseIf(d.greaterThan(c[1]), () => {
        c[2].assign(c[1]); i[2].assign(i[1]);
        c[1].assign(d); i[1].assign(k);
      }).ElseIf(d.greaterThan(c[2]), () => {
        c[2].assign(d); i[2].assign(k);
      });
    });
    const arc = c.map((x) => acos(clamp(x, -1, 1)).mul(R));
    const s = [float(1), smoothstep(width, 0, arc[1].sub(arc[0])), smoothstep(width, 0, arc[2].sub(arc[0]))];
    const size = sqrt(s[0].add(s[1].mul(s[1])).add(s[2].mul(s[2])));
    const weight = s.map((x) => x.div(size).toVar());
    if (!gradients) return { index: i, weight, slope: [] as Vec3Node[] };
    const away = i.map((k, j) => {
      const t = u.mul(c[j]).sub(centres.element(k).xyz);
      return t.div(max(length(t), 1e-6));
    });
    // ds/dx of smoothstep(width, 0, x) is −6t(1 − t)/width, t = 1 − x/width
    const ds = [1, 2].map((j) => {
      const t = clamp(float(1).sub(arc[j].sub(arc[0]).div(width)), 0, 1);
      return away[j].sub(away[0]).mul(t.mul(float(1).sub(t)).mul(-6 / width));
    });
    const dsize = ds[0].mul(s[1]).add(ds[1].mul(s[2])).div(size);
    const slope = [vec3(0), ...ds].map((d, j) => d.sub(dsize.mul(weight[j])).div(size));
    return { index: i, weight, slope };
  };

  /**
   * Calls `read` for each chart with weight at world position p (nearest first; the first always), inside a branch
   * on its weight for the second and third. Must be called inside an Fn. dp: p's change across the pixel, right and
   * down, for the reads' gradients (fragment stage); worked out before any branch.
   */
  function each(p: Vec3Node, read: (r: Read, slot: number) => void, dp?: [Vec3Node, Vec3Node]) {
    const u = normalize(p);
    const { index, weight, slope } = pick(u, dp !== undefined);
    index.forEach((k, slot) => {
      const run = () => {
        const C = centres.element(k), X = axes.element(k);
        const at = C.xyz, axis = X.xyz;
        const c = chartNodes(at, axis, cross(axis, at))(u);
        const grad = (d: Vec3Node | undefined) => (d ? vec2(dot(d, c.e1), dot(d, c.e2)) : vec2(0));
        read({ q: c.q.add(vec2(C.w, X.w)), e1: c.e1, e2: c.e2, w: weight[slot], dx: grad(dp?.[0]), dy: grad(dp?.[1]), dw: slope[slot] ?? vec3(0) }, slot);
      };
      if (slot === 0) run();
      else If(weight[slot].greaterThan(0), run);
    });
  }

  /** For ?debug=charts: the three weights as red, green and blue, each cell a little lighter or darker than the next. */
  function debug(p: Vec3Node): Vec3Node {
    const { index, weight } = pick(normalize(p));
    const shade = fract(sin(float(index[0]).mul(12.9898)).mul(43758.5453)).mul(0.5).add(0.5);
    return vec3(weight[0], weight[1], weight[2]).mul(shade);
  }

  return {
    /** Every anchor, as world/lattice.ts placed them: for the CPU's copy of the waves (water/swell.ts). */
    anchors: all as readonly Anchor[],
    each,
    debug,
    /** Lists the anchors that can weigh in on the sea drawn out to `reach` metres round the point under the eye. */
    update(eye: Vec3, reach: number) {
      const order = near(all, eye, Math.PI * R);
      const n = Math.max(3, near(all, eye, reach + margin).length);
      const key = order.slice(0, n).join(',');
      if (key === listed) return;
      listed = key;
      order.slice(0, n).forEach((a, k) => {
        const { at, axis, offset } = all[a];
        centreValues[k].set(at[0], at[1], at[2], offset[0]);
        axisValues[k].set(axis[0], axis[1], axis[2], offset[1]);
      });
      count.value = n;
    },
  };
}
