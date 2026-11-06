// The coastline as a field over the planet: for every node of the simulation's height grid (sim/world heightAt: six
// equal-angle cube faces of HEIGHT_GRID cells, about 2.3 m), the ground's height there and how far it is to the
// coast at mean tide, metres, positive out over the water and negative inland, out to REACH either way.
//
// The coast is the height grid's zero contour, drawn cell by cell by marching squares (a saddle split by the cell's
// middle), so the field is exact to the contour the ships run aground on. Each segment then marks every node within
// REACH of it, on whichever faces those nodes lie, so the distance runs on across the cube's seams as if they were
// not there. Pure arithmetic over the grid: it runs in a worker (coast-worker.ts) and in node.
import { HEIGHT_GRID } from '../../sim/world/index.ts';

/** How far either side of the coast the field reaches, metres: past it a node only says which side it is on. */
export const REACH = 48;

const N = HEIGHT_GRID, ROW = N + 1, FACE = ROW * ROW;

/** The direction of node (i, j) of `face`, as sim/sphere.ts faceDir, into `out` at `o`. */
function nodeDir(face: number, i: number, j: number, out: Float32Array, o: number): void {
  const gu = Math.tan(((i / N) * 2 - 1) * (Math.PI / 4)), gv = Math.tan(((j / N) * 2 - 1) * (Math.PI / 4));
  let x: number, y: number, z: number;
  switch (face) {
    case 0: x = 1; y = gv; z = -gu; break;
    case 1: x = -1; y = gv; z = gu; break;
    case 2: x = gu; y = 1; z = -gv; break;
    case 3: x = gu; y = -1; z = gv; break;
    case 4: x = gu; y = gv; z = 1; break;
    default: x = -gu; y = gv; z = -1;
  }
  const l = Math.hypot(x, y, z);
  out[o] = x / l;
  out[o + 1] = y / l;
  out[o + 2] = z / l;
}

/** Where direction (x, y, z) falls on `face`'s grid, in nodes, or null if it lies on the far side of the planet. */
function onFace(face: number, x: number, y: number, z: number, out: { i: number; j: number }): boolean {
  let a: number, gu: number, gv: number;
  switch (face) {
    case 0: a = x; gu = -z; gv = y; break;
    case 1: a = -x; gu = z; gv = y; break;
    case 2: a = y; gu = x; gv = -z; break;
    case 3: a = -y; gu = x; gv = z; break;
    case 4: a = z; gu = x; gv = y; break;
    default: a = -z; gu = -x; gv = y;
  }
  // only faces the point lies over or near (within 60° of the face's middle)
  if (a < 0.5) return false;
  out.i = ((Math.atan(gu / a) * (4 / Math.PI) + 1) / 2) * N;
  out.j = ((Math.atan(gv / a) * (4 / Math.PI) + 1) / 2) * N;
  return true;
}

/**
 * The field from a height grid as sim/world bakeHeights returns it: two floats a node, the ground's height and the
 * signed distance to the coast, face by face, row (j) by row, node (i) by node.
 */
export function coastField(heights: Float32Array, R: number): Float32Array {
  if (heights.length !== 6 * FACE) throw new RangeError('coastField: the height grid is the wrong size');
  const dir = new Float32Array(6 * FACE * 3);
  for (let f = 0; f < 6; f++) for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) nodeDir(f, i, j, dir, (f * FACE + j * ROW + i) * 3);

  // ---- the coast's segments, two endpoints in metres each
  let segs = new Float32Array(1 << 16), ns = 0;
  const push = (ax: number, ay: number, az: number, bx: number, by: number, bz: number) => {
    if ((ns + 1) * 6 > segs.length) {
      const grown = new Float32Array(segs.length * 2);
      grown.set(segs);
      segs = grown;
    }
    segs.set([ax, ay, az, bx, by, bz], ns * 6);
    ns++;
  };
  // the point where the contour crosses between nodes a and b, into cross[k]
  const cross = new Float32Array(12);
  const at = (k: number, a: number, b: number) => {
    const ha = heights[a], hb = heights[b], t = ha / (ha - hb);
    for (let c = 0; c < 3; c++) cross[k * 3 + c] = (dir[a * 3 + c] + (dir[b * 3 + c] - dir[a * 3 + c]) * t) * R;
  };
  const seg = (k0: number, k1: number) =>
    push(cross[k0 * 3], cross[k0 * 3 + 1], cross[k0 * 3 + 2], cross[k1 * 3], cross[k1 * 3 + 1], cross[k1 * 3 + 2]);
  for (let f = 0; f < 6; f++) {
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        const a = f * FACE + j * ROW + i, b = a + 1, c = a + ROW + 1, d = a + ROW;
        const la = heights[a] > 0, lb = heights[b] > 0, lc = heights[c] > 0, ld = heights[d] > 0;
        if (la === lb && lb === lc && lc === ld) continue;
        // the crossings round the square, in order: a–b, b–c, c–d, d–a
        const edges: number[] = [];
        if (la !== lb) (at(0, a, b), edges.push(0));
        if (lb !== lc) (at(1, b, c), edges.push(1));
        if (lc !== ld) (at(2, c, d), edges.push(2));
        if (ld !== la) (at(3, d, a), edges.push(3));
        if (edges.length === 2) seg(edges[0], edges[1]);
        else {
          // a saddle: the middle's height says whether the land or the water joins across it
          const mid = heights[a] + heights[b] + heights[c] + heights[d] > 0;
          if (mid === la) (seg(0, 1), seg(2, 3));
          else (seg(0, 3), seg(1, 2));
        }
      }
    }
  }

  // ---- every node within REACH of a segment takes its distance to the nearest
  const dist = new Float32Array(6 * FACE).fill(REACH);
  // the fewest metres a step between nodes covers (the equal-angle cells shrink toward the corners)
  const W = Math.ceil(REACH / (((R * Math.PI) / 2 / N) * 0.7));
  const p = { i: 0, j: 0 };
  for (let s = 0; s < ns; s++) {
    const o = s * 6;
    const ax = segs[o], ay = segs[o + 1], az = segs[o + 2], bx = segs[o + 3], by = segs[o + 4], bz = segs[o + 5];
    const ex = bx - ax, ey = by - ay, ez = bz - az, ee = ex * ex + ey * ey + ez * ez || 1;
    const mx = (ax + bx) / 2, my = (ay + by) / 2, mz = (az + bz) / 2, ml = Math.hypot(mx, my, mz);
    for (let f = 0; f < 6; f++) {
      if (!onFace(f, mx / ml, my / ml, mz / ml, p)) continue;
      const i0 = Math.max(0, Math.floor(p.i) - W), i1 = Math.min(N, Math.ceil(p.i) + W);
      const j0 = Math.max(0, Math.floor(p.j) - W), j1 = Math.min(N, Math.ceil(p.j) + W);
      if (i0 > i1 || j0 > j1) continue;
      for (let j = j0; j <= j1; j++) {
        for (let i = i0; i <= i1; i++) {
          const n = f * FACE + j * ROW + i, q = n * 3;
          const px = dir[q] * R - ax, py = dir[q + 1] * R - ay, pz = dir[q + 2] * R - az;
          const t = Math.min(1, Math.max(0, (px * ex + py * ey + pz * ez) / ee));
          const dx = px - ex * t, dy = py - ey * t, dz = pz - ez * t;
          const d2 = dx * dx + dy * dy + dz * dz;
          if (d2 < dist[n] * dist[n]) dist[n] = Math.sqrt(d2);
        }
      }
    }
  }

  const out = new Float32Array(6 * FACE * 2);
  for (let n = 0; n < 6 * FACE; n++) {
    out[n * 2] = heights[n];
    out[n * 2 + 1] = heights[n] > 0 ? -dist[n] : dist[n];
  }
  return out;
}

/** Nodes along each face's side, for the texture that holds the field. */
export const COAST_NODES = ROW;
