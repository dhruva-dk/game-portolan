// The long waves summed mode by mode at a few points of a chart at once
// (world/swell.ts's reads), laid out once so that a read makes nothing and
// works out no trig per mode.
//
// A mode is a place on its cascade's lattice of wavevectors (k = j·2π/L) and a
// frequency, a whole multiple of the sea's beat 2π/PERIOD. At chart position q
// its share of the surface is Re(A(t) e^{i jx dk x} e^{i jy dk z}), so:
//   - e^{i jx dk x} and e^{i jy dk z} are tables for each point read, worked out by powers of one e^{i dk x} (two
//     trig calls per cascade, not per mode);
//   - A(t) for every mode comes from cos and sin of each multiple of the beat, worked out once per moment;
//   - the modes are kept by cascade and row (jy), and a row's modes are summed against the x table alone, the row's
//     sum turned by its one e^{i jy dk z} after: a complex multiply and add per mode and point.
// Up to four points are summed together (a hull's: sim/ride.ts), their tables
// interleaved so each mode's four entries lie side by side.
//
// Pure arithmetic: no three, so it runs in node for the tests.

import { CASCADES, CHOP, LONG, PERIOD } from './cascades.ts';

/**
 * longModes' layout (swell.ts): per mode its cascade, jx, jy, ω, and the
 * amplitudes of e^{−iωt} and e^{iωt}.
 */
export const STRIDE = 8;
/**
 * The sea's beat: every ω is a whole multiple of it (longModes rounds them so).
 */
const BEAT = (2 * Math.PI) / PERIOD;
/** The points summed at once. */
const POINTS = 4;

/**
 * A set of modes laid out to be summed: by cascade and row, each row's end and
 * its z entry; each mode's x entry, its multiple of the beat, its amplitudes
 * for cos ωt and sin ωt, k̂, and its amplitude now; and each cascade's widest
 * |j|.
 */
interface Group {
  tx: Int32Array;
  rowEnd: Int32Array;
  tz: Int32Array;
  beat: Int32Array;
  amp: Float64Array;
  unit: Float64Array;
  now: Float64Array;
  widest: Int32Array;
}

/**
 * The sums over `groups` of the modes in `table` (longModes's, by index): each
 * group is summed on its own, all read through one set of tables. A group's
 * index into `groups` names it to one and four.
 */
export function createSums(
  table: Float64Array,
  groups: readonly (readonly number[])[]
) {
  // each cascade's widest |jx| and jy over every mode, and where its entries
  // start in the tables
  const widestOf = (modes: readonly number[]) => {
    const J = new Int32Array(LONG);
    for (const m of modes) {
      const o = m * STRIDE,
        c = table[o];
      J[c] = Math.max(J[c], Math.abs(table[o + 1]), table[o + 2]);
    }
    return J;
  };
  const J = widestOf(groups.flat());
  const xFrom = new Int32Array(LONG),
    zFrom = new Int32Array(LONG);
  let xs = 0,
    zs = 0;
  for (let c = 0; c < LONG; c++) {
    [xFrom[c], zFrom[c]] = [xs, zs];
    [xs, zs] = [xs + 2 * J[c] + 1, zs + J[c] + 1];
  }
  // e^{i jx dk x} and e^{i jy dk z} at each point: entry e's for point p at
  // (e·POINTS + p)·2
  const X = new Float64Array(xs * POINTS * 2),
    Z = new Float64Array(zs * POINTS * 2);

  const make = (modes: readonly number[]): Group => {
    const at = (m: number, k: number) => table[m * STRIDE + k];
    const sorted = [...modes].sort(
      (a, b) =>
        at(a, 0) - at(b, 0) || at(a, 2) - at(b, 2) || at(a, 1) - at(b, 1)
    );
    const n = sorted.length,
      tx = new Int32Array(n),
      beat = new Int32Array(n);
    const amp = new Float64Array(n * 4),
      unit = new Float64Array(n * 2),
      ends: number[] = [],
      zs: number[] = [];
    sorted.forEach((m, i) => {
      const c = at(m, 0),
        jx = at(m, 1),
        jy = at(m, 2);
      tx[i] = (xFrom[c] + J[c] + jx) * POINTS * 2;
      beat[i] = Math.round(at(m, 3) / BEAT);
      // h₀ e^{−iωt} + conj h₀(−k) e^{iωt}, as (P cos ωt + Q sin ωt) + i (U cos
      // ωt + V sin ωt)
      const ar = at(m, 4),
        ai = at(m, 5),
        br = at(m, 6),
        bi = at(m, 7);
      amp.set([ar + br, ai - bi, ai + bi, br - ar], i * 4);
      const l = Math.hypot(jx, jy);
      unit.set([jx / l, jy / l], i * 2);
      // a new row where the cascade or jy changes
      const next = sorted[i + 1];
      if (next === undefined || at(next, 0) !== c || at(next, 2) !== jy) {
        ends.push(i + 1);
        zs.push((zFrom[c] + jy) * POINTS * 2);
      }
    });
    return {
      tx,
      rowEnd: Int32Array.from(ends),
      tz: Int32Array.from(zs),
      beat,
      amp,
      unit,
      now: new Float64Array(n * 2),
      widest: widestOf(modes),
    };
  };
  const made = groups.map(make);
  const beats = Math.max(0, ...made.flatMap((g) => [...g.beat])) + 1;
  const cosB = new Float64Array(beats),
    sinB = new Float64Array(beats);

  let moment = NaN;
  /**
   * Every group's amplitudes at a time on the world's clock (the sea repeats
   * every PERIOD).
   */
  const at = (time: number) => {
    if (time === moment) return;
    moment = time;
    const t = time % PERIOD;
    for (let b = 0; b < beats; b++) {
      const w = b * BEAT;
      cosB[b] = Math.cos(w * t);
      sinB[b] = Math.sin(w * t);
    }
    for (const { beat, amp, now } of made) {
      for (let m = 0; m < beat.length; m++) {
        const c = cosB[beat[m]],
          s = sinB[beat[m]],
          o = m * 4;
        now[m * 2] = amp[o] * c + amp[o + 1] * s;
        now[m * 2 + 1] = amp[o + 2] * c + amp[o + 3] * s;
      }
    }
  };

  /**
   * Point p's tables at chart position (x, z), metres, as far as group g's
   * modes reach.
   */
  const place = (p: number, x: number, z: number, g: number) => {
    const top = made[g].widest;
    for (let c = 0; c < LONG; c++) {
      const dk = (2 * Math.PI) / CASCADES[c],
        cx = Math.cos(dk * x),
        sx = Math.sin(dk * x),
        cz = Math.cos(dk * z),
        sz = Math.sin(dk * z);
      const mid = ((xFrom[c] + J[c]) * POINTS + p) * 2,
        z0 = (zFrom[c] * POINTS + p) * 2,
        step = POINTS * 2;
      let xr = 1,
        xi = 0,
        zr = 1,
        zi = 0;
      for (let j = 0; j <= top[c]; j++) {
        X[mid + j * step] = xr;
        X[mid + j * step + 1] = xi;
        X[mid - j * step] = xr;
        X[mid - j * step + 1] = -xi;
        Z[z0 + j * step] = zr;
        Z[z0 + j * step + 1] = zi;
        const xr1 = xr * cx - xi * sx,
          zr1 = zr * cz - zi * sz;
        xi = xr * sx + xi * cx;
        zi = zr * sz + zi * cz;
        xr = xr1;
        zr = zr1;
      }
    }
  };

  /**
   * The water's move along the chart's axes at point 0, as `one` last summed it
   * with `move`.
   */
  const moved = new Float64Array(2);
  /**
   * Group g summed at point 0: the height, and if `move`, the move into
   * `moved`.
   */
  const one = (g: number, move: boolean) => {
    const { tx, rowEnd, tz, now, unit } = made[g];
    let h = 0,
      dx = 0,
      dz = 0,
      m = 0;
    for (let r = 0; r < rowEnd.length; r++) {
      // the row's Σ A e^{i jx dk x}, and with each k̂'s x and z
      let a = 0,
        b = 0,
        ax = 0,
        bx = 0,
        az = 0,
        bz = 0;
      for (const end = rowEnd[r]; m < end; m++) {
        const i = tx[m],
          ar = now[m * 2],
          ai = now[m * 2 + 1],
          xr = X[i],
          xi = X[i + 1];
        const re = ar * xr - ai * xi,
          im = ar * xi + ai * xr;
        a += re;
        b += im;
        if (!move) continue;
        const ux = unit[m * 2],
          uz = unit[m * 2 + 1];
        ax += ux * re;
        bx += ux * im;
        az += uz * re;
        bz += uz * im;
      }
      const k = tz[r],
        zr = Z[k],
        zi = Z[k + 1];
      h += a * zr - b * zi;
      // Re(i k̂ A e^{ik·q}) = −k̂ Im(…)
      dx -= ax * zi + bx * zr;
      dz -= az * zi + bz * zr;
    }
    moved[0] = 2 * dx * CHOP;
    moved[1] = 2 * dz * CHOP;
    return 2 * h;
  };

  /** The four points' heights, as `four` last summed them. */
  const heights = new Float64Array(POINTS);
  /** Group g summed at all four points: their heights into `heights`. */
  const four = (g: number) => {
    const { tx, rowEnd, tz, now } = made[g];
    let h0 = 0,
      h1 = 0,
      h2 = 0,
      h3 = 0,
      m = 0;
    for (let r = 0; r < rowEnd.length; r++) {
      let a0 = 0,
        b0 = 0,
        a1 = 0,
        b1 = 0,
        a2 = 0,
        b2 = 0,
        a3 = 0,
        b3 = 0;
      for (const end = rowEnd[r]; m < end; m++) {
        const i = tx[m],
          ar = now[m * 2],
          ai = now[m * 2 + 1];
        let xr = X[i],
          xi = X[i + 1];
        a0 += ar * xr - ai * xi;
        b0 += ar * xi + ai * xr;
        xr = X[i + 2];
        xi = X[i + 3];
        a1 += ar * xr - ai * xi;
        b1 += ar * xi + ai * xr;
        xr = X[i + 4];
        xi = X[i + 5];
        a2 += ar * xr - ai * xi;
        b2 += ar * xi + ai * xr;
        xr = X[i + 6];
        xi = X[i + 7];
        a3 += ar * xr - ai * xi;
        b3 += ar * xi + ai * xr;
      }
      const k = tz[r];
      h0 += a0 * Z[k] - b0 * Z[k + 1];
      h1 += a1 * Z[k + 2] - b1 * Z[k + 3];
      h2 += a2 * Z[k + 4] - b2 * Z[k + 5];
      h3 += a3 * Z[k + 6] - b3 * Z[k + 7];
    }
    heights[0] = 2 * h0;
    heights[1] = 2 * h1;
    heights[2] = 2 * h2;
    heights[3] = 2 * h3;
  };

  return { at, place, one, four, moved, heights };
}
