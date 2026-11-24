// Where the harbour stands (world/harbour.ts) is the planet's to say: the
// shore ahead of her berth is searched for the stretch where the jetty's head
// is over water, the three on the water's edge stand low by it, and the most
// of the other six have level land under them; and each is given the ground's
// height there for its foot (a footing carries it down to the ground
// wherever that falls away, and over the water where there is no land at all).
// The same for a planet every time.
//
// Pure arithmetic: no three, so it runs in node for the tests.

import { JETTY, PLACES, WATERSIDE, eachPlot, type Harbour } from './harbour.ts';
import { START, type Planet } from './planet.ts';
import {
  along,
  bearingAt,
  cross,
  fromChart,
  normalize,
  type Chart,
} from './sphere.ts';

/** A plot's ground is read at its middle and this far out to each corner, metres. */
const HALF = 6;
/**
 * A building's foot is never nearer the sea's level than this, metres; nor the
 * jetty's deck nearer the ground under its run than CLEAR.
 */
const DRY = 1.2,
  CLEAR = 0.4;
/**
 * A plot is good ground if all of it is this far over the sea, none of it
 * higher than `top`, and it falls no more than `fall` across, metres.
 */
const GOOD = { over: 0.5, top: 16, fall: 3.5 } as const;
/**
 * The water's edge: one of the three there stands well if its ground is within
 * `low` of the sea's level, metres (under it, on a footing in the shallows;
 * over it, on the beach).
 */
const EDGE = { low: [-2.5, 4] } as const;
/**
 * Where the harbour's middle is tried: from `near` to `far` metres past the
 * coast ahead of her, each `step` metres, and `across` metres to either side,
 * each `aside` metres.
 */
const SEARCH = { near: 8, far: 68, step: 6, across: 90, aside: 15 } as const;
/** Where a plot's ground is read, from its middle: there and at its corners. */
const READ = [
  [0, 0],
  [-HALF, -HALF],
  [HALF, -HALF],
  [-HALF, HALF],
  [HALF, HALF],
] as const;

/**
 * The harbour laid about `chart`: each plot's foot, how many stand well (on
 * good ground; by the water, the three on its edge, and the jetty's head over
 * it), and how far the ground falls under them all.
 */
function laid(planet: Planet, chart: Chart) {
  let sound = 0,
    rough = 0;
  const [jx, jz] = PLACES.hospitality;
  // (the jetty's head over water counts as three: a harbour is on the sea)
  if (planet.height(fromChart(chart, jx, jz + JETTY)) < 0) sound += 3;
  const plots = eachPlot((id) => {
    const [x, z, tall] = PLACES[id];
    let low = Infinity,
      high = -Infinity;
    for (const [dx, dz] of READ) {
      const h = planet.height(fromChart(chart, x + dx, z + dz));
      low = Math.min(low, h);
      high = Math.max(high, h);
    }
    const mid = planet.height(fromChart(chart, x, z)),
      edge = WATERSIDE.includes(id);
    if (
      edge
        ? mid > EDGE.low[0] && mid < EDGE.low[1]
        : low > GOOD.over && high < GOOD.top && high - low < GOOD.fall
    )
      sound++;
    rough += Math.min(high - Math.max(low, 0), 12);
    // (the jetty's deck clears whatever ground lies under its run)
    let run = -Infinity;
    if (id === 'hospitality')
      for (let r = 0; r <= JETTY; r += 3)
        run = Math.max(run, planet.height(fromChart(chart, x, z + r)) + CLEAR);
    // (by the water it stands at its middle's ground, cut into the bank
    // behind it; elsewhere on its plot's highest, so none of it is buried)
    return { x, z, foot: Math.max(edge ? mid : high, run, DRY), tall };
  });
  return { plots, sound, rough };
}

/** The planet's harbour. */
export function harbourOf(planet: Planet): Harbour {
  const berth = normalize(planet.start.at),
    ahead = bearingAt(berth, planet.start.bearing);
  let best: (ReturnType<typeof laid> & { chart: Chart }) | null = null;
  for (let d = SEARCH.near; d <= SEARCH.far; d += SEARCH.step)
    for (let a = -SEARCH.across; a <= SEARCH.across; a += SEARCH.aside) {
      const on = along(berth, ahead, START + d),
        // (ahead × up: to the right as she heads in)
        side = along(on.p, normalize(cross(on.t, on.p)), a);
      const chart: Chart = { at: side.p, axis: side.t };
      const l = laid(planet, chart);
      // the most on good ground; then the levellest; then the first tried
      if (
        !best ||
        l.sound > best.sound ||
        (l.sound === best.sound && l.rough < best.rough - 1e-9)
      )
        best = { ...l, chart };
    }
  if (!best) throw new Error('no harbour was tried');
  return {
    chart: best.chart,
    ground: Math.max(planet.height(best.chart.at), DRY),
    plots: best.plots,
    sound: best.sound,
  };
}
