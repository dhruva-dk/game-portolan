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
 * The campus's site on the harbour's chart, metres: one level terrace from `x`
 * to `x` along the shore and `z` inland to `z` at its quay on the sea; the
 * roads across it (each [x0, x1, z0, z1]): two avenues from the gates at its
 * back to the quay, and two streets between the rows.
 */
export const SITE = {
  x: [-60, 60],
  z: [-52, 40],
  roads: [
    [-21, -15, -52, 40],
    [15, 21, -52, 40],
    [-60, 60, 10, 15],
    [-60, 60, -21, -16],
  ],
} as const;

/**
 * The plots' places on the harbour's chart, metres: x along the shore (to the
 * right as seen from her berth), z toward the sea; and how tall what is built
 * on each stands over its foot (land/harbour.ts builds it; a label is hung
 * over its head). Three rows between the avenues and the streets: on the quay
 * what is launched or landed there, behind them what is worked at, and at the
 * back what stands tall.
 */
export const PLACES: Readonly<
  Record<Plot, readonly [x: number, z: number, tall: number]>
> = {
  factory: [-38, 28, 12],
  hospitality: [0, 28, 5],
  pitCentre: [38, 28, 7],
  commercialCentre: [-38, -3, 6],
  towingTank: [0, -3, 5.2],
  simulator: [38, -3, 9],
  compositesPlant: [-38, -35, 10],
  designCentre: [0, -35, 15],
  scoutingCentre: [38, -35, 21],
};
/** How far toward the sea from its plot's middle the landing's jetty runs, metres. */
export const JETTY = 26;

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
  /** The terrace's height over the sea, metres: every building's foot. */
  ground: number;
  plots: Readonly<Record<Plot, Stand>>;
  /** How well it stands, as its site was chosen by (harbour-site.ts): the most there. */
  sound: number;
}

/** Nothing grows or lies within this of the terrace (its bank, harbour-site.ts), metres. */
const CLEARED = 12;

/** Whether the point p (a unit vector) is built on: on the terrace, or within CLEARED of it. */
export function builtOn(h: Harbour, p: Vec3): boolean {
  const [x, z] = toChart(h.chart, p);
  return (
    x > SITE.x[0] - CLEARED &&
    x < SITE.x[1] + CLEARED &&
    z > SITE.z[0] - CLEARED &&
    z < SITE.z[1] + CLEARED
  );
}
