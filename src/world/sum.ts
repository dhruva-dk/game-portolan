import { CASCADES, CHOP, LONG, PERIOD } from './cascades.ts';

export const STRIDE = 8;
const BEAT = (2 * Math.PI) / PERIOD;
const POINTS = 4;

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

export function createSums(
  table: Float64Array,
  groups: readonly (readonly number[])[]
) {
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
      const ar = at(m, 4),
        ai = at(m, 5),
        br = at(m, 6),
        bi = at(m, 7);
      amp.set([ar + br, ai - bi, ai + bi, br - ar], i * 4);
      const l = Math.hypot(jx, jy);
      unit.set([jx / l, jy / l], i * 2);
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

  const moved = new Float64Array(2);
  const one = (g: number, move: boolean) => {
    const { tx, rowEnd, tz, now, unit } = made[g];
    let h = 0,
      dx = 0,
      dz = 0,
      m = 0;
    for (let r = 0; r < rowEnd.length; r++) {
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
      dx -= ax * zi + bx * zr;
      dz -= az * zi + bz * zr;
    }
    moved[0] = 2 * dx * CHOP;
    moved[1] = 2 * dz * CHOP;
    return 2 * h;
  };

  const heights = new Float64Array(POINTS);
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
