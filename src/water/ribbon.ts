// A ship's wake laid out as a ribbon for the map to draw (wake.ts): from her
// bow now back along the path it has cut (sim/wake.ts), two vertices to a
// point, one each side of her track and far enough out to hold what the wake
// draws there: her Kelvin wedge's arms and the churned water astern. The
// ribbon's vertices carry how far out each lies, how long ago she passed and
// how fast she went, and how far along the path they are, which the map's
// shader draws from. Nothing is made: it writes straight into the buffers it is
// given, for every ship every frame.

import type { WakePoint } from '../sim/wake.ts';
import * as sphere from '../world/sphere.ts';

/** tan of the Kelvin angle, 19.47°. */
export const KELVIN = Math.tan((19.47 * Math.PI) / 180);
/**
 * The churned water astern: its half-width under her transom, and how fast it
 * spreads, metres a second.
 */
export const CHURN = 1.6,
  SPREAD = 0.3;
/** How long the wedge's arms last in a calm, seconds. */
export const ARM_LIFE = 22;
/**
 * An arm's half-width as it leaves her stem, metres, and how fast it widens,
 * metres a second per metre a second of her speed then.
 */
export const ARM_WIDTH = 0.9,
  WIDEN = 0.05;
/**
 * The ribbon reaches this many of an arm's half-widths past its crest (and at
 * least ARM_ROOM metres), and at least this many of the churn's half-widths.
 */
const ARM_REACH = 4,
  ARM_ROOM = 4,
  CHURN_ROOM = 2.6;
/**
 * On the inside of a turn, the ribbon reaches this share of the way to its
 * centre.
 */
const INSIDE = 0.8;

/**
 * The wake to lay: her bow now (the newest point), then the points the wake
 * kept from `skip` on.
 */
export interface Route {
  head: WakePoint;
  kept: readonly WakePoint[];
  skip: number;
}

/** The route's point k: the bow now, then the kept points. */
const pointOf = (route: Route, k: number): WakePoint =>
  k === 0 ? route.head : route.kept[route.skip + k - 1];

/**
 * at, mark and laid: the buffers the vertices go into, two floats, four and one
 * a vertex.
 */
export function createRibbon(
  at: Float32Array,
  mark: Float32Array,
  laid: Float32Array
) {
  /** A point on a chart, metres (chartAt's out). */
  const onChart = new Float64Array(2);
  /**
   * One ship's ribbon along `route` on `chart`, `gone` metres sailed along it,
   * from vertex `v0`; returns the vertices it took.
   */
  return (
    chart: sphere.Chart,
    route: Route,
    now: number,
    gone: number,
    v0: number
  ): number => {
    const count = 1 + route.kept.length - route.skip;
    let run = 0;
    for (let k = 0; k < count; k++) {
      const point = pointOf(route, k),
        p = point.at;
      if (k > 0) run += sphere.distance(pointOf(route, k - 1).at, p);
      // along the path toward her bow, from the points either side
      const ahead = pointOf(route, Math.max(k - 1, 0)).at,
        behind = pointOf(route, Math.min(k + 1, count - 1)).at;
      // the way along the path (ahead less behind), brought into the tangent
      // plane at p, and across it, side = p × that
      const tx = ahead[0] - behind[0],
        ty = ahead[1] - behind[1],
        tz = ahead[2] - behind[2];
      const along = tx * p[0] + ty * p[1] + tz * p[2];
      const ux = tx - p[0] * along,
        uy = ty - p[1] * along,
        uz = tz - p[2] * along;
      const sx = p[1] * uz - p[2] * uy,
        sy = p[2] * ux - p[0] * uz,
        sz = p[0] * uy - p[1] * ux,
        sl = 1 / Math.hypot(sx, sy, sz);
      const age = now - point.time,
        reach = point.speed * age * KELVIN;
      const room = Math.max(
        ARM_ROOM,
        ARM_REACH * (ARM_WIDTH + WIDEN * point.speed * age)
      );
      const half = Math.max(
        age < ARM_LIFE ? reach + room : 0,
        (CHURN + SPREAD * age) * CHURN_ROOM
      );
      // On the inside of a turn the ribbon reaches no further than most of the
      // way to the turn's centre, past which it would fold back over itself.
      // The turn here: how far the path bends between the stretches either
      // side, over their length (+ to port).
      const ix = p[0] - behind[0],
        iy = p[1] - behind[1],
        iz = p[2] - behind[2];
      const ox = ahead[0] - p[0],
        oy = ahead[1] - p[1],
        oz = ahead[2] - p[2];
      const li = Math.hypot(ix, iy, iz),
        lo = Math.hypot(ox, oy, oz),
        lengths = li * lo;
      const turn =
        (iy * oz - iz * oy) * p[0] +
        (iz * ox - ix * oz) * p[1] +
        (ix * oy - iy * ox) * p[2];
      const bend =
        lengths > 0 ? turn / lengths / (((li + lo) / 2) * sphere.R) : 0;
      for (let s = 1; s >= -1; s -= 2) {
        const i = v0 + 2 * k + (s > 0 ? 0 : 1);
        const reaches =
          s * bend > 0 ? Math.min(half, INSIDE / Math.abs(bend)) : half;
        // from p, s·reaches metres along the sea in the direction of side
        // (chartAt takes it unnormalised)
        const angle = (s * reaches) / sphere.R,
          c = Math.cos(angle),
          w = Math.sin(angle) * sl;
        sphere.chartAt(
          chart,
          p[0] * c + sx * w,
          p[1] * c + sy * w,
          p[2] * c + sz * w,
          onChart
        );
        at[i * 2] = onChart[0];
        at[i * 2 + 1] = onChart[1];
        mark[i * 4] = s * reaches;
        mark[i * 4 + 1] = age;
        mark[i * 4 + 2] = point.speed;
        mark[i * 4 + 3] = run;
        laid[i] = gone - run;
      }
    }
    return 2 * count;
  };
}
