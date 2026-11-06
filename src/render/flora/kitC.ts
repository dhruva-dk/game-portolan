// Flora C's kit: what the Glass Sea, Jade Shoals, Coral Atolls and Spice Isles plants are built from.
// A seeded random stream, a geometry builder (tubes, strips, leaf cards), wind-swayed materials over scanned
// or painted textures, and helpers to wrap a plant in LODs or instance it hundreds of times.
//
// Every plant is built in its own frame: metres, +Y up from the ground at the origin. The integration step
// turns +Y to the sphere's local up. Wind is three shared uniforms (WIND), set once a frame for every plant.
import * as THREE from 'three';
import { tag, type FloraTag } from './tag.ts';

// ---------------------------------------------------------------- the API every region file exports

/** 0 is full detail (read at 10 m), 1 is form and branching (50 m), 2 is the silhouette (300 m). */
export type Lod = 0 | 1 | 2;
export const LODS: readonly Lod[] = [0, 1, 2];
/** Camera distance in metres at which each LOD takes over. */
export const LOD_DISTANCES: readonly [number, number, number] = [0, 30, 110];

export interface Placement {
  /** Ground height range, metres above mean sea level. Under-water plants use negative heights. */
  minHeight: number;
  maxHeight: number;
  /** The steepest ground it grows on, in degrees from flat. */
  maxSlope: number;
  /** Plants per 100 m² of ground that fits the rules above. */
  density: number;
  /** Radius in metres of the groups it grows in. 0 scatters plants evenly. */
  cluster: number;
}

export interface Plant {
  id: string;
  name: string;
  /** The same seed gives the same plant at every LOD; only the detail changes. */
  build(seed: number, lod: Lod): THREE.Object3D;
  placement: Placement;
}

// ---------------------------------------------------------------- random

export type Rand = () => number;

/** A seeded stream in [0, 1) (mulberry32 over a hashed seed). */
export function rng(seed: number): Rand {
  let s = Math.imul((seed | 0) ^ 0x5bd1e995, 0x9e3779b1) >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const between = (r: Rand, a: number, b: number): number => a + (b - a) * r();
export const V = (x = 0, y = 0, z = 0): THREE.Vector3 => new THREE.Vector3(x, y, z);
/** A unit vector at angle a around +Y, tilted up by `up` (0 is level, 1 is straight up). */
export const dirAt = (a: number, up: number): THREE.Vector3 => V(Math.cos(a) * (1 - up), up, Math.sin(a) * (1 - up)).normalize();
export const smooth = (t: number): number => t * t * (3 - 2 * t);

/** A colour from sRGB hue (0-360), saturation and lightness (0-100), in the renderer's linear space. */
export function hsl(h: number, s: number, l: number): THREE.Color {
  return new THREE.Color().setHSL((((h % 360) + 360) % 360) / 360, s / 100, l / 100);
}
export const mix = (a: THREE.Color, b: THREE.Color, t: number): THREE.Color => a.clone().lerp(b, t);

// ---------------------------------------------------------------- wind

/** Shared by every plant material. Direction is in world space; strength is 0 (calm) to 1 (a gale). */
export const WIND = {
  uWindDir: { value: V(1, 0, 0) },
  uWindStrength: { value: 0.35 },
  uTime: { value: 0 },
};

export function setWind(dir: THREE.Vector3, strength: number): void {
  WIND.uWindDir.value.copy(dir).normalize();
  WIND.uWindStrength.value = strength;
}
export function tickWind(seconds: number): void {
  WIND.uTime.value = seconds;
}

// aSway: metres a point leans at full strength (the whole plant bends). aFlutter: metres a leaf flaps along its normal.
const WIND_HEAD = /* glsl */ `
attribute float aSway;
attribute float aFlutter;
uniform vec3 uWindDir;
uniform float uWindStrength;
uniform float uTime;
`;
const WIND_BODY = /* glsl */ `
{
  mat4 wm = modelMatrix;
  #ifdef USE_INSTANCING
  wm = wm * instanceMatrix;
  #endif
  vec3 wo = wm[3].xyz;
  float ph = dot(wo, vec3(0.137, 0.091, 0.113));
  // the world wind turned into the plant's own frame, flattened onto its ground
  vec3 wl = transpose(mat3(wm)) * uWindDir;
  wl.y = 0.0;
  wl = dot(wl, wl) > 1e-8 ? normalize(wl) : vec3(1.0, 0.0, 0.0);
  vec3 ws = vec3(-wl.z, 0.0, wl.x);
  float s = uWindStrength;
  #ifdef FLORA_SURGE
  // under water the swell rocks soft corals to and fro, with no steady lean
  float surge = sin(uTime * 0.9 + ph) + 0.35 * sin(uTime * 2.3 + ph * 1.7);
  transformed += (wl * surge + ws * 0.3 * sin(uTime * 0.7 + ph * 2.1)) * aSway * (0.3 + 0.7 * s);
  #else
  float gust = 0.6 + 0.4 * sin(uTime * 0.63 + ph) * sin(uTime * 0.21 + ph * 0.7);
  float lean = s * s * gust;
  float swing = (0.15 + s) * (sin(uTime * 1.7 + ph * 3.1) * 0.22 + sin(uTime * 2.9 + ph * 1.3) * 0.08);
  float side = (0.15 + s) * sin(uTime * 1.3 + ph * 2.3) * 0.1;
  transformed += (wl * (lean + swing) + ws * side) * aSway;
  transformed.y -= aSway * lean * lean * 0.3;
  #endif
  transformed += normal * aFlutter * (0.2 + s) * sin(uTime * (6.0 + 3.0 * s) + dot(position, vec3(1.9, 2.3, 1.7)) + ph * 5.0);
}
`;

// Leaves let the sun through from behind, and keep their coverage in the distance where mipmaps thin the alpha.
const LEAF_ALPHA = /* glsl */ `
#include <alphamap_fragment>
#ifdef USE_MAP
{
  vec2 tsz = vec2(textureSize(map, 0));
  vec2 ddx = dFdx(vMapUv * tsz), ddy = dFdy(vMapUv * tsz);
  diffuseColor.a *= 1.0 + max(0.0, 0.5 * log2(max(dot(ddx, ddx), dot(ddy, ddy)))) * 0.22;
}
#endif
`;
const LEAF_LIGHT = /* glsl */ `
#include <lights_fragment_end>
#if NUM_DIR_LIGHTS > 0
{
  vec3 tL = directionalLights[ 0 ].direction;
  float tBack = pow(clamp(dot(-geometryViewDir, tL), 0.0, 1.0), 3.0);
  float tThru = clamp(dot(-normal, tL), 0.0, 1.0);
  reflectedLight.directDiffuse += diffuseColor.rgb * directionalLights[ 0 ].color * (tBack * 0.55 + tThru * 0.3) * FLORA_TRANSLUCENT;
}
#endif
`;

export interface MaterialOptions {
  map?: THREE.Texture;
  normalMap?: THREE.Texture;
  normalScale?: number;
  alphaMap?: THREE.Texture;
  roughness?: number;
  metalness?: number;
  /** Alpha-tested, two-sided and lit through from behind by this much (0 to 1). */
  leaf?: number;
  /** Two-sided without being a leaf (open shells like plate coral). */
  doubleSide?: boolean;
  /** Sway with the under-water swell instead of the wind. */
  surge?: boolean;
  /** Extra shader edits, run after the wind and leaf edits. */
  patch?: (s: THREE.WebGLProgramParametersWithUniforms) => void;
  /** Extra uniforms the patch reads. */
  uniforms?: Record<string, THREE.IUniform>;
  /** What the patch draws, for the WebGPU planet, which makes its own. */
  coral?: FloraTag['coral'];
}

export interface PlantMaterial {
  mat: THREE.MeshStandardMaterial;
  depth: THREE.MeshDepthMaterial;
}

const materials = new Map<string, PlantMaterial>();

/** One material per key, shared by every plant built with it, so copies batch and instance. */
export function plantMaterial(key: string, make: () => MaterialOptions): PlantMaterial {
  const hit = materials.get(key);
  if (hit) return hit;
  const o = make();
  const leaf = o.leaf !== undefined;
  const side = leaf || o.doubleSide ? THREE.DoubleSide : THREE.FrontSide;
  const alphaTest = leaf ? 0.45 : 0;
  const mat = new THREE.MeshStandardMaterial({
    map: o.map ?? null,
    normalMap: o.normalMap ?? null,
    alphaMap: o.alphaMap ?? null,
    roughness: o.roughness ?? 0.85,
    metalness: o.metalness ?? 0,
    vertexColors: true,
    side,
    alphaTest,
    alphaToCoverage: leaf,
  });
  if (o.normalMap) mat.normalScale.setScalar(o.normalScale ?? 1);
  const defines = (s: THREE.WebGLProgramParametersWithUniforms) => {
    s.defines = s.defines ?? {};
    if (o.surge) s.defines.FLORA_SURGE = '';
  };
  mat.onBeforeCompile = (s) => {
    Object.assign(s.uniforms, WIND, o.uniforms ?? {});
    defines(s);
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\n' + WIND_HEAD)
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n' + WIND_BODY);
    if (leaf) {
      s.fragmentShader = s.fragmentShader
        .replace('#include <common>', `#include <common>\n#define FLORA_TRANSLUCENT ${(o.leaf ?? 0).toFixed(3)}`)
        .replace('#include <alphamap_fragment>', LEAF_ALPHA)
        .replace('#include <lights_fragment_end>', LEAF_LIGHT);
    }
    o.patch?.(s);
  };
  mat.customProgramCacheKey = () => 'floraC:' + key;
  tag(mat, { kit: 'C', surge: !!o.surge, cutout: leaf ? 0 : undefined, translucency: leaf ? o.leaf : 0, coral: o.coral });
  const depth = new THREE.MeshDepthMaterial({
    depthPacking: THREE.RGBADepthPacking,
    map: leaf ? (o.map ?? null) : null,
    alphaMap: leaf ? (o.alphaMap ?? null) : null,
    alphaTest,
    side,
  });
  depth.onBeforeCompile = (s) => {
    Object.assign(s.uniforms, WIND);
    defines(s);
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\n' + WIND_HEAD)
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n' + WIND_BODY);
  };
  depth.customProgramCacheKey = () => 'floraC-depth:' + key;
  const out = { mat, depth };
  materials.set(key, out);
  return out;
}

// ---------------------------------------------------------------- textures

let ROOT = import.meta.env?.BASE_URL ?? '';
const textures = new Map<string, THREE.Texture>();
const pending: Promise<unknown>[] = [];

/** Where public/ is served from, relative to the page: '' in the app, '/' or '../' from a dev page. */
export function setTextureRoot(root: string): void {
  ROOT = root;
}

/** Resolves once every scanned texture asked for so far has loaded. */
export function texturesReady(): Promise<void> {
  return Promise.all(pending).then(() => undefined);
}

/** A scanned texture from public/tex/flora/c/, loaded once. Colour maps are sRGB, the rest linear. */
export function scanTexture(file: string, srgb: boolean): THREE.Texture {
  const hit = textures.get(file);
  if (hit) return hit;
  let done: (v?: unknown) => void = () => {};
  pending.push(new Promise((res) => (done = res)));
  const t = new THREE.TextureLoader().load(`${ROOT}tex/flora/c/${file}`, () => done(), undefined, () => done());
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  textures.set(file, t);
  return t;
}

/** A bark's colour and normal maps: <name>_d.jpg and <name>_n.jpg. */
export function barkMaps(name: string): Pick<MaterialOptions, 'map' | 'normalMap'> {
  return { map: scanTexture(`${name}_d.jpg`, true), normalMap: scanTexture(`${name}_n.jpg`, false) };
}

/** A scanned leaf set: colour, normal and opacity (<name>_a.jpg). */
export function leafMaps(name: string): Pick<MaterialOptions, 'map' | 'normalMap' | 'alphaMap'> {
  const map = scanTexture(`${name}_d.jpg`, true), normalMap = scanTexture(`${name}_n.jpg`, false), alphaMap = scanTexture(`${name}_a.jpg`, false);
  for (const t of [map, normalMap, alphaMap]) t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return { map, normalMap, alphaMap };
}

/** A texture painted in code on a canvas, once. */
export function paintedTexture(key: string, w: number, h: number, paint: (g: CanvasRenderingContext2D, w: number, h: number) => void, srgb = true): THREE.Texture {
  const hit = textures.get('painted:' + key);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  paint(g, w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  t.anisotropy = 4;
  textures.set('painted:' + key, t);
  return t;
}

/** A canvas colour from hue, saturation, lightness and alpha. */
export const css = (h: number, s: number, l: number, a = 1): string => `hsla(${h},${s}%,${l}%,${a})`;

// ---------------------------------------------------------------- leaf atlases

/** A scanned leaf set laid out in a grid of cells, one leaf per cell. */
export interface Atlas {
  cols: number;
  rows: number;
  /** Where the stem points in each cell. */
  stem: 'down' | 'left';
  /** A cell's width over its height, in texels. */
  aspect: number;
}

type Rect = [number, number, number, number];

function cellRect(a: Atlas, i: number): Rect {
  const c = i % a.cols, r = Math.floor(i / a.cols) % a.rows;
  return [c / a.cols, 1 - (r + 1) / a.rows, (c + 1) / a.cols, 1 - r / a.rows];
}

// ---------------------------------------------------------------- geometry

export type Col = THREE.Color;
type PerPoint<T> = T | ((i: number, t: number) => T);
const at = <T>(f: PerPoint<T>, i: number, t: number): T => (typeof f === 'function' ? (f as (i: number, t: number) => T)(i, t) : f);

export interface Wind {
  /** Metres it leans at full wind. */
  sway?: PerPoint<number>;
  /** Metres it flutters along its normal. */
  flutter?: PerPoint<number>;
}

const _a = V(), _b = V(), _c = V(), _n = V();

/** Accumulates one mesh's worth of vertices: position, normal, uv, colour and the two wind weights. */
export class Geo {
  pos: number[] = [];
  nor: number[] = [];
  uv: number[] = [];
  col: number[] = [];
  sway: number[] = [];
  flut: number[] = [];
  idx: number[] = [];

  get empty(): boolean {
    return this.idx.length === 0;
  }
  get count(): number {
    return this.pos.length / 3;
  }

  vert(p: THREE.Vector3, n: THREE.Vector3, u: number, v: number, c: Col, sway = 0, flutter = 0): number {
    this.pos.push(p.x, p.y, p.z);
    this.nor.push(n.x, n.y, n.z);
    this.uv.push(u, v);
    this.col.push(c.r, c.g, c.b);
    this.sway.push(sway);
    this.flut.push(flutter);
    return this.count - 1;
  }
  tri(a: number, b: number, c: number): void {
    this.idx.push(a, b, c);
  }
  quad(a: number, b: number, c: number, d: number): void {
    this.idx.push(a, b, c, a, c, d);
  }

  /** A generalised cylinder along a path, its frame carried by parallel transport. v runs in metres × vScale. */
  tube(path: THREE.Vector3[], radii: number[], sides: number, color: PerPoint<Col>, wind: Wind = {}, uRepeat = 1, vScale = 0.5, cap = false): void {
    const base = this.count;
    let normal = Math.abs(path[1].clone().sub(path[0]).normalize().y) > 0.9 ? V(1, 0, 0) : V(0, 1, 0);
    let len = 0;
    const n = path.length;
    for (let i = 0; i < n; i++) {
      const tan = (i < n - 1 ? _a.copy(path[i + 1]).sub(path[i]) : _a.copy(path[i]).sub(path[i - 1])).normalize();
      if (i > 0 && i < n - 1) tan.add(_b.copy(path[i]).sub(path[i - 1]).normalize()).normalize();
      normal.sub(_b.copy(tan).multiplyScalar(normal.dot(tan)));
      if (normal.lengthSq() < 1e-6) normal = V(0, 0, 1).cross(tan);
      normal.normalize();
      const bin = _c.copy(tan).cross(normal);
      if (i > 0) len += path[i].distanceTo(path[i - 1]);
      const t = i / (n - 1), c = at(color, i, t), sw = at(wind.sway ?? 0, i, t), fl = at(wind.flutter ?? 0, i, t);
      for (let s = 0; s <= sides; s++) {
        const a = (s / sides) * Math.PI * 2;
        _n.copy(normal).multiplyScalar(Math.cos(a)).addScaledVector(bin, Math.sin(a));
        this.vert(_b.copy(path[i]).addScaledVector(_n, radii[i]), _n, (s / sides) * uRepeat, len * vScale, c, sw, fl);
      }
    }
    for (let i = 0; i < n - 1; i++)
      for (let s = 0; s < sides; s++) {
        const a = base + i * (sides + 1) + s;
        this.quad(a, a + sides + 1, a + sides + 2, a + 1);
      }
    if (cap) {
      const i = n - 1, t = 1;
      const tip = this.vert(path[i], _a.copy(path[i]).sub(path[i - 1]).normalize(), 0.5, len * vScale, at(color, i, t), at(wind.sway ?? 0, i, t), 0);
      const ring = base + i * (sides + 1);
      for (let s = 0; s < sides; s++) this.tri(ring + s, ring + s + 1, tip);
    }
  }

  /**
   * A strip along a spine. At point i it spans from spine[i] + side[i]·w0[i] (u0) to spine[i] + side[i]·w1[i] (u1);
   * v runs from v0 at the first point to v1 at the last.
   */
  strip(spine: THREE.Vector3[], side: THREE.Vector3[], w0: number[], w1: number[], normals: THREE.Vector3[], uv: Rect, color: PerPoint<Col>, wind: Wind = {}, edgeFlutter: [number, number] = [1, 1]): void {
    const base = this.count, n = spine.length;
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1), v = uv[1] + (uv[3] - uv[1]) * t;
      const c = at(color, i, t), sw = at(wind.sway ?? 0, i, t), fl = at(wind.flutter ?? 0, i, t);
      this.vert(_a.copy(spine[i]).addScaledVector(side[i], w0[i]), normals[i], uv[0], v, c, sw, fl * edgeFlutter[0]);
      this.vert(_a.copy(spine[i]).addScaledVector(side[i], w1[i]), normals[i], uv[2], v, c, sw, fl * edgeFlutter[1]);
    }
    for (let i = 0; i < n - 1; i++) {
      const a = base + i * 2;
      this.quad(a, a + 1, a + 3, a + 2);
    }
  }

  /**
   * One leaf from a scanned atlas: hinged at its stem, folded up along the midrib and curled back towards the tip.
   * `along` and `face` should be unit length and roughly perpendicular.
   */
  leaf(stem: THREE.Vector3, along: THREE.Vector3, face: THREE.Vector3, length: number, atlas: Atlas, cell: number, color: Col, o: { segs?: number; fold?: number; curl?: number; sway?: number; flutter?: number; crown?: THREE.Vector3 } = {}): void {
    const r = cellRect(atlas, cell);
    const segs = o.segs ?? 2, fold = o.fold ?? 0.2, curl = o.curl ?? 0.15;
    const right = _c.copy(face).cross(along).normalize().clone();
    const width = atlas.stem === 'down' ? length * atlas.aspect : length / atlas.aspect;
    const base = this.count;
    const nrm = V();
    for (let j = 0; j <= segs; j++) {
      const a = j / segs;
      for (let k = 0; k < 3; k++) {
        const b = k / 2 - 0.5;
        const p = stem.clone().addScaledVector(along, a * length).addScaledVector(right, b * width)
          .addScaledVector(face, Math.abs(b) * width * fold - a * a * length * curl);
        nrm.copy(face).addScaledVector(right, -Math.sign(b) * fold * 0.8);
        if (o.crown) nrm.normalize().multiplyScalar(0.5).add(_n.copy(p).sub(o.crown).normalize().multiplyScalar(0.5));
        nrm.normalize();
        const u = atlas.stem === 'down' ? r[0] + (b + 0.5) * (r[2] - r[0]) : r[0] + a * (r[2] - r[0]);
        const v = atlas.stem === 'down' ? r[1] + a * (r[3] - r[1]) : r[1] + (b + 0.5) * (r[3] - r[1]);
        this.vert(p, nrm, u, v, color, o.sway ?? 0, (o.flutter ?? 0) * a);
      }
    }
    for (let j = 0; j < segs; j++)
      for (let k = 0; k < 2; k++) {
        const a = base + j * 3 + k;
        this.quad(a, a + 1, a + 4, a + 3);
      }
  }

  /** A flat card with any uv rectangle, centred on c; its normals lean out from `crown` when one is given. */
  card(c: THREE.Vector3, right: THREE.Vector3, up: THREE.Vector3, w: number, h: number, uv: Rect, color: Col, o: { sway?: number; flutter?: number; crown?: THREE.Vector3; anchorBottom?: boolean } = {}): void {
    const face = _c.copy(right).cross(up).normalize().clone();
    const y0 = o.anchorBottom ? 0 : -0.5;
    const ids = [[-0.5, y0, uv[0], uv[1]], [0.5, y0, uv[2], uv[1]], [0.5, y0 + 1, uv[2], uv[3]], [-0.5, y0 + 1, uv[0], uv[3]]].map(([x, y, u, v]) => {
      const p = c.clone().addScaledVector(right, x * w).addScaledVector(up, y * h);
      const n = o.crown ? _n.copy(p).sub(o.crown).normalize().multiplyScalar(0.7).addScaledVector(face, 0.3).normalize() : face;
      return this.vert(p, n, u, v, color, o.sway ?? 0, (o.flutter ?? 0) * (y - y0));
    });
    this.quad(ids[0], ids[1], ids[2], ids[3]);
  }

  /** Merge a three.js geometry, moved by m. Colour and wind may depend on the moved position. */
  geometry(src: THREE.BufferGeometry, m: THREE.Matrix4, color: Col | ((p: THREE.Vector3) => Col), wind: { sway?: number | ((p: THREE.Vector3) => number); flutter?: number } = {}): void {
    const g = src;
    const P = g.getAttribute('position'), N = g.getAttribute('normal'), U = g.getAttribute('uv');
    const nm = new THREE.Matrix3().getNormalMatrix(m);
    const base = this.count;
    for (let i = 0; i < P.count; i++) {
      const p = _a.fromBufferAttribute(P, i).applyMatrix4(m);
      const n = _b.fromBufferAttribute(N, i).applyMatrix3(nm).normalize();
      const c = typeof color === 'function' ? color(p) : color;
      const sw = typeof wind.sway === 'function' ? wind.sway(p) : (wind.sway ?? 0);
      this.vert(p, n, U ? U.getX(i) : 0, U ? U.getY(i) : 0, c, sw, wind.flutter ?? 0);
    }
    if (g.index) for (let i = 0; i < g.index.count; i++) this.idx.push(base + g.index.getX(i));
    else for (let i = 0; i < P.count; i++) this.idx.push(base + i);
  }

  /** Copy another Geo in, moved by m, keeping its colours, uvs and wind weights. */
  append(o: Geo, m: THREE.Matrix4): void {
    const nm = new THREE.Matrix3().getNormalMatrix(m), base = this.count;
    for (let i = 0; i < o.count; i++) {
      _a.fromArray(o.pos, i * 3).applyMatrix4(m);
      _b.fromArray(o.nor, i * 3).applyMatrix3(nm).normalize();
      this.pos.push(_a.x, _a.y, _a.z);
      this.nor.push(_b.x, _b.y, _b.z);
    }
    for (const x of o.uv) this.uv.push(x);
    for (const x of o.col) this.col.push(x);
    for (const x of o.sway) this.sway.push(x);
    for (const x of o.flut) this.flut.push(x);
    for (const i of o.idx) this.idx.push(base + i);
  }

  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute('aSway', new THREE.Float32BufferAttribute(this.sway, 1));
    g.setAttribute('aFlutter', new THREE.Float32BufferAttribute(this.flut, 1));
    g.setIndex(this.count > 65535 ? new THREE.Uint32BufferAttribute(this.idx, 1) : new THREE.Uint16BufferAttribute(this.idx, 1));
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }
}

/** Points along a path that starts at `from` heading `dir`, wandering by `bend` and pulled by `pull` each step. */
export function grow(from: THREE.Vector3, dir: THREE.Vector3, length: number, steps: number, r: Rand, bend = 0.2, pull = V()): THREE.Vector3[] {
  const pts = [from.clone()];
  const d = dir.clone().normalize(), p = from.clone();
  for (let i = 0; i < steps; i++) {
    d.add(V((r() - 0.5) * bend, (r() - 0.5) * bend, (r() - 0.5) * bend)).add(pull).normalize();
    p.addScaledVector(d, length / steps);
    pts.push(p.clone());
  }
  return pts;
}

/** Radii from a to b over n points. */
export const taper = (n: number, a: number, b: number, k = 1): number[] => Array.from({ length: n }, (_, i) => a + (b - a) * Math.pow(i / (n - 1), k));

/** Resample a path to n points by arc length (straight lines between the given points). */
export function resample(path: THREE.Vector3[], n: number): THREE.Vector3[] {
  const d = [0];
  for (let i = 1; i < path.length; i++) d.push(d[i - 1] + path[i].distanceTo(path[i - 1]));
  const L = d[d.length - 1], out: THREE.Vector3[] = [];
  let j = 0;
  for (let i = 0; i < n; i++) {
    const s = (L * i) / (n - 1);
    while (j < path.length - 2 && d[j + 1] < s) j++;
    const t = (s - d[j]) / Math.max(1e-6, d[j + 1] - d[j]);
    out.push(path[j].clone().lerp(path[j + 1], Math.min(1, Math.max(0, t))));
  }
  return out;
}

/** A point on a path by fraction of its points (not arc length), and the direction there. */
export function along(path: THREE.Vector3[], t: number): { p: THREE.Vector3; d: THREE.Vector3 } {
  const f = t * (path.length - 1), i = Math.min(path.length - 2, Math.floor(f));
  const d = path[i + 1].clone().sub(path[i]);
  return { p: path[i].clone().addScaledVector(d, f - i), d: d.normalize() };
}

// ---------------------------------------------------------------- assembling plants

export interface Part {
  geo: Geo;
  mat: PlantMaterial;
}

/** Wrap a plant's parts into one group: a mesh per material, with shadows and its wind-aware depth material. */
export function assemble(name: string, lod: Lod, parts: Part[]): THREE.Group {
  const group = new THREE.Group();
  group.name = name;
  let triangles = 0;
  for (const p of parts) {
    if (p.geo.empty) continue;
    const geo = p.geo.build();
    const mesh = new THREE.Mesh(geo, p.mat.mat);
    mesh.customDepthMaterial = p.mat.depth;
    mesh.castShadow = lod < 2;
    mesh.receiveShadow = true;
    triangles += geo.index!.count / 3;
    group.add(mesh);
  }
  group.userData = { lod, triangles };
  return group;
}

/** A plant at all three LODs, switching at LOD_DISTANCES. */
export function plantLOD(plant: Plant, seed: number): THREE.LOD {
  const lod = new THREE.LOD();
  for (const l of LODS) lod.addLevel(plant.build(seed, l), LOD_DISTANCES[l]);
  return lod;
}

/**
 * Many copies of one built plant as instanced meshes (one draw call per material). Each matrix places a copy
 * in its parent's frame; an optional colour per copy multiplies its vertex colours for variety.
 */
export function instancePlant(built: THREE.Object3D, matrices: readonly THREE.Matrix4[], colors?: readonly THREE.Color[]): THREE.Group {
  const out = new THREE.Group();
  out.name = built.name + ' ×' + matrices.length;
  built.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    const im = new THREE.InstancedMesh(o.geometry, o.material, matrices.length);
    matrices.forEach((m, i) => im.setMatrixAt(i, m));
    colors?.forEach((c, i) => im.setColorAt(i, c));
    im.customDepthMaterial = o.customDepthMaterial;
    im.castShadow = o.castShadow;
    im.receiveShadow = o.receiveShadow;
    im.computeBoundingSphere();
    out.add(im);
  });
  return out;
}

/** Triangles in a built plant. */
export const triangles = (o: THREE.Object3D): number => (o.userData.triangles as number | undefined) ?? 0;
