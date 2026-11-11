// PROTOTYPE (archipelago look): a scatter of tropical islands, generated whole from a seed. Throwaway code that
// answers "can a light, airy archipelago (turquoise shallows, sand, granite, palms) reach the north star's look on this
// sea, cheaply enough to leave room for the battle royale?". Pure TypeScript, no DOM, so it runs in a worker.
//
// Each island is its own shape: an ellipse of its own size, stretch and turn, its coast warped by noise and bitten
// into coves, rising from a beach to hills (the big ones), dunes (the middling) or nothing (sand cays); granite where
// the noise says so. Round each is a shallow shelf (the lagoon) ending at a reef crest, then a drop to the deep.
// Islands near each other are joined by sandbars. The bed is coloured (white sand, seagrass, coral) for the sea to
// show through its water; the land is coloured for the renderer. The land is cut into 128 m tiles, each meshed at four
// spacings with skirts, only where there is land.
//
// The patch is a square in the plane round the ship's start: x along her first heading, y to port.

export interface LandMaps {
  /** Side of the patch, metres; texels a side of the height, and of the colour and material maps. */
  size: number;
  n: number;
  cn: number;
  /** Height over the sea, metres (negative under it), n² texels. */
  height: Float32Array;
  /** Albedo (sRGB) of the land (wet sand under the sea, so its mips never blur the bright bed into it); cn² texels. */
  colour: Uint8Array;
  /** Albedo (sRGB) of the bed under the sea; cn² texels. */
  bed: Uint8Array;
  /** Dry sand, wet sand, rock and green cover for the near detail; cn² texels. */
  material: Uint8Array;
  /** The land's tiles: origin (x, y) and, at each spacing, the vertices (x, y, skirt) and triangles. */
  tiles: Tile[];
  /** Coconut palms: x, y, the azimuth they lean toward (radians from +x), seed. */
  palms: Float32Array;
  /** Granite: x, y, size (m), seed, kind (0 boulder, 1 slab). */
  rocks: Float32Array;
  /** Islands: x, y, equivalent radius, hill height. */
  islands: Float32Array;
  timing: Record<string, number>;
}

export interface Tile {
  x: number;
  y: number;
  lods: { pos: Float32Array; index: Uint32Array }[];
}

export const TILE = 128;
export const TILE_SPACING = [2, 4, 8, 16];

// ---------------------------------------------------------------- noise

export function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const GX = [1, -1, 1, -1, 1.41, -1.41, 0, 0], GY = [1, 1, -1, -1, 0, 0, 1.41, -1.41];
const grad = (h: number, dx: number, dy: number) => GX[h & 7] * dx + GY[h & 7] * dy;

class Noise {
  readonly #p = new Uint8Array(512);
  constructor(seed: number) {
    const r = rng(seed);
    const p = Array.from({ length: 256 }, (_, i) => i);
    for (let i = 255; i > 0; i--) {
      const j = Math.floor(r() * (i + 1));
      [p[i], p[j]] = [p[j], p[i]];
    }
    for (let i = 0; i < 512; i++) this.#p[i] = p[i & 255];
  }
  /** Gradient noise, about -1 to 1. */
  at(x: number, y: number): number {
    const p = this.#p;
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const X = xi & 255, Y = yi & 255;
    const u = xf * xf * xf * (xf * (xf * 6 - 15) + 10), v = yf * yf * yf * (yf * (yf * 6 - 15) + 10);
    const aa = p[p[X] + Y], ab = p[p[X] + Y + 1], ba = p[p[X + 1] + Y], bb = p[p[X + 1] + Y + 1];
    const gaa = grad(aa, xf, yf), gab = grad(ab, xf, yf - 1);
    const x1 = gaa + u * (grad(ba, xf - 1, yf) - gaa);
    const x2 = gab + u * (grad(bb, xf - 1, yf - 1) - gab);
    return x1 + v * (x2 - x1);
  }
  fbm(x: number, y: number, octaves: number, gain = 0.5): number {
    let s = 0, a = 1, f = 1, w = 0;
    for (let o = 0; o < octaves; o++) {
      s += this.at(x * f + o * 17.3, y * f - o * 9.1) * a;
      w += a;
      a *= gain;
      f *= 2.03;
    }
    return s / w;
  }
  ridged(x: number, y: number, octaves: number): number {
    let s = 0, a = 1, f = 1, w = 0, prev = 1;
    for (let o = 0; o < octaves; o++) {
      const r = 1 - Math.abs(this.at(x * f + o * 31.7, y * f + o * 7.7));
      s += r * r * a * prev;
      prev = r;
      w += a;
      a *= 0.5;
      f *= 2.1;
    }
    return s / w;
  }
}

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

// ---------------------------------------------------------------- the islands

interface Island {
  x: number; y: number;
  /** Half-axes (m), turn (rad), equivalent radius. */
  a: number; b: number; turn: number; r: number;
  /** Hill height (m), how much of it is granite (0-1), shelf width (m). */
  hill: number; granite: number; shelf: number;
  /** Lobes: offset (x, y) in the island's frame, scale; the first is the island itself. */
  lobes: [number, number, number][];
  seed: number;
}

/** Sizes drawn from a long tail: a couple of big hilly islands, several middling, many small, some mere cays. */
function placeIslands(seed: number, size: number): Island[] {
  const r = rng(seed * 7 + 3);
  const classes: [number, number, number, number][] = [
    // count, radius from, radius to, hill per radius
    [2, 230, 360, 0.16],
    [5, 90, 170, 0.12],
    [8, 32, 75, 0.08],
    [7, 10, 24, 0.05],
  ];
  const out: Island[] = [];
  const reach = size * 0.5 - 420;
  for (const [count, r0, r1, k] of classes) {
    for (let c = 0; c < count; c++) {
      for (let attempt = 0; attempt < 200; attempt++) {
        const rad = r0 + (r1 - r0) * r() ** 1.5;
        const x = (r() * 2 - 1) * reach, y = (r() * 2 - 1) * reach;
        const shelf = (0.3 * rad + 28) * (0.7 + 0.6 * r());
        // the ship starts at the origin heading +x: keep her water clear, and keep islands apart (some close, for bars)
        if (Math.hypot(x, y) < rad + shelf + 140) continue;
        if (out.some((o) => Math.hypot(o.x - x, o.y - y) < (o.r + rad) * 1.25 + 40)) continue;
        const stretch = 1 + r() * 1.1;
        const big = rad > 200, rocky = r();
        // the bigger islands grow lobes: headlands, a second hill, a hooked spit round a bay
        const lobes: [number, number, number][] = [[0, 0, 1]];
        const extra = rad < 40 ? (r() < 0.3 ? 1 : 0) : 1 + Math.floor(r() * (big ? 4 : 3));
        for (let l = 0; l < extra; l++) {
          const ang = r() * Math.PI * 2, far = 0.55 + 0.4 * r();
          lobes.push([Math.cos(ang) * far, Math.sin(ang) * far, 0.3 + 0.35 * r()]);
        }
        out.push({ lobes,
          x, y, a: rad * Math.sqrt(stretch), b: rad / Math.sqrt(stretch), turn: r() * Math.PI, r: rad,
          hill: rad * k * (0.6 + 0.8 * r()) + (big ? 18 : 0), granite: rad < 26 && rocky < 0.4 ? 1 : rocky * (big ? 0.7 : 0.5), shelf,
          seed: Math.floor(r() * 1e6),
        });
        break;
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------- the patch

export function generate(seed = 7, size = 4096, n = 2048, cn = 1024): LandMaps {
  const timing: Record<string, number> = {};
  let t0 = performance.now();
  const lap = (name: string) => { const t = performance.now(); timing[name] = Math.round(t - t0); t0 = t; };
  const noise = new Noise(seed), detail = new Noise(seed + 101);
  const dx = size / n;
  const at = (i: number) => (i + 0.5) * dx - size / 2;
  const islands = placeIslands(seed, size);

  // the deep, gently rolling, then each island's shelf, reef and land over it (the shallowest wins)
  const h = new Float32Array(n * n), granite = new Float32Array(n * n), shelfOf = new Float32Array(n * n);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) h[y * n + x] = -46 + 8 * noise.fbm(at(x) / 500, at(y) / 500, 3);
  for (const is of islands) {
    const reach = Math.max(is.a, is.b) * 2.4 + is.shelf + 120;
    const x0 = Math.max(0, Math.floor((is.x - reach + size / 2) / dx)), x1 = Math.min(n - 1, Math.ceil((is.x + reach + size / 2) / dx));
    const y0 = Math.max(0, Math.floor((is.y - reach + size / 2) / dx)), y1 = Math.min(n - 1, Math.ceil((is.y + reach + size / 2) / dx));
    const c = Math.cos(is.turn), s = Math.sin(is.turn);
    const wf = 1 / (is.r * 0.8), o = is.seed % 1000;
    const beach = 10 + 0.1 * is.r;
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const px = at(x), py = at(y);
        const lx = px - is.x, ly = py - is.y;
        let u = (lx * c + ly * s) / is.a, v = (-lx * s + ly * c) / is.b;
        // the coast warped at two scales (bays and points, then coves), each lobe of the island its own ellipse
        u += 0.38 * noise.fbm(px * wf + o, py * wf, 3) + 0.08 * detail.fbm(px * wf * 4, py * wf * 4 + o, 2);
        v += 0.38 * noise.fbm(px * wf - o, py * wf + 50, 3) + 0.08 * detail.fbm(px * wf * 4 + 70, py * wf * 4 - o, 2);
        let inside = -1e9;
        for (const [lu, lv, ls] of is.lobes) inside = Math.max(inside, (ls - Math.hypot(u - lu, v - lv)) * is.r);
        inside += Math.min(6, is.r * 0.15) * detail.fbm(px / 30, py / 30, 2);
        let z: number;
        if (inside > 0) {
          // the beach's berm, then the island's own hill: hummocky, steepening inland
          const berm = 1.6 * smooth(0, beach, inside) + 0.25 * detail.fbm(px / 12, py / 12, 2) * smooth(3, beach, inside);
          const rise = Math.pow(smooth(beach * 0.7, is.r * 0.95, inside), 1.35);
          const lumps = 0.65 + 0.45 * noise.fbm(px / (is.r * 0.45) + o, py / (is.r * 0.45), 3);
          const outcrop = is.granite * smooth(0.62, 0.8, detail.ridged(px / 60 + o, py / 60, 3) + 0.05 * rise);
          const crag = outcrop * (detail.ridged(px / 28, py / 28, 3) - 0.4) * Math.min(10, is.hill * 0.4) * smooth(beach, beach * 3, inside);
          z = berm + is.hill * rise * lumps + crag;
          const g = is.granite * smooth(0.7, 0.82, detail.ridged(px / 60 + o, py / 60, 3) + 0.05 * rise) + (is.granite > 0.99 ? 1 : 0);
          if (z > h[y * n + x]) granite[y * n + x] = Math.min(1, g);
        } else {
          // the lagoon over sand, the reef crest at the shelf's edge, then the drop
          const out = -inside, edge = is.shelf * (0.75 + 0.5 * noise.fbm(px / 140 + o, py / 140, 2));
          const lagoon = 0.5 * smooth(0, 8, out) + 2.6 * smooth(0, edge, out) + 0.8 * noise.fbm(px / 50, py / 50, 2) * smooth(5, 30, out);
          const crest = 1.2 * Math.exp(-(((out - edge) / 9) ** 2)) * (0.6 + 0.4 * detail.fbm(px / 20, py / 20, 2));
          const drop = Math.max(0, out - edge) * 0.45;
          z = -Math.max(0.05, lagoon - crest + drop);
          if (z > h[y * n + x]) shelfOf[y * n + x] = clamp01(1 - (out - edge) / 40);
        }
        if (z > h[y * n + x]) h[y * n + x] = z;
      }
    }
  }
  lap('islands');

  // sandbars between near neighbours: a shallow ridge along the gap, sometimes breaking the surface
  const r = rng(seed * 13 + 1);
  for (let i = 0; i < islands.length; i++) {
    for (let j = i + 1; j < islands.length; j++) {
      const A = islands[i], B = islands[j];
      const gap = Math.hypot(A.x - B.x, A.y - B.y) - A.r - B.r;
      if (gap > 420 || r() < 0.35) continue;
      const crest = -0.3 - r() * 1.8, wide = 26 + r() * 30, o = r() * 100;
      const ex = B.x - A.x, ey = B.y - A.y, L2 = ex * ex + ey * ey;
      const pad = wide * 3;
      const x0 = Math.max(0, Math.floor((Math.min(A.x, B.x) - pad + size / 2) / dx)), x1 = Math.min(n - 1, Math.ceil((Math.max(A.x, B.x) + pad + size / 2) / dx));
      const y0 = Math.max(0, Math.floor((Math.min(A.y, B.y) - pad + size / 2) / dx)), y1 = Math.min(n - 1, Math.ceil((Math.max(A.y, B.y) + pad + size / 2) / dx));
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          const px = at(x), py = at(y);
          const t = clamp01(((px - A.x) * ex + (py - A.y) * ey) / L2);
          // the bar meanders a little and narrows where it dips
          const bend = 40 * noise.fbm(t * 3 + o, o, 2);
          const cx = A.x + ex * t - (ey / Math.sqrt(L2)) * bend, cy = A.y + ey * t + (ex / Math.sqrt(L2)) * bend;
          const d = Math.hypot(px - cx, py - cy);
          const dip = 1.2 * (0.5 + 0.5 * noise.fbm(t * 5 + o * 2, 3, 2));
          const z = crest - dip - 2.2 * smooth(0, wide, d) - Math.max(0, d - wide) * 0.25;
          if (z > h[y * n + x]) {
            h[y * n + x] = z;
            shelfOf[y * n + x] = Math.max(shelfOf[y * n + x], 0.5);
          }
        }
      }
    }
  }
  lap('bars');

  // ---------------- the colour and the materials, at half the height's resolution
  const colour = new Uint8Array(cn * cn * 4), bed = new Uint8Array(cn * cn * 4), material = new Uint8Array(cn * cn * 4);
  const k = n / cn, cdx = size / cn;
  const enc = (c: number) => Math.round(255 * clamp01(c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055));
  const hAt = (x: number, y: number) => h[Math.min(n - 1, Math.max(0, y)) * n + Math.min(n - 1, Math.max(0, x))];
  const veg = new Float32Array(cn * cn);
  for (let y = 0; y < cn; y++) {
    for (let x = 0; x < cn; x++) {
      const i = y * cn + x, hx = x * k, hy = y * k;
      const z = (hAt(hx, hy) + hAt(hx + 1, hy) + hAt(hx, hy + 1) + hAt(hx + 1, hy + 1)) / 4;
      const sx = (hAt(hx + 2, hy) - hAt(hx - 1, hy)) / (3 * dx), sy = (hAt(hx, hy + 2) - hAt(hx, hy - 1)) / (3 * dx);
      const slope = Math.hypot(sx, sy);
      const g = granite[hy * n + hx];
      const px = (x + 0.5) * cdx - size / 2, py = (y + 0.5) * cdx - size / 2;
      const v1 = noise.fbm(px / 70, py / 70, 3), v2 = detail.fbm(px / 18, py / 18, 2);
      let c: number[];
      let dry = 0, wet = 0, rock = 0, green = 0;
      if (z > 0) {
        // sand, darker where the sea wets it; green cover inland in patches; granite where the island has it
        wet = 1 - smooth(0.2, 0.85, z);
        rock = Math.max(g, smooth(1.0, 1.4, slope) * smooth(2, 6, z));
        green = smooth(1.62, 2.0, z + 0.25 * v2) * smooth(-0.5, -0.2, v1 + 0.6 * smooth(3, 8, z)) * (1 - smooth(0.9, 1.3, slope)) * (1 - rock);
        dry = clamp01(1 - wet - rock - green);
        const sandDry = [0.62 + 0.04 * v2, 0.56 + 0.04 * v2, 0.43 + 0.03 * v2], sandWet = [0.36, 0.31, 0.23];
        const grass = [0.12 + 0.03 * v2, 0.17 + 0.03 * v1, 0.045];
        const jungle = [0.05 + 0.015 * v2, 0.11 + 0.025 * v1, 0.035];
        const leafy = mix3(grass, jungle, clamp01(smooth(3.5, 12, z) * (0.75 + 0.5 * v1)));
        const stone = [0.17 + 0.04 * v2, 0.165 + 0.035 * v2, 0.155 + 0.03 * v2];
        c = mix3(sandDry, sandWet, wet);
        c = mix3(c, leafy, green);
        c = mix3(c, stone, rock);
      } else {
        // the bed: white sand, seagrass in the lagoons, coral by the reef crest, duller sand in the deep
        const depth = -z, sh = shelfOf[hy * n + hx];
        const sand = [0.7 + 0.05 * v2, 0.66 + 0.05 * v2, 0.53 + 0.04 * v2];
        const grassBed = [0.06, 0.08, 0.04];
        const coral = mix3([0.42, 0.3, 0.24], [0.16, 0.14, 0.1], clamp01(0.5 + v2 * 1.5));
        const deepSand = [0.4, 0.38, 0.32];
        const seagrass = smooth(0.12, 0.3, noise.fbm(px / 45 + 30, py / 45, 3)) * smooth(1, 2.5, depth) * (1 - smooth(5, 9, depth));
        const reef = sh * smooth(0.18, 0.4, detail.fbm(px / 14, py / 14, 3) + 0.25 * noise.fbm(px / 90, py / 90, 2)) * smooth(1, 2, depth) * (1 - smooth(8, 16, depth));
        c = mix3(sand, deepSand, smooth(6, 25, depth));
        c = mix3(c, grassBed, seagrass);
        c = mix3(c, coral, reef);
        dry = 1;
        if (depth < 0.6) wet = 1, dry = 0;
      }
      const landC = z > 0 ? c : [0.36, 0.31, 0.23];
      colour[i * 4] = enc(landC[0]); colour[i * 4 + 1] = enc(landC[1]); colour[i * 4 + 2] = enc(landC[2]); colour[i * 4 + 3] = 255;
      bed[i * 4] = enc(c[0]); bed[i * 4 + 1] = enc(c[1]); bed[i * 4 + 2] = enc(c[2]); bed[i * 4 + 3] = 255;
      material[i * 4] = Math.round(255 * dry); material[i * 4 + 1] = Math.round(255 * wet);
      material[i * 4 + 2] = Math.round(255 * rock); material[i * 4 + 3] = Math.round(255 * green);
      veg[i] = green;
    }
  }
  lap('maps');

  // ---------------- palms: a fringe behind the beaches, groves inland, leaning toward the sea
  const palms: number[] = [];
  {
    const S = 6.5, cells = Math.floor(size / S);
    for (let cy = 0; cy < cells; cy++) {
      for (let cx = 0; cx < cells; cx++) {
        const px = (cx + 0.1 + 0.8 * r()) * S - size / 2, py = (cy + 0.1 + 0.8 * r()) * S - size / 2;
        const hx = Math.floor((px + size / 2) / dx), hy = Math.floor((py + size / 2) / dx);
        const z = hAt(hx, hy);
        if (z < 1.3) { r(); continue; }
        const ci = Math.min(cn - 1, Math.floor(hy / k)) * cn + Math.min(cn - 1, Math.floor(hx / k));
        const rock = material[ci * 4 + 2] / 255;
        const grove = smooth(-0.3, 0.25, noise.fbm(px / 55 + 7, py / 55, 3));
        const fringe = smooth(1.4, 2.0, z) * (1 - smooth(3.5, 7, z));
        const p = (0.55 * fringe + 0.5 * veg[ci] * (0.5 + 0.5 * smooth(-0.4, 0.2, noise.fbm(px / 40, py / 40 + 9, 2)))) * grove * (1 - rock);
        if (r() > p) continue;
        // downhill is seaward
        const gx = hAt(hx + 3, hy) - hAt(hx - 3, hy), gy = hAt(hx, hy + 3) - hAt(hx, hy - 3);
        const lean = Math.atan2(-gy, -gx) + (r() - 0.5) * 1.4;
        palms.push(px, py, lean, Math.floor(r() * 1e6));
      }
    }
  }
  lap('palms');

  // ---------------- granite: boulders where an island has granite at the shore and on its hills, slabs on the hills
  const rocks: number[] = [];
  {
    const S = 4, cells = Math.floor(size / S);
    for (let cy = 0; cy < cells; cy++) {
      for (let cx = 0; cx < cells; cx++) {
        const px = (cx + r()) * S - size / 2, py = (cy + r()) * S - size / 2;
        const hx = Math.floor((px + size / 2) / dx), hy = Math.floor((py + size / 2) / dx);
        const z = hAt(hx, hy), g = granite[hy * n + hx];
        if (z < -1.2 || g < 0.05) { r(); continue; }
        // near the waterline the granite stands as boulders; up the hills as slabs and tors
        const shore = (1 - smooth(1.2, 3.5, Math.abs(z - 0.6))) * smooth(0.1, 0.4, noise.fbm(px / 25 + 3, py / 25, 2));
        const pick = r();
        if (pick < g * (0.01 + 0.3 * shore)) rocks.push(px, py, 1.2 + 4.5 * r() ** 2 * (0.5 + g), Math.floor(r() * 1e6), 0);
        else if (pick < g * (0.01 + 0.3 * shore) + g * 0.008 * smooth(4, 10, z)) rocks.push(px, py, 7 + 12 * r(), Math.floor(r() * 1e6), 1);
      }
    }
  }
  lap('rocks');

  // ---------------- the land's tiles: at each spacing, the cells with any land, and skirts round the tile's edge
  const tiles: Tile[] = [];
  const hBil = (qx: number, qy: number) => {
    const fx = (qx + size / 2) / dx - 0.5, fy = (qy + size / 2) / dx - 0.5;
    const xi = Math.max(0, Math.min(n - 2, Math.floor(fx))), yi = Math.max(0, Math.min(n - 2, Math.floor(fy)));
    const tx = Math.min(1, Math.max(0, fx - xi)), ty = Math.min(1, Math.max(0, fy - yi)), i = yi * n + xi;
    return (h[i] * (1 - tx) + h[i + 1] * tx) * (1 - ty) + (h[i + n] * (1 - tx) + h[i + n + 1] * tx) * ty;
  };
  const T = size / TILE;
  for (let ty = 0; ty < T; ty++) {
    for (let tx = 0; tx < T; tx++) {
      const ox = tx * TILE - size / 2, oy = ty * TILE - size / 2;
      // is there land here at all (finest look)?
      let any = false;
      for (let y = 0; y <= TILE && !any; y += 2) for (let x = 0; x <= TILE && !any; x += 2) if (hBil(ox + x, oy + y) > -1.6) any = true;
      if (!any) continue;
      const lods = TILE_SPACING.map((s) => tileMesh(ox, oy, s, hBil));
      tiles.push({ x: ox, y: oy, lods });
    }
  }
  lap('tiles');

  return {
    size, n, cn, height: h, colour, bed, material, tiles,
    palms: new Float32Array(palms), rocks: new Float32Array(rocks),
    islands: new Float32Array(islands.flatMap((i) => [i.x, i.y, i.r, i.hill])), timing,
  };
}

const mix3 = (a: number[], b: number[], w: number) => a.map((v, k) => v + (b[k] - v) * w);

/** One tile at one spacing: its cells with any corner above -1.5 m, and a skirt hanging from its edge. */
function tileMesh(ox: number, oy: number, s: number, hAt: (x: number, y: number) => number): { pos: Float32Array; index: Uint32Array } {
  const m = TILE / s;
  const zs = new Float32Array((m + 1) * (m + 1));
  for (let j = 0; j <= m; j++) for (let i = 0; i <= m; i++) zs[j * (m + 1) + i] = hAt(ox + i * s, oy + j * s);
  const keep = new Uint8Array(m * m);
  for (let j = 0; j < m; j++) {
    for (let i = 0; i < m; i++) {
      const a = j * (m + 1) + i;
      if (Math.max(zs[a], zs[a + 1], zs[a + m + 1], zs[a + m + 2]) > -1.5) keep[j * m + i] = 1;
    }
  }
  const pos: number[] = [], idx: number[] = [];
  const map = new Int32Array((m + 1) * (m + 1)).fill(-1);
  const vert = (i: number, j: number) => {
    const a = j * (m + 1) + i;
    if (map[a] < 0) { map[a] = pos.length / 3; pos.push(ox + i * s, oy + j * s, 0); }
    return map[a];
  };
  for (let j = 0; j < m; j++) {
    for (let i = 0; i < m; i++) {
      if (!keep[j * m + i]) continue;
      const a = vert(i, j), b = vert(i + 1, j), c = vert(i, j + 1), d = vert(i + 1, j + 1);
      idx.push(a, b, c, b, d, c);
    }
  }
  // skirts: along the tile's border, a strip hanging down, both faces (seen from inside or out)
  const skirt = (i0: number, j0: number, i1: number, j1: number) => {
    const a = vert(i0, j0), b = vert(i1, j1);
    const a2 = pos.length / 3; pos.push(pos[a * 3], pos[a * 3 + 1], 1);
    const b2 = pos.length / 3; pos.push(pos[b * 3], pos[b * 3 + 1], 1);
    idx.push(a, b, a2, b, b2, a2, a, a2, b, b, a2, b2);
  };
  for (let i = 0; i < m; i++) {
    if (keep[i]) skirt(i, 0, i + 1, 0);
    if (keep[(m - 1) * m + i]) skirt(i, m, i + 1, m);
  }
  for (let j = 0; j < m; j++) {
    if (keep[j * m]) skirt(0, j, 0, j + 1);
    if (keep[j * m + m - 1]) skirt(m, j, m, j + 1);
  }
  return { pos: new Float32Array(pos), index: new Uint32Array(idx) };
}
