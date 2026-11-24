// The camera over the harbour as the office has it (the HQ's campus): where it
// looks (a survey), dragged across the campus or gliding in to the building
// chosen and back out once none is; and where each building is drawn on the
// screen, for the office's pins over them. The eye itself is anchorage.ts's
// harbourEye.

import type { Eye } from '../snapshot.ts';
import { PLOTS, eachPlot, type Harbour, type Plot } from '../world/harbour.ts';
import { fromChart, place } from '../world/sphere.ts';
import {
  PAN,
  harbourEye,
  onPlot,
  overall,
  panned,
  seenAt,
  surveyed,
  type Survey,
} from './anchorage.ts';

/** How far over a building's head its label is hung, metres: none, so near to, the label stays on its roof. */
const OVERHEAD = 0;
/** Along the shore, the metres between the points a building's scale on the screen is measured across. */
const ACROSS = 10;

/** Where a building is drawn: its label's place (px from the top left), its foot's height down the screen (px), and px a metre across. */
export type Point4 = readonly [
  x: number,
  y: number,
  foot: number,
  metre: number,
];

/** The camera over the harbour `h`. */
export function createOverlook(h: Harbour) {
  const survey: Survey = { ...PAN.home },
    heads = eachPlot((): [number, number, number, number] => [0, 0, 0, 0]),
    head: [number, number, number] = [0, 0, 0],
    at: [number, number] = [0, 0];
  /** Where it is gliding to (null: where it is dragged), and the building it is on (null: all). */
  let toward: Survey | null = null,
    plot: Plot | null = null;
  /** Where the world point over (x, z) on the chart, `up` metres over the sea, is drawn by `eye` (into `at`). */
  const drawn = (
    eye: Eye,
    x: number,
    z: number,
    up: number,
    w: number,
    ht: number
  ) => {
    place(fromChart(h.chart, x, z), up, head);
    seenAt(eye, head, w, ht, at);
    return at;
  };
  return {
    /** Back to where it looks first, on no building. */
    reset() {
      Object.assign(survey, PAN.home);
      toward = null;
      plot = null;
    },
    /** The building the office has it on (any other id: none), glided to once newly chosen; none, back out over all. */
    choose(on: string | null) {
      const chose = PLOTS.find((p) => p === on) ?? null;
      if (chose === plot) return;
      plot = chose;
      const s = chose && h.plots[chose];
      toward = s ? onPlot(s.x, s.z) : overall(survey);
    },
    /** A frame of dt seconds, dragged by `drag` (CSS px) with the picture `size` of the screen high: a drag takes it from its glide. */
    step(drag: { x: number; y: number }, size: number, dt: number) {
      if (drag.x || drag.y) toward = null;
      panned(survey, drag, size);
      if (toward) surveyed(survey, toward, dt);
    },
    /** Its eye (into `out`, an eyeOut, whose framing is left as it is). */
    eye: (out: Parameters<typeof harbourEye>[2]) => harbourEye(h, survey, out),
    /** Where each building is drawn by `eye` on a screen w by ht (Point4; the same object each time, refilled). */
    plots(eye: Eye, w: number, ht: number): Readonly<Record<Plot, Point4>> {
      for (const id of PLOTS) {
        const s = h.plots[id],
          out = heads[id],
          top = s.foot + s.tall + OVERHEAD;
        [out[0], out[1]] = drawn(eye, s.x, s.z, top, w, ht);
        const across = drawn(eye, s.x + ACROSS, s.z, top, w, ht);
        out[3] = Math.hypot(across[0] - out[0], across[1] - out[1]) / ACROSS;
        out[2] = drawn(eye, s.x, s.z, s.foot, w, ht)[1];
      }
      return heads;
    },
  };
}
