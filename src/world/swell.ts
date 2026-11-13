// The sea's long waves on the CPU, for what floats on them: the height of the surface the GPU draws, at any point and
// moment, from the same random sea (spectrum.ts's initialSpectrum, the same seeds as water/waves.ts) read through the same
// charts (world/lattice.ts's weigh, the GPU's choice) at the same offsets, with the same depth cut.
//
// The GPU sums every mode of every cascade by FFT; this sums, mode by mode (sum.ts), only the few hundred that carry
// nearly all of the height: the largest of the two longer cascades (the waves over 2.7 m long). What it leaves out are
// ripples a few centimetres high, which a hull averages away (tests/swell.test.ts measures both).
//
// Two reads: the surface at a point (what bobs on it, the camera keeping clear of it), and the water under a hull at
// four points about her (sim/ride.ts), which sums only the modes she feels: those at least `shortest` metres long.
// Shorter waves run under a hull of her length without lifting her (tests/swell.test.ts holds her ride to the whole
// sum's).
//
// Each cascade's patch is read at q / L by a linear filter whose texel i holds the surface at i·L/N, so the GPU's
// surface at q is the FFT's at q − L/2N: that half texel is folded into each mode's phase. The waves also move the
// water sideways (the chop) toward their crests: the surface over a point is the water whose rest place, moved, lands
// there, found by stepping back once by the move read at the point itself (the move varies over tens of metres, the
// step is a metre or so; under a hull, the move read at her middle serves her four points).
//
// Nothing is made per read.
//
// Pure arithmetic: no three, so it runs in node for the tests.

import { FREQUENCY, band, weighInto, type Anchor } from './lattice.ts';
import { R, chartAt, type Vec3 } from './sphere.ts';
import { BANDS, BREAKER, CASCADES, FETCH, LONG, PERIOD, SIZE } from './cascades.ts';
import { G, initialSpectrum, seaState } from './spectrum.ts';
import { STRIDE, createSums } from './sum.ts';

/** The modes kept, at most: the largest by their share of the height's variance. */
const MODES = 1500;
/** The largest of them, which give the water's sideways move well enough to step back by it. */
const MOVE_MODES = 256;

/** The sea's surface over a point (a vector from the centre), metres above sea level, at a time on the world's clock. */
export type Surface = (p: Vec3, time: number) => number;

/** The water under a hull, metres above sea level: under her bow and stern, and her port and starboard rails. */
export interface Under { bow: number; stern: number; port: number; starboard: number }

/** The water under a hull lying at `at` (a unit vector) heading `heading` (a unit tangent there), read `reach` metres
 *  ahead of and behind her middle and `rail` metres out to either side, at a time on the world's clock. The answer is
 *  the read's own, made once: read it before the next. */
export type Hull = (at: Vec3, heading: Vec3, reach: number, rail: number, time: number) => Under;

/** The sea's two reads. */
export interface Swell { at: Surface; hull: Hull }

/** A sea without waves, under any hull (for the matches run headless, where the waves only lift the drawn ships). */
const LEVEL: Under = Object.freeze({ bow: 0, stern: 0, port: 0, starboard: 0 });
export const flat: Hull = () => LEVEL;

/**
 * The modes the long cascades hold, the largest first: per mode its cascade, its place on that cascade's lattice of
 * wavevectors (jx, jy: k = j·2π/L, jy ≥ 0), ω, and the complex amplitudes of e^{−iωt} and e^{iωt} (the half texel
 * already in their phases); each pair k and −k as one, the surface twice its real part.
 */
export function longModes(wind: number, count = MODES): Float64Array {
  const sea = { wind, fetch: FETCH };
  const all: number[][] = [];
  for (let c = 0; c < LONG; c++) {
    const L = CASCADES[c], dk = (2 * Math.PI) / L, half = L / (2 * SIZE);
    const h0 = initialSpectrum(SIZE, L, sea, c + 1, BANDS[c]);
    const step = (2 * Math.PI) / PERIOD;
    for (let y = SIZE / 2; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
      const jx = x - SIZE / 2, jy = y - SIZE / 2;
      // one of each pair: k and −k hold conjugate amplitudes
      if (jy === 0 && jx <= 0) continue;
      const i = (y * SIZE + x) * 4;
      const [ar, ai, br, bi] = [h0[i], h0[i + 1], h0[i + 2], h0[i + 3]];
      const energy = ar * ar + ai * ai + br * br + bi * bi;
      if (energy === 0) continue;
      // as the GPU rounds it, so the sea repeats
      const w = Math.floor(Math.sqrt(G * dk * Math.hypot(jx, jy)) / step) * step;
      // e^{−ik·half}: the surface read at q is the FFT's at q − half on both axes
      const t = -(jx + jy) * dk * half, c0 = Math.cos(t), s0 = Math.sin(t);
      all.push([energy, c, jx, jy, w, ar * c0 - ai * s0, ar * s0 + ai * c0, br * c0 - bi * s0, br * s0 + bi * c0]);
    }
  }
  all.sort((a, b) => b[0] - a[0]);
  return Float64Array.from(all.slice(0, count).flatMap((m) => m.slice(1)));
}

/** The reads' options: the shortest wave a hull feels, metres (0: all of them), and the modes kept. */
export interface SwellOptions { shortest?: number; count?: number }

/** sum.ts's groups: every mode kept, the largest for the move, and those a hull feels. */
const EVERY = 0, MOVE = 1, FELT = 2;

/**
 * The surface for a wind speed (m/s): read through the sea's anchors (lattice.ts: their charts and offsets, as
 * view/charts.ts uploads them); `ground` gives the height of the floor (planet.ts), for the depth's cut of the long
 * waves.
 */
export function createSwell(anchors: readonly Anchor[], ground: (p: Vec3) => number, wind: number, { shortest = 0, count = MODES }: SwellOptions = {}): Swell {
  const width = band(FREQUENCY);
  const table = longModes(wind, count);
  const all = Array.from({ length: table.length / STRIDE }, (_, m) => m);
  const length = (m: number) => CASCADES[table[m * STRIDE]] / Math.hypot(table[m * STRIDE + 1], table[m * STRIDE + 2]);
  const sums = createSums(table, [all, all.slice(0, MOVE_MODES), all.filter((m) => length(m) >= shortest)]);
  const hs = seaState(wind, FETCH).hs;
  const place = new Float64Array(8), index = new Int32Array(3), weight = new Float64Array(3);

  /** The long waves at the unit vector (x, y, z) cut to what the depth there holds, as water.ts's `shallows` does. */
  const cutAt = (x: number, y: number, z: number) => {
    const depth = Math.max(-ground([x, y, z]), 0);
    return Math.min(Math.max(Math.min(hs, depth * BREAKER) / hs, 0), 1);
  };

  /** The move at the unit vector (x, y, z), each chart's with its weight, as a world tangent into `shift`. */
  const shift = new Float64Array(3);
  const moveAt = (x: number, y: number, z: number) => {
    shift.fill(0);
    const k = weighInto(anchors, x, y, z, width, index, weight);
    for (let j = 0; j < k; j++) {
      const chart = anchors[index[j]];
      chartAt(chart, x, y, z, place, true);
      sums.place(0, place[0] + chart.offset[0], place[1] + chart.offset[1], MOVE);
      sums.one(MOVE, true);
      const [mx, mz] = sums.moved;
      for (let i = 0; i < 3; i++) shift[i] += (place[2 + i] * mx + place[5 + i] * mz) * weight[j];
    }
  };

  /** The surface over a point: the water whose moved place is here rests about one move back. */
  const surface: Surface = (p, time) => {
    sums.at(time);
    const l = 1 / Math.hypot(p[0], p[1], p[2]), ux = p[0] * l, uy = p[1] * l, uz = p[2] * l;
    const cut = cutAt(ux, uy, uz);
    moveAt(ux, uy, uz);
    const rx = ux * R - shift[0] * cut, ry = uy * R - shift[1] * cut, rz = uz * R - shift[2] * cut;
    let h = 0;
    const k = weighInto(anchors, rx, ry, rz, width, index, weight);
    for (let j = 0; j < k; j++) {
      const chart = anchors[index[j]];
      chartAt(chart, rx, ry, rz, place);
      sums.place(0, place[0] + chart.offset[0], place[1] + chart.offset[1], EVERY);
      h += sums.one(EVERY, false) * weight[j];
    }
    return h * cut;
  };

  // a hull's four points (bow, stern, port, starboard): where each rests, its cut, and the charts that weigh in at any
  // of them with each point's weight on each
  const under: Under = { bow: 0, stern: 0, port: 0, starboard: 0 };
  const rest = new Float64Array(12), cuts = new Float64Array(4), heights = new Float64Array(4);
  const charts = new Int32Array(12), weights = new Float64Array(12 * 4);
  const hull: Hull = (centre, heading, reach, rail, time) => {
    sums.at(time);
    const [ax, ay, az] = centre, [hx, hy, hz] = heading;
    // port: up × ahead
    const px = ay * hz - az * hy, py = az * hx - ax * hz, pz = ax * hy - ay * hx;
    moveAt(ax, ay, az);
    let found = 0;
    for (let i = 0; i < 4; i++) {
      // `metres` along the surface toward the tangent (sphere.ts along)
      const metres = i === 0 ? reach : i === 1 ? -reach : i === 2 ? rail : -rail, ahead = i < 2;
      const a = metres / R, c = Math.cos(a), s = Math.sin(a);
      const x = ax * c + (ahead ? hx : px) * s, y = ay * c + (ahead ? hy : py) * s, z = az * c + (ahead ? hz : pz) * s;
      const l = 1 / Math.hypot(x, y, z), cut = (cuts[i] = cutAt(x * l, y * l, z * l));
      const rx = x * l * R - shift[0] * cut, ry = y * l * R - shift[1] * cut, rz = z * l * R - shift[2] * cut;
      rest[i * 3] = rx;
      rest[i * 3 + 1] = ry;
      rest[i * 3 + 2] = rz;
      const k = weighInto(anchors, rx, ry, rz, width, index, weight);
      for (let j = 0; j < k; j++) {
        // each chart once
        let f = 0;
        while (f < found && charts[f] !== index[j]) f++;
        if (f === found) {
          charts[found++] = index[j];
          for (let q = 0; q < 4; q++) weights[f * 4 + q] = 0;
        }
        weights[f * 4 + i] = weight[j];
      }
    }
    heights.fill(0);
    for (let f = 0; f < found; f++) {
      const chart = anchors[charts[f]];
      for (let i = 0; i < 4; i++) {
        chartAt(chart, rest[i * 3], rest[i * 3 + 1], rest[i * 3 + 2], place);
        sums.place(i, place[0] + chart.offset[0], place[1] + chart.offset[1], FELT);
      }
      sums.four(FELT);
      for (let i = 0; i < 4; i++) heights[i] += sums.heights[i] * weights[f * 4 + i];
    }
    under.bow = heights[0] * cuts[0];
    under.stern = heights[1] * cuts[1];
    under.port = heights[2] * cuts[2];
    under.starboard = heights[3] * cuts[3];
    return under;
  };

  return { at: surface, hull };
}
