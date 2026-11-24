import {
  FACES,
  R,
  faceDir,
  horizonDip,
  type Vec3,
} from '../../world/sphere.ts';

export const LOD = { P: 16, LEAF: 6, RANGE: 10, MORPH: 0.75 } as const;

export const STRIDE = 15;

const SIDE = (R * Math.PI) / 2;
const size = (level: number) => SIDE / 2 ** level;
const range = (level: number) => LOD.RANGE * size(level);

const AXES = new Float32Array(6 * 9);
FACES.forEach((face, f) =>
  [face.across, face.u, face.v].forEach(
    ([axis, sign], m) => (AXES[9 * f + 3 * m + axis] = sign)
  )
);

export interface LodEye {
  position: Vec3;
  height: number;
}
type InView = (x: number, y: number, z: number, radius: number) => boolean;

export function createLod(bounds: { lo: Float32Array; hi: Float32Array }) {
  const levels = Array.from({ length: LOD.LEAF + 1 }, (_, L) => {
    const n = 2 ** L;
    const nodes = 6 * n * n;
    const lo = new Float32Array(nodes),
      hi = new Float32Array(nodes);
    return {
      n,
      lo,
      hi,
      sphere: new Float32Array(4 * nodes),
      dir: new Float32Array(3 * nodes),
    };
  });
  levels[LOD.LEAF].lo.set(bounds.lo);
  levels[LOD.LEAF].hi.set(bounds.hi);
  for (let L = LOD.LEAF - 1; L >= 0; L--) {
    const a = levels[L],
      b = levels[L + 1];
    for (let f = 0; f < 6; f++)
      for (let j = 0; j < a.n; j++)
        for (let i = 0; i < a.n; i++) {
          let lo = Infinity,
            hi = -Infinity;
          for (let q = 0; q < 4; q++) {
            const k = (f * b.n + 2 * j + (q >> 1)) * b.n + 2 * i + (q & 1);
            lo = Math.min(lo, b.lo[k]);
            hi = Math.max(hi, b.hi[k]);
          }
          a.lo[(f * a.n + j) * a.n + i] = lo;
          a.hi[(f * a.n + j) * a.n + i] = hi;
        }
  }
  for (const { n, lo, hi, sphere, dir } of levels) {
    for (let f = 0; f < 6; f++)
      for (let j = 0; j < n; j++)
        for (let i = 0; i < n; i++) {
          const k = (f * n + j) * n + i,
            s = 2 / n,
            u0 = -1 + i * s,
            v0 = -1 + j * s;
          const low = R + Math.min(lo[k], 0),
            high = R + Math.max(hi[k], 0),
            mid = (low + high) / 2;
          const d = faceDir(f, u0 + s / 2, v0 + s / 2);
          const cx = d[0] * mid,
            cy = d[1] * mid,
            cz = d[2] * mid;
          dir.set(d, 3 * k);
          let r = 0;
          for (let b = 0; b <= 2; b++)
            for (let a = 0; a <= 2; a++) {
              const e = faceDir(f, u0 + (a * s) / 2, v0 + (b * s) / 2);
              for (const h of [low, high])
                r = Math.max(
                  r,
                  Math.hypot(e[0] * h - cx, e[1] * h - cy, e[2] * h - cz)
                );
            }
          sphere.set([cx, cy, cz, r], 4 * k);
        }
  }

  let ex = 0,
    ey = 0,
    ez = 0,
    el = 1,
    dip = 0,
    max = 0,
    count = 0;
  let inView: InView = () => false,
    out: Float32Array = new Float32Array(0);

  function visit(L: number, f: number, i: number, j: number) {
    if (count >= max) return;
    const { n, hi, sphere, dir } = levels[L],
      k = (f * n + j) * n + i;
    const cx = sphere[4 * k],
      cy = sphere[4 * k + 1],
      cz = sphere[4 * k + 2],
      r = sphere[4 * k + 3];
    const round = Math.acos(
      Math.min(
        1,
        (ex * dir[3 * k] + ey * dir[3 * k + 1] + ez * dir[3 * k + 2]) / el
      )
    );
    if (round - r / R > dip + horizonDip(Math.max(hi[k], 0))) return;
    if (!inView(cx, cy, cz, r)) return;
    const near = Math.hypot(cx - ex, cy - ey, cz - ez) - r;
    if (L < LOD.LEAF && near < range(L + 1)) {
      for (let q = 0; q < 4; q++)
        visit(L + 1, f, 2 * i + (q & 1), 2 * j + (q >> 1));
      return;
    }
    const s = 2 / n,
      o = count++ * STRIDE,
      quad = size(L) / LOD.P;
    out[o] = -1 + i * s;
    out[o + 1] = -1 + j * s;
    out[o + 2] = s;
    out[o + 3] = 0.5 + 0.1 * quad;
    out[o + 4] = LOD.MORPH * range(L);
    out[o + 5] = range(L);
    for (let m = 0; m < 9; m++) out[o + 6 + m] = AXES[9 * f + m];
  }

  return {
    select(eye: LodEye, seen: InView, into: Float32Array): number {
      ex = eye.position[0];
      ey = eye.position[1];
      ez = eye.position[2];
      el = Math.hypot(ex, ey, ez);
      dip = horizonDip(eye.height);
      inView = seen;
      out = into;
      max = Math.floor(into.length / STRIDE);
      count = 0;
      for (let f = 0; f < 6; f++) visit(0, f, 0, 0);
      return count;
    },
  };
}
