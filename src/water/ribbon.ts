import type { WakePoint } from '../sim/wake.ts';
import * as sphere from '../world/sphere.ts';

export const KELVIN = Math.tan((19.47 * Math.PI) / 180);
export const CHURN = 1.6,
  SPREAD = 0.3;
export const ARM_LIFE = 22;
export const ARM_WIDTH = 0.9,
  WIDEN = 0.05;
const ARM_REACH = 4,
  ARM_ROOM = 4,
  CHURN_ROOM = 2.6;
const INSIDE = 0.8;

export interface Route {
  head: WakePoint;
  kept: readonly WakePoint[];
  skip: number;
}

const pointOf = (route: Route, k: number): WakePoint =>
  k === 0 ? route.head : route.kept[route.skip + k - 1];

export function createRibbon(
  at: Float32Array,
  mark: Float32Array,
  laid: Float32Array
) {
  const onChart = new Float64Array(2);
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
      const ahead = pointOf(route, Math.max(k - 1, 0)).at,
        behind = pointOf(route, Math.min(k + 1, count - 1)).at;
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
