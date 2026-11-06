// The shared kit for Flora A (the Ice Crown, the Fjords, Mistwood and the Spires).
// It holds the plant contract, a seeded random source, a geometry builder for trunks, cards, ribbons and blobs,
// scanned bark and painted card materials that all sway in one shared wind, and two ways to show a plant:
// a THREE.LOD for one copy, and an instanced field that picks each copy's level of detail by distance.
//
// Units are metres. A plant's local +Y is up from the ground, and its root sits at the origin.
import * as THREE from 'three';
import { tag } from './tag.ts';

// ---------------------------------------------------------------- the contract

export interface Placement {
  /** Lowest ground height where it grows, in metres above sea level (negative is under water). */
  minHeight: number;
  /** Highest ground height where it grows, in metres above sea level. */
  maxHeight: number;
  /** Steepest ground it grows on, in degrees from level. */
  maxSlope: number;
  /** Plants per 100 m² where it grows. */
  density: number;
  /** 0 scatters plants evenly; 1 packs them into tight groups. */
  cluster: number;
}

export interface Plant {
  id: string;
  name: string;
  /** One copy, shaped by the seed, at level of detail 0 (near), 1 (middle) or 2 (far silhouette). */
  build(seed: number, lod: number): THREE.Object3D;
  placement: Placement;
  /** Camera distances in metres where LOD 1 and LOD 2 take over, and past which the plant isn't drawn. */
  lodDistances: [number, number, number];
}

// ---------------------------------------------------------------- random and maths

/** A seeded random source (mulberry32) returning numbers in [0, 1). */
export function rng(seed: number): () => number {
  let a = (seed | 0) ^ 0x2545f491;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Mixes a plant's id into a seed, so two species given the same seed still differ. */
export function seedFor(id: string, seed: number): number {
  let h = 2166136261 ^ (seed | 0);
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return h >>> 0;
}

export const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
export const smooth = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
/** A number between a and b from the random source. */
export const between = (r: () => number, a: number, b: number) => a + (b - a) * r();
/** n values going linearly from a to b. */
export const taper = (n: number, a: number, b: number) => Array.from({ length: n }, (_, i) => a + ((b - a) * i) / Math.max(1, n - 1));
/** A clamped level of detail. */
export const lodOf = (lod: number) => (lod <= 0 ? 0 : lod >= 2 ? 2 : 1) as 0 | 1 | 2;

/** A wandering path from a point: steps segments of equal length, the heading nudged each step. */
export function wander(from: THREE.Vector3, dir: THREE.Vector3, len: number, steps: number, r: () => number, bend: number, pull = V()): THREE.Vector3[] {
  const pts = [from.clone()];
  const d = dir.clone().normalize();
  const p = from.clone();
  for (let i = 1; i <= steps; i++) {
    d.add(V((r() - 0.5) * bend, (r() - 0.5) * bend, (r() - 0.5) * bend)).add(pull).normalize();
    p.addScaledVector(d, len / steps);
    pts.push(p.clone());
  }
  return pts;
}

/** A unit vector perpendicular to v. */
export function perpendicular(v: THREE.Vector3): THREE.Vector3 {
  const a = Math.abs(v.y) < 0.9 ? V(0, 1, 0) : V(1, 0, 0);
  return a.cross(v).normalize();
}

// ---------------------------------------------------------------- geometry

/** How one vertex moves in the wind beyond the plant's main bend. */
export interface VertexWind {
  /** Phase in radians, so neighbouring branches don't move in step. */
  phase: number;
  /** Metres a branch tip bobs at strength 1. */
  branch: number;
  /** Metres a leaf, needle card or frond flutters at strength 1. */
  flutter: number;
}
export const STILL: VertexWind = { phase: 0, branch: 0, flutter: 0 };

/** A rectangle of an atlas, in texture coordinates. */
export interface Cell { u0: number; v0: number; u1: number; v1: number }

export interface TubeOpts {
  sides: number;
  /** Bark tiles around the tube, and metres of tube per tile along it. */
  uRepeat?: number;
  vMetres?: number;
  /** Radius multiplier by angle (radians) and distance along the tube (0..1): fluting and buttresses. */
  shape?: (a: number, t: number) => number;
  wind?: (t: number) => VertexWind;
  shade?: (t: number) => number;
  cover?: (t: number, normal: THREE.Vector3) => number;
  color?: (t: number) => THREE.Color;
  /** Close the far end with a splintered cap (for broken logs and snags). */
  cap?: { length: number; r: () => number; color: THREE.Color };
}

export interface CardOpts {
  /** Where the origin sits on the card, as (0..1, 0..1) from its left and bottom edges. */
  anchor?: [number, number];
  /** Bend the card's normals out from this point, so a crown of cards shades as one mass. */
  crown?: THREE.Vector3;
  shade?: number;
  wind?: VertexWind;
}

/**
 * Accumulates one mesh: positions, normals, uvs, a vertex colour (shade times tint), the wind weights (aWind) and a
 * cover amount (aCover: how much snow or moss lies on the bark there; 1 is solid cover).
 */
export class Geo {
  private pos: number[] = [];
  private nor: number[] = [];
  private uv: number[] = [];
  private col: number[] = [];
  private wnd: number[] = [];
  private cov: number[] = [];
  private idx: number[] = [];
  /** Metres the plant's main bend moves a point at wind strength 1. Evaluated before the transform. */
  bend: (p: THREE.Vector3) => number = () => 0;
  /** Multiplies every vertex colour added from now on. */
  tint = new THREE.Color(1, 1, 1);
  /** Places everything added from now on (for a fern growing on a log, say). */
  transform: THREE.Matrix4 | null = null;
  private nm = new THREE.Matrix3();

  get triangles(): number { return this.idx.length / 3; }

  setTransform(m: THREE.Matrix4 | null): void {
    this.transform = m;
    if (m) this.nm.getNormalMatrix(m);
  }

  vertex(p: THREE.Vector3, n: THREE.Vector3, u: number, v: number, shade: number, w: VertexWind = STILL, cover = 0): number {
    let bend = this.bend(p);
    if (this.transform) {
      p = p.clone().applyMatrix4(this.transform);
      n = n.clone().applyMatrix3(this.nm).normalize();
      bend = this.bend(p);
    }
    this.pos.push(p.x, p.y, p.z);
    this.nor.push(n.x, n.y, n.z);
    this.uv.push(u, v);
    this.col.push(this.tint.r * shade, this.tint.g * shade, this.tint.b * shade);
    this.wnd.push(bend, w.phase, w.branch, w.flutter);
    this.cov.push(cover);
    return this.pos.length / 3 - 1;
  }

  tri(a: number, b: number, c: number): void { this.idx.push(a, b, c); }
  quad(a: number, b: number, c: number, d: number): void { this.idx.push(a, b, c, a, c, d); }

  /** A generalised cylinder along a path, its frame carried along by parallel transport. */
  tube(path: THREE.Vector3[], radii: number[], o: TubeOpts): void {
    const sides = o.sides, uRep = o.uRepeat ?? 1, vM = o.vMetres ?? 1.5;
    let normal = perpendicular(path[1].clone().sub(path[0]).normalize());
    const base = this.pos.length / 3;
    let len = 0;
    const saved = this.tint.clone();
    const ring: THREE.Vector3[] = [];
    for (let i = 0; i < path.length; i++) {
      const t = i / (path.length - 1);
      const tan = (i < path.length - 1 ? path[i + 1].clone().sub(path[i]) : path[i].clone().sub(path[i - 1])).normalize();
      normal.sub(tan.clone().multiplyScalar(normal.dot(tan))).normalize();
      if (normal.lengthSq() < 0.5) normal = perpendicular(tan);
      const bin = tan.clone().cross(normal);
      if (i > 0) len += path[i].distanceTo(path[i - 1]);
      if (o.color) this.tint.copy(saved).multiply(o.color(t));
      const w = o.wind ? o.wind(t) : STILL, shade = o.shade ? o.shade(t) : 1;
      for (let s = 0; s <= sides; s++) {
        const a = (s / sides) * Math.PI * 2;
        const n = normal.clone().multiplyScalar(Math.cos(a)).addScaledVector(bin, Math.sin(a));
        const rad = radii[i] * (o.shape ? o.shape(a, t) : 1);
        const p = path[i].clone().addScaledVector(n, rad);
        this.vertex(p, n, (s / sides) * uRep, len / vM, shade, w, o.cover ? o.cover(t, n) : 0);
        if (i === path.length - 1 && s < sides) ring.push(p);
      }
    }
    for (let i = 0; i < path.length - 1; i++)
      for (let s = 0; s < sides; s++) {
        const a = base + i * (sides + 1) + s, b = a + 1, c = a + sides + 1, d = c + 1;
        this.idx.push(a, b, c, b, d, c);
      }
    if (o.cap) {
      // a splintered end: a ring of jagged teeth around a sunken core, in pale torn wood
      const end = path[path.length - 1], tan = end.clone().sub(path[path.length - 2]).normalize();
      this.tint.copy(saved).multiply(o.cap.color);
      const core = this.vertex(end.clone().addScaledVector(tan, -o.cap.length * 0.2), tan, 0.5, 0.5, 0.8);
      const ids = ring.map((p, s) => {
        const tooth = o.cap!.r() * o.cap!.length * (s % 2 ? 1 : 0.35);
        const q = p.clone().lerp(end, 0.25 + o.cap!.r() * 0.25).addScaledVector(tan, tooth);
        return this.vertex(q, tan, 0.5 + 0.4 * Math.cos(s), 0.5 + 0.4 * Math.sin(s), 0.9);
      });
      for (let s = 0; s < ids.length; s++) this.tri(core, ids[s], ids[(s + 1) % ids.length]);
    }
    this.tint.copy(saved);
  }

  /** A flat card from an atlas cell. right and up span its width and height. */
  card(o: THREE.Vector3, right: THREE.Vector3, up: THREE.Vector3, w: number, h: number, cell: Cell, c: CardOpts = {}): void {
    const [ax, ay] = c.anchor ?? [0.5, 0.5];
    const face = right.clone().cross(up).normalize();
    const shade = c.shade ?? 1, wind = c.wind ?? STILL;
    const ids = [[0, 0], [1, 0], [1, 1], [0, 1]].map(([x, y]) => {
      const p = o.clone().addScaledVector(right, (x - ax) * w).addScaledVector(up, (y - ay) * h);
      let n = face;
      if (c.crown) {
        const out = p.clone().sub(c.crown);
        if (out.lengthSq() > 1e-6) n = out.normalize().multiplyScalar(0.8).addScaledVector(face, face.dot(out) < 0 ? -0.2 : 0.2).normalize();
      }
      const reach = Math.max(Math.abs(x - ax), Math.abs(y - ay));
      const cw = { phase: wind.phase, branch: wind.branch, flutter: wind.flutter * (0.25 + 0.75 * reach) };
      return this.vertex(p, n, lerp(cell.u0, cell.u1, x), lerp(cell.v0, cell.v1, y), shade, cw);
    });
    this.quad(ids[0], ids[1], ids[2], ids[3]);
  }

  /**
   * A strip along a path: fronds, moss strands and straps. The cell runs from its bottom edge at the path's start to its
   * top edge at the end; sides[i] spans the strip's width at point i.
   */
  ribbon(path: THREE.Vector3[], widths: number[], sides: THREE.Vector3[], cell: Cell, o: { shade?: (t: number) => number; wind?: (t: number) => VertexWind; up?: THREE.Vector3; crown?: THREE.Vector3 } = {}): void {
    const base = this.pos.length / 3;
    const n = path.length;
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      const tan = (i < n - 1 ? path[i + 1].clone().sub(path[i]) : path[i].clone().sub(path[i - 1])).normalize();
      let nor = sides[i].clone().cross(tan).normalize();
      if (o.up && nor.dot(o.up) < 0) nor.negate();
      if (o.crown) nor = nor.multiplyScalar(0.5).add(path[i].clone().sub(o.crown).normalize().multiplyScalar(0.5)).normalize();
      const shade = o.shade ? o.shade(t) : 1, w = o.wind ? o.wind(t) : STILL;
      const v = lerp(cell.v0, cell.v1, t);
      this.vertex(path[i].clone().addScaledVector(sides[i], -widths[i] / 2), nor, cell.u0, v, shade, w);
      this.vertex(path[i].clone().addScaledVector(sides[i], widths[i] / 2), nor, cell.u1, v, shade, w);
    }
    for (let i = 0; i < n - 1; i++) {
      const a = base + i * 2;
      this.quad(a, a + 1, a + 3, a + 2);
    }
  }

  /** A lumpy ellipsoid: snow pads, root plates, mounds. Its uvs wrap the bark (or cover) texture around it. */
  blob(c: THREE.Vector3, rad: THREE.Vector3, o: { r: () => number; segs?: [number, number]; rough?: number; flat?: number; cover?: number; shade?: number; rot?: THREE.Quaternion; wind?: VertexWind; uvScale?: number }): void {
    const [nu, nv] = o.segs ?? [8, 5];
    const rough = o.rough ?? 0.15, base = this.pos.length / 3;
    const bumps = Array.from({ length: 6 }, () => [o.r() * 6.28, o.r() * 6.28, 1 + Math.floor(o.r() * 3)]);
    for (let j = 0; j <= nv; j++) {
      const th = (j / nv) * Math.PI; // 0 at the top
      for (let i = 0; i <= nu; i++) {
        const ph = (i / nu) * Math.PI * 2;
        const d = V(Math.sin(th) * Math.cos(ph), Math.cos(th), Math.sin(th) * Math.sin(ph));
        let k = 1;
        for (const [a, b, f] of bumps) k += (rough / 3) * Math.sin(ph * f + a) * Math.sin(th * f + b);
        if (o.flat !== undefined && d.y < 0) d.y *= o.flat;
        const p = V(d.x * rad.x * k, d.y * rad.y * k, d.z * rad.z * k);
        const n = V(d.x / rad.x, d.y / rad.y, d.z / rad.z).normalize();
        if (o.rot) { p.applyQuaternion(o.rot); n.applyQuaternion(o.rot); }
        const s = o.uvScale ?? 1;
        this.vertex(p.add(c), n, (i / nu) * s * 2, (j / nv) * s, (o.shade ?? 1) * (0.75 + 0.25 * (d.y * 0.5 + 0.5)), o.wind ?? STILL, o.cover ?? 0);
      }
    }
    for (let j = 0; j < nv; j++)
      for (let i = 0; i < nu; i++) {
        const a = base + j * (nu + 1) + i, b = a + 1, cc = a + nu + 1, d = cc + 1;
        this.idx.push(a, b, cc, b, d, cc);
      }
  }

  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute('aWind', new THREE.Float32BufferAttribute(this.wnd, 4));
    g.setAttribute('aCover', new THREE.Float32BufferAttribute(this.cov, 1));
    g.setIndex(this.idx);
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }
}

/** A card hanging, rising or lying along a direction: right spans the width, the card extends along dir. */
export function cardAlong(g: Geo, o: THREE.Vector3, dir: THREE.Vector3, roll: number, w: number, len: number, cell: Cell, c: CardOpts = {}): void {
  const up = dir.clone().normalize();
  const side = perpendicular(up);
  const other = up.clone().cross(side);
  const right = side.multiplyScalar(Math.cos(roll)).addScaledVector(other, Math.sin(roll)).normalize();
  g.card(o, right, up, w, len, cell, { anchor: [0.5, 0], ...c });
}

// ---------------------------------------------------------------- textures

let texBase = `${import.meta.env?.BASE_URL ?? './'}tex/flora/a/`;
/** Where public/tex/flora/a is served from, if not the default. */
export function setTextureBase(url: string): void { texBase = url.endsWith('/') ? url : url + '/'; }

const texCache = new Map<string, THREE.Texture>();
function loadTex(file: string, color: boolean): THREE.Texture {
  let t = texCache.get(file);
  if (!t) {
    t = typeof document === 'undefined' ? new THREE.Texture() : new THREE.TextureLoader().load(texBase + file);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 8;
    if (color) t.colorSpace = THREE.SRGBColorSpace;
    texCache.set(file, t);
  }
  return t;
}

// ---------------------------------------------------------------- atlases painted in code

export type Painter = (g: CanvasRenderingContext2D, w: number, h: number, r: () => number) => void;
export interface CellSpec { x: number; y: number; w: number; h: number; paint: Painter }

/** A texture atlas of cards painted on a canvas at first use: needle sprays, fronds, moss strands, lichen. */
export class Atlas<K extends string> {
  private tex: THREE.Texture | null = null;
  private rects: Record<K, Cell>;
  readonly key: string;
  readonly size: number;
  private specs: Record<K, CellSpec>;
  constructor(key: string, size: number, specs: Record<K, CellSpec>) {
    this.key = key;
    this.size = size;
    this.specs = specs;
    const inset = 1.5 / size;
    this.rects = {} as Record<K, Cell>;
    for (const k of Object.keys(specs) as K[]) {
      const c = specs[k];
      // the canvas is flipped on upload: its top row is v = 1
      this.rects[k] = { u0: c.x / size + inset, u1: (c.x + c.w) / size - inset, v0: 1 - (c.y + c.h) / size + inset, v1: 1 - c.y / size - inset };
    }
  }
  cell(k: K): Cell { return this.rects[k]; }
  texture(): THREE.Texture {
    if (this.tex) return this.tex;
    if (typeof document === 'undefined') return (this.tex = new THREE.Texture());
    const canvas = this.paint();
    const t = new THREE.CanvasTexture(canvas);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    t.generateMipmaps = true;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    return (this.tex = t);
  }
  /** Paints the atlas (exposed for the dev page). */
  paint(): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = this.size;
    const g = canvas.getContext('2d')!;
    let n = 1;
    for (const k of Object.keys(this.specs) as K[]) {
      const c = this.specs[k];
      g.save();
      g.beginPath();
      g.rect(c.x, c.y, c.w, c.h);
      g.clip();
      g.translate(c.x, c.y);
      c.paint(g, c.w, c.h, rng(n++ * 7919 + this.size));
      g.restore();
    }
    bleed(g, this.size);
    return canvas;
  }
}

/** Spreads opaque colour into the transparent texels, so mipmaps don't darken the cards' edges. */
function bleed(g: CanvasRenderingContext2D, size: number): void {
  const img = g.getImageData(0, 0, size, size), d = img.data;
  const src = new Uint8ClampedArray(d);
  for (let pass = 0; pass < 3; pass++) {
    const prev = pass === 0 ? src : new Uint8ClampedArray(d);
    for (let y = 1; y < size - 1; y++)
      for (let x = 1; x < size - 1; x++) {
        const i = (y * size + x) * 4;
        if (prev[i + 3] > 8) continue;
        let r = 0, gg = 0, b = 0, n = 0;
        for (const o of [-4, 4, -size * 4, size * 4]) {
          if (prev[i + o + 3] > 8 || (pass > 0 && (prev[i + o] | prev[i + o + 1] | prev[i + o + 2]) > 0)) { r += prev[i + o]; gg += prev[i + o + 1]; b += prev[i + o + 2]; n++; }
        }
        if (n) { d[i] = r / n; d[i + 1] = gg / n; d[i + 2] = b / n; }
      }
  }
  g.putImageData(img, 0, 0);
}

/** hsl() with alpha, for painters. */
export const hsl = (h: number, s: number, l: number, a = 1) => `hsla(${h},${s}%,${l}%,${a})`;

/** A tapered stroke from (x, y) along angle a: a needle, a stem, a strand. */
export function stroke(g: CanvasRenderingContext2D, x: number, y: number, a: number, len: number, w: number, col: string, curve = 0): void {
  const ex = x + Math.cos(a) * len, ey = y + Math.sin(a) * len;
  const mx = (x + ex) / 2 - Math.sin(a) * curve * len, my = (y + ey) / 2 + Math.cos(a) * curve * len;
  g.strokeStyle = col;
  g.lineWidth = w;
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(x, y);
  g.quadraticCurveTo(mx, my, ex, ey);
  g.stroke();
}

/** A leaf or leaflet: two curves meeting at its tip. */
export function leaf(g: CanvasRenderingContext2D, x: number, y: number, a: number, len: number, wid: number, col: string, rib?: string): void {
  g.save();
  g.translate(x, y);
  g.rotate(a);
  g.beginPath();
  g.moveTo(0, 0);
  g.quadraticCurveTo(len * 0.4, -wid, len, 0);
  g.quadraticCurveTo(len * 0.4, wid, 0, 0);
  g.fillStyle = col;
  g.fill();
  if (rib) stroke(g, 0, 0, 0, len * 0.85, Math.max(0.6, wid * 0.12), rib);
  g.restore();
}

// ---------------------------------------------------------------- materials

export type BarkName = 'fir' | 'pine' | 'cedar' | 'crown';
export type CoverName = 'snow' | 'moss';

const BARK_FILES: Record<BarkName, string> = { fir: 'fir_bark', pine: 'pine_bark', cedar: 'cedar_bark', crown: 'crown_bark' };
const COVER: Record<CoverName, { file: string; tint: THREE.Color; scale: number }> = {
  snow: { file: 'snow', tint: new THREE.Color(1.3, 1.34, 1.42), scale: 0.6 },
  moss: { file: 'moss', tint: new THREE.Color(0.85, 1.0, 0.75), scale: 0.4 },
};

const matCache = new Map<string, THREE.Material>();

/** Scanned bark, optionally with snow or moss lying on its upper faces and wherever aCover asks for it. */
export function barkMaterial(bark: BarkName, cover?: CoverName): THREE.Material {
  const key = `bark-${bark}-${cover ?? 'bare'}`;
  const m = matCache.get(key);
  if (m) return m;
  const mat = new THREE.MeshStandardMaterial({
    map: loadTex(`${BARK_FILES[bark]}_d.jpg`, true),
    normalMap: loadTex(`${BARK_FILES[bark]}_n.jpg`, false),
    normalScale: new THREE.Vector2(1.6, 1.6),
    roughness: 0.92,
    metalness: 0,
    vertexColors: true,
  });
  const cv = cover ? COVER[cover] : null;
  tag(mat, { kit: 'A', cover: cv ? { map: loadTex(`${cv.file}_d.jpg`, true), tint: cv.tint, scale: cv.scale } : undefined });
  matCache.set(key, mat);
  return mat;
}

/** Alpha-tested cards from a painted atlas: needles, fronds, strands. Normals are not flipped on back faces. */
export function cardMaterial(atlas: Atlas<string>): THREE.Material {
  const key = 'cards-' + atlas.key;
  const m = matCache.get(key);
  if (m) return m;
  const map = atlas.texture();
  const mat = new THREE.MeshStandardMaterial({ map, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.82, metalness: 0, vertexColors: true });
  tag(mat, { kit: 'A', cutout: 1024, crownNormals: true });
  matCache.set(key, mat);
  return mat;
}

// ---------------------------------------------------------------- assembling plants

export interface Part { geo: Geo; mat: THREE.Material }

/** Turns a plant's parts into one object: a mesh per material, casting and receiving shadows. */
export function assemble(name: string, lod: number, parts: Part[]): THREE.Group {
  const group = new THREE.Group();
  group.name = `${name}@${lod}`;
  let tris = 0;
  for (const p of parts) {
    if (!p.geo.triangles) continue;
    const mesh = new THREE.Mesh(p.geo.build(), p.mat);
    mesh.castShadow = lod < 2;
    mesh.receiveShadow = lod < 2;
    tris += p.geo.triangles;
    group.add(mesh);
  }
  group.userData.triangles = tris;
  return group;
}
