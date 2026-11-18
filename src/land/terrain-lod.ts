// Which patches of ground are drawn, and how finely: continuous distance-dependent level of detail (CDLOD, Strugar
// 2009) on a quadtree over each of the cube's six faces (world/sphere.ts FACES, equi-angular), laid on the sphere.
//
// Every patch is the same grid of P × P quads (terrain-mesh.ts draws them all as instances of one mesh, in one call);
// a node of level L is 2^L to a face's side, so its quads are half its parent's. A node is split while any of it lies
// within its children's range (RANGE times their size) of the eye, so the ground is finest about the eye and coarser by
// halves with distance. Nothing pops: within a level's range, from MORPH of the way out to its end, each patch's odd
// vertices slide onto its even ones (in the vertex shader, by the vertex's own distance from the eye), so by the end of
// its range a patch is its parent's grid exactly, and where it meets a coarser patch the two edges agree. That holds
// when, where a coarser patch meets a finer one, the finer has finished its morph and the coarser not begun its own,
// which RANGE and MORPH are chosen for. The coarser node wasn't split, so it lies wholly past its children's range r:
// the finer patch's morph has ended there. The finer's parent was split, so it reaches no further than r + its own
// diameter (about 2.8 of a child's size), and that must fall short of where the coarser's morph begins, MORPH × 2r:
// so RANGE ≥ 2.8 / (2 MORPH − 1), 5.6 (tests/terrain-lod.test.ts checks both with the real bounds).
// Where two faces meet, their grids' odd vertices slide opposite ways along the shared edge; the few centimetres that
// opens mid-morph are hidden by each patch's skirt.
//
// Patches wholly behind the horizon (for ground as high as theirs) or outside the view are left out, by their bounds:
// a sphere round each node's patch at its lowest and highest ground (world/terrain.ts heightBounds).
//
// Pure arithmetic: no three, so it runs in node for the tests.

import { FACES, R, horizonDip, type Vec3 } from '../world/sphere.ts';

export const LOD = {
  /** Quads along a patch's side (a power of two). */
  P: 16,
  /** The finest level: 2^LEAF nodes to a face's side (64: 13.6 m nodes, 0.85 m quads). */
  LEAF: 6,
  /** A level's range, in its nodes' sizes; and how far through it its patches begin to morph into their parent's. */
  RANGE: 10, MORPH: 0.75,
} as const;

/** Each patch's floats, as terrain-mesh.ts's instances hold them: its corner (u, v) and size on its face, its skirt's
 *  depth (metres), its morph's start and end (metres from the eye), and its face's axes (across, u, v). */
export const STRIDE = 15;

/** A face's side, metres (equi-angular: about the same everywhere on it). */
const SIDE = (R * Math.PI) / 2;
/** A node's size, metres, at each level; and its range. */
const size = (level: number) => SIDE / 2 ** level;
const range = (level: number) => LOD.RANGE * size(level);

/** The unit vector at (u, v), −1…1, on a face: sphere.ts faceDir, inlined. */
function dirOf(face: number, u: number, v: number, out: number[]): void {
  const f = FACES[face], gu = Math.tan((u * Math.PI) / 4), gv = Math.tan((v * Math.PI) / 4);
  out[0] = out[1] = out[2] = 0;
  out[f.across[0]] += f.across[1];
  out[f.u[0]] += f.u[1] * gu;
  out[f.v[0]] += f.v[1] * gv;
  const l = Math.hypot(out[0], out[1], out[2]);
  out[0] /= l; out[1] /= l; out[2] /= l;
}

/** The eye, as the selection needs it: where it is (world metres) and how high over the sea. */
export interface LodEye { position: Vec3; height: number }
/** Whether a sphere (centre x, y, z and radius, world metres) can be in view. */
export type InView = (x: number, y: number, z: number, radius: number) => boolean;

/**
 * The quadtree over `bounds`, the ground's lowest and highest over each leaf node (6 × 2^LEAF × 2^LEAF, row by row,
 * face by face). select() writes the patches to draw for an eye, STRIDE floats each, into `out`, and returns how many.
 */
export function createLod(bounds: { lo: Float32Array; hi: Float32Array }) {
  // each level's nodes' bounds, coarser from finer, and their spheres
  const levels = Array.from({ length: LOD.LEAF + 1 }, (_, L) => {
    const n = 2 ** L;
    return { n, lo: new Float32Array(6 * n * n), hi: new Float32Array(6 * n * n), sphere: new Float32Array(6 * n * n * 4), dir: new Float32Array(6 * n * n * 3) };
  });
  levels[LOD.LEAF].lo.set(bounds.lo);
  levels[LOD.LEAF].hi.set(bounds.hi);
  for (let L = LOD.LEAF - 1; L >= 0; L--) {
    const a = levels[L], b = levels[L + 1];
    for (let f = 0; f < 6; f++) for (let j = 0; j < a.n; j++) for (let i = 0; i < a.n; i++) {
      let lo = Infinity, hi = -Infinity;
      for (let q = 0; q < 4; q++) {
        const k = (f * b.n + 2 * j + (q >> 1)) * b.n + 2 * i + (q & 1);
        lo = Math.min(lo, b.lo[k]);
        hi = Math.max(hi, b.hi[k]);
      }
      a.lo[(f * a.n + j) * a.n + i] = lo;
      a.hi[(f * a.n + j) * a.n + i] = hi;
    }
  }
  // a sphere round each node's patch: about its middle at its middle height, out to the farthest of nine points on
  // its edges and middle at its lowest and highest, and at sea level (where the shader measures the morph from, so a
  // node's nearest is never further than any of its vertices is for the morph)
  const d: number[] = [0, 0, 0];
  for (const { n, lo, hi, sphere, dir } of levels) {
    for (let f = 0; f < 6; f++) for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const k = (f * n + j) * n + i, s = 2 / n, u0 = -1 + i * s, v0 = -1 + j * s;
      const low = R + Math.min(lo[k], 0), high = R + Math.max(hi[k], 0), mid = (low + high) / 2;
      dirOf(f, u0 + s / 2, v0 + s / 2, d);
      const cx = d[0] * mid, cy = d[1] * mid, cz = d[2] * mid;
      dir.set(d, 3 * k);
      let r = 0;
      for (let b = 0; b <= 2; b++) for (let a = 0; a <= 2; a++) {
        dirOf(f, u0 + (a * s) / 2, v0 + (b * s) / 2, d);
        for (const h of [low, high]) r = Math.max(r, Math.hypot(d[0] * h - cx, d[1] * h - cy, d[2] * h - cz));
      }
      sphere.set([cx, cy, cz, r], 4 * k);
    }
  }

  return {
    /** The patches to draw for `eye`, those `inView` can see, into `out`; how many (no more than fit). */
    select(eye: LodEye, inView: InView, out: Float32Array): number {
      const [ex, ey, ez] = eye.position, el = Math.hypot(ex, ey, ez), dip = horizonDip(eye.height);
      const max = Math.floor(out.length / STRIDE);
      let count = 0;
      const visit = (L: number, f: number, i: number, j: number) => {
        if (count >= max) return;
        const { n, hi, sphere, dir } = levels[L], k = (f * n + j) * n + i;
        const cx = sphere[4 * k], cy = sphere[4 * k + 1], cz = sphere[4 * k + 2], r = sphere[4 * k + 3];
        // behind the horizon: further round the planet from under the eye than the eye sees ground as high as its
        const round = Math.acos(Math.min(1, (ex * dir[3 * k] + ey * dir[3 * k + 1] + ez * dir[3 * k + 2]) / el));
        if (round - r / R > dip + horizonDip(Math.max(hi[k], 0))) return;
        if (!inView(cx, cy, cz, r)) return;
        const near = Math.hypot(cx - ex, cy - ey, cz - ez) - r;
        if (L < LOD.LEAF && near < range(L + 1)) {
          for (let q = 0; q < 4; q++) visit(L + 1, f, 2 * i + (q & 1), 2 * j + (q >> 1));
          return;
        }
        const s = 2 / n, o = count++ * STRIDE, face = FACES[f], quad = size(L) / LOD.P;
        out[o] = -1 + i * s;
        out[o + 1] = -1 + j * s;
        out[o + 2] = s;
        out[o + 3] = 0.5 + 0.1 * quad;
        out[o + 4] = LOD.MORPH * range(L);
        out[o + 5] = range(L);
        for (const [m, axis] of [face.across, face.u, face.v].entries()) {
          out[o + 6 + 3 * m] = out[o + 7 + 3 * m] = out[o + 8 + 3 * m] = 0;
          out[o + 6 + 3 * m + axis[0]] = axis[1];
        }
      };
      for (let f = 0; f < 6; f++) visit(0, f, 0, 0);
      return count;
    },
  };
}
