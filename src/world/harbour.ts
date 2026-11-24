// The harbour: her team's headquarters, nine buildings on the shore she lies
// off at the start, as plain measures: which plots there are, where each lies
// on the harbour's chart, and a harbour as it stands on a planet (its chart
// and each plot's foot; world/harbour-site.ts finds them).
//
// Pure arithmetic: no three, so it runs in node for the tests.

import { toChart, type Chart, type Vec3 } from './sphere.ts';

/** The nine buildings, each with a plot. */
export const PLOTS = [
  'factory',
  'hospitality',
  'pitCentre',
  'commercialCentre',
  'towingTank',
  'simulator',
  'compositesPlant',
  'designCentre',
  'scoutingCentre',
] as const;
export type Plot = (typeof PLOTS)[number];

/** Something for each plot, as `of` makes it. */
export const eachPlot = <T>(of: (id: Plot) => T): Record<Plot, T> => ({
  factory: of('factory'),
  hospitality: of('hospitality'),
  pitCentre: of('pitCentre'),
  commercialCentre: of('commercialCentre'),
  towingTank: of('towingTank'),
  simulator: of('simulator'),
  compositesPlant: of('compositesPlant'),
  designCentre: of('designCentre'),
  scoutingCentre: of('scoutingCentre'),
});

/**
 * The plots' places on the harbour's chart, metres: x along the shore (to the
 * right as seen from her berth), z toward the sea; and how tall what is built
 * on each stands over its foot (land/harbour.ts builds it; a label is hung
 * over its head). Three rows: on the water's edge what is launched or landed
 * there, behind them what is worked at, and at the back what stands tall.
 */
export const PLACES: Readonly<
  Record<Plot, readonly [x: number, z: number, tall: number]>
> = {
  factory: [-33, 28, 11.5],
  hospitality: [1, 31, 12],
  pitCentre: [33, 28, 11],
  commercialCentre: [-36, -2, 5.5],
  towingTank: [-3, 0, 7],
  simulator: [32, -3, 13.5],
  compositesPlant: [-31, -31, 21],
  designCentre: [2, -33, 17],
  scoutingCentre: [33, -31, 30],
};
/** The three on the water's edge: what is launched or landed there. */
export const WATERSIDE: readonly Plot[] = [
  'factory',
  'hospitality',
  'pitCentre',
];
/** How far toward the sea from its plot's middle the landing's jetty runs, metres. */
export const JETTY = 18;

/**
 * A plot as it stands: where on the harbour's chart, its foot's height over the
 * sea, and how tall what is built on it stands over its foot, metres.
 */
interface Stand {
  x: number;
  z: number;
  foot: number;
  tall: number;
}

export interface Harbour {
  /** The chart it is laid on: about its middle, x along the shore, z toward the sea (PLACES). */
  chart: Chart;
  /** Its middle's ground, metres over the sea (at least the feet's). */
  ground: number;
  plots: Readonly<Record<Plot, Stand>>;
  /** How well it stands, as its site was chosen by (harbour-site.ts): the most there. */
  sound: number;
}

/** Nothing grows or lies within this of a plot's middle, metres. */
const CLEARED = 13;

/** Whether the point p (a unit vector) is built on: within a plot's clearing. */
export function builtOn(h: Harbour, p: Vec3): boolean {
  const [x, z] = toChart(h.chart, p);
  for (const id of PLOTS) {
    const s = h.plots[id];
    if (Math.hypot(x - s.x, z - s.z) < CLEARED) return true;
  }
  return false;
}
