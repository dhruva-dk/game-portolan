// Flora B's kit: what the Narrows, the Basalt Stacks, the Kelp Shallows and Blossom Run plants are built from.
// A seeded random stream, a geometry builder (tubes, cards, ribbons, blobs), the wind shader every plant shares,
// cached materials, the bark and leaf textures (scanned ones from public/tex/flora/b, painted ones from code),
// and a helper that turns a built plant into instanced meshes.
//
// Frames: every plant is built in metres with +Y up (the planet's up where it stands) and its origin at its anchor.
// See `Anchor` for where that is. Render code, not simulation, so Math.sin and friends are fine here.
import * as THREE from 'three';
import { tag } from './tag.ts';

// ---------------------------------------------------------------- the plant contract

export type Lod = 0 | 1 | 2;

/**
 * Where a plant's origin goes.
 * - ground: on the ground or seabed, +Y along the local up.
 * - wall: on a steep face. +Y is still the local up, and +Z points straight out of the face (horizontal).
 * - surface: at sea level above the spot, whatever the depth. Parts below the origin hang down to the seabed
 *   and are simply hidden where the seabed is shallower. Follow the tide by moving the origin.
 */
export type Anchor = 'ground' | 'wall' | 'surface';

export interface Placement {
  /** Height range, in metres above sea level, of the ground point the plant stands on. Negative is underwater. */
  minHeight: number;
  maxHeight: number;
  /** Steepest ground, in degrees from flat (90 is a vertical wall). */
  maxSlope: number;
  /** Plants per 100 m² of eligible ground. 0 means placed by hand (a landmark). */
  density: number;
  /** 0 scatters evenly, 1 packs plants into tight clumps. */
  cluster: number;
  /** Gentlest ground, in degrees. Wall plants need a face. Defaults to 0. */
  minSlope?: number;
  /** Defaults to 'ground'. */
  anchor?: Anchor;
}

export interface PlantSpec {
  id: string;
  name: string;
  /** A fresh object for this seed at this level of detail. Geometry is new; materials are shared and cached. */
  build(seed: number, lod: Lod): THREE.Object3D;
  placement: Placement;
  /** Camera distances, in metres, beyond which to switch to LOD 1 and LOD 2. */
  lodDistances: [number, number];
  /** Beyond this distance the plant can be culled entirely. */
  cullDistance: number;
}

// ---------------------------------------------------------------- random

/** Mulberry32: a seeded stream of numbers in [0, 1). */
export function rng(seed: number): () => number {
  let a = (Math.imul(seed | 0, 0x9e3779b1) ^ 0x6d2b79f5) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const range = (r: () => number, a: number, b: number) => a + (b - a) * r();
export const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

// ---------------------------------------------------------------- wind

/**
 * Per-vertex wind weights, the `aWind` attribute:
 * - bend: metres the whole plant leans at this vertex in a breeze (0 at the anchor, growing up the plant);
 * - branch: metres this branch sways on its own;
 * - phase: 0..1, which branch this is, so neighbours move out of step;
 * - flutter: metres a leaf card shivers along its normal.
 * `hz` is the plant's main sway frequency; it is packed into the phase slot.
 */
export interface Wind { bend: number; branch: number; phase: number; flutter: number; hz: number }
export const STILL: Wind = { bend: 0, branch: 0, phase: 0, flutter: 0, hz: 0.5 };

/** How the wind moves a material: in the air, under the water (swell), or at the surface (both, by height). */
export type WindMode = 'air' | 'submerged' | 'surface';

// ---------------------------------------------------------------- materials

export interface MaterialOptions {
  map?: THREE.Texture;
  normalMap?: THREE.Texture;
  normalScale?: number;
  color?: THREE.ColorRepresentation;
  roughness?: number;
  /** Cards and blades: a cut-out (alpha test) and both faces drawn. */
  alphaTest?: number;
  doubleSided?: boolean;
  /** 0..1, how much sun shows through from behind. */
  translucency?: number;
  mode?: WindMode;
  /** Use the vertex colours (AO, tint). Defaults to true. */
  vertexColors?: boolean;
  emissive?: THREE.ColorRepresentation;
  /** 0..1: wash the map toward pale grey (sun-bleached dead wood). */
  bleach?: number;
}

const materials = new Map<string, THREE.MeshStandardMaterial>();

/** A cached plant material, tagged with how the wind moves it and what its surface does (nodes.ts makes it so). The
 *  same key always returns the same material. */
export function material(key: string, o: MaterialOptions): THREE.MeshStandardMaterial {
  const hit = materials.get(key);
  if (hit) return hit;
  const alpha = o.alphaTest !== undefined;
  const m = new THREE.MeshStandardMaterial({
    map: o.map ?? null,
    normalMap: o.normalMap ?? null,
    color: o.color ?? 0xffffff,
    roughness: o.roughness ?? 0.85,
    metalness: 0,
    alphaTest: o.alphaTest ?? 0,
    side: o.doubleSided || alpha ? THREE.DoubleSide : THREE.FrontSide,
    vertexColors: o.vertexColors ?? true,
    emissive: o.emissive ?? 0x000000,
  });
  if (o.normalMap) m.normalScale.setScalar(o.normalScale ?? 1);
  tag(m, { kit: 'B', mode: o.mode ?? 'air', cutout: alpha ? 1024 : undefined, edgeFade: alpha, translucency: o.translucency ?? 0, bleach: o.bleach ?? 0 });
  materials.set(key, m);
  return m;
}

/** A mesh casting (if asked) and receiving shadows. */
export function mesh(geo: THREE.BufferGeometry, mat: THREE.MeshStandardMaterial, shadows = true): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = shadows;
  m.receiveShadow = true;
  return m;
}

/** A group holding one mesh per non-empty geometry. */
export function assemble(name: string, parts: [Geo, THREE.MeshStandardMaterial, boolean?][]): THREE.Group {
  const g = new THREE.Group();
  g.name = name;
  for (const [geo, mat, shadows] of parts) if (geo.count > 0) g.add(mesh(geo.build(), mat, shadows ?? true));
  return g;
}

// ---------------------------------------------------------------- textures

const BASE = (import.meta.env?.BASE_URL ?? './') + 'tex/flora/b/';
const loader = new THREE.TextureLoader();
const textures = new Map<string, THREE.Texture>();
const pending: Promise<unknown>[] = [];

/** A scanned image from public/tex/flora/b, tiled. */
export function scan(file: string, srgb: boolean): THREE.Texture {
  const hit = textures.get(file);
  if (hit) return hit;
  let done!: () => void;
  pending.push(new Promise<void>((r) => (done = r)));
  const t = loader.load(BASE + file, () => done(), undefined, () => done());
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  textures.set(file, t);
  return t;
}

export interface Canvas2D { g: CanvasRenderingContext2D; w: number; h: number }

/**
 * A texture painted in code. `paint` runs at once; `refine`, if given, runs again once the named scans have
 * loaded (as alpha-cut images) and repaints with them, so a plant built before the scans arrive still has leaves.
 */
export function painted(key: string, w: number, h: number, paint: (c: Canvas2D) => void, refine?: { scans: [string, string][]; paint: (c: Canvas2D, imgs: HTMLCanvasElement[]) => void }): THREE.Texture {
  const hit = textures.get(key);
  if (hit) return hit;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const g = canvas.getContext('2d', { willReadFrequently: true })!;
  paint({ g, w, h });
  const t = new THREE.DataTexture(bleed(g, w, h), w, h, THREE.RGBAFormat);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.needsUpdate = true;
  textures.set(key, t);
  if (refine) {
    const job = Promise.all(refine.scans.map(([c, a]) => cutout(c, a))).then(
      (imgs) => {
        g.clearRect(0, 0, w, h);
        refine.paint({ g, w, h }, imgs);
        t.image.data = bleed(g, w, h);
        t.needsUpdate = true;
      },
      () => undefined,
    );
    pending.push(job);
  }
  return t;
}

/**
 * The canvas as texture data, bottom row first, with the colour of the nearest opaque texels bled into the
 * transparent ones. A canvas stores transparent texels as black, which mipmapping would smear round every leaf.
 */
function bleed(g: CanvasRenderingContext2D, w: number, h: number): Uint8Array {
  const src = g.getImageData(0, 0, w, h).data;
  const out = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) out.set(src.subarray((h - 1 - y) * w * 4, (h - y) * w * 4), y * w * 4);
  // average colour of each 16×16 block's opaque texels, spread outward block by block
  const B = 16, bw = Math.ceil(w / B), bh = Math.ceil(h / B);
  const sum = new Float32Array(bw * bh * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4, a = out[i + 3];
    if (a < 128) continue;
    const b = (Math.floor(y / B) * bw + Math.floor(x / B)) * 4;
    sum[b] += out[i]; sum[b + 1] += out[i + 1]; sum[b + 2] += out[i + 2]; sum[b + 3] += 1;
  }
  let any = false;
  for (let b = 0; b < bw * bh; b++) if (sum[b * 4 + 3] > 0) { any = true; break; }
  if (!any) return out;
  for (let pass = 0; pass < Math.max(bw, bh); pass++) {
    let empty = 0;
    const next = sum.slice();
    for (let by = 0; by < bh; by++) for (let bx = 0; bx < bw; bx++) {
      const b = (by * bw + bx) * 4;
      if (sum[b + 3] > 0) continue;
      empty++;
      let r = 0, gg = 0, bb = 0, n = 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = bx + dx, ny = by + dy;
        if (nx < 0 || ny < 0 || nx >= bw || ny >= bh) continue;
        const k = (ny * bw + nx) * 4;
        if (sum[k + 3] <= 0) continue;
        r += sum[k] / sum[k + 3]; gg += sum[k + 1] / sum[k + 3]; bb += sum[k + 2] / sum[k + 3]; n++;
      }
      if (n) { next[b] = r / n; next[b + 1] = gg / n; next[b + 2] = bb / n; next[b + 3] = 1; }
    }
    sum.set(next);
    if (!empty) break;
  }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4;
    if (out[i + 3] >= 128) continue;
    const b = (Math.floor(y / B) * bw + Math.floor(x / B)) * 4;
    const n = sum[b + 3] || 1, a = out[i + 3] / 128;
    out[i] = lerp(sum[b] / n, out[i], a); out[i + 1] = lerp(sum[b + 1] / n, out[i + 1], a); out[i + 2] = lerp(sum[b + 2] / n, out[i + 2], a);
  }
  return out;
}

function image(file: string): Promise<HTMLImageElement> {
  return new Promise((ok, fail) => {
    const img = new Image();
    img.onload = () => ok(img);
    img.onerror = fail;
    img.src = BASE + file;
  });
}

/** A colour scan and its opacity scan, joined into one canvas with alpha. */
async function cutout(colorFile: string, alphaFile: string): Promise<HTMLCanvasElement> {
  const [c, a] = await Promise.all([image(colorFile), image(alphaFile)]);
  const w = c.width, h = c.height;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const g = canvas.getContext('2d', { willReadFrequently: true })!;
  g.drawImage(a, 0, 0, w, h);
  const alpha = g.getImageData(0, 0, w, h).data;
  g.drawImage(c, 0, 0, w, h);
  const px = g.getImageData(0, 0, w, h);
  for (let i = 0; i < alpha.length; i += 4) px.data[i + 3] = alpha[i];
  g.putImageData(px, 0, 0);
  return canvas;
}

/** Every texture made so far, by key (painted) or file name (scanned). For the dev page. */
export function floraTextures(): ReadonlyMap<string, THREE.Texture> {
  return textures;
}

/** Resolves once every scan and every refined painting has loaded. */
export function floraReady(): Promise<void> {
  return Promise.all(pending).then(() => undefined);
}

/** The bounding boxes of the leaves in a scanned atlas laid out as a cols × rows grid. */
export function atlasCells(img: HTMLCanvasElement, cols: number, rows: number): [number, number, number, number][] {
  const g = img.getContext('2d')!;
  const d = g.getImageData(0, 0, img.width, img.height).data;
  const cw = img.width / cols, ch = img.height / rows;
  const out: [number, number, number, number][] = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
    for (let y = Math.floor(r * ch); y < Math.floor((r + 1) * ch); y += 2) for (let x = Math.floor(c * cw); x < Math.floor((c + 1) * cw); x += 2) {
      if (d[(y * img.width + x) * 4 + 3] > 128) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
    }
    if (x1 > x0) out.push([x0, y0, x1 - x0, y1 - y0]);
  }
  return out;
}

/** Draws one leaf from an atlas, its stem end at (x, y), pointing at angle `a` (0 = up the canvas), `len` px long. */
export function stamp(g: CanvasRenderingContext2D, img: CanvasImageSource, cell: [number, number, number, number], x: number, y: number, a: number, len: number, flip = false): void {
  const [sx, sy, sw, sh] = cell;
  const k = len / sh;
  g.save();
  g.translate(x, y);
  g.rotate(a);
  if (flip) g.scale(-1, 1);
  g.drawImage(img, sx, sy, sw, sh, (-sw * k) / 2, -sh * k, sw * k, sh * k);
  g.restore();
}

export const hsl = (h: number, s: number, l: number, a = 1) => `hsla(${h},${s}%,${l}%,${a})`;

// ---------------------------------------------------------------- geometry

export type Rgb = [number, number, number];

/** Accumulates one mesh's vertices: position, normal, uv, colour and wind weights. */
export class Geo {
  private pos: number[] = [];
  private nor: number[] = [];
  private uv: number[] = [];
  private col: number[] = [];
  private wnd: number[] = [];
  private idx: number[] = [];

  get count(): number {
    return this.pos.length / 3;
  }

  vertex(p: THREE.Vector3, n: THREE.Vector3, u: number, v: number, c: Rgb, w: Wind): number {
    this.pos.push(p.x, p.y, p.z);
    this.nor.push(n.x, n.y, n.z);
    this.uv.push(u, v);
    this.col.push(c[0], c[1], c[2]);
    this.wnd.push(w.bend, w.branch, Math.round(w.hz * 100) + Math.min(0.999, Math.max(0, w.phase)), w.flutter);
    return this.count - 1;
  }

  tri(a: number, b: number, c: number): void {
    this.idx.push(a, b, c);
  }

  /**
   * A generalised cylinder along `path`, its frame carried by parallel transport.
   * u wraps `uRepeat` times round; v runs `vPerMetre` per metre along. `twist` turns the texture as it climbs.
   */
  tube(path: THREE.Vector3[], radii: number[], sides: number, o: { uRepeat?: number; vPerMetre?: number; twist?: number; color: (i: number) => Rgb; wind: (p: THREE.Vector3, i: number) => Wind; cap?: boolean }): void {
    const base = this.count;
    let normal = new THREE.Vector3(1, 0, 0);
    let len = 0;
    const uR = o.uRepeat ?? 1, vM = o.vPerMetre ?? 1;
    const t = new THREE.Vector3(), bin = new THREE.Vector3(), n = new THREE.Vector3(), p = new THREE.Vector3();
    for (let i = 0; i < path.length; i++) {
      if (i < path.length - 1) t.subVectors(path[i + 1], path[i]);
      else t.subVectors(path[i], path[i - 1]);
      t.normalize();
      normal.addScaledVector(t, -normal.dot(t));
      if (normal.lengthSq() < 1e-4) normal = new THREE.Vector3(0, 0, 1).cross(t);
      if (normal.lengthSq() < 1e-4) normal = new THREE.Vector3(1, 0, 0).cross(t);
      normal.normalize();
      bin.crossVectors(t, normal);
      if (i > 0) len += path[i].distanceTo(path[i - 1]);
      const w = o.wind(path[i], i);
      const c = o.color(i);
      for (let s = 0; s <= sides; s++) {
        const a = (s / sides) * Math.PI * 2;
        n.copy(normal).multiplyScalar(Math.cos(a)).addScaledVector(bin, Math.sin(a));
        p.copy(path[i]).addScaledVector(n, radii[i]);
        this.vertex(p, n, (s / sides) * uR + len * (o.twist ?? 0), len * vM, c, w);
      }
    }
    for (let i = 0; i < path.length - 1; i++) for (let s = 0; s < sides; s++) {
      const a = base + i * (sides + 1) + s, b = a + 1, c = a + sides + 1, d = c + 1;
      this.idx.push(a, b, c, b, d, c);
    }
    if (o.cap) {
      const last = path.length - 1;
      const tip = this.vertex(path[last], t, 0.5, len * vM, o.color(last), o.wind(path[last], last));
      for (let s = 0; s < sides; s++) {
        const a = base + last * (sides + 1) + s;
        this.idx.push(a, a + 1, tip);
      }
    }
  }

  /**
   * A flat card: the quad spanned by `right` (width) and `up` (height) about `at`, mapped to uv rect [u0, v0, u1, v1].
   * `bottom` hangs it from `at` instead of centring it. Normals are bent away from `crown`, so a canopy of cards
   * shades as one mass rather than as flat paper.
   */
  card(at: THREE.Vector3, right: THREE.Vector3, up: THREE.Vector3, w: number, h: number, rect: [number, number, number, number], o: { crown?: THREE.Vector3; bottom?: boolean; color: (p: THREE.Vector3) => Rgb; wind: (p: THREE.Vector3) => Wind; bendNormals?: number }): void {
    const [u0, v0, u1, v1] = rect;
    const face = new THREE.Vector3().crossVectors(right, up).normalize();
    const y0 = o.bottom ? 0 : -0.5, y1 = o.bottom ? 1 : 0.5;
    const corners: [number, number, number, number][] = [[-0.5, y0, u0, v0], [0.5, y0, u1, v0], [0.5, y1, u1, v1], [-0.5, y1, u0, v1]];
    const k = o.bendNormals ?? 0.75;
    const ids = corners.map(([x, y, u, v]) => {
      const p = at.clone().addScaledVector(right, x * w).addScaledVector(up, y * h);
      const n = face.clone();
      if (o.crown) {
        const out = p.clone().sub(o.crown);
        if (out.lengthSq() > 1e-6) n.multiplyScalar(1 - k).addScaledVector(out.normalize(), k).normalize();
      }
      return this.vertex(p, n, u, v, o.color(p), o.wind(p));
    });
    this.idx.push(ids[0], ids[1], ids[2], ids[0], ids[2], ids[3]);
  }

  /**
   * A strip along `path`: at each point it spans `widths[i]` across `sides[i]`. u runs across (0..1),
   * v along by `vAt(i)`. Normals face cross(tangent, side). Used for grass, kelp and eelgrass blades.
   */
  ribbon(path: THREE.Vector3[], widths: number[], sides: THREE.Vector3[], o: { vAt: (i: number) => number; color: (i: number) => Rgb; wind: (p: THREE.Vector3, i: number) => Wind; u?: [number, number] }): void {
    const base = this.count;
    const t = new THREE.Vector3(), n = new THREE.Vector3();
    const [ua, ub] = o.u ?? [0, 1];
    for (let i = 0; i < path.length; i++) {
      if (i < path.length - 1) t.subVectors(path[i + 1], path[i]);
      else t.subVectors(path[i], path[i - 1]);
      t.normalize();
      n.crossVectors(sides[i], t).normalize();
      const w = o.wind(path[i], i), c = o.color(i), v = o.vAt(i);
      this.vertex(path[i].clone().addScaledVector(sides[i], -widths[i] / 2), n, ua, v, c, w);
      this.vertex(path[i].clone().addScaledVector(sides[i], widths[i] / 2), n, ub, v, c, w);
    }
    for (let i = 0; i < path.length - 1; i++) {
      const a = base + i * 2;
      this.idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }

  /** A lumpy closed blob: the far-off stand-in for a crown, a cushion or a mat. Normals point out from its centre. */
  blob(center: THREE.Vector3, radii: [number, number, number], detail: number, r: () => number, o: { color: (p: THREE.Vector3, n: THREE.Vector3) => Rgb; wind: (p: THREE.Vector3) => Wind; lumps?: number; flatBottom?: number }): void {
    const ico = new THREE.IcosahedronGeometry(1, detail);
    const pa = ico.getAttribute('position') as THREE.BufferAttribute;
    const lumps = o.lumps ?? 0.22;
    // a few random bumps, so blobs aren't spheres
    const bumps = Array.from({ length: 6 }, () => [V(r() - 0.5, r() - 0.5, r() - 0.5).normalize(), range(r, -1, 1)] as const);
    const map = new Map<string, number>();
    const ids: number[] = [];
    const p = new THREE.Vector3();
    for (let i = 0; i < pa.count; i++) {
      p.fromBufferAttribute(pa, i);
      const key = `${p.x.toFixed(4)},${p.y.toFixed(4)},${p.z.toFixed(4)}`;
      const seen = map.get(key);
      if (seen !== undefined) { ids.push(seen); continue; }
      const dir = p.clone().normalize();
      let k = 1;
      for (const [b, s] of bumps) k += lumps * s * Math.max(0, dir.dot(b)) ** 3;
      const q = V(dir.x * radii[0] * k, dir.y * radii[1] * k, dir.z * radii[2] * k);
      if (o.flatBottom !== undefined) q.y = Math.max(q.y, -radii[1] * o.flatBottom);
      q.add(center);
      const id = this.vertex(q, dir, dir.x * 0.5 + 0.5, dir.y * 0.5 + 0.5, o.color(q, dir), o.wind(q));
      map.set(key, id);
      ids.push(id);
    }
    for (let i = 0; i < ids.length; i += 3) this.idx.push(ids[i], ids[i + 1], ids[i + 2]);
    ico.dispose();
  }

  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute('aWind', new THREE.Float32BufferAttribute(this.wnd, 4));
    g.setIndex(this.idx);
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }
}

// ---------------------------------------------------------------- branching

/** One limb of a tree: its centre line, radii, depth in the tree and the wind its points carry. */
export interface Branch {
  pts: THREE.Vector3[];
  radii: number[];
  level: number;
  /** Branch sway weight (metres) at each point: grows out along the limb from its parent's value. */
  sway: number[];
  phase: number;
  /** Dead wood: drawn bare and pale. */
  dead?: boolean;
}

export interface GrowParams {
  /** The trunk's start and first direction. */
  root: THREE.Vector3;
  dir: THREE.Vector3;
  length: number;
  radius: number;
  /** Per level below the trunk: children per parent, where along the parent they start, angle off the parent, length ratio. */
  children: number[];
  spread: [number, number][];
  angle: number[];
  lengthRatio: number[];
  /** Radius of a child against its parent's radius where it starts. */
  radiusRatio: number;
  /** Per level, including the trunk: pull toward up (+) or down (−) per segment. */
  tropism: number[];
  /** Random turn per segment. */
  wiggle: number;
  segments: number[];
  /** Branch sway gained per metre of limb, per level. */
  flex: number[];
  /** Taper from base to tip radius. */
  tipRatio: number;
  /** Optional: bends a direction at each step (twisting cliff junipers, spreading cherries). */
  steer?: (d: THREE.Vector3, level: number, t: number, at: THREE.Vector3) => void;
}

/** Grows a whole tree from a seed. The skeleton never depends on LOD, so every level of detail has the same shape. */
export function grow(r: () => number, P: GrowParams): Branch[] {
  const out: Branch[] = [];
  const limb = (from: THREE.Vector3, dir: THREE.Vector3, len: number, rad: number, level: number, sway0: number, phase: number) => {
    const n = P.segments[level];
    const pts = [from.clone()];
    const radii = [rad];
    const sway = [sway0];
    const d = dir.clone().normalize();
    const p = from.clone();
    for (let i = 1; i <= n; i++) {
      d.x += (r() - 0.5) * P.wiggle;
      d.y += (r() - 0.5) * P.wiggle * 0.6 + P.tropism[level];
      d.z += (r() - 0.5) * P.wiggle;
      P.steer?.(d, level, i / n, p);
      d.normalize();
      p.addScaledVector(d, len / n);
      pts.push(p.clone());
      radii.push(rad * lerp(1, P.tipRatio, i / n));
      sway.push(sway0 + (len * i * P.flex[level]) / n);
    }
    const b: Branch = { pts, radii, level, sway, phase };
    out.push(b);
    if (level >= P.children.length) return;
    const kids = P.children[level];
    const [s0, s1] = P.spread[level];
    const golden = 2.39996;
    let az = r() * Math.PI * 2;
    for (let k = 0; k < kids; k++) {
      const t = lerp(s0, s1, kids === 1 ? 0.5 : k / (kids - 1)) + (r() - 0.5) * 0.08;
      const fi = Math.min(n - 1, Math.max(0, Math.floor(t * n)));
      const ft = t * n - fi;
      const at = pts[fi].clone().lerp(pts[fi + 1], ft);
      const pd = pts[fi + 1].clone().sub(pts[fi]).normalize();
      az += golden + (r() - 0.5) * 0.6;
      // a direction `angle` off the parent, at azimuth az round it
      const ref = Math.abs(pd.y) < 0.95 ? V(0, 1, 0) : V(1, 0, 0);
      const e1 = ref.clone().cross(pd).normalize();
      const e2 = pd.clone().cross(e1).normalize();
      const ang = P.angle[level] * (0.8 + r() * 0.4);
      const cd = pd.clone().multiplyScalar(Math.cos(ang)).addScaledVector(e1.multiplyScalar(Math.cos(az)).addScaledVector(e2, Math.sin(az)), Math.sin(ang));
      const cl = len * P.lengthRatio[level] * (0.75 + r() * 0.5) * (1 - t * 0.35);
      const cr = lerp(rad, rad * P.tipRatio, t) * P.radiusRatio;
      const sw = lerp(sway[fi], sway[fi + 1], ft);
      limb(at, cd, cl, cr, level + 1, sw, level === 0 ? r() : phase);
    }
  };
  limb(P.root, P.dir, P.length, P.radius, 0, 0, r());
  return out;
}

/** A point `t` (0..1) along a branch, and the branch's direction there. */
export function along(b: Branch, t: number): [THREE.Vector3, THREE.Vector3, number] {
  const n = b.pts.length - 1;
  const f = Math.min(n - 1e-4, Math.max(0, t * n));
  const i = Math.floor(f), k = f - i;
  const p = b.pts[i].clone().lerp(b.pts[i + 1], k);
  const d = b.pts[i + 1].clone().sub(b.pts[i]).normalize();
  return [p, d, lerp(b.sway[i], b.sway[i + 1], k)];
}

/**
 * A random card frame facing loosely out of `crown` at `p`. `flat` pulls it toward lying flat (0..1);
 * `jitter` is how far it may turn away from facing straight out.
 */
export function cardFrame(r: () => number, p: THREE.Vector3, crown: THREE.Vector3, flat = 0, jitter = 0.75): [THREE.Vector3, THREE.Vector3] {
  const out = p.clone().sub(crown);
  if (out.lengthSq() < 1e-6) out.set(r() - 0.5, 0.3, r() - 0.5);
  out.normalize();
  const face = V(r() - 0.5, r() - 0.5, r() - 0.5).normalize().multiplyScalar(jitter).add(out).normalize();
  if (flat > 0) face.lerp(V(0, 1, 0), flat).normalize();
  const tmp = Math.abs(face.y) > 0.9 ? V(1, 0, 0) : V(0, 1, 0);
  const right = tmp.clone().cross(face).normalize();
  const up = face.clone().cross(right).normalize();
  const a = r() * Math.PI * 2;
  const r2 = right.clone().multiplyScalar(Math.cos(a)).addScaledVector(up, Math.sin(a));
  const u2 = face.clone().cross(r2).normalize();
  return [r2, u2];
}

/** Bend weight for a point at height y on a plant of height H: quadratic, so the base stays put. */
export const bendAt = (y: number, H: number, metres: number) => metres * Math.min(1.3, Math.max(0, y / H)) ** 2;

// ---------------------------------------------------------------- trees

export interface TreeLook {
  bark: () => THREE.MeshStandardMaterial;
  leaf: () => THREE.MeshStandardMaterial;
  far: () => THREE.MeshStandardMaterial;
  /** Linear multipliers on the leaf texture for this seed. */
  tint: Rgb;
  /** The far-off crown colour (LOD 2), on its lit top. */
  farColor: Rgb;
  barkTint: Rgb;
  /** Metres the top leans in a fresh breeze, and the main sway frequency. */
  bend: number;
  hz: number;
  /** Card size at LOD 0, and how many per terminal twig. */
  card: number;
  perTwig: number;
  /** 0..1: how much the cards lie flat (juniper pads) rather than face outward. */
  flat?: number;
  /** Bark texture: metres per repeat round the trunk. */
  barkScale: number;
  sides: [number, number, number];
  /** How much wider the trunk flares at the ground. */
  flare?: number;
  /** Bare dead limbs (marked `dead` on the branch) are drawn with this material. */
  deadBark?: () => THREE.MeshStandardMaterial;
}

/**
 * Emits a grown skeleton. LOD 0: every limb as bark, cards along every twig. LOD 1: one level fewer, cards twice
 * the size round each twig's parent. LOD 2: trunk and main limbs only, the crown as solid lumpy blobs (one per
 * second-to-last limb), so a tree keeps its silhouette at 300 m instead of thinning into mipmapped alpha.
 */
export function emitTree(name: string, seed: number, lod: Lod, limbs: Branch[], look: TreeLook, H: number): THREE.Group {
  const bark = new Geo(), dead = new Geo(), leaves = new Geo(), far = new Geo();
  const r = rng(seed * 31 + 5);
  const maxLevel = Math.max(...limbs.map((b) => b.level));
  const tubeLevels = lod === 0 ? maxLevel : lod === 1 ? maxLevel - 1 : Math.min(1, maxLevel - 1);
  const live = limbs.filter((b) => !b.dead);
  const terminals = live.filter((b) => b.level === maxLevel);
  const crown = terminals.reduce((a, b) => a.add(b.pts[b.pts.length - 1]), V()).multiplyScalar(1 / Math.max(1, terminals.length));
  crown.y -= H * 0.1;
  const windAt = (b: Branch, i: number): Wind => ({ bend: bendAt(b.pts[i].y, H, look.bend), branch: b.sway[i], phase: b.phase, flutter: 0, hz: look.hz });

  for (const b of limbs) {
    if (b.level > tubeLevels) continue;
    const sides = lod === 2 ? (b.level === 0 ? 5 : 3) : b.level === 0 ? look.sides[0] : b.level === 1 ? look.sides[1] : look.sides[2];
    const circ = 2 * Math.PI * b.radii[0];
    const uRepeat = Math.max(1, Math.round(circ / look.barkScale));
    const pts = b.pts.slice();
    const radii = b.radii.slice();
    // sink each limb's start into its parent so no seam shows; flare the trunk into the ground
    if (b.level > 0) pts[0] = pts[0].clone().lerp(pts[1], -0.15);
    else {
      radii[0] *= look.flare ?? 1.45;
      pts.unshift(pts[0].clone().add(V(0, -0.4, 0)));
      radii.unshift(radii[0] * 1.1);
    }
    const tint = look.barkTint;
    (b.dead && look.deadBark ? dead : bark).tube(pts, radii.map((x) => (lod === 2 ? x * 1.2 : x)), sides, {
      uRepeat, vPerMetre: uRepeat / circ, twist: 0.015,
      color: (i) => {
        const ao = lerp(0.72, 1, Math.min(1, Math.max(0, pts[i].y) / (H * 0.35)));
        return [tint[0] * ao, tint[1] * ao, tint[2] * ao];
      },
      wind: (_p, i) => windAt(b, Math.max(0, i - (b.level === 0 ? 1 : 0))),
    });
  }

  const shade = (p: THREE.Vector3): Rgb => {
    // darker deep inside and underneath the crown
    const d = p.clone().sub(crown);
    const up = THREE.MathUtils.clamp((d.y / (H * 0.3)) * 0.5 + 0.5, 0, 1);
    const out = Math.min(1, d.length() / (H * 0.45));
    const ao = lerp(0.62, 1.04, up) * lerp(0.8, 1.05, out) * range(r, 0.92, 1.06);
    return [look.tint[0] * ao, look.tint[1] * ao, look.tint[2] * ao];
  };

  if (lod < 2) {
    // leaf cards: along each twig at LOD 0; fewer, bigger, round each twig's parent at LOD 1
    const host = lod === 0 ? terminals : live.filter((b) => b.level === maxLevel - 1);
    const per = lod === 0 ? look.perTwig : look.perTwig + 1;
    const size = lod === 0 ? look.card : look.card * 1.9;
    for (const b of host) {
      for (let k = 0; k < per; k++) {
        const t = per === 1 ? 1 : lerp(0.3, 1, k / (per - 1));
        const [p, , sw] = along(b, t);
        p.add(V((r() - 0.5) * size * 0.3, (r() - 0.3) * size * 0.25, (r() - 0.5) * size * 0.3));
        const [right, up] = cardFrame(r, p, crown, look.flat ?? 0.12, 0.45);
        const s = size * range(r, 0.8, 1.2);
        const c = shade(p);
        leaves.card(p, right, up, s, s, [0, 0, 1, 1], {
          crown,
          color: () => c,
          wind: (q) => ({ bend: bendAt(q.y, H, look.bend), branch: sw * 1.1, phase: b.phase, flutter: 0.03 * s, hz: look.hz }),
        });
      }
    }
  } else {
    // LOD 2: one solid blob per second-to-last limb that bears leaves
    const level = Math.max(1, maxLevel - 1);
    for (const host of live.filter((b) => b.level === level)) {
      const tips = terminals.filter((t) => isDescendant(limbs, t, host));
      const ends = tips.length ? tips.map((t) => t.pts[t.pts.length - 1]) : [host.pts[host.pts.length - 1]];
      const c = ends.reduce((a, p) => a.add(p), V()).multiplyScalar(1 / ends.length);
      let rms = 0;
      for (const p of ends) rms += p.distanceToSquared(c);
      const rad = Math.sqrt(rms / ends.length) * 0.75 + look.card * 0.38;
      const sway = host.sway[host.sway.length - 1];
      far.blob(c, [rad, rad * 0.78, rad], 1, r, {
        lumps: 0.35,
        color: (q, n) => {
          const k = lerp(0.5, 1.05, n.y * 0.5 + 0.5) * lerp(0.82, 1.04, Math.min(1, q.distanceTo(crown) / (H * 0.45))) * range(r, 0.9, 1.06);
          return [look.farColor[0] * k, look.farColor[1] * k, look.farColor[2] * k];
        },
        wind: (q) => ({ bend: bendAt(q.y, H, look.bend), branch: sway, phase: host.phase, flutter: 0, hz: look.hz }),
      });
    }
  }
  return assemble(name, [[bark, look.bark()], [dead, (look.deadBark ?? look.bark)()], [leaves, look.leaf()], [far, look.far()]]);
}

/** grow() lists limbs depth first, so a limb descends from `ancestor` if no limb of the ancestor's level comes between. */
export function isDescendant(all: Branch[], b: Branch, ancestor: Branch): boolean {
  const i = all.indexOf(ancestor), j = all.indexOf(b);
  if (j <= i) return false;
  for (let k = i + 1; k <= j; k++) if (all[k].level <= ancestor.level) return false;
  return true;
}

/** The highest point of a grown tree. */
export function topOf(limbs: Branch[]): number {
  let y = 0;
  for (const b of limbs) for (const p of b.pts) y = Math.max(y, p.y);
  return y;
}
