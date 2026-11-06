// The beacon kit: what every regional beacon is built from. A beacon is one THREE.Group whose materials all read
// one shared clock (time and how dark it is), so animating it is two uniform writes. Lit parts are node materials
// with glow and surface detail written in TSL (nodes.ts); glows, halos, sparks, mist and flames are instanced
// billboards whose motion runs entirely on the GPU. Units are metres, +Y is up, y = 0 is sea level.
import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import {
  litNode, particlesNode, shapeHalo, surfaceNode, type Clocked, type F, type LitNodes, type ParticleNodes, type SurfaceNodes, type V4,
} from './nodes.ts';

// ---------------------------------------------------------------- randomness and noise (JS side)

/** A small seeded generator (mulberry32): the same seed always builds the same beacon. */
export function rng(seed: number): () => number {
  let a = (seed | 0) ^ 0x9e3779b9;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const hash3 = (x: number, y: number, z: number, s: number): number => {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(z | 0, 2147483647) ^ Math.imul(s | 0, 144665);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

/** Smooth 3D value noise in [-1, 1], for shaping geometry. */
export function noise3(x: number, y: number, z: number, seed = 0): number {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const xf = x - xi, yf = y - yi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf);
  const l = (a: number, b: number, t: number) => a + (b - a) * t;
  const c = (dx: number, dy: number, dz: number) => hash3(xi + dx, yi + dy, zi + dz, seed);
  return 2 * l(
    l(l(c(0, 0, 0), c(1, 0, 0), u), l(c(0, 1, 0), c(1, 1, 0), u), v),
    l(l(c(0, 0, 1), c(1, 0, 1), u), l(c(0, 1, 1), c(1, 1, 1), u), v),
    w,
  ) - 1;
}

/** Fractal noise: `oct` octaves of noise3, roughly in [-1, 1]. */
export function fbm3(x: number, y: number, z: number, seed = 0, oct = 4): number {
  let s = 0, a = 0.5, f = 1, n = 0;
  for (let i = 0; i < oct; i++) { s += a * noise3(x * f, y * f, z * f, seed + i * 17); n += a; a *= 0.5; f *= 2.03; }
  return s / n;
}

// ---------------------------------------------------------------- the clock and the beacon root

/** Every material in one beacon reads these by reference: seconds, and 0 for full day up to 1 for full night. */
export interface Clock { uTime: { value: number }; uNight: { value: number } }

type Tick = (t: number, night: number) => void;

/** What a beacon keeps in its root's userData so update() can drive it. */
export interface BeaconState {
  clock: Clock;
  ticks: Tick[];
  /** The beacon's current light, 0..1 of its look's light.intensity: a point light near it can follow this. */
  light: number;
  pulse: (t: number) => number;
}

/** The builder a look's build() works through: the root group, its clock, its random stream and its helpers. */
export class Kit {
  readonly root = new THREE.Group();
  readonly clock: Clock = { uTime: { value: 0 }, uNight: { value: 1 } };
  readonly rand: () => number;
  readonly state: BeaconState;
  readonly seed: number;

  constructor(seed: number, name: string) {
    this.seed = seed;
    this.rand = rng(seed);
    this.root.name = name;
    this.state = { clock: this.clock, ticks: [], light: 1, pulse: () => 1 };
    this.root.userData.beacon = this.state;
  }

  /** A uniform float in [a, b). */
  r(a = 0, b = 1): number { return a + (b - a) * this.rand(); }

  add<T extends THREE.Object3D>(o: T, parent: THREE.Object3D = this.root): T { parent.add(o); return o; }

  /** Runs every update, after the clock is set: CPU-side animation such as turning a group. */
  onTick(fn: Tick): void { this.state.ticks.push(fn); }

  /** The rhythm a point light near the beacon should follow (the beacon's own pulse). */
  setPulse(fn: (t: number) => number): void { this.state.pulse = fn; }
}

/** The shared update(): every look uses it. `night` is 0 by day and 1 at full night. */
export function tick(obj: THREE.Object3D, t: number, night: number): void {
  const s = obj.userData.beacon as BeaconState | undefined;
  if (!s) return;
  s.clock.uTime.value = t;
  s.clock.uNight.value = night;
  for (const f of s.ticks) f(t, night);
  s.light = night * s.pulse(t);
}

// ---------------------------------------------------------------- lit materials with glow

export interface LitOptions extends LitNodes {
  color: THREE.ColorRepresentation;
  roughness?: number;
  metalness?: number;
  flat?: boolean;
  side?: THREE.Side;
  transparent?: boolean;
  opacity?: number;
}

/** A standard node material with surface detail, sway and glow from the look's nodes, driven by the beacon's clock. */
export function lit(k: Kit, o: LitOptions): THREE.MeshStandardMaterial {
  return litNode(k.clock, o) as unknown as THREE.MeshStandardMaterial;
}

// ---------------------------------------------------------------- billboard particles

export interface ParticleOptions extends Partial<ParticleNodes> {
  count: number;
  /** Base colour (linear), multiplied by the colour the motion gives. */
  color: THREE.ColorRepresentation;
  /** Brightness by day and at night: HDR, so above ~1.1 blooms. */
  day: number;
  night: number;
  /** Additive light (default), or alpha-blended matter such as smoke and petals. */
  blend?: 'add' | 'alpha';
  /** Per-particle base position. Defaults to the origin. */
  base?: (i: number, r: () => number) => [number, number, number];
  /** For 'alpha' blending: the matter's own colour by day (linear), lit a little by the glow at night. */
  matter?: THREE.ColorRepresentation;
  renderOrder?: number;
  /** Fades nearer than this many metres to the camera (keeps big halos from filling the screen). */
  nearFade?: number;
}

/** A cloud of camera-facing quads, all moved on the GPU. One draw call. */
export function particles(k: Kit, o: ParticleOptions): THREE.Mesh {
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  const seeds = new Float32Array(o.count * 4), bases = new Float32Array(o.count * 3);
  for (let i = 0; i < o.count; i++) {
    for (let j = 0; j < 4; j++) seeds[i * 4 + j] = k.rand();
    const b = o.base ? o.base(i, k.rand) : [0, 0, 0];
    bases.set(b, i * 3);
  }
  g.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 4));
  g.setAttribute('aBase', new THREE.InstancedBufferAttribute(bases, 3));
  g.instanceCount = o.count;
  const mat = particlesNode(k.clock, { ...o, motionNode: o.motionNode ?? (() => ({})) });
  const mesh = new THREE.Mesh(g, mat);
  mesh.frustumCulled = false; // positions are made in the shader; the beacon is one place, so cull it as a whole
  mesh.renderOrder = o.renderOrder ?? 10;
  return mesh;
}

/** One soft glow: a halo or a far-reading sky glow. `nearFade` keeps it from swallowing the camera up close; `breathe`
 *  is its alpha over time. */
export function halo(k: Kit, at: [number, number, number], radius: number, color: THREE.ColorRepresentation,
  day: number, night: number, nearFade = 0, breathe?: (c: Clocked & { s: V4 }) => F): THREE.Mesh {
  return particles(k, {
    count: 1, color, day, night, nearFade, renderOrder: 12,
    base: () => at,
    motionNode: (c) => ({ size: radius, alpha: breathe ? breathe(c) : 1 }),
    shapeNode: shapeHalo,
  });
}

// ---------------------------------------------------------------- shaped emissive surfaces (ribbons, pillars, discs)

export interface SurfaceOptions extends Partial<SurfaceNodes> {
  color: THREE.ColorRepresentation;
  day: number;
  night: number;
  blend?: 'add' | 'alpha';
  /** For alpha blending: the surface's own colour (linear); the paint may give an alpha. */
  matter?: THREE.ColorRepresentation;
  /** Turn the quad about local Y so it always faces the camera (pillars, falls of light). */
  faceY?: boolean;
  renderOrder?: number;
  side?: THREE.Side;
}

/** A custom-shaded surface: light ribbons, glowing pools, light pillars. */
export function surface(k: Kit, geo: THREE.BufferGeometry, o: SurfaceOptions): THREE.Mesh {
  const mat = surfaceNode(k.clock, { ...o, paintNode: o.paintNode ?? (() => ({})) });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.renderOrder = o.renderOrder ?? 11;
  if (o.faceY || o.vertexNode) mesh.frustumCulled = false;
  return mesh;
}

/** A vertical light pillar from y0 to y1, `width` metres wide, always facing the camera. uv.y runs 0..1 upward. */
export function pillar(k: Kit, y0: number, y1: number, width: number, o: Omit<SurfaceOptions, 'faceY'>): THREE.Mesh {
  const g = new THREE.PlaneGeometry(width, y1 - y0, 1, 16);
  g.translate(0, (y0 + y1) / 2, 0);
  return surface(k, g, { ...o, faceY: true });
}

/** A flat disc on the water, facing up, uv centred at 0.5. */
export function disc(radius: number, y = 0.05, segs = 48): THREE.BufferGeometry {
  const g = new THREE.CircleGeometry(radius, segs);
  g.rotateX(-Math.PI / 2);
  g.translate(0, y, 0);
  return g;
}

// ---------------------------------------------------------------- geometry helpers

/** Bakes a matrix into a geometry and returns it. */
export function place(g: THREE.BufferGeometry, pos: THREE.Vector3Like, rot?: THREE.Euler, scale?: THREE.Vector3Like): THREE.BufferGeometry {
  const m = new THREE.Matrix4().compose(
    new THREE.Vector3(pos.x, pos.y, pos.z), new THREE.Quaternion().setFromEuler(rot ?? new THREE.Euler()),
    new THREE.Vector3(scale?.x ?? 1, scale?.y ?? 1, scale?.z ?? 1),
  );
  return g.applyMatrix4(m);
}

/** Merges geometries into one (one draw call); they must share attributes, so normals and uvs are made uniform. `keep` names extra attributes every part has. */
export function merge(gs: THREE.BufferGeometry[], keep: string[] = []): THREE.BufferGeometry {
  const clean = gs.map((g) => {
    const n = g.index ? g.toNonIndexed() : g;
    for (const k of Object.keys(n.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv' && !keep.includes(k)) n.deleteAttribute(k);
    if (!n.attributes.normal) n.computeVertexNormals();
    if (!n.attributes.uv) n.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array((n.attributes.position.count) * 2), 2));
    return n;
  });
  const m = mergeGeometries(clean, false);
  if (!m) throw new Error('beacon kit: merge failed');
  return m;
}

/** Gives every vertex of a geometry one value of a float attribute (for per-part phases in a merged mesh). */
export function tag(g: THREE.BufferGeometry, name: string, v: number): THREE.BufferGeometry {
  g.setAttribute(name, new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count).fill(v), 1));
  return g;
}

/** Welds a geometry's seams and recomputes smooth normals (after displacing it). */
export function smooth(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const uv = g.getAttribute('uv');
  g.deleteAttribute('normal');
  if (uv) g.deleteAttribute('uv');
  const w = mergeVertices(g, 1e-4);
  w.computeVertexNormals();
  return w;
}

export interface ColumnOptions {
  height: number;
  /** Radius at height fraction f (0 base, 1 top). */
  radius: (f: number) => number;
  radial?: number;
  rings?: number;
  /** Noise displacement in metres, and its scale (features per metre). */
  bump?: number;
  bumpScale?: number;
  seed?: number;
  /** Sideways lean of the top in metres (along +x), curved. */
  lean?: number;
  leanZ?: number;
  /** Squash across: x and z radius multipliers. */
  sx?: number;
  sz?: number;
  /** Close the top (default) or leave it open. */
  cap?: boolean;
  /** Extra displacement along the normal at a point (object space), metres. */
  shape?: (x: number, y: number, z: number, f: number, a: number) => number;
}

/** A rough column: needles, trunks, spires, stacks. Smooth-shaded and welded. */
export function column(o: ColumnOptions): THREE.BufferGeometry {
  const radial = o.radial ?? 18, rings = o.rings ?? 28;
  const g = new THREE.CylinderGeometry(1, 1, 1, radial, rings, !(o.cap ?? true));
  const p = g.attributes.position as THREE.BufferAttribute;
  const seed = o.seed ?? 1, bump = o.bump ?? 0, bs = o.bumpScale ?? 0.25;
  for (let i = 0; i < p.count; i++) {
    const x0 = p.getX(i), y0 = p.getY(i), z0 = p.getZ(i);
    const f = y0 + 0.5, a = Math.atan2(z0, x0);
    const rr = Math.hypot(x0, z0);
    let r = o.radius(Math.min(1, Math.max(0, f))) * rr;
    let x = Math.cos(a) * r * (o.sx ?? 1), z = Math.sin(a) * r * (o.sz ?? 1);
    const y = f * o.height;
    if (bump > 0 && rr > 0.01) {
      const n = fbm3(x * bs, y * bs, z * bs, seed);
      r = 1 + (n * bump) / Math.max(0.3, Math.hypot(x, z));
      x *= r; z *= r;
    }
    if (o.shape && rr > 0.01) {
      const d = o.shape(x, y, z, f, a), l = Math.max(1e-3, Math.hypot(x, z));
      x += (x / l) * d; z += (z / l) * d;
    }
    x += (o.lean ?? 0) * f * f;
    z += (o.leanZ ?? 0) * f * f;
    p.setXYZ(i, x, y, z);
  }
  return smooth(g);
}

/** A mound: a low dome of radius r and height h, roughened, for islets, cones and dunes. */
export function mound(r: number, h: number, o: { seed?: number; bump?: number; bumpScale?: number; segs?: number;
  profile?: (d: number, a: number) => number; } = {}): THREE.BufferGeometry {
  const segs = o.segs ?? 64;
  // a polar grid of even rings, so a dome bends smoothly
  const ringsN = Math.max(8, segs >> 2);
  const pos: number[] = [], idx: number[] = [];
  pos.push(0, 0, 0);
  for (let j = 1; j <= ringsN; j++) {
    for (let i = 0; i < segs; i++) {
      const d = j / ringsN, a = (i / segs) * Math.PI * 2;
      pos.push(Math.cos(a) * d, 0, Math.sin(a) * d);
    }
  }
  for (let i = 0; i < segs; i++) idx.push(0, 1 + ((i + 1) % segs), 1 + i);
  for (let j = 1; j < ringsN; j++) {
    const a0 = 1 + (j - 1) * segs, b0 = 1 + j * segs;
    for (let i = 0; i < segs; i++) {
      const i1 = (i + 1) % segs;
      idx.push(a0 + i, a0 + i1, b0 + i, a0 + i1, b0 + i1, b0 + i);
    }
  }
  const out = new THREE.BufferGeometry();
  const seed = o.seed ?? 3, bump = o.bump ?? 0, bs = o.bumpScale ?? 0.1;
  for (let i = 0; i < pos.length; i += 3) {
    const x = pos[i], z = pos[i + 2], d = Math.hypot(x, z), a = Math.atan2(z, x);
    const prof = o.profile ? o.profile(d, a) : Math.cos(Math.min(1, d) * Math.PI / 2) ** 1.5;
    const wx = x * r, wz = z * r;
    const n = bump ? fbm3(wx * bs, 0, wz * bs, seed) * bump * (1 - d * 0.5) : 0;
    pos[i] = wx; pos[i + 2] = wz;
    pos[i + 1] = prof * h + n - (d > 0.98 ? 1.5 : 0);
  }
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setIndex(idx);
  out.computeVertexNormals();
  return out;
}

/** A tube along points (roots, stipes, branches, vines), radius tapering from r0 to r1. */
export function tube(points: THREE.Vector3[], r0: number, r1: number, radial = 6, segs?: number): THREE.BufferGeometry {
  const curve = new THREE.CatmullRomCurve3(points);
  const n = segs ?? Math.max(4, points.length * 4);
  const g = new THREE.TubeGeometry(curve, n, 1, radial, false);
  // taper: TubeGeometry is built ring by ring, each ring radial + 1 vertices
  const p = g.attributes.position as THREE.BufferAttribute, nr = g.attributes.normal as THREE.BufferAttribute;
  const per = radial + 1;
  for (let i = 0; i <= n; i++) {
    const f = i / n, c = curve.getPointAt(f), r = r0 + (r1 - r0) * f;
    for (let j = 0; j < per; j++) {
      const v = i * per + j;
      p.setXYZ(v, c.x + nr.getX(v) * r, c.y + nr.getY(v) * r, c.z + nr.getZ(v) * r);
    }
  }
  p.needsUpdate = true;
  return g;
}

/** A hexagonal crystal: a prism with a pointed termination, base at the origin pointing up +Y. */
export function crystal(r: number, len: number, tip = r * 1.6): THREE.BufferGeometry {
  const pts = [new THREE.Vector2(0, -0.2), new THREE.Vector2(r * 0.92, 0), new THREE.Vector2(r, len * 0.1), new THREE.Vector2(r, len - tip),
    new THREE.Vector2(0, len)];
  const g = new THREE.LatheGeometry(pts, 6);
  return g.toNonIndexed();
}

/** A strip along a path (waterfalls, threads, arcs): `widths` per point, faces `normal`; uv.x across, uv.y metres along. */
export function strip(points: THREE.Vector3[], widths: number[], normal = new THREE.Vector3(0, 0, 1)): THREE.BufferGeometry {
  const pos: number[] = [], uv: number[] = [], idx: number[] = [];
  let along = 0;
  for (let i = 0; i < points.length; i++) {
    const p = points[i], q = points[Math.min(points.length - 1, i + 1)], o = points[Math.max(0, i - 1)];
    const t = new THREE.Vector3().subVectors(q, o).normalize();
    const side = new THREE.Vector3().crossVectors(t, normal).normalize().multiplyScalar(widths[i] / 2);
    if (i > 0) along += p.distanceTo(points[i - 1]);
    pos.push(p.x - side.x, p.y - side.y, p.z - side.z, p.x + side.x, p.y + side.y, p.z + side.z);
    uv.push(0, along, 1, along);
    if (i > 0) { const a = (i - 1) * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Instanced copies of one geometry with one material, from a list of matrices. */
export function instances(geo: THREE.BufferGeometry, mat: THREE.Material, mats: THREE.Matrix4[]): THREE.InstancedMesh {
  const m = new THREE.InstancedMesh(geo, mat, mats.length);
  mats.forEach((x, i) => m.setMatrixAt(i, x));
  m.instanceMatrix.needsUpdate = true;
  m.computeBoundingSphere();
  return m;
}

/** A matrix from position, Euler rotation and uniform or per-axis scale. */
export function mat4(x: number, y: number, z: number, rx = 0, ry = 0, rz = 0, s: number | [number, number, number] = 1): THREE.Matrix4 {
  const sc = typeof s === 'number' ? new THREE.Vector3(s, s, s) : new THREE.Vector3(...s);
  return new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), sc);
}

/** Only shows `detail` within `near` metres of the camera: fine parts that cost draw calls but are invisible far off. */
export function nearOnly(detail: THREE.Object3D, near: number): THREE.LOD {
  const lod = new THREE.LOD();
  lod.addLevel(detail, 0);
  lod.addLevel(new THREE.Object3D(), near);
  return lod;
}

// ---------------------------------------------------------------- rhythms (JS, for the light's pulse)

/** A heartbeat: two quick beats then a rest, 0..1, period p seconds. */
export function heartbeat(t: number, p: number): number {
  const x = (t / p) % 1;
  const b = (c: number, w: number) => Math.exp(-((x - c) * (x - c)) / (w * w));
  return Math.min(1, b(0.08, 0.035) + 0.7 * b(0.2, 0.04));
}
