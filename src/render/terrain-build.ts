// Builds one terrain chunk of the cube-sphere from the world's heights. Pure: it runs in the terrain workers, or on
// the main thread when workers are missing. A chunk is a quadtree node on one cube face: an (N+1)² grid of vertices
// in the face's equal-angle coordinates, lifted to the ground's height, plus a skirt hanging down from each edge to
// hide the cracks between neighbouring levels of detail.
import { faceDir } from '../sim/sphere.ts';
import { R } from '../sim/sphere.ts';
import { heightAt, regionMix, REGION_COUNT, type RegionMix } from '../sim/world/index.ts';
import { v3 } from '../sim/math.ts';

/** Quads along a chunk's side. */
export const CHUNK_N = 32;

export interface ChunkRequest { id: number; face: number; level: number; i: number; j: number }

export interface ChunkData {
  id: number;
  /** The chunk's centre on the sea-level sphere; positions are relative to it. */
  centre: [number, number, number];
  /** (N+1)² grid vertices, then 4 × (N+1) skirt vertices (bottom, top, left and right edges). */
  position: Float32Array;
  normal: Float32Array;
  /** The world's region blend at each vertex, one byte per region (REGION_COUNT, padded to 16). */
  weights: Uint8Array;
  minH: number;
  maxH: number;
}

export const WEIGHTS = 16;

/** Vertices in a chunk, skirts included. */
export const chunkVertices = (n = CHUNK_N) => (n + 1) * (n + 1) + 4 * (n + 1);

export function buildChunk(req: ChunkRequest, n = CHUNK_N): ChunkData {
  const { face, level, i, j } = req;
  const side = 2 / (1 << level), u0 = -1 + i * side, v0 = -1 + j * side;
  const W = n + 3; // the grid with a ring of extra samples for normals
  const px = new Float64Array(W * W), py = new Float64Array(W * W), pz = new Float64Array(W * W), hs = new Float64Array(W * W);
  const d = v3();
  for (let b = 0; b < W; b++) for (let a = 0; a < W; a++) {
    faceDir(face, u0 + ((a - 1) / n) * side, v0 + ((b - 1) / n) * side, d);
    const h = heightAt(d), r = R + h, k = b * W + a;
    px[k] = d.x * r; py[k] = d.y * r; pz[k] = d.z * r; hs[k] = h;
  }
  faceDir(face, u0 + side / 2, v0 + side / 2, d);
  const cx = d.x * R, cy = d.y * R, cz = d.z * R;
  const verts = chunkVertices(n), grid = (n + 1) * (n + 1);
  const position = new Float32Array(verts * 3), normal = new Float32Array(verts * 3), weights = new Uint8Array(verts * WEIGHTS);
  let minH = Infinity, maxH = -Infinity;
  const mix: RegionMix = { a: 0, b: 0, t: 0 };
  for (let b = 0; b <= n; b++) for (let a = 0; a <= n; a++) {
    const k = (b + 1) * W + (a + 1), o = b * (n + 1) + a;
    position[o * 3] = px[k] - cx; position[o * 3 + 1] = py[k] - cy; position[o * 3 + 2] = pz[k] - cz;
    // the normal from the neighbours either side, turned outward
    const ex = px[k + 1] - px[k - 1], ey = py[k + 1] - py[k - 1], ez = pz[k + 1] - pz[k - 1];
    const fx = px[k + W] - px[k - W], fy = py[k + W] - py[k - W], fz = pz[k + W] - pz[k - W];
    let nx = ey * fz - ez * fy, ny = ez * fx - ex * fz, nz = ex * fy - ey * fx;
    if (nx * px[k] + ny * py[k] + nz * pz[k] < 0) { nx = -nx; ny = -ny; nz = -nz; }
    const l = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
    normal[o * 3] = nx / l; normal[o * 3 + 1] = ny / l; normal[o * 3 + 2] = nz / l;
    const h = hs[k];
    if (h < minH) minH = h;
    if (h > maxH) maxH = h;
    const r = Math.sqrt(px[k] * px[k] + py[k] * py[k] + pz[k] * pz[k]);
    d.x = px[k] / r; d.y = py[k] / r; d.z = pz[k] / r;
    regionMix(d, mix);
    const wa = Math.round((1 - mix.t) * 255);
    weights[o * WEIGHTS + mix.a] += wa;
    if (mix.b < REGION_COUNT) weights[o * WEIGHTS + mix.b] += 255 - wa;
  }
  // skirts: each edge vertex again, dropped toward the centre
  const drop = Math.max(2, (side * Math.PI * R) / 4 / n * 3);
  const edge = (s: number, o: number) => {
    const t = grid + s;
    const x = position[o * 3] + cx, y = position[o * 3 + 1] + cy, z = position[o * 3 + 2] + cz;
    const r = Math.sqrt(x * x + y * y + z * z), k = (r - drop) / r;
    position[t * 3] = x * k - cx; position[t * 3 + 1] = y * k - cy; position[t * 3 + 2] = z * k - cz;
    normal.copyWithin(t * 3, o * 3, o * 3 + 3);
    weights.copyWithin(t * WEIGHTS, o * WEIGHTS, o * WEIGHTS + WEIGHTS);
  };
  for (let a = 0; a <= n; a++) {
    edge(a, a);
    edge(n + 1 + a, n * (n + 1) + a);
    edge(2 * (n + 1) + a, a * (n + 1));
    edge(3 * (n + 1) + a, a * (n + 1) + n);
  }
  return { id: req.id, centre: [cx, cy, cz], position, normal, weights, minH, maxH };
}

/** The triangles of a chunk; `flip` reverses the winding for faces whose coordinates run the other way. */
export function chunkIndex(flip: boolean, n = CHUNK_N): Uint16Array {
  const idx: number[] = [], grid = (n + 1) * (n + 1);
  const tri = (a: number, b: number, c: number) => (flip ? idx.push(a, c, b) : idx.push(a, b, c));
  // a quad with corners a (low u, low v), b (high u), c (high v), d (both)
  const quad = (a: number, b: number, c: number, d: number) => { tri(a, c, b); tri(b, c, d); };
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const a = j * (n + 1) + i;
    quad(a, a + 1, a + n + 1, a + n + 2);
  }
  const bottom = grid, top = grid + n + 1, left = grid + 2 * (n + 1), right = grid + 3 * (n + 1);
  for (let k = 0; k < n; k++) {
    quad(bottom + k, bottom + k + 1, k, k + 1);
    quad(n * (n + 1) + k, n * (n + 1) + k + 1, top + k, top + k + 1);
    quad(left + k, k * (n + 1), left + k + 1, (k + 1) * (n + 1));
    quad(k * (n + 1) + n, right + k, (k + 1) * (n + 1) + n, right + k + 1);
  }
  return new Uint16Array(idx);
}
