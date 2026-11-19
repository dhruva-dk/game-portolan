// How finely each level of detail builds the galleon, and which level a ship is drawn at.
//
// A level is drawn once what it leaves out or bends out of place (`error`, metres) covers less than a pixel: a ship d
// metres off, seen at `pixel` radians a pixel, shows a thing of e metres over e / (d · pixel) pixels. On the target
// (PIXEL: the iPad in landscape, 820 CSS pixels high, through the chase camera's 50° lens) a pixel is 1.14 mrad: 2.8 cm
// at 25 m.
//
//   L0  everything: the hull's planking runs, wales, inboard faces, tops, deadeyes, every rope, sails on
//       cloth-sized grids (14 × 9 a square sail)                                 own ship, and up to ~105 m
//   L1  coarser lofts and sails, no small fittings, the running rigging on single spans    to ~265 m
//   L2  the hull's shape and the castles, bare spars, sails as small grids, shrouds and stays only    to ~615 m
//   L3  a speck: a hull, three masts, five sails                                               beyond
//
// A ship moves to a coarser level once it is SLACK further than the level's distance, and back once it is that much
// nearer, so a ship sitting at a boundary doesn't flicker between the two.
//
// Pure arithmetic: runs in node for the tests.

import { AIR_FOV } from '../snapshot.ts';

/** The target's screen height, CSS pixels (the iPad in landscape, 1180 × 820); and the angle a pixel of it spans
 *  through the chase camera's lens, radians (the eye works out the screen's own each frame: view/view.ts). */
const SCREEN = 820;
export const PIXEL = (2 * Math.tan((AIR_FOV * Math.PI) / 360)) / SCREEN;

export interface Detail {
  /** Stations along her, and rows up each side of the skin from keel to rail. */
  stations: number;
  rows: number;
  /** Points along each wale and painted strake; sides round a wale (0: none, the strakes carry them). */
  run: number;
  waleSides: number;
  /** The bulwarks' inner faces, the cap rail and the castles' bulkheads. */
  inboard: boolean;
  /** Each deck's grid: along it, across it. */
  deck: [number, number];
  /** Sides round a mast and round a yard or the bowsprit; pieces along a yard. */
  mastSides: number;
  sparSides: number;
  yardSegs: number;
  /** Sides round a top's platform (0: no tops, crosstrees only). */
  topSides: number;
  /** A square sail's grid, columns × rows, and the lateen's. */
  square: [number, number];
  lateen: [number, number];
  /** Pieces along each pennant (0: none). */
  pennant: number;
  /** Which ropes: shrouds, stays and every running line; shrouds and stays only; none. */
  ropes: 'running' | 'standing' | 'none';
  /** Pieces along a sagging rope. */
  sag: number;
  /** Small fittings: deadeyes and chainplates, anchors, gratings, gammoning, the stern's mouldings, the channels. */
  fittings: boolean;
  /** The beakhead's knee, rails and grating, and the rudder. */
  head: boolean;
  /** The largest thing this level leaves out or bends out of place, metres (at the ship's scale). */
  error: number;
}

export const DETAILS: readonly Detail[] = [
  {
    stations: 56, rows: 16, run: 36, waleSides: 5, inboard: true, deck: [14, 4], mastSides: 8, sparSides: 6, yardSegs: 8,
    topSides: 14, square: [14, 9], lateen: [12, 8], pennant: 10, ropes: 'running', sag: 5, fittings: true, head: true, error: 0,
  },
  {
    stations: 30, rows: 9, run: 16, waleSides: 4, inboard: true, deck: [6, 2], mastSides: 6, sparSides: 4, yardSegs: 4,
    topSides: 10, square: [8, 5], lateen: [6, 4], pennant: 6, ropes: 'running', sag: 2, fittings: false, head: true, error: 0.12,
  },
  {
    stations: 16, rows: 5, run: 8, waleSides: 0, inboard: false, deck: [2, 1], mastSides: 4, sparSides: 3, yardSegs: 1,
    topSides: 6, square: [3, 2], lateen: [2, 2], pennant: 2, ropes: 'standing', sag: 1, fittings: false, head: false, error: 0.3,
  },
  {
    stations: 8, rows: 3, run: 0, waleSides: 0, inboard: false, deck: [1, 1], mastSides: 3, sparSides: 3, yardSegs: 1,
    topSides: 0, square: [1, 1], lateen: [1, 1], pennant: 0, ropes: 'none', sag: 1, fittings: false, head: false, error: 0.7,
  },
];

/** How far past a level's distance a ship goes before it changes level: a tenth either way. */
export const SLACK = 1.1;

/** The distance, metres, past which a ship may be drawn at level k, for a pixel of `pixel` radians. */
export const reach = (k: number, pixel: number): number => DETAILS[k].error / pixel;

/** The level to draw a ship at `metres` off, which was drawn at `was` (or −1 if it wasn't drawn). */
export function chooseDetail(was: number, metres: number, pixel: number): number {
  let k = 0;
  while (k + 1 < DETAILS.length && metres > reach(k + 1, pixel)) k++;
  if (was < 0 || k === was) return k;
  // within the slack of the boundary it would cross, it stays where it was
  const edge = reach(Math.max(k, was), pixel);
  return metres > edge / SLACK && metres < edge * SLACK && Math.abs(k - was) === 1 ? was : k;
}
