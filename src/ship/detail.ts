import { AIR_FOV } from '../snapshot.ts';

const SCREEN = 820;
export const PIXEL = (2 * Math.tan((AIR_FOV * Math.PI) / 360)) / SCREEN;

export interface Detail {
  stations: number;
  rows: number;
  run: number;
  waleSides: number;
  inboard: boolean;
  deck: [number, number];
  mastSides: number;
  sparSides: number;
  yardSegs: number;
  topSides: number;
  square: [number, number];
  lateen: [number, number];
  pennant: number;
  ropes: 'running' | 'standing' | 'none';
  sag: number;
  fittings: boolean;
  head: boolean;
  error: number;
}

export const DETAILS: readonly Detail[] = [
  {
    stations: 56,
    rows: 16,
    run: 36,
    waleSides: 5,
    inboard: true,
    deck: [14, 4],
    mastSides: 8,
    sparSides: 6,
    yardSegs: 8,
    topSides: 14,
    square: [14, 9],
    lateen: [12, 8],
    pennant: 10,
    ropes: 'running',
    sag: 5,
    fittings: true,
    head: true,
    error: 0,
  },
  {
    stations: 30,
    rows: 9,
    run: 16,
    waleSides: 4,
    inboard: true,
    deck: [6, 2],
    mastSides: 6,
    sparSides: 4,
    yardSegs: 4,
    topSides: 10,
    square: [8, 5],
    lateen: [6, 4],
    pennant: 6,
    ropes: 'running',
    sag: 2,
    fittings: false,
    head: true,
    error: 0.12,
  },
  {
    stations: 16,
    rows: 5,
    run: 8,
    waleSides: 0,
    inboard: false,
    deck: [2, 1],
    mastSides: 4,
    sparSides: 3,
    yardSegs: 1,
    topSides: 6,
    square: [3, 2],
    lateen: [2, 2],
    pennant: 2,
    ropes: 'standing',
    sag: 1,
    fittings: false,
    head: false,
    error: 0.3,
  },
  {
    stations: 8,
    rows: 3,
    run: 0,
    waleSides: 0,
    inboard: false,
    deck: [1, 1],
    mastSides: 3,
    sparSides: 3,
    yardSegs: 1,
    topSides: 0,
    square: [1, 1],
    lateen: [1, 1],
    pennant: 0,
    ropes: 'none',
    sag: 1,
    fittings: false,
    head: false,
    error: 0.7,
  },
];

export const SLACK = 1.1;

export const reach = (k: number, pixel: number): number =>
  DETAILS[k].error / pixel;

export function chooseDetail(
  was: number,
  meters: number,
  pixel: number
): number {
  let k = 0;
  while (k + 1 < DETAILS.length && meters > reach(k + 1, pixel)) k++;
  if (was < 0 || k === was) return k;
  const edge = reach(Math.max(k, was), pixel);
  return meters > edge / SLACK &&
    meters < edge * SLACK &&
    Math.abs(k - was) === 1
    ? was
    : k;
}
