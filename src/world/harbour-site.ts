// Where the harbour stands (world/harbour.ts) is the ground's to say, and the
// harbour cuts the ground level for its terrace. The shore ahead of her berth
// is searched for the stretch where the sea lies beyond the terrace's quay and
// the jetty's head is over it, and the ground under the terrace falls least;
// the terrace is laid level at the height of the ground along its quay, every
// building's foot on it; and the planet's ground is cut down under it (a little
// below it, so none shows through) and banked up round it to the ground as it
// was. The cut only ever lowers land that stands over the sea, never under the
// terrace's level, so the sea and its shores are as they were. The same for a
// planet every time.
//
// Pure arithmetic: no three, so it runs in node for the tests.

import { JETTY, PLACES, SITE, eachPlot, type Harbour } from './harbour.ts';
import { START, type Cover, type Ground, type Planet } from './planet.ts';
import {
  R,
  along,
  bearingAt,
  cross,
  dot,
  fromChart,
  normalize,
  toChart,
  type Chart,
  type Vec3,
} from './sphere.ts';

/** The terrace is never nearer the sea's level than this, metres; and stands this far over the quay's ground. */
const DRY = 1.2,
  CLEAR = 0.4;
/** How far apart the terrace's ground is read: in the search, and once it is chosen, metres. */
const READ = { rough: 8, fine: 2 } as const;
/** How far beyond the quay the sea is looked for, metres; where along it; and how deep a strip along the quay the terrace's level is read from. */
const BEYOND = 6,
  ALONG = [-40, 0, 40] as const,
  QUAYSIDE = 12;
/**
 * The cut: the ground under the terrace `sunk` metres below it; round it, a
 * bank rising `rise` a metre out and steepening by `steepen` a metre squared,
 * to the ground as it was by `reach` metres out.
 */
const CUT = { sunk: 0.3, rise: 0.6, steepen: 0.05, reach: 40 } as const;
/**
 * Where the harbour's middle is tried: from `near` to `far` metres past the
 * coast ahead of her, each `step` metres, and `across` metres to either side,
 * each `aside` metres.
 */
const SEARCH = { near: 8, far: 68, step: 6, across: 90, aside: 15 } as const;

/** The highest and lowest ground (the sea's level the lowest) from z0 to the quay on the terrace laid about `chart`, read each `every` metres. */
function under(ground: Ground, chart: Chart, every: number, z0: number) {
  let low = Infinity,
    high = -Infinity;
  for (let x = SITE.x[0]; x <= SITE.x[1] + 1e-9; x += every)
    for (let z = z0; z <= SITE.z[1] + 1e-9; z += every) {
      const h = Math.max(0, ground.height(fromChart(chart, x, z)));
      low = Math.min(low, h);
      high = Math.max(high, h);
    }
  return { low, high };
}

/** How well the terrace laid about `chart` stands: the sea beyond its quay and under its jetty's head, each a point; and how far its ground falls. */
function laid(ground: Ground, chart: Chart) {
  const [jx, jz] = PLACES.hospitality;
  let sound = 0;
  if (ground.height(fromChart(chart, jx, jz + JETTY)) < 0) sound++;
  for (const x of ALONG)
    if (ground.height(fromChart(chart, x, SITE.z[1] + BEYOND)) < 0) sound++;
  const { low, high } = under(ground, chart, READ.rough, SITE.z[0]);
  return { sound, rough: high - low };
}

/** The harbour on the ground: its site, and its terrace's level. */
export function harbourOf(ground: Ground): Harbour {
  const berth = normalize(ground.start.at),
    ahead = bearingAt(berth, ground.start.bearing);
  let best: (ReturnType<typeof laid> & { chart: Chart }) | null = null;
  for (let d = SEARCH.near; d <= SEARCH.far; d += SEARCH.step)
    for (let a = -SEARCH.across; a <= SEARCH.across; a += SEARCH.aside) {
      const on = along(berth, ahead, START + d),
        // (ahead × up: to the right as she heads in)
        side = along(on.p, normalize(cross(on.t, on.p)), a);
      const chart: Chart = { at: side.p, axis: side.t };
      const l = laid(ground, chart);
      // the sea most where it should be; then the levellest; then the first tried
      if (
        !best ||
        l.sound > best.sound ||
        (l.sound === best.sound && l.rough < best.rough - 1e-9)
      )
        best = { ...l, chart };
    }
  if (!best) throw new Error('no harbour was tried');
  const level = Math.max(
    under(ground, best.chart, READ.fine, SITE.z[1] - QUAYSIDE).high + CLEAR,
    DRY
  );
  return {
    chart: best.chart,
    ground: level,
    plots: eachPlot((id) => {
      const [x, z, tall] = PLACES[id];
      return { x, z, foot: level, tall };
    }),
    sound: best.sound,
  };
}

/** How far the point at chart (x, z) lies outside the terrace, metres (0 on it). */
const outside = (x: number, z: number) =>
  Math.hypot(
    Math.max(SITE.x[0] - x, 0, x - SITE.x[1]),
    Math.max(SITE.z[0] - z, 0, z - SITE.z[1])
  );

/** The planet: the ground with its harbour sited on it and cut level under the harbour's terrace. */
export function levelled(ground: Ground): Planet {
  const harbour = harbourOf(ground),
    { chart } = harbour,
    // (past this angle from the chart's middle the cut is none)
    near = Math.cos(
      (Math.hypot(SITE.x[1] - SITE.x[0], SITE.z[1] - SITE.z[0]) / 2 +
        CUT.reach) /
        R
    );
  /** The ground `h` at the direction p, cut. */
  const cut = (p: Vec3, h: number) => {
    if (h <= 0 || dot(p, chart.at) < near) return h;
    const [x, z] = toChart(chart, p),
      d = outside(x, z);
    if (d >= CUT.reach) return h;
    return Math.min(
      h,
      harbour.ground - CUT.sunk + CUT.rise * d + CUT.steepen * d * d
    );
  };
  return {
    ...ground,
    harbour,
    height: (p: Vec3) => cut(p, ground.height(p)),
    sample: (p: Vec3, cover: Cover) => cut(p, ground.sample(p, cover)),
  };
}
