// The sea's long waves on the CPU, for what floats on them: the height of the surface the GPU draws, at any point and
// moment, from the same random sea (spectrum.ts's initialSpectrum, the same seeds as water/waves.ts) read through the same
// charts (world/lattice.ts's weigh, the GPU's choice) at the same offsets, with the same depth cut.
//
// The GPU sums every mode of every cascade by FFT; this sums, mode by mode, only the few hundred that carry nearly all
// of the height: the largest of the two longer cascades (the waves over 2.7 m long). What it leaves out are ripples a
// few centimetres high, which a hull averages away (tests/swell.test.ts measures both).
//
// Each cascade's patch is read at q / L by a linear filter whose texel i holds the surface at i·L/N, so the GPU's
// surface at q is the FFT's at q − L/2N: that half texel is folded into each mode's phase. The waves also move the
// water sideways (the chop) toward their crests: the surface over a point is the water whose rest place, moved, lands
// there, found by stepping back once by the move read at the point itself (the move varies over tens of metres, the
// step is a metre or so).
//
// Pure arithmetic: no three, so it runs in node for the tests.

import { FREQUENCY, band, weigh, type Anchor } from './lattice.ts';
import { R, add, chartBasis, normalize, scale, toChart, type Vec3 } from './sphere.ts';
import { BANDS, BREAKER, CASCADES, CHOP, FETCH, LONG, PERIOD, SIZE } from './cascades.ts';
import { G, initialSpectrum, seaState } from './spectrum.ts';

/** The modes kept, at most: the largest by their share of the height's variance. */
const MODES = 1500;
/** The largest of them, which give the water's sideways move well enough to step back by it. */
const MOVE_MODES = 256;

/** The sea's surface over a point (a vector from the centre), metres above sea level, at a time on the world's clock. */
export type Surface = (p: Vec3, time: number) => number;

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

const STRIDE = 8;

/**
 * The surface for a wind speed (m/s): read through the sea's anchors (lattice.ts: their charts and offsets, as
 * view/charts.ts uploads them); `ground` gives the height of the floor (planet.ts), for the depth's cut of the long
 * waves.
 */
export function createSwell(anchors: readonly Anchor[], ground: (p: Vec3) => number, wind: number, count = MODES): Surface {
  const width = band(FREQUENCY);
  const modes = longModes(wind, count);
  const n = modes.length / STRIDE;
  // each mode's k̂
  const unit = new Float64Array(n * 2);
  for (let m = 0; m < n; m++) {
    const jx = modes[m * STRIDE + 1], jy = modes[m * STRIDE + 2], l = Math.hypot(jx, jy);
    unit[m * 2] = jx / l;
    unit[m * 2 + 1] = jy / l;
  }
  const hs = seaState(wind, FETCH).hs;
  // the modes' amplitudes at the last time asked for
  const now = new Float64Array(n * 2);
  let at = NaN;
  const moment = (time: number) => {
    if (time === at) return;
    at = time;
    const t = time % PERIOD;
    for (let m = 0; m < n; m++) {
      const o = m * STRIDE, w = modes[o + 3], c = Math.cos(w * t), s = Math.sin(w * t);
      // h₀ e^{−iωt} + conj h₀(−k) e^{iωt}
      now[m * 2] = modes[o + 4] * c + modes[o + 5] * s + modes[o + 6] * c - modes[o + 7] * s;
      now[m * 2 + 1] = modes[o + 5] * c - modes[o + 4] * s + modes[o + 6] * s + modes[o + 7] * c;
    }
  };
  // e^{i j dk x} and e^{i j dk z} for every j a mode uses, per cascade: worked out by powers, no trig per mode
  let J = 0;
  for (let m = 0; m < n; m++) J = Math.max(J, Math.abs(modes[m * STRIDE + 1]), modes[m * STRIDE + 2]);
  const ex = Array.from({ length: LONG }, () => new Float64Array((2 * J + 1) * 2));
  const ez = Array.from({ length: LONG }, () => new Float64Array((J + 1) * 2));
  const powers = (into: Float64Array, a: number, from: number) => {
    const c = Math.cos(a), s = Math.sin(a);
    let re = 1, im = 0;
    // from j = 0 up, and (for x) down to −J too
    for (let j = 0; j <= J; j++) {
      into[(from + j) * 2] = re;
      into[(from + j) * 2 + 1] = im;
      if (from > 0) {
        into[(from - j) * 2] = re;
        into[(from - j) * 2 + 1] = -im;
      }
      [re, im] = [re * c - im * s, re * s + im * c];
    }
  };
  /** At chart position (x, z), from the `count` largest modes: the height and the move along the chart's axes. */
  const out = [0, 0, 0];
  const read = (x: number, z: number, count: number) => {
    for (let c = 0; c < LONG; c++) {
      const dk = (2 * Math.PI) / CASCADES[c];
      powers(ex[c], dk * x, J);
      powers(ez[c], dk * z, 0);
    }
    let h = 0, dx = 0, dz = 0;
    for (let m = 0; m < count; m++) {
      const o = m * STRIDE, c = modes[o], jx = modes[o + 1], jy = modes[o + 2];
      const X = ex[c], Z = ez[c], ix = (jx + J) * 2, iz = jy * 2;
      // e^{ik·q} = e^{i jx dk x} e^{i jy dk z}
      const er = X[ix] * Z[iz] - X[ix + 1] * Z[iz + 1], ei = X[ix] * Z[iz + 1] + X[ix + 1] * Z[iz];
      const ar = now[m * 2], ai = now[m * 2 + 1];
      const re = ar * er - ai * ei, im = ar * ei + ai * er;
      h += re;
      // Re(i k̂ A e^{ik·q}) = −k̂ Im(…)
      const k = unit[m * 2], l = unit[m * 2 + 1];
      dx -= k * im;
      dz -= l * im;
    }
    out[0] = 2 * h;
    out[1] = 2 * dx * CHOP;
    out[2] = 2 * dz * CHOP;
    return out;
  };
  /** The waves at rest point u, each chart's read with its weight: the height, and the move as a world tangent. */
  const waves = (u: Vec3, cut: number, count: number): { h: number; move: Vec3 } => {
    const { index, weight } = weigh(anchors, u, width);
    let h = 0, move: Vec3 = [0, 0, 0];
    index.forEach((a, j) => {
      const chart = anchors[a];
      const [x, z] = toChart(chart, u);
      const [rh, rx, rz] = read(x + chart.offset[0], z + chart.offset[1], count);
      const [e1, e2] = chartBasis(chart, u);
      h += rh * weight[j];
      move = add(add(move, e1, rx * weight[j]), e2, rz * weight[j]);
    });
    return { h: h * cut, move: scale(move, cut) };
  };
  return (p, time) => {
    moment(time);
    const u = normalize(p);
    // the long waves cut to what the depth holds, as water.ts's `shallows` does
    const depth = Math.max(-ground(u), 0);
    const cut = Math.min(Math.max(Math.min(hs, depth * BREAKER) / hs, 0), 1);
    // the water whose moved place is here rests about one move back
    const rest = normalize(add(scale(u, R), waves(u, cut, Math.min(MOVE_MODES, n)).move, -1));
    return waves(rest, cut, n).h;
  };
}
