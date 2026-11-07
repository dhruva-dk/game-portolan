// The shared kit behind flora library D: the Fire Archipelago, the Weeping Isle, the Mangrove Labyrinth and the
// Maelstrom. Every plant is generated here in code: tubes for wood and roots, cards for leaves, ribbons for blades
// and strands, and surfaces for broad leaves. Textures are scans from ambientCG and Poly Haven (see
// CREDITS.md); the leaf atlases are composed from the scanned leaves at load time, in code.
//
// Wind: each vertex carries `aWind` = (bend, flutter, phase): bend is how far it leans at full gale in the plant's
// own metres, flutter is how much it shivers, and phase de-syncs neighbours. The materials are tagged (tag.ts) and
// the planet's flora (nodes.ts) sways them on the GPU, every copy from its own place.
//
// Up is the plant's local +Y. On the sphere, each plant stands with +Y along the planet's radius; the wind is
// projected onto each plant's own horizontal plane, so one world-space wind vector works everywhere.
import * as THREE from 'three';
import { tag } from './tag.ts';

// ---------------------------------------------------------------- the API every region file exports

export type Lod = 0 | 1 | 2;

export interface Placement {
  /** Ground height range, metres above mean sea level (negative is under the sea). */
  minHeight: number;
  maxHeight: number;
  /** Steepest ground it grows on, in degrees from flat. */
  maxSlope: number;
  /** Plants per 100 m² of ground where it grows at all. */
  density: number;
  /** 0 spreads plants evenly; 1 gathers them in tight groves. */
  cluster: number;
}

export interface Plant {
  id: string;
  name: string;
  /** Builds one plant at real size, in metres, standing on its local origin. The same seed gives the same plant. */
  build(seed: number, lod: Lod): THREE.Object3D;
  placement: Placement;
}

/** Distances in metres at which a plant switches to LOD 1 and to LOD 2. */
export const LOD_DISTANCES: readonly [number, number] = [40, 150];

// ---------------------------------------------------------------- small helpers

export const V = (x = 0, y = 0, z = 0): THREE.Vector3 => new THREE.Vector3(x, y, z);
export const lerp = THREE.MathUtils.lerp;
export const clamp = THREE.MathUtils.clamp;
export const TAU = Math.PI * 2;

/** A seeded random stream in [0, 1). */
export function rng(seed: number): () => number {
  let a = (Math.imul(seed | 0, 0x9e3779b1) ^ 0x5bd1e995) | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A value between a and b from the stream. */
export const range = (r: () => number, a: number, b: number): number => a + (b - a) * r();

/** Linearly tapering radii along a path of n points. */
export const taper = (n: number, a: number, b: number, k = 1): number[] =>
  Array.from({ length: n }, (_, i) => a + (b - a) * Math.pow(i / Math.max(1, n - 1), k));

/** A wandering path from `from` along `dir`: `bend` is how much it wanders, `lift` how much it rises or droops per step. */
export function wander(r: () => number, from: THREE.Vector3, dir: THREE.Vector3, len: number, steps: number, bend: number, lift = 0): THREE.Vector3[] {
  const pts = [from.clone()];
  const d = dir.clone().normalize(), p = from.clone();
  for (let i = 1; i <= steps; i++) {
    d.add(V((r() - 0.5) * bend, (r() - 0.5) * bend * 0.6 + lift, (r() - 0.5) * bend)).normalize();
    p.addScaledVector(d, len / steps);
    pts.push(p.clone());
  }
  return pts;
}

/** Points along a quadratic Bézier from a through control c to b. */
export function arc(a: THREE.Vector3, c: THREE.Vector3, b: THREE.Vector3, n: number): THREE.Vector3[] {
  return Array.from({ length: n + 1 }, (_, i) => {
    const t = i / n, s = 1 - t;
    return V(s * s * a.x + 2 * s * t * c.x + t * t * b.x, s * s * a.y + 2 * s * t * c.y + t * t * b.y, s * s * a.z + 2 * s * t * c.z + t * t * b.z);
  });
}

/** Level of detail settings shared by every plant: tube sides, how many cards and how big, and what is left out. */
export interface Detail { lod: Lod; sides: number; cards: number; cardSize: number; fine: boolean; mid: boolean; seg: number }
export function detail(lod: Lod): Detail {
  return [
    { lod: 0 as Lod, sides: 7, cards: 1, cardSize: 1, fine: true, mid: true, seg: 1 },
    { lod: 1 as Lod, sides: 4, cards: 0.42, cardSize: 1.55, fine: false, mid: true, seg: 0.55 },
    { lod: 2 as Lod, sides: 3, cards: 0.13, cardSize: 2.6, fine: false, mid: false, seg: 0.35 },
  ][lod];
}

/** Count of n scaled for the level of detail, never below `min`. */
export const many = (n: number, d: Detail, min = 1): number => Math.max(min, Math.round(n * d.cards));

// ---------------------------------------------------------------- textures

let base = (import.meta.env?.BASE_URL ?? '/') + 'tex/flora/d/';
/** Where the library's textures are served from (defaults to <BASE_URL>tex/flora/d/). */
export function setTextureBase(url: string): void { base = url; }

const pending: Promise<unknown>[] = [];
const images = new Map<string, Promise<HTMLImageElement>>();
const textures = new Map<string, THREE.Texture>();

function image(file: string): Promise<HTMLImageElement> {
  let p = images.get(file);
  if (!p) {
    p = new Promise((ok, fail) => {
      const img = new Image();
      img.onload = () => ok(img);
      img.onerror = () => fail(new Error('flora-d: could not load ' + file));
      img.src = base + file;
    });
    images.set(file, p);
    pending.push(p);
  }
  return p;
}

/** A repeating scanned texture from the library's folder. */
export function texture(file: string, color: boolean): THREE.Texture {
  let t = textures.get(file);
  if (!t) {
    const tex = new THREE.Texture();
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.anisotropy = 4;
    if (color) tex.colorSpace = THREE.SRGBColorSpace;
    image(file).then((img) => { tex.image = img; tex.needsUpdate = true; });
    textures.set(file, tex);
    t = tex;
  }
  return t;
}

/** Resolves once every texture and atlas asked for so far has loaded and been painted. */
export async function floraReady(): Promise<void> {
  for (let n = 0; n !== pending.length;) { n = pending.length; await Promise.all(pending); }
}

// ---------------------------------------------------------------- leaf atlases, composed from scans

/** Where each leaf lies in its scanned sheet: x, y, w, h in pixels of the 1024² image. Leaves point up, stem at the bottom; blades point right. */
export const SHEETS = {
  round: { file: 'leaves_round.png', rects: [[48, 7, 249, 328], [400, 4, 225, 326], [737, 7, 235, 324], [54, 353, 232, 318], [399, 361, 231, 315], [736, 348, 229, 329], [52, 692, 232, 319], [392, 691, 238, 324], [734, 694, 231, 322]] },
  long: { file: 'leaves_long.png', rects: [[106, 34, 185, 432], [417, 39, 187, 436], [762, 56, 166, 408], [70, 547, 189, 440], [423, 551, 179, 435], [733, 537, 191, 437]] },
  broad: { file: 'leaves_broad.png', rects: [[39, 14, 271, 472], [376, 31, 249, 443], [675, 5, 308, 466]] },
  blades: { file: 'grass_blades.png', rects: [[49, 67, 940, 70], [60, 167, 901, 136], [105, 359, 771, 106], [42, 506, 947, 78], [73, 645, 866, 75], [28, 763, 966, 53], [110, 924, 839, 46]] },
} as const;
export type SheetName = keyof typeof SHEETS;

/** u0, v0 (bottom), u1, v1 (top) of an atlas cell. */
export type UvRect = readonly [number, number, number, number];

export interface Tone { sat?: number; mul?: readonly [number, number, number]; add?: readonly [number, number, number] }

/** What a cell painter gets: a context already moved into and clipped to its cell of size s. */
export interface Paint {
  g: CanvasRenderingContext2D;
  s: number;
  r: () => number;
  sheet: Record<SheetName, HTMLImageElement>;
  /** Recolours everything painted in the cell so far. */
  tone(t: Tone): void;
  /** Draws scanned leaf i of a sheet with its stem at (x, y), `len` px long, turned `ang` radians clockwise from up. */
  leaf(name: SheetName, i: number, x: number, y: number, len: number, ang: number, widthK?: number): void;
}

export interface Atlas { texture: THREE.CanvasTexture; uv(cell: number): UvRect; grid: number }

const atlases = new Map<string, Atlas>();

/** A leaf atlas of grid × grid cells, each painted in code by `cells[i]` once the scanned sheets have loaded. */
export function atlas(key: string, grid: number, size: number, cells: readonly ((p: Paint) => void)[]): Atlas {
  const hit = atlases.get(key);
  if (hit) return hit;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  const s = size / grid, pad = 2 / size;
  const a: Atlas = {
    texture, grid,
    uv(cell) {
      const cx = cell % grid, cy = Math.floor(cell / grid);
      return [cx / grid + pad, 1 - (cy + 1) / grid + pad, (cx + 1) / grid - pad, 1 - cy / grid - pad];
    },
  };
  atlases.set(key, a);
  const names = Object.keys(SHEETS) as SheetName[];
  // painted a cell at a time between the frames, since the scans arrive while the game is being played
  const job = (async () => {
    const imgs = await Promise.all(names.map((n) => image(SHEETS[n].file)));
    const sheet = Object.fromEntries(names.map((n, i) => [n, imgs[i]])) as Record<SheetName, HTMLImageElement>;
    const g = canvas.getContext('2d', { willReadFrequently: true })!;
    for (const [i, paint] of cells.entries()) {
      await breathe();
      const x0 = (i % grid) * s, y0 = Math.floor(i / grid) * s;
      g.save();
      g.translate(x0, y0);
      g.beginPath(); g.rect(0, 0, s, s); g.clip();
      const p: Paint = {
        g, s, r: rng(i * 7919 + key.length * 31 + 1), sheet,
        tone: (t) => toneRect(g, x0, y0, s, t),
        leaf(name, k, x, y, len, ang, widthK = 1) {
          const rects = SHEETS[name].rects, [rx, ry, rw, rh] = rects[k % rects.length];
          g.save(); g.translate(x, y); g.rotate(ang);
          if (name === 'blades') {
            g.rotate(-Math.PI / 2);
            const h = len * (rh / rw) * widthK;
            g.drawImage(sheet[name], rx, ry, rw, rh, 0, -h / 2, len, h);
          } else {
            const k2 = len / rh, w = rw * k2 * widthK;
            g.drawImage(sheet[name], rx, ry, rw, rh, -w / 2, -len, w, len);
          }
          g.restore();
        },
      };
      paint(p);
      g.restore();
    }
    await breathe();
    // the transparent texels keep their leaves' colour, so mipmaps don't fringe the cards in a dark halo
    bleed(g, size);
    texture.needsUpdate = true;
  })();
  pending.push(job);
  return a;
}

function toneRect(g: CanvasRenderingContext2D, x: number, y: number, s: number, t: Tone): void {
  const img = g.getImageData(x, y, s, s), d = img.data;
  const sat = t.sat ?? 1, [mr, mg, mb] = t.mul ?? [1, 1, 1], [ar, ag, ab] = t.add ?? [0, 0, 0];
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] === 0) continue;
    const r = d[i], gg = d[i + 1], b = d[i + 2], l = 0.3 * r + 0.59 * gg + 0.11 * b;
    d[i] = (l + (r - l) * sat) * mr + ar * 255;
    d[i + 1] = (l + (gg - l) * sat) * mg + ag * 255;
    d[i + 2] = (l + (b - l) * sat) * mb + ab * 255;
  }
  g.putImageData(img, x, y);
}

/** Spreads opaque colour into the clear texels around it (a few passes), keeping alpha. Written without allocating:
 *  a 1024² atlas, a neighbour list made for every texel of every pass, held the page for 2 s on the iPad. */
function bleed(g: CanvasRenderingContext2D, size: number): void {
  const img = g.getImageData(0, 0, size, size), d = img.data;
  let filled = new Uint8Array(size * size), next = new Uint8Array(size * size);
  for (let i = 0; i < size * size; i++) filled[i] = d[i * 4 + 3] > 8 ? 1 : 0;
  for (let pass = 0; pass < 4; pass++) {
    next.set(filled);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const i = y * size + x;
      if (filled[i]) continue;
      let r = 0, gg = 0, b = 0, n = 0;
      if (x + 1 < size && filled[i + 1]) { const j = (i + 1) * 4; r += d[j]; gg += d[j + 1]; b += d[j + 2]; n++; }
      if (x > 0 && filled[i - 1]) { const j = (i - 1) * 4; r += d[j]; gg += d[j + 1]; b += d[j + 2]; n++; }
      if (y + 1 < size && filled[i + size]) { const j = (i + size) * 4; r += d[j]; gg += d[j + 1]; b += d[j + 2]; n++; }
      if (y > 0 && filled[i - size]) { const j = (i - size) * 4; r += d[j]; gg += d[j + 1]; b += d[j + 2]; n++; }
      if (n) { d[i * 4] = r / n; d[i * 4 + 1] = gg / n; d[i * 4 + 2] = b / n; next[i] = 1; }
    }
    [filled, next] = [next, filled];
  }
  g.putImageData(img, 0, 0);
}

const breathe = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

// ---------------------------------------------------------------- shared painters

/** A point on a painted twig: x, y, the twig's heading there (radians clockwise from up), and whether it is a tip. */
export type TwigPoint = readonly [number, number, number, boolean];

/** Bare twigs from the bottom centre of the cell. Returns points along them and their tips, for leaves to hang on. */
export function twigs(p: Paint, n: number, color: string, width: number, spread = 1.1, reach = 0.8): TwigPoint[] {
  const { g, s, r } = p, pts: TwigPoint[] = [];
  g.strokeStyle = color; g.lineCap = 'round';
  const grow = (x: number, y: number, a: number, l: number, w: number, depth: number) => {
    const x2 = x + Math.sin(a) * l, y2 = y - Math.cos(a) * l;
    g.lineWidth = w;
    g.beginPath(); g.moveTo(x, y);
    g.quadraticCurveTo(x + Math.sin(a + (r() - 0.5) * 0.6) * l * 0.5, y - Math.cos(a) * l * 0.5, x2, y2);
    g.stroke();
    for (const t of [0.45, 0.8]) pts.push([x + (x2 - x) * t, y + (y2 - y) * t, a, false]);
    if (depth === 0) { pts.push([x2, y2, a, true]); return; }
    const k = 1 + Math.floor(r() * 2);
    for (let i = 0; i <= k; i++) grow(x2, y2, a + (r() - 0.5) * spread, l * (0.55 + r() * 0.2), w * 0.65, depth - 1);
  };
  for (let i = 0; i < n; i++) grow(s * 0.5, s * 0.98, (r() - 0.5) * spread * 0.8, s * reach * 0.38, width, 2);
  return pts;
}

/** Hanging strands from the top edge: a beard of moss. */
export function beard(p: Paint, n: number, hue: number, sat: number, light: number): void {
  const { g, s, r } = p;
  for (let i = 0; i < n; i++) {
    const x0 = s * (0.15 + r() * 0.7), len = s * (0.35 + r() * 0.62) * (1 - Math.abs(x0 / s - 0.5) * 0.9);
    let x = x0, y = 0;
    g.lineWidth = 0.8 + r() * 1.8;
    g.strokeStyle = `hsla(${hue + (r() - 0.5) * 16},${sat + (r() - 0.5) * 14}%,${light + (r() - 0.5) * 18}%,${0.75 + r() * 0.25})`;
    g.beginPath(); g.moveTo(x, y);
    const steps = 12, ph = r() * TAU, amp = 2 + r() * 5;
    for (let k = 1; k <= steps; k++) {
      y = (len * k) / steps;
      x = x0 + Math.sin(ph + k * 0.9) * amp + (r() - 0.5) * 3;
      g.lineTo(x, y);
      if (r() < 0.12) { g.moveTo(x, y); g.lineTo(x + (r() - 0.5) * 18, y + 6 + r() * 12); g.moveTo(x, y); }
    }
    g.stroke();
  }
}

// ---------------------------------------------------------------- geometry

export type Col = readonly [number, number, number];
/** bend (metres at full gale), flutter (0..1), phase (0..1). */
export type Wind = readonly [number, number, number];

export interface TubeOpts {
  sides: number;
  /** Metres of bark per texture repeat. */
  texM?: number;
  col?: Col | ((i: number) => Col);
  wind: (p: THREE.Vector3, i: number) => Wind;
  /** Moss cover (0..1) for each ring and the ring's outward normal. */
  moss?: (i: number, n: THREE.Vector3) => number;
  /** Gnarl: how much each ring bulges, as a fraction of its radius. */
  gnarl?: number;
  /** Close the end with a cone tip. */
  tip?: boolean;
}

export interface CardOpts {
  /** Which edge sits at the anchor point. */
  anchor?: 'bottom' | 'centre' | 'top';
  /** Bend normals out from this point, so a crown shades as one mass. */
  crown?: THREE.Vector3;
  col?: Col;
  /** Wind at the anchor edge. */
  wind: Wind;
  /** Extra bend at the free edge (metres at full gale). */
  tip?: number;
  /** Fold the card along its centre line, so it has some depth from the side (fraction of width). */
  fold?: number;
}

/** Accumulates the vertices of one part of a plant: wood, leaves or blades. */
export class Geo {
  private p: number[] = [];
  private n: number[] = [];
  private t: number[] = [];
  private c: number[] = [];
  private w: number[] = [];
  private m: number[] = [];
  private idx: number[] = [];

  get vertices(): number { return this.p.length / 3; }
  get triangles(): number { return this.idx.length / 3; }

  vert(p: THREE.Vector3, n: THREE.Vector3, u: number, v: number, col: Col, wind: Wind, moss = 0): number {
    this.p.push(p.x, p.y, p.z);
    this.n.push(n.x, n.y, n.z);
    this.t.push(u, v);
    this.c.push(col[0], col[1], col[2]);
    this.w.push(wind[0], wind[1], wind[2]);
    this.m.push(moss);
    return this.p.length / 3 - 1;
  }

  tri(a: number, b: number, c: number): void { this.idx.push(a, b, c); }
  quad(a: number, b: number, c: number, d: number): void { this.idx.push(a, b, c, a, c, d); }

  /** A generalised cylinder along a path, its frame carried along by parallel transport. */
  tube(path: readonly THREE.Vector3[], radii: readonly number[], o: TubeOpts): void {
    const sides = o.sides, texM = o.texM ?? 1.2;
    const base = this.vertices;
    let normal = V(1, 0, 0);
    const reps = Math.max(1, Math.round((TAU * radii[0]) / texM));
    let len = 0;
    const gn = o.gnarl ?? 0, gph = path[0].x * 3.1 + path[0].z * 1.7;
    for (let i = 0; i < path.length; i++) {
      const t = (i < path.length - 1 ? path[i + 1].clone().sub(path[i]) : path[i].clone().sub(path[i - 1])).normalize();
      normal.sub(t.clone().multiplyScalar(normal.dot(t)));
      if (normal.lengthSq() < 1e-6) normal = Math.abs(t.y) < 0.9 ? V(0, 1, 0).cross(t) : V(1, 0, 0).cross(t);
      normal.normalize();
      const bin = t.clone().cross(normal);
      if (i > 0) len += path[i].distanceTo(path[i - 1]);
      const col = typeof o.col === 'function' ? o.col(i) : o.col ?? [1, 1, 1];
      const wind = o.wind(path[i], i);
      for (let s = 0; s <= sides; s++) {
        const a = (s / sides) * TAU;
        const nn = normal.clone().multiplyScalar(Math.cos(a)).addScaledVector(bin, Math.sin(a));
        const bump = gn ? 1 + gn * (Math.sin(a * 2 + i * 1.3 + gph) * 0.6 + Math.sin(a * 5 - i * 0.7) * 0.4) : 1;
        this.vert(path[i].clone().addScaledVector(nn, radii[i] * bump), nn, (s / sides) * reps, len / texM, col, wind, o.moss ? o.moss(i, nn) : 0);
      }
    }
    for (let i = 0; i < path.length - 1; i++) for (let s = 0; s < sides; s++) {
      const a = base + i * (sides + 1) + s, b = a + 1, c = a + sides + 1, d = c + 1;
      this.idx.push(a, c, b, b, c, d);
    }
    if (o.tip) {
      const last = path[path.length - 1], prev = path[path.length - 2];
      const dir = last.clone().sub(prev).normalize();
      const col = typeof o.col === 'function' ? o.col(path.length - 1) : o.col ?? [1, 1, 1];
      const apex = this.vert(last.clone().addScaledVector(dir, radii[radii.length - 1] * 2), dir, 0.5, len / texM + 0.1, col, o.wind(last, path.length - 1));
      const ring = base + (path.length - 1) * (sides + 1);
      for (let s = 0; s < sides; s++) this.idx.push(ring + s, apex, ring + s + 1);
    }
  }

  /** A leaf card: a quad textured with an atlas cell. `right` and `up` span it; the anchor edge sits at `at`. */
  card(at: THREE.Vector3, right: THREE.Vector3, up: THREE.Vector3, w: number, h: number, uv: UvRect, o: CardOpts): void {
    const [u0, v0, u1, v1] = uv;
    const face = right.clone().cross(up).normalize();
    const y0 = o.anchor === 'top' ? -1 : o.anchor === 'centre' ? -0.5 : 0;
    const col = o.col ?? [1, 1, 1], fold = o.fold ?? 0;
    const cols = fold > 0 ? 3 : 2;
    const ids: number[][] = [];
    for (let row = 0; row < 2; row++) {
      ids.push([]);
      for (let k = 0; k < cols; k++) {
        const x = k / (cols - 1) - 0.5, y = y0 + row;
        const p = at.clone().addScaledVector(right, x * w).addScaledVector(up, y * h);
        if (fold > 0 && k === 1) p.addScaledVector(face, fold * w);
        let n = face.clone();
        if (o.crown) n = p.clone().sub(o.crown).normalize().multiplyScalar(0.75).addScaledVector(face, 0.25).normalize();
        // the free edge is the one away from the anchor
        const free = o.anchor === 'top' ? 1 - row : o.anchor === 'centre' ? Math.abs(y) * 2 : row;
        const wind: Wind = [o.wind[0] + (o.tip ?? 0) * free, Math.min(1, o.wind[1] + 0.35 * free), o.wind[2]];
        ids[row].push(this.vert(p, n, lerp(u0, u1, k / (cols - 1)), lerp(v0, v1, row), col, wind));
      }
    }
    for (let k = 0; k < cols - 1; k++) this.quad(ids[0][k], ids[0][k + 1], ids[1][k + 1], ids[1][k]);
  }

  /** A card facing a random way round a point, leaning out from `crown`; `flat` tips it toward horizontal. */
  scatter(r: () => number, at: THREE.Vector3, crown: THREE.Vector3, size: number, uv: UvRect, o: Omit<CardOpts, 'crown' | 'anchor'> & { flat?: number }): void {
    const out = at.clone().sub(crown);
    if (out.lengthSq() < 1e-6) out.set(r() - 0.5, 0.4, r() - 0.5);
    out.normalize();
    const dir = V(r() - 0.5, r() - 0.5, r() - 0.5).normalize().multiplyScalar(0.7).add(out).normalize();
    if (o.flat) dir.lerp(V(0, 1, 0), o.flat).normalize();
    const tmp = Math.abs(dir.y) > 0.9 ? V(1, 0, 0) : V(0, 1, 0);
    const right = tmp.clone().cross(dir).normalize();
    const up = dir.clone().cross(right).normalize();
    const a = r() * TAU;
    const r2 = right.clone().multiplyScalar(Math.cos(a)).addScaledVector(up, Math.sin(a));
    const u2 = dir.clone().cross(r2).normalize();
    this.card(at, r2, u2, size, size, uv, { ...o, anchor: 'centre', crown });
  }

  /** A ribbon along a path: grass blades, strap leaves, strands. `side` gives each point's across direction. */
  ribbon(path: readonly THREE.Vector3[], widths: readonly number[], side: (i: number) => THREE.Vector3, uv: UvRect, col: (i: number) => Col, wind: (i: number) => Wind, normal?: (i: number) => THREE.Vector3): void {
    const [u0, v0, u1, v1] = uv, n = path.length;
    const base = this.vertices;
    for (let i = 0; i < n; i++) {
      const s = side(i).clone().normalize();
      const t = (i < n - 1 ? path[i + 1].clone().sub(path[i]) : path[i].clone().sub(path[i - 1])).normalize();
      const nn = normal ? normal(i) : s.clone().cross(t).normalize();
      const v = lerp(v0, v1, i / (n - 1));
      this.vert(path[i].clone().addScaledVector(s, -widths[i] / 2), nn, u0, v, col(i), wind(i));
      this.vert(path[i].clone().addScaledVector(s, widths[i] / 2), nn, u1, v, col(i), wind(i));
    }
    for (let i = 0; i < n - 1; i++) {
      const a = base + i * 2;
      this.quad(a, a + 1, a + 3, a + 2);
    }
  }

  /** A curved surface sampled on a nu × nv grid of (u, v) in [0, 1]², normals from the surface itself. */
  surface(nu: number, nv: number, at: (u: number, v: number) => THREE.Vector3, uv: UvRect, col: (u: number, v: number) => Col, wind: (u: number, v: number) => Wind): void {
    const [u0, v0, u1, v1] = uv, base = this.vertices;
    const e = 1e-3;
    for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) {
      const u = i / nu, v = j / nv;
      const p = at(u, v);
      const du = at(Math.min(1, u + e), v).sub(at(Math.max(0, u - e), v));
      const dv = at(u, Math.min(1, v + e)).sub(at(u, Math.max(0, v - e)));
      const n = du.cross(dv).normalize();
      if (n.lengthSq() < 0.5) n.set(0, 1, 0);
      this.vert(p, n, lerp(u0, u1, u), lerp(v0, v1, v), col(u, v), wind(u, v));
    }
    for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
      const a = base + j * (nu + 1) + i;
      this.quad(a, a + 1, a + nu + 2, a + nu + 1);
    }
  }

  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.t, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    g.setAttribute('aWind', new THREE.Float32BufferAttribute(this.w, 3));
    if (this.m.some((x) => x > 0)) g.setAttribute('aMoss', new THREE.Float32BufferAttribute(this.m, 1));
    g.setIndex(this.idx);
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }
}

/** A bend weight that grows with height: zero at the ground, `amp` metres at `h`. */
export const bendAt = (amp: number, h: number, k = 1.8) => (p: THREE.Vector3): number => amp * Math.pow(Math.max(0, p.y) / h, k);

export interface ClumpOpts {
  /** Normals bend out from here (defaults to the clump's centre). */
  crown?: THREE.Vector3;
  bend: (p: THREE.Vector3) => number;
  flutter?: number;
  /** Extra bend at each card's free edge. */
  tip?: number;
  /** Tip cards toward horizontal (0..1). */
  flat?: number;
  /** Base colour; cards deep inside are shaded darker and ones on top lighter. */
  col?: Col;
  /** Random brightness spread per card. */
  vary?: number;
}

/** A mass of leaf cards on the shell of an ellipsoid round c, the way a crown or a pad of foliage is built. */
export function clump(geo: Geo, r: () => number, c: THREE.Vector3, rad: readonly [number, number, number], n: number, size: number, uv: (i: number) => UvRect, o: ClumpOpts): void {
  const crown = o.crown ?? c, base = o.col ?? [1, 1, 1], vary = o.vary ?? 0.18;
  for (let i = 0; i < n; i++) {
    const d = V(r() * 2 - 1, r() * 2 - 1, r() * 2 - 1);
    if (d.lengthSq() > 1 || d.lengthSq() < 1e-4) { i--; continue; }
    const k = 0.55 + 0.45 * Math.sqrt(r());
    d.normalize().multiplyScalar(k);
    const p = c.clone().add(V(d.x * rad[0], d.y * rad[1], d.z * rad[2]));
    const shade = (0.62 + 0.38 * k) * (0.85 + 0.25 * clamp(d.y * 0.5 + 0.5, 0, 1)) * (1 - vary / 2 + r() * vary);
    const col: Col = [base[0] * shade, base[1] * shade, base[2] * shade];
    geo.scatter(r, p, crown, size * (0.8 + r() * 0.4), uv(i), { wind: [o.bend(p), o.flutter ?? 0.6, r()], tip: o.tip ?? 0.04, flat: o.flat, col });
  }
}

// ---------------------------------------------------------------- materials

export interface BarkOpts {
  map: string;
  normal: string;
  tint?: THREE.ColorRepresentation;
  roughness?: number;
  normalScale?: number;
  /** Moss on upward faces and wherever the geometry asks for it (aMoss). */
  moss?: { map: string; tint: THREE.ColorRepresentation; amount: number };
  /** Darken, shine and stain the wood where it meets the sea: roots in water. */
  tide?: boolean;
  /** Texture repeats along v for each repeat around (for non-square scans). */
  aspect?: number;
}

const materials = new Map<string, THREE.Material>();

/** Wood, roots and trunks: scanned bark with a normal map, optional moss and a tide line. Cached by key. */
export function barkMaterial(key: string, o: BarkOpts): THREE.MeshStandardMaterial {
  const hit = materials.get(key) as THREE.MeshStandardMaterial | undefined;
  if (hit) return hit;
  const map = texture(o.map, true), nmap = texture(o.normal, false);
  if (o.aspect) {
    map.repeat.set(1, o.aspect);
    nmap.repeat.set(1, o.aspect);
  }
  const m = new THREE.MeshStandardMaterial({
    map, normalMap: nmap, normalScale: new THREE.Vector2(o.normalScale ?? 1.2, o.normalScale ?? 1.2),
    color: o.tint ?? 0xffffff, roughness: o.roughness ?? 0.88, metalness: 0, vertexColors: true,
  });
  const mossMap = o.moss ? texture(o.moss.map, true) : null;
  const mossTint = new THREE.Color(o.moss?.tint ?? 0xffffff);
  tag(m, { kit: 'D', moss: o.moss && mossMap ? { map: mossMap, tint: mossTint, amount: o.moss.amount } : undefined, tide: !!o.tide });
  materials.set(key, m);
  return m;
}

export interface LeafOpts {
  atlas: Atlas;
  roughness?: number;
  /** How much sun shows through the leaves from behind. */
  translucency?: number;
  tint?: THREE.ColorRepresentation;
  alphaTest?: number;
  /** Leaves with no texture holes (surfaces, blades): alpha test off. */
  solid?: boolean;
}

/** Leaf cards, blades and petals: the atlas, both sides lit, light through from behind. Cached by key. */
export function leafMaterial(key: string, o: LeafOpts): THREE.MeshStandardMaterial {
  const hit = materials.get(key) as THREE.MeshStandardMaterial | undefined;
  if (hit) return hit;
  const m = new THREE.MeshStandardMaterial({
    map: o.atlas.texture, color: o.tint ?? 0xffffff, roughness: o.roughness ?? 0.7, metalness: 0,
    side: THREE.DoubleSide, alphaTest: o.solid ? 0 : o.alphaTest ?? 0.45, vertexColors: true,
  });
  const translucency = o.translucency ?? 0.6, size = o.atlas.texture.image.width as number;
  tag(m, { kit: 'D', cutout: o.solid ? undefined : size, translucency });
  materials.set(key, m);
  return m;
}

/** Puts a plant's parts together as one group of meshes, each part one draw call. Empty parts are skipped. */
export function assemble(name: string, lod: Lod, parts: readonly (readonly [Geo, THREE.Material])[]): THREE.Group {
  const group = new THREE.Group();
  group.name = `${name}-lod${lod}`;
  for (const [geo, mat] of parts) {
    if (geo.triangles === 0) continue;
    const mesh = new THREE.Mesh(geo.build(), mat);
    mesh.castShadow = lod < 2;
    mesh.receiveShadow = lod < 2;
    group.add(mesh);
  }
  return group;
}

// ---------------------------------------------------------------- falling drips

let dripMat: THREE.MeshBasicMaterial | null = null;

/** Drops that fall from the given points over and over, `fall` metres each, as thin streaks: each quad's corners
 *  carry aDrip (across, along, phase) and aFall, and the planet's flora (nodes.ts) lets them fall. The material is
 *  untagged, which is what marks them as drips there. */
export function drips(r: () => number, from: readonly THREE.Vector3[], fall: readonly number[]): THREE.Mesh {
  dripMat ??= new THREE.MeshBasicMaterial({ name: 'drips', color: 0xd1e6f2, transparent: true, opacity: 0.55, depthWrite: false });
  const pos: number[] = [], drip: number[] = [], fl: number[] = [], idx: number[] = [];
  from.forEach((p, i) => {
    const ph = r(), b = pos.length / 3;
    for (const [x, y] of [[-1, 0], [1, 0], [1, 1], [-1, 1]]) {
      pos.push(p.x, p.y, p.z);
      drip.push(x, y, ph);
      fl.push(fall[i]);
    }
    idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aDrip', new THREE.Float32BufferAttribute(drip, 3));
  g.setAttribute('aFall', new THREE.Float32BufferAttribute(fl, 1));
  g.setIndex(idx);
  g.computeBoundingSphere();
  if (g.boundingSphere) g.boundingSphere.radius += Math.max(...fall);
  const mesh = new THREE.Mesh(g, dripMat);
  mesh.renderOrder = 2;
  mesh.frustumCulled = false;
  mesh.name = 'drips';
  return mesh;
}
