// Built things: stone lighthouses crowned with beacon fires, the empty stilt-hut fishing village with its timber
// pier, drying nets, smoking chimneys and moored skiffs, and the cask buoys and marker poles that lean, bob and
// ring in the swell. Each static site merges into one mesh per material; everything that rides the sea shares one
// skinned mesh per material with a bone per floating body, so the whole module is a few dozen draw calls.
import * as THREE from 'three';
import { R, Rng, smoothstep, type V3 } from './sim.ts';
import { box as craftBox, cask as craftCask, crease, lathe as craftLathe, tube as craftTube, type Sink } from './craft.ts';
import type { Site, World } from './world.ts';
import { swell } from './ocean.ts';
import { loadTexture } from './post.ts';
import { applyWeather, COMMON_GLSL, SKY_GLSL, WIND_GLSL, type LightSource, type SharedUniforms } from './sky.ts';
import type { Ctx, Frame } from './main.ts';
import type { Emitter } from './fx.ts';

const TAU = Math.PI * 2;
/** Pier deck and hut floors, height above sea level: clear of the sheltered bay's storm swell. */
const DECK = 0.55;
/** Lamp slots in the shared gain uniform (beacons, hut windows, the pier lantern). */
const SLOTS = 32;
/** True gravity in world units (9.8 m/s² at 1 u ≈ 7 m): bells swing at a real bell's pace, not at the brisker
 *  game-speed gravity the swell's waves run on (ocean.ts GRAVITY). */
const BELL_G = 9.81 / 7;
// World length of one texture tile. Geometry UVs are generated in tiles, so materials need no repeat.
const T_WOOD = 1, T_STONE = 1.3, T_DRESSED = 0.8, T_THATCH = 0.4, T_IRON = 0.5;
// Seams between the boards painted into the wood textures (fractions of the tile), so every modelled board
// samples exactly one painted board: columns of wood_weathered, rows of wood_hull.
const WEATHERED = [1, 125, 247, 358, 469, 573, 678, 794, 904, 1025].map((s) => s / 1024);
const HULL = [117, 330, 551, 778, 1021, 1256, 1483, 1705, 1932, 2165].map((s) => s / 2048);

const TEX = import.meta.glob<string>('./assets/{masonry,rock_coast,wood_weathered,wood_hull,iron,rope,thatch}_*.jpg', {
  eager: true,
  import: 'default',
});

const X = new THREE.Vector3(1, 0, 0), Y = new THREE.Vector3(0, 1, 0), Z = new THREE.Vector3(0, 0, 1);
const IDENT = new THREE.Matrix4();
const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const ALGAE = new THREE.Color(0.1, 0.11, 0.07);
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _n4 = new THREE.Vector4();
const _nm = new THREE.Matrix3(), _col = new THREE.Color(), _tint = new THREE.Color(), _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const dot3 = (n: THREE.Vector4, v: THREE.Vector3) => n.x * v.x + n.y * v.y + n.z * v.z;

// ---------------------------------------------------------------------------------------------
// Geometry kit. Parts are built in their own frame (long parts along +Y) and placed with a matrix.

type Pt = [number, number, number, number, number]; // x, y, z, u, v
/** A board picked from a wood texture: its painted extent across the tile, and a random offset along the grain. */
type Band = readonly [number, number, number];
/** Per-vertex colour adjustment from the vertex's placed position (baked weathering and occlusion). */
type Paint = (x: number, y: number, z: number, c: THREE.Color) => void;
/** Texture coordinates for a craft generator's vertex; it may also adjust the position. */
type UVMap = (p: THREE.Vector3, n: THREE.Vector3, s: number, t: number, i: number) => readonly [number, number];

/**
 * Indexed triangles in a part's frame, UVs in texture tiles, an optional per-vertex pair for special shaders. Craft
 * generators supply normals; sheets built with grid() get theirs from the faces.
 */
class Geo implements Sink {
  readonly p: number[] = [];
  readonly uv: number[] = [];
  readonly i: number[] = [];
  readonly n: number[] = [];
  readonly x: number[] = [];
  private faceted = false;
  private readonly map: UVMap | null;

  constructor(map: UVMap | null = null) {
    this.map = map;
  }

  vert(p: THREE.Vector3, n: THREE.Vector3, s: number, t: number, i: number): number {
    const [u, v] = this.map!(p, n, s, t, i);
    this.n.push(n.x, n.y, n.z);
    return this.point(p.x, p.y, p.z, u, v);
  }

  tri(a: number, b: number, c: number): void {
    this.i.push(a, b, c);
  }

  /** A vertex whose normal comes from the faces around it. */
  point(x: number, y: number, z: number, u: number, v: number): number {
    if (this.n.length < this.p.length + 3) this.faceted = true;
    this.p.push(x, y, z);
    this.uv.push(u, v);
    return this.p.length / 3 - 1;
  }

  quad(a: number, b: number, c: number, d: number): void {
    this.i.push(a, b, c, a, c, d);
  }

  /** Vertex normals: as supplied, or area-weighted from the faces once any vertex came without one. */
  normals(): number[] {
    const { p, n, i } = this;
    if (!this.faceted) return n;
    this.faceted = false;
    n.length = 0;
    for (let k = 0; k < p.length; k++) n.push(0);
    for (let k = 0; k < i.length; k += 3) {
      const a = i[k] * 3, b = i[k + 1] * 3, c = i[k + 2] * 3;
      const ux = p[b] - p[a], uy = p[b + 1] - p[a + 1], uz = p[b + 2] - p[a + 2];
      const vx = p[c] - p[a], vy = p[c + 1] - p[a + 1], vz = p[c + 2] - p[a + 2];
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      n[a] += nx; n[a + 1] += ny; n[a + 2] += nz;
      n[b] += nx; n[b + 1] += ny; n[b + 2] += nz;
      n[c] += nx; n[c + 1] += ny; n[c + 2] += nz;
    }
    for (let k = 0; k < n.length; k += 3) {
      const l = Math.hypot(n[k], n[k + 1], n[k + 2]) || 1;
      n[k] /= l; n[k + 1] /= l; n[k + 2] /= l;
    }
    return n;
  }

  /** Append another part moved by m, with a constant shader pair. */
  merge(g: Geo, m: THREE.Matrix4, x0: number, x1: number): this {
    const base = this.p.length / 3;
    for (let k = 0; k < g.p.length; k += 3) {
      _a.set(g.p[k], g.p[k + 1], g.p[k + 2]).applyMatrix4(m);
      this.point(_a.x, _a.y, _a.z, g.uv[(k / 3) * 2], g.uv[(k / 3) * 2 + 1]);
      this.x.push(x0, x1);
    }
    for (const i of g.i) this.i.push(base + i);
    return this;
  }
}

/** A (cols+1)×(rows+1) vertex sheet whose faces point along d(i) × d(j). */
function grid(g: Geo, cols: number, rows: number, at: (i: number, j: number) => Pt): Geo {
  const base = g.p.length / 3, w = cols + 1;
  for (let j = 0; j <= rows; j++) {
    for (let i = 0; i <= cols; i++) {
      const q = at(i, j);
      g.point(q[0], q[1], q[2], q[3], q[4]);
    }
  }
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) g.quad(base + j * w + i, base + j * w + i + 1, base + (j + 1) * w + i + 1, base + (j + 1) * w + i);
  }
  return g;
}

/**
 * Box x∈±w/2, y∈[0,h], z∈±d/2: a board or beam along +Y. With a board band the grain runs along y and each long
 * face samples that one painted board; without, faces map flat in tiles. topL/topR slope the top edge from
 * x = -w/2 to +w/2 (gable boards).
 */
function box(w: number, h: number, d: number, band: Band | null, tile = T_WOOD, topL = h, topR = h): Geo {
  const g = new Geo((p, n) => {
    p.y = p.y > 0 ? topL + (topR - topL) * (p.x / w + 0.5) : 0;
    const side = Math.abs(n.y) < 0.5, along = side ? p.y : p.z + d / 2;
    const across = Math.abs(n.x) > 0.5 ? p.z + d / 2 : p.x + w / 2, width = Math.abs(n.x) > 0.5 ? d : w;
    return band ? [band[0] + ((band[1] - band[0]) * across) / width, along / tile + band[2]] : [across / tile, along / tile];
  });
  craftBox(g, w, 1, d);
  return g;
}

/** A lathe (see craft.ts) mapped `around` tiles around and in tiles of `tile` along the profile from v0. */
function lathe(prof: readonly number[][], seg: number, around: number, tile: number, a0 = 0, a1 = TAU, v0 = 0): Geo {
  const g = new Geo((_p, _n, s, t) => [around * s, (v0 + t) / tile]);
  craftLathe(g, prof, seg, a0, a1);
  return g;
}

/** A craft tube; uv = [u0, u1, vPerUnit, v0]: u runs around, v along. caps: 1 start, 2 end. */
function tube(path: THREE.Vector3[], radius: number | ((i: number) => number), seg: number, uv: readonly number[], caps = 0): Geo {
  const g = new Geo((_p, _n, s, t, i) => (i < 0 ? [(uv[0] + uv[1]) / 2 + s, uv[3] + t] : [uv[0] + (uv[1] - uv[0]) * s, uv[3] + t * uv[2]]));
  craftTube(g, path, typeof radius === 'number' ? () => radius : radius, seg, { caps: [caps & 1 ? 0 : null, caps & 2 ? 0 : null] });
  return g;
}

/** A flat panel x∈±w/2, y∈[0,h] facing +Z, UV 0..1 (lamp-lit rooms seen through openings). */
function panel(w: number, h: number): Geo {
  return grid(new Geo(), 1, 1, (i, j) => [(i - 0.5) * w, j * h, 0, i, j]);
}

const circle = (r: number, n: number, y = 0) =>
  Array.from({ length: n + 1 }, (_, k) => V(r * Math.cos((k / n) * TAU), y, -r * Math.sin((k / n) * TAU)));

/** F · translate(x, y, z) · rotate (Euler YXZ). */
function at(F: THREE.Matrix4, x: number, y: number, z: number, ry = 0, rx = 0, rz = 0): THREE.Matrix4 {
  return new THREE.Matrix4().compose(V(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz, 'YXZ')), V(1, 1, 1)).premultiply(F);
}

/** F · a frame whose +Y runs from a to b (F's coordinates) and whose +Z leans toward `up`: beams are box(w, len, d)
 *  with w horizontal across and d vertical. */
function span(F: THREE.Matrix4, a: THREE.Vector3, b: THREE.Vector3, up = Y): THREE.Matrix4 {
  const y = b.clone().sub(a).normalize();
  const x = new THREE.Vector3().crossVectors(y, Math.abs(y.dot(up)) > 0.95 ? Z : up).normalize();
  return new THREE.Matrix4().makeBasis(x, y, new THREE.Vector3().crossVectors(x, y)).setPosition(a).premultiply(F);
}
/** span() between two world points, upright to the sphere. */
const spanW = (a: THREE.Vector3, b: THREE.Vector3) => span(IDENT, a, b, a.clone().add(b).normalize());

/** On a round wall of radius r about F's +Y: +Z points out at angle a, +X runs along the wall, t across, at height y. */
function wall(F: THREE.Matrix4, a: number, r: number, t: number, y: number): THREE.Matrix4 {
  const c = Math.cos(a), s = Math.sin(a);
  return at(F, r * c - t * s, y, -r * s - t * c, a + Math.PI / 2);
}

/** A random painted board of a wood material, inset from its seams. */
function board(mat: THREE.Material, rng: Rng): Band {
  const b = mat.userData.boards as number[], k = rng.int(b.length - 1);
  return [b[k] + 0.012, b[k + 1] - 0.012, rng.next() * 4];
}

/** Tube UVs for a wood material: one board's width wraps the log, grain along it. */
const grain = (mat: THREE.Material, rng: Rng) => {
  const b = board(mat, rng);
  return [b[0], b[1], 1 / T_WOOD, b[2]];
};
const ropeUV = (r: number) => [0, 0.34, 0.34 / (TAU * r), 0];
const ironUV = (r: number) => [0, (TAU * r) / T_IRON, 1 / T_IRON, 0];

/** A trimmed, slightly crooked log from the origin up +Y. */
function log(len: number, r0: number, r1: number, mat: THREE.Material, rng: Rng, crook = 0.012, caps = 2): Geo {
  const n = Math.max(2, Math.ceil(len / 0.25)), ph = rng.range(0, TAU), ax = rng.range(0, TAU), k = rng.range(1.5, 3.5);
  const pts = Array.from({ length: n + 1 }, (_, i) => {
    const t = i / n, w = Math.sin(t * Math.PI) * crook * Math.sin(ph + t * k);
    return V(Math.cos(ax) * w, t * len, Math.sin(ax) * w);
  });
  return tube(pts, (i) => r0 + ((r1 - r0) * i) / n, 7, grain(mat, rng), caps);
}

/** Darken and green the timber the tide reaches, up to `lift` above sea level. */
const wetBelow = (h: number, lift: number, c: THREE.Color) => {
  const wet = 1 - smoothstep(0.02, lift, h);
  c.multiply(_col.setRGB(1 - 0.6 * wet, 1 - 0.52 * wet, 1 - 0.68 * wet));
};
const tide: Paint = (x, y, z, c) => wetBelow(Math.hypot(x, y, z) - R, 0.2, c);

interface Bucket { p: number[]; n: number[]; uv: number[]; c: number[]; x: number[]; i: number[]; s: number[] }

/** Collects transformed parts per material, so a site becomes one mesh per material. */
class Builder {
  private readonly buckets = new Map<THREE.Material, Bucket>();
  /** bone that following parts ride on (skinned builds only) */
  bone = 0;
  /** per-vertex pair for parts without their own: lamp slot and glow mode */
  extra: [number, number] = [0, 0];

  add(mat: THREE.Material, g: Geo, m: THREE.Matrix4, tint: THREE.ColorRepresentation = 0xffffff, paint?: Paint): void {
    const n = g.normals();
    let b = this.buckets.get(mat);
    if (!b) this.buckets.set(mat, (b = { p: [], n: [], uv: [], c: [], x: [], i: [], s: [] }));
    const base = b.p.length / 3, swap = mat.userData.grainU === true, own = g.x.length > 0, col = new THREE.Color(tint);
    _nm.getNormalMatrix(m);
    for (let k = 0, q = 0; k < g.p.length; k += 3, q += 2) {
      _a.set(g.p[k], g.p[k + 1], g.p[k + 2]).applyMatrix4(m);
      _b.set(n[k], n[k + 1], n[k + 2]).applyMatrix3(_nm).normalize();
      b.p.push(_a.x, _a.y, _a.z);
      b.n.push(_b.x, _b.y, _b.z);
      if (swap) b.uv.push(g.uv[q + 1], g.uv[q]);
      else b.uv.push(g.uv[q], g.uv[q + 1]);
      const c = _tint.copy(col);
      paint?.(_a.x, _a.y, _a.z, c);
      b.c.push(c.r, c.g, c.b);
      if (own) b.x.push(g.x[q], g.x[q + 1]);
      else b.x.push(this.extra[0], this.extra[1]);
      b.s.push(this.bone);
    }
    const flip = m.determinant() < 0;
    for (let k = 0; k < g.i.length; k += 3) b.i.push(base + g.i[k], base + g.i[k + (flip ? 2 : 1)], base + g.i[k + (flip ? 1 : 2)]);
  }

  /** One mesh per material; skinned to `skeleton` when given. */
  build(skeleton?: THREE.Skeleton): THREE.Mesh[] {
    const out: THREE.Mesh[] = [];
    for (const [mat, b] of this.buckets) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(b.p, 3));
      geo.setAttribute('normal', new THREE.Float32BufferAttribute(b.n, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(b.uv, 2));
      geo.setAttribute('color', new THREE.Float32BufferAttribute(b.c, 3));
      if (mat.userData.extra) geo.setAttribute('aExtra', new THREE.Float32BufferAttribute(b.x, 2));
      geo.setIndex(b.i);
      let mesh: THREE.Mesh;
      if (skeleton) {
        const idx = new Uint16Array(b.s.length * 4), wgt = new Float32Array(b.s.length * 4);
        b.s.forEach((s, k) => ((idx[k * 4] = s), (wgt[k * 4] = 1)));
        geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(idx, 4));
        geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(wgt, 4));
        const sm = new THREE.SkinnedMesh(geo, mat);
        sm.bind(skeleton, new THREE.Matrix4());
        sm.frustumCulled = false;
        mesh = sm;
      } else {
        geo.computeBoundingSphere();
        mesh = new THREE.Mesh(geo, mat);
      }
      mesh.castShadow = mat.userData.shadow !== false;
      mesh.receiveShadow = true;
      if (mat.userData.depth) mesh.customDepthMaterial = mat.userData.depth as THREE.Material;
      out.push(mesh);
    }
    return out;
  }
}

// ---------------------------------------------------------------------------------------------
// Placement on the sphere.

/** Map coordinates around a site on its tangent plane: x right, z along the facing, y height above sea level. */
class Place {
  readonly F: THREE.Matrix4;
  readonly up: THREE.Vector3;
  readonly e1: THREE.Vector3;
  readonly e2: THREE.Vector3;
  private readonly world: World;

  constructor(world: World, dir: V3, facing: V3, yaw = 0) {
    this.world = world;
    this.up = V(dir.x, dir.y, dir.z).normalize();
    const f = V(facing.x, facing.y, facing.z);
    f.addScaledVector(this.up, -f.dot(this.up));
    if (f.lengthSq() < 1e-10) f.crossVectors(this.up, Math.abs(this.up.y) < 0.9 ? Y : X);
    this.e2 = f.normalize().applyAxisAngle(this.up, yaw);
    this.e1 = new THREE.Vector3().crossVectors(this.up, this.e2);
    this.F = new THREE.Matrix4().makeBasis(this.e1, this.up, this.e2).setPosition(this.up.clone().multiplyScalar(R));
  }

  dir(x: number, z: number, out = new THREE.Vector3()): THREE.Vector3 {
    return out.copy(this.up).multiplyScalar(R).addScaledVector(this.e1, x).addScaledVector(this.e2, z).normalize();
  }

  /** Ground (or seabed) height above sea level under (x, z). */
  h(x: number, z: number): number {
    return this.world.height(this.dir(x, z, _c));
  }

  /** World point at height y above sea level over (x, z). */
  at(x: number, y: number, z: number): THREE.Vector3 {
    return this.dir(x, z).multiplyScalar(R + y);
  }

  /** Map coordinates of a world direction. */
  map(d: V3): [number, number] {
    const k = R / (d.x * this.up.x + d.y * this.up.y + d.z * this.up.z);
    return [k * (d.x * this.e1.x + d.y * this.e1.y + d.z * this.e1.z), k * (d.x * this.e2.x + d.y * this.e2.y + d.z * this.e2.z)];
  }

  /** A place centred on (x, z) whose +Z is this place's +Z turned by yaw about the vertical. */
  sub(x: number, z: number, yaw = 0): Place {
    return new Place(this.world, this.dir(x, z), this.e2, yaw);
  }
}

// ---------------------------------------------------------------------------------------------
// Materials.

interface Mats {
  stone: THREE.MeshStandardMaterial; // rubble masonry
  wash: THREE.MeshStandardMaterial; // limewashed masonry, coloured by the vertex tint
  dressed: THREE.MeshStandardMaterial; // dressed stone: quoins, courses, corbels, copings
  wood: THREE.MeshStandardMaterial; // grey weathered boards and timbers, paint by vertex tint
  tar: THREE.MeshStandardMaterial; // dark tarred planking
  iron: THREE.MeshStandardMaterial;
  rope: THREE.MeshStandardMaterial;
  thatch: THREE.MeshStandardMaterial;
  glow: THREE.ShaderMaterial; // lamp-lit rooms behind openings, beacon coals
  net: THREE.MeshStandardMaterial;
}

function materials(u: SharedUniforms, gain: { value: Float32Array }): Mats {
  const cache = new Map<string, THREE.Texture>();
  const tex = (name: string, map: string, srgb: boolean) => {
    const key = `./assets/${name}_${map}.jpg`;
    if (!cache.has(key)) cache.set(key, loadTexture(TEX[key], srgb));
    return cache.get(key)!;
  };
  const pbr = (name: string, porosity: number, p: THREE.MeshStandardMaterialParameters = {}, data = {}, color = true) => {
    const arm = tex(name, 'arm', false);
    const m = new THREE.MeshStandardMaterial({
      vertexColors: true, map: color ? tex(name, 'color', true) : null, normalMap: tex(name, 'normal', false),
      aoMap: arm, roughnessMap: arm, metalnessMap: arm, ...p,
    });
    Object.assign(m.userData, data);
    applyWeather(m, porosity);
    return m;
  };
  // base colours lift the textures' dark scanned albedo to weathered timber, straw and stone (vertex tints darken)
  const lift = (r: number, g: number, b: number) => new THREE.Color(r, g, b);
  return {
    stone: pbr('masonry', 0.6, { color: lift(1.25, 1.25, 1.25) }),
    wash: pbr('masonry', 0.5, { roughness: 0.95, normalScale: new THREE.Vector2(1.4, 1.4) }, {}, false),
    dressed: pbr('rock_coast', 0.4, { color: lift(1.05, 0.98, 0.88) }),
    wood: pbr('wood_weathered', 0.9, { color: lift(2.2, 2.15, 2.05) }, { boards: WEATHERED }),
    tar: pbr('wood_hull', 0.5, { color: lift(1.4, 1.4, 1.4) }, { boards: HULL, grainU: true }),
    iron: pbr('iron', 0.15, { metalness: 1 }),
    rope: pbr('rope', 1, { color: lift(2, 2, 2) }),
    thatch: pbr('thatch', 1, { color: lift(2.3, 2.25, 2.0), normalScale: new THREE.Vector2(1.8, 1.8) }),
    glow: glowMaterial(u, gain),
    net: netMaterial(u),
  };
}

/** Rooms seen through windows (dark by day, lamp-lit after dusk) and the beacons' coal beds. aExtra: lamp slot,
 *  mode (0 hut window, 1 dim tower window, 2 coals). */
function glowMaterial(u: SharedUniforms, gain: { value: Float32Array }): THREE.ShaderMaterial {
  const m = new THREE.ShaderMaterial({
    uniforms: { ...THREE.UniformsLib.fog, ...u, uGain: gain },
    vertexShader: /* glsl */ `
      #include <fog_pars_vertex>
      uniform float uGain[${SLOTS}];
      attribute vec2 aExtra;
      varying vec2 vUv;
      varying vec3 vPos;
      varying float vGain, vMode;
      void main() {
        vUv = uv;
        vPos = position;
        vGain = uGain[int(aExtra.x)];
        vMode = aExtra.y;
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      #include <fog_pars_fragment>
      ${COMMON_GLSL}
      uniform float uTime, uNight;
      uniform vec3 uAmbient;
      varying vec2 vUv;
      varying vec3 vPos;
      varying float vGain, vMode;
      void main() {
        vec3 col;
        if (vMode > 1.5) {
          // a cracked crust of coals over a white-hot heart that breathes with the flames
          float n = fbm(vPos * 16.0 + vec3(0.0, uTime * 0.4, 0.0));
          float hot = smoothstep(0.4, 0.68, n) * (0.55 + 0.45 * vGain);
          col = mix(vec3(0.03, 0.012, 0.006), vec3(30.0, 9.0, 2.0), hot);
        } else {
          // an unlit room by day; lamplight pooling low in the room after dusk
          float pool = mix(1.25, 0.45, vUv.y) * (1.0 - 0.4 * abs(vUv.x - 0.5));
          col = uAmbient * 0.04 + vec3(1.0, 0.47, 0.16) * (vMode > 0.5 ? 6.0 * mix(0.015, 1.0, uNight) : 9.0) * pool * vGain;
        }
        gl_FragColor = vec4(col, 1.0);
        #include <fog_fragment>
      }`,
    fog: true,
  });
  m.userData = { extra: true, shadow: false };
  return m;
}

/** Fishing net: a diamond mesh cut from the cloth in the shader, swaying in the shared wind toward its free edge.
 *  aExtra: freedom 0 (on the bar) … 1 (hanging edge), cork flag. Shadows use the same sway and mesh. */
function netMaterial(u: SharedUniforms): THREE.MeshStandardMaterial {
  const patch = (s: THREE.WebGLProgramParametersWithUniforms, depth: boolean) => {
    s.uniforms.uTime = u.uTime;
    s.uniforms.uSimTime = u.uSimTime;
    s.vertexShader = s.vertexShader
      .replace('#include <common>', `#include <common>
        uniform float uTime, uSimTime;
        attribute vec2 aExtra;
        varying vec2 vNet;
        varying float vCork;
        ${WIND_GLSL}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vNet = uv;
        vCork = aExtra.y;
        vec3 netW = windAt(normalize(transformed), uSimTime);
        float netG = 0.65 + 0.35 * sin(uTime * 1.3 + dot(transformed, vec3(0.37, 0.21, 0.29)));
        float netF = sin(uTime * 4.3 + dot(transformed, vec3(7.1, 5.3, 6.7))) * 0.3;
        transformed += netW * (netG + netF) * 0.075 * aExtra.x * aExtra.x;`);
    s.fragmentShader = s.fragmentShader.replace('#include <common>', `#include <common>
        varying vec2 vNet;
        varying float vCork;
        ${depth ? COMMON_GLSL : ''}
        // twine coverage of a diamond mesh, antialiased, fading to its mean density where cells get too small
        float netCover() {
          vec2 d = vec2(vNet.x + vNet.y, vNet.x - vNet.y) * 30.0;
          vec2 f = abs(fract(d) - 0.5);
          float w = length(fwidth(d));
          return mix(smoothstep(0.43 - w, 0.43 + w, max(f.x, f.y)), 0.28, smoothstep(0.25, 0.6, w));
        }`);
    s.fragmentShader = depth
      ? s.fragmentShader.replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
          if (vCork < 0.5 && hash13(vec3(gl_FragCoord.xy, 3.0)) > netCover()) discard;`)
      : s.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
          if (vCork < 0.5) {
            diffuseColor.a = netCover();
            if (diffuseColor.a < 0.02) discard;
          }`);
  };
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, side: THREE.DoubleSide, transparent: true });
  m.onBeforeCompile = (s) => patch(s, false);
  const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, side: THREE.DoubleSide });
  depth.onBeforeCompile = (s) => patch(s, true);
  m.userData = { extra: true, depth };
  return m;
}

// ---------------------------------------------------------------------------------------------
// Beacon fires: nested flame shells shaped and licked by noise in the shader and bent by the wind, plus a glow
// billboard for the bloom. Both are additive and built in world space: one draw each for every beacon.

interface Fire { base: THREE.Vector3; slot: number; r: number; h: number; seed: number }

function fireMeshes(fires: Fire[], u: SharedUniforms, gain: { value: Float32Array }): THREE.Mesh[] {
  const SEG = 18, ROWS = 12;
  const flame = { p: [] as number[], f: [] as number[], s: [] as number[], i: [] as number[] };
  const halo = { p: [] as number[], f: [] as number[], s: [] as number[], i: [] as number[] };
  for (const fire of fires) {
    for (const [rs, hs, seed] of [[1, 1, fire.seed], [0.55, 0.7, fire.seed + 3.7]]) {
      const base = flame.p.length / 3;
      for (let j = 0; j <= ROWS; j++) {
        for (let i = 0; i <= SEG; i++) {
          flame.p.push(Math.cos((i / SEG) * TAU), j / ROWS, Math.sin((i / SEG) * TAU));
          flame.f.push(fire.base.x, fire.base.y, fire.base.z, fire.slot);
          flame.s.push(fire.r * rs, fire.h * hs, seed);
        }
      }
      for (let j = 0; j < ROWS; j++) {
        for (let i = 0; i < SEG; i++) {
          const a = base + j * (SEG + 1) + i;
          flame.i.push(a, a + 1, a + SEG + 2, a, a + SEG + 2, a + SEG + 1);
        }
      }
    }
    const c = fire.base.clone().addScaledVector(fire.base.clone().normalize(), fire.h * 0.32), b = halo.p.length / 3;
    for (const [x, y] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      halo.p.push(x, y, 0);
      halo.f.push(c.x, c.y, c.z, fire.slot);
      halo.s.push(fire.h * 1.3, 1, 0);
    }
    halo.i.push(b, b + 1, b + 2, b, b + 2, b + 3);
  }
  const mesh = (d: typeof flame, vertexShader: string, fragmentShader: string) => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(d.p, 3));
    geo.setAttribute('aFire', new THREE.Float32BufferAttribute(d.f, 4));
    geo.setAttribute('aShape', new THREE.Float32BufferAttribute(d.s, 3));
    geo.setIndex(d.i);
    const mat = new THREE.ShaderMaterial({
      uniforms: { ...u, uGain: gain },
      vertexShader, fragmentShader, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    });
    const m = new THREE.Mesh(geo, mat);
    m.frustumCulled = false;
    return m;
  };
  const head = /* glsl */ `
    uniform float uTime, uSimTime, uNight;
    uniform float uGain[${SLOTS}];
    attribute vec4 aFire;
    attribute vec3 aShape;
    varying vec3 vWorld;`;
  return [
    mesh(halo, /* glsl */ `${head}
      varying vec2 vC;
      varying float vI;
      void main() {
        vec4 mv = viewMatrix * vec4(aFire.xyz, 1.0);
        float s = aShape.x * (0.55 + 0.6 * uNight);
        mv.xyz += normalize(-mv.xyz) * s * 0.6; // in front of the masonry the fire sits in
        mv.xy += position.xy * s;
        vC = position.xy;
        vI = uGain[int(aFire.w)] * mix(0.25, 1.0, uNight);
        vWorld = aFire.xyz;
        gl_Position = projectionMatrix * mv;
      }`, /* glsl */ `
      ${SKY_GLSL}
      varying vec3 vWorld;
      varying vec2 vC;
      varying float vI;
      void main() {
        float r2 = dot(vC, vC);
        float a = (exp(-r2 * 7.0) * 0.5 + exp(-r2 * 30.0) * 1.5) * max(0.0, 1.0 - r2);
        gl_FragColor = vec4(vec3(1.0, 0.42, 0.13) * 2.5 * vI * a * skyFogT(vWorld), 1.0);
      }`),
    mesh(flame, /* glsl */ `${head}
      ${WIND_GLSL}
      varying vec3 vCyl;
      varying float vGain, vSeed, vEdge, vTop;
      void main() {
        vec3 up = normalize(aFire.xyz);
        vec3 e1 = normalize(cross(up, abs(up.y) < 0.99 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0)));
        vec3 e2 = cross(up, e1);
        float g = uGain[int(aFire.w)];
        float h = position.y;
        float height = aShape.y * (0.7 + 0.35 * g);
        float r = aShape.x * (0.45 + 0.55 * smoothstep(0.0, 0.2, h)) * pow(1.0 - h, 0.9);
        float t = uTime + aShape.z * 10.0;
        vec3 sway = e1 * (sin(t * 2.7) * 0.5 + sin(t * 4.3) * 0.25) + e2 * sin(t * 3.4) * 0.4;
        vec3 dir = e1 * position.x + e2 * position.z;
        vec3 p = aFire.xyz + up * (h * height) + dir * r + (windAt(up, uSimTime) * 0.5 + sway * 0.14) * h * h * height;
        vec3 V = normalize(cameraPosition - p);
        vEdge = abs(dot(dir, V));
        vTop = abs(dot(up, V));
        vCyl = vec3(position.x, position.z, h);
        vGain = g;
        vSeed = aShape.z;
        vWorld = p;
        gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
      }`, /* glsl */ `
      ${SKY_GLSL}
      ${COMMON_GLSL}
      uniform float uTime;
      varying vec3 vWorld;
      varying vec3 vCyl;
      varying float vGain, vSeed, vEdge, vTop;
      void main() {
        float h = vCyl.z;
        vec3 q = vec3(vCyl.xy * 1.7, h * 3.4 - uTime * 2.6) + vSeed * 17.0;
        float body = fbm(q) * 0.8 + vnoise(q * 2.6 - vec3(0.0, 0.0, uTime * 2.0)) * 0.35 - h * 0.7;
        // soft silhouettes from the side; seen from above the shells overlap into a full bloom of flame
        float a = smoothstep(0.1, 0.42, body) * smoothstep(0.0, 0.07, h) * mix(smoothstep(0.0, 0.5, vEdge), 1.0, vTop);
        float heat = clamp(body * 1.7 - h * 0.3, 0.0, 1.0);
        vec3 col = mix(vec3(0.9, 0.15, 0.02), vec3(1.0, 0.6, 0.2), smoothstep(0.2, 0.6, heat));
        col = mix(col, vec3(1.0, 0.9, 0.68), smoothstep(0.66, 0.95, heat));
        gl_FragColor = vec4(col * a * (6.0 + 14.0 * vGain) * skyFogT(vWorld), 1.0);
      }`),
  ];
}

// ---------------------------------------------------------------------------------------------
// Floating and anchored bodies. Each drives one bone of the shared skinned meshes from the swell.

/** A damped spring on a 2D tilt (components along a body's rest tangents). */
function spring(tilt: THREE.Vector2, vel: THREE.Vector2, tx: number, ty: number, k: number, c: number, dt: number): void {
  vel.x += (k * (tx - tilt.x) - c * vel.x) * dt;
  vel.y += (k * (ty - tilt.y) - c * vel.y) * dt;
  tilt.addScaledVector(vel, dt);
}

/** Set m to the frame with +Y = up and +Z as close to f as possible, at pos. */
function basis(m: THREE.Matrix4, up: THREE.Vector3, f: THREE.Vector3, pos: THREE.Vector3): void {
  _b.copy(f).addScaledVector(up, -f.dot(up)).normalize();
  _c.crossVectors(up, _b);
  m.makeBasis(_c, up, _b).setPosition(pos);
}

abstract class Body {
  readonly bone = new THREE.Bone();
  protected readonly up: THREE.Vector3;
  protected readonly e1: THREE.Vector3;
  protected readonly e2: THREE.Vector3;
  protected readonly tilt = new THREE.Vector2();
  protected readonly vel = new THREE.Vector2();
  protected readonly axis = new THREE.Vector3();
  protected readonly pos = new THREE.Vector3();
  protected heave = NaN;

  constructor(dir: THREE.Vector3, facing: THREE.Vector3) {
    this.up = dir.clone().normalize();
    this.e2 = facing.clone().addScaledVector(this.up, -facing.dot(this.up)).normalize();
    this.e1 = new THREE.Vector3().crossVectors(this.up, this.e2);
    this.bone.matrixAutoUpdate = false;
  }

  abstract update(f: Frame, dt: number): void;

  /** Sea height and slope over d; heave follows with a little lag so the body settles like a float. */
  protected ride(d: THREE.Vector3, f: Frame, dt: number, lag: number): THREE.Vector4 {
    swell(d, f.t, f.simTime, _n4);
    this.heave = Number.isNaN(this.heave) ? _n4.w : this.heave + (_n4.w - this.heave) * (1 - Math.exp(-dt * lag));
    return _n4;
  }

  /** The body's current up axis, tipped by its tilt. */
  protected tipped(): THREE.Vector3 {
    return this.axis.copy(this.up).addScaledVector(this.e1, this.tilt.x).addScaledVector(this.e2, this.tilt.y).normalize();
  }
}

/** A cask buoy riding upright on its riser, rocking with the wave slope and slowly turning. */
class Buoy extends Body {
  /** world position of the mooring eye under the cask */
  readonly eye = new THREE.Vector3();
  private readonly turn: number;
  private readonly draft: number;

  constructor(dir: THREE.Vector3, facing: THREE.Vector3, draft: number) {
    super(dir, facing);
    this.draft = draft;
    this.turn = dir.x * 53 + dir.y * 17;
  }

  update(f: Frame, dt: number): void {
    const n = this.ride(this.up, f, dt, 5);
    spring(this.tilt, this.vel, dot3(n, this.e1) * 1.5, dot3(n, this.e2) * 1.5, 24, 2.6, dt);
    const u = this.tipped();
    this.pos.copy(this.up).multiplyScalar(R + this.heave).addScaledVector(u, -this.draft);
    basis(this.bone.matrixWorld, u, _a.copy(this.e2).applyAxisAngle(this.up, Math.sin(f.t * 0.11 + this.turn) * 0.6), this.pos);
    this.eye.copy(this.pos).addScaledVector(u, -0.04);
  }
}

/** A marker pole driven into the seabed, leaning and swaying about its foot as the swell passes. */
class Pole extends Body {
  private readonly foot: THREE.Vector3;
  private readonly lean: number;

  constructor(dir: THREE.Vector3, facing: THREE.Vector3, foot: THREE.Vector3, lean: number) {
    super(dir, facing);
    this.foot = foot;
    this.lean = lean;
    this.tilt.y = lean;
  }

  update(f: Frame, dt: number): void {
    const n = this.ride(this.up, f, dt, 4);
    spring(this.tilt, this.vel, dot3(n, this.e1) * 0.3, this.lean + dot3(n, this.e2) * 0.3, 11, 1.8, dt);
    basis(this.bone.matrixWorld, this.tipped(), this.e2, this.foot);
  }
}

/** A moored skiff surging and yawing a little on its lines as it rides the swell. */
class Skiff extends Body {
  readonly bow = new THREE.Vector3();
  readonly stern = new THREE.Vector3();
  private readonly phase: number;
  private readonly d = new THREE.Vector3();
  private readonly bowL: THREE.Vector3;
  private readonly sternL: THREE.Vector3;

  constructor(dir: THREE.Vector3, facing: THREE.Vector3, bowL: THREE.Vector3, sternL: THREE.Vector3) {
    super(dir, facing);
    this.bowL = bowL;
    this.sternL = sternL;
    this.phase = dir.x * 91 + dir.z * 37;
  }

  update(f: Frame, dt: number): void {
    const t = f.t + this.phase, d = this.d.copy(this.up).multiplyScalar(R);
    d.addScaledVector(this.e2, 0.04 * Math.sin(t * 0.41)).addScaledVector(this.e1, 0.02 * Math.sin(t * 0.31 + 1.3)).normalize();
    const n = this.ride(d, f, dt, 6);
    spring(this.tilt, this.vel, dot3(n, this.e1) * 1.2, dot3(n, this.e2) * 1.2, 40, 6, dt);
    const u = this.tipped();
    basis(this.bone.matrixWorld, u, _a.copy(this.e2).applyAxisAngle(u, 0.05 * Math.sin(t * 0.27 + 0.4)), d.multiplyScalar(R + this.heave));
    this.bow.copy(this.bowL).applyMatrix4(this.bone.matrixWorld);
    this.stern.copy(this.sternL).applyMatrix4(this.bone.matrixWorld);
  }
}

/**
 * A bell hung from a pivot on a body: a pendulum driven by gravity and by the pivot's own acceleration as the body
 * rocks. The clapper strikes at the turn of each swing that is wide enough.
 */
class Bell {
  readonly bone = new THREE.Bone();
  readonly out = { pos: new THREE.Vector3(), ring: 0 };
  private readonly th = new THREE.Vector2();
  private readonly om = new THREE.Vector2();
  private readonly prev = new THREE.Vector3();
  private readonly vel = new THREE.Vector3();
  private readonly acc = new THREE.Vector3();
  private readonly local = new THREE.Matrix4();
  private live = false;
  private turning = 0;
  private readonly body: THREE.Bone;
  private readonly pivot: THREE.Vector3;

  constructor(body: THREE.Bone, pivot: THREE.Vector3) {
    this.body = body;
    this.pivot = pivot;
    this.bone.matrixAutoUpdate = false;
  }

  update(dt: number): void {
    const W = this.body.matrixWorld, p = _a.copy(this.pivot).applyMatrix4(W);
    if (!this.live) this.prev.copy(p);
    const v = _b.copy(p).sub(this.prev).divideScalar(dt);
    if (this.live) this.acc.lerp(_c.copy(v).sub(this.vel).divideScalar(dt), 0.15);
    this.vel.copy(v);
    this.prev.copy(p);
    this.live = true;
    // gravity as the swinging frame feels it, along the frame's own axes
    const g = _c.copy(p).normalize().multiplyScalar(-BELL_G).addScaledVector(this.acc, -0.5), e = W.elements;
    const gx = g.x * e[0] + g.y * e[1] + g.z * e[2], gy = g.x * e[4] + g.y * e[5] + g.z * e[6];
    const gz = g.x * e[8] + g.y * e[9] + g.z * e[10], w2 = g.length() / 0.09;
    const ex = Math.atan2(gx, -gy), ez = Math.atan2(gz, -gy);
    for (let s = 0, h = dt / 2; s < 2; s++) {
      this.om.x += (-w2 * (this.th.x - ex) - 2.4 * this.om.x) * h;
      this.om.y += (-w2 * (this.th.y - ez) - 2.4 * this.om.y) * h;
      this.th.addScaledVector(this.om, h);
    }
    if (this.th.length() > 0.45) this.th.setLength(0.45);
    // the swing about where the bell would hang at rest (a leaning pole tips that too)
    const sx = this.th.x - ex, sy = this.th.y - ez, rv = sx * this.om.x + sy * this.om.y, amp = Math.hypot(sx, sy);
    this.out.ring = this.turning > 0 && rv <= 0 && amp > 0.18 ? Math.min(1, (amp - 0.14) * 3) : 0;
    this.turning = rv;
    this.local.makeRotationFromEuler(_e.set(-this.th.y, 0, this.th.x, 'YXZ')).setPosition(this.pivot);
    this.bone.matrixWorld.multiplyMatrices(W, this.local);
    this.out.pos.set(0, -0.07, 0).applyMatrix4(this.bone.matrixWorld);
  }
}

/** Lines whose ends move (mooring lines, buoy risers), rebuilt each frame as thin sagging tubes. */
class Ropes {
  private static readonly SEG = 14;
  private static readonly SIDES = 5;
  private readonly list: { a: THREE.Vector3; b: THREE.Vector3; slack: number; len: number; r: number; floor: number }[] = [];
  private readonly pts = Array.from({ length: Ropes.SEG + 1 }, () => new THREE.Vector3());
  private readonly t = new THREE.Vector3();
  private readonly n = new THREE.Vector3();
  private readonly o = new THREE.Vector3();
  private readonly mid = new THREE.Vector3();
  private mesh: THREE.Mesh | null = null;

  /** A rope from a to b (live vectors) with `slack` × their first distance of length, never sinking under `floor`. */
  add(a: THREE.Vector3, b: THREE.Vector3, slack: number, r: number, floor = 0): void {
    this.list.push({ a, b, slack, len: NaN, r, floor });
  }

  build(mat: THREE.Material): THREE.Mesh {
    const { SEG, SIDES } = Ropes, nv = this.list.length * (SEG + 1) * (SIDES + 1);
    const geo = new THREE.BufferGeometry(), uv: number[] = [], idx: number[] = [];
    this.list.forEach((_, k) => {
      const base = k * (SEG + 1) * (SIDES + 1);
      for (let j = 0; j <= SEG; j++) for (let i = 0; i <= SIDES; i++) uv.push((i / SIDES) * 0.34, (j / SEG) * 6);
      for (let j = 0; j < SEG; j++) {
        for (let i = 0; i < SIDES; i++) {
          const a = base + j * (SIDES + 1) + i, b = a + SIDES + 1;
          idx.push(a, a + 1, b + 1, a, b + 1, b);
        }
      }
    });
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(nv * 3), 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(nv * 3), 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(nv * 3).fill(0.75), 3));
    geo.setIndex(idx);
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = this.mesh.receiveShadow = true;
    return this.mesh;
  }

  update(): void {
    if (!this.mesh) return;
    const { SEG, SIDES } = Ropes, { pts, t, n, o, mid } = this;
    const pos = this.mesh.geometry.attributes.position, nrm = this.mesh.geometry.attributes.normal;
    let v = 0;
    for (const rope of this.list) {
      const d = rope.a.distanceTo(rope.b);
      if (Number.isNaN(rope.len)) rope.len = d * rope.slack;
      const sag = Math.sqrt(Math.max(0, (3 * d * (rope.len - d)) / 8));
      mid.addVectors(rope.a, rope.b).normalize();
      for (let j = 0; j <= SEG; j++) {
        const s = j / SEG;
        pts[j].lerpVectors(rope.a, rope.b, s).addScaledVector(mid, -sag * 4 * s * (1 - s));
        if (rope.floor) pts[j].setLength(Math.max(pts[j].length(), rope.floor));
      }
      // a reference across the rope: the vertical, or for a rope hanging straight down any horizontal
      const ref = Math.abs(_a.subVectors(rope.b, rope.a).normalize().dot(mid)) > 0.9 ? _b.crossVectors(mid, X).normalize() : mid;
      for (let j = 0; j <= SEG; j++) {
        t.subVectors(pts[Math.min(SEG, j + 1)], pts[Math.max(0, j - 1)]).normalize();
        n.crossVectors(t, ref).normalize();
        _c.crossVectors(t, n);
        for (let i = 0; i <= SIDES; i++, v++) {
          const a = (i / SIDES) * TAU;
          o.copy(n).multiplyScalar(Math.cos(a)).addScaledVector(_c, Math.sin(a));
          nrm.setXYZ(v, o.x, o.y, o.z);
          pos.setXYZ(v, pts[j].x + o.x * rope.r, pts[j].y + o.y * rope.r, pts[j].z + o.z * rope.r);
        }
      }
    }
    pos.needsUpdate = nrm.needsUpdate = true;
  }
}

// ---------------------------------------------------------------------------------------------
// Prop models shared by several sites.

/** A coopered cask from y = 0 up: bulged staves with grooves between them, a recessed head and iron hoops. */
function cask(b: Builder, m: Mats, F: THREE.Matrix4, h: number, rEnd: number, rMid: number, rng: Rng, mat: THREE.Material, tint: number, paint?: Paint): void {
  let band = board(mat, rng);
  const staves = new Geo((_p, _n, s, t) => [band[0] + (band[1] - band[0]) * s, t / T_WOOD + band[2]]);
  const hoops = new Geo((_p, _n, s, t) => [s, t / T_IRON]);
  craftCask(staves, hoops, h, rEnd, rMid, () => (band = board(mat, rng)));
  b.add(mat, staves, F, tint, paint);
  b.add(m.iron, hoops, F, 0x8a7a6c);
}

/** A bell hanging down from its pivot at the origin, its crown loop around the pivot. */
function bell(b: Builder, m: Mats): void {
  b.add(m.iron, lathe([[0, -0.016], [0.034, -0.03], [0.05, -0.1], [0.06, -0.122], [0.066, -0.124], [0.062, -0.104], [0.048, -0.04], [0.03, -0.006], [0, 0]], 16, 1, T_IRON), IDENT, 0xb08850);
  b.add(m.iron, tube(circle(0.012, 8), 0.004, 4, ironUV(0.004)), at(IDENT, 0, -0.004, 0, 0, Math.PI / 2), 0x7a6040);
}

/** A little woven basket or fish trap (the rope texture reads as wicker). */
function basket(b: Builder, m: Mats, F: THREE.Matrix4, r: number, h: number): void {
  b.add(m.rope, lathe([[0, 0.002], [r * 0.8, 0.002], [r, h * 0.3], [r * 0.92, h], [r * 0.82, h], [r * 0.82, h * 0.85]], 14, 2, 0.25), F, 0xb09670);
}

/** A flat coil of rope lying on a deck. */
function coil(b: Builder, m: Mats, F: THREE.Matrix4, r: number): void {
  const pts: THREE.Vector3[] = [];
  for (let k = 0; k <= 72; k++) {
    const a = (k / 18) * TAU, rr = r * (1 - (k / 72) * 0.55);
    pts.push(V(rr * Math.cos(a), 0.012 + 0.003 * Math.sin(a * 3), -rr * Math.sin(a)));
  }
  b.add(m.rope, tube(pts, 0.012, 5, ropeUV(0.012), 3), F, 0xc8b490);
}

/**
 * A small clinker-built double-ender in its own frame (waterline amidships at the origin, bow toward +Z): lapped
 * strakes with the top one painted, stems, keel, ribs, thwarts and a pair of oars. Returns the bow and stern rings.
 */
function skiff(b: Builder, m: Mats, L: number, paint: number, rng: Rng): [THREE.Vector3, THREE.Vector3] {
  const B = 0.155, half = L / 2, rake = 0.07, THK = 0.014, LAP = 0.006, NU = 28;
  const yk = (u: number) => -0.075 + 0.035 * u * u;
  const yg = (u: number) => 0.095 + 0.02 * u * u + 0.07 * u ** 4;
  const hb = (u: number) => B * Math.pow(Math.max(0, 1 - Math.abs(u) ** 2.4), 0.6);
  /** girth t from keel (0) to sheer (1) at station u, pushed o along the outward normal */
  const sec = (u: number, t: number, o: number, out = new THREE.Vector3()) => {
    const h = hb(u), k = yk(u), g = yg(u);
    const dx = 2 * (1 - 2 * t) * 0.92 * h + 2 * t * h, dy = 2 * t * (g - k), l = Math.hypot(dx, dy) || 1;
    const x = 2 * (1 - t) * t * 0.92 * h + t * t * h, y = k + t * t * (g - k);
    return out.set(x + (dy / l) * o, y - (dx / l) * o, u * half + Math.sign(u) * Math.abs(u) ** 8 * rake * t);
  };
  const strakes = [0, 0.3, 0.52, 0.72, 0.87, 1], port = new THREE.Matrix4().makeScale(-1, 1, 1), sides = [IDENT, port];
  for (let k = 0; k < 5; k++) {
    const t0 = strakes[k], t1 = strakes[k + 1], top = k === 4, mat = top ? m.wood : m.tar, band = board(mat, rng);
    const rows: [number, number][] = k ? [[t0, 0], [t0, LAP], [(t0 + t1) / 2, LAP / 2], [t1, 0]] : [[0, 0], [0.1, 0], [0.2, 0], [t1, 0]];
    const g = grid(new Geo(), NU, 3, (i, j) => {
      const [t, o] = rows[j], p = sec(1 - (2 * i) / NU, t, o, _a);
      return [p.x, p.y, p.z, band[0] + ((band[1] - band[0]) * (t - t0)) / (t1 - t0), p.z / T_WOOD + band[2]];
    });
    for (const M of sides) b.add(mat, g, M, top ? paint : 0xffffff);
  }
  // the inside of the planking, then the gunwale cap joining it to the outside
  const inner = grid(new Geo(), NU, 8, (i, j) => {
    const p = sec(-1 + (2 * i) / NU, j / 8, -THK, _a);
    return [p.x, p.y, p.z, 0.3 + (j / 8) * 0.1, p.z / T_WOOD];
  });
  const cap = grid(new Geo(), NU, 1, (i, j) => {
    const p = sec(1 - (2 * i) / NU, 1, j ? -THK : 0, _a);
    return [p.x, p.y, p.z, 0.5 + j * 0.03, p.z / T_WOOD];
  });
  const rail = tube(Array.from({ length: 25 }, (_, k) => sec(-0.97 + (1.94 * k) / 24, 0.985, 0.01)), 0.011, 5, grain(m.wood, rng), 3);
  for (const M of sides) {
    b.add(m.tar, inner, M, 0xa08c78);
    b.add(m.wood, cap, M, paint);
    b.add(m.wood, rail, M, paint);
  }
  for (const s of [1, -1]) {
    const stem = Array.from({ length: 7 }, (_, k) => sec(s, k / 6, 0).add(V(0, (k / 6) ** 3 * 0.035, s * 0.012)));
    b.add(m.tar, tube(stem, 0.017, 6, grain(m.tar, rng), 3), IDENT);
  }
  b.add(m.tar, tube(Array.from({ length: 21 }, (_, k) => sec(-1 + k / 10, 0, 0.008)), 0.014, 6, grain(m.tar, rng)), IDENT);
  for (const u of [-0.66, -0.33, 0, 0.33, 0.66]) {
    const side = Array.from({ length: 8 }, (_, k) => sec(u, 0.95 - (0.95 * k) / 7, -THK - 0.007));
    const rib = [...side.map((p) => V(-p.x, p.y, p.z)), ...side.reverse().slice(1)];
    b.add(m.tar, tube(rib, 0.008, 4, grain(m.tar, rng), 3), IDENT, 0xc0a890);
  }
  let seat = 0;
  for (const u of [-0.35, 0.28]) {
    const y = yg(u) - 0.045, t = Math.sqrt((y - yk(u)) / (yg(u) - yk(u))), x = sec(u, t, -THK, _a).x;
    b.add(m.wood, box(0.07, 2 * x, 0.016, board(m.wood, rng)), span(IDENT, V(-x, y, u * half), V(x, y, u * half)), 0xd8d0c4);
    seat = y + 0.008;
  }
  for (const x of [-0.045, 0.045]) {
    const y = seat + 0.009, z0 = -0.38 * L, z1 = 0.38 * L;
    b.add(m.wood, tube([V(x, y, z0 + 0.18), V(x, y, z1)], 0.009, 5, grain(m.wood, rng), 3), IDENT, 0xe0d4c0);
    b.add(m.wood, box(0.055, 0.2, 0.006, board(m.wood, rng)), span(IDENT, V(x, y, z0), V(x, y, z0 + 0.2)), 0xe0d4c0);
  }
  const rings: THREE.Vector3[] = [];
  for (const s of [1, -1]) {
    const c = sec(s, 1, 0).add(V(0, 0.01, s * 0.03));
    b.add(m.iron, tube(circle(0.018, 10), 0.0045, 4, ironUV(0.0045)), at(IDENT, c.x, c.y, c.z, 0, 0, Math.PI / 2), 0x6a5a50);
    rings.push(c.add(V(0, -0.018, 0)));
  }
  return [rings[0], rings[1]];
}

/** A net hung over a bar (along X at the origin), both sides falling `drop`; and the cork line along one edge. */
function net(len: number, drop: number, rng: Rng): [Geo, Geo] {
  const g = new Geo(), cols = Math.ceil(len / 0.03), rows = Math.ceil(drop / 0.03), ph = rng.range(0, TAU);
  // each side gathers toward its hem in soft vertical folds and flares a little off the bar
  const pos = (u: number, j: number) => {
    const side = j < rows ? -1 : 1, f = Math.abs(j - rows) / rows, d = f * drop, x = (u - 0.5) * len * (1 - 0.16 * f);
    const fold = (0.045 * Math.sin(x * 13 + ph + side * 1.3) + 0.018 * Math.sin(x * 37 + ph * 2)) * Math.sin(Math.PI * u) * f ** 0.7;
    const y = d ? 0.012 - d * (1 - 0.05 * Math.sin(Math.PI * u) - 0.02 * Math.sin(x * 9 + ph)) : 0.03;
    return [x, y, side * (0.03 + d * 0.1 + fold), f];
  };
  grid(g, cols, 2 * rows, (i, j) => {
    const [x, y, z, free] = pos(i / cols, j);
    g.x.push(free, 0);
    return [x, y, z, (i / cols - 0.5) * len, (j - rows) * (drop / rows)];
  });
  const corks = new Geo(), cork = lathe(crease([[0, -0.018], [0.013, -0.018], [0.013, 0.018], [0, 0.018]]), 8, 1, 1);
  for (let u = 0.05; u < 1; u += 0.1) {
    const [x, y, z] = pos(u, 2 * rows);
    corks.merge(cork, at(IDENT, x, y - 0.006, z, 0, 0, Math.PI / 2), 1, 1);
  }
  return [g, corks];
}

// ---------------------------------------------------------------------------------------------

interface Lamp { slot: number; light: LightSource; power: number; fire: boolean; on: number; seed: number }
interface Cull { group: THREE.Group; center: THREE.Vector3; radius: number }
/** One wall of a hut: its frame index (front 0, right 1, back 2, left 3), offset, length and openings. */
interface Wall { n: number; c: number; len: number; win: number | null; door: number | null; gable: boolean }

export class Structures {
  /** particle sources for fx.ts */
  readonly emitters: Emitter[] = [];
  /**
   * Bells on buoys and poles, updated every frame for audio: world position, and the strength (0..1) of a clapper
   * strike on the frame it lands (0 on every other frame).
   */
  readonly bells: { pos: THREE.Vector3; ring: number }[] = [];
  private readonly world: World;
  private readonly sky: Ctx['sky'];
  private readonly gain = { value: new Float32Array(SLOTS) };
  private readonly m: Mats;
  private readonly lamps: Lamp[] = [];
  private readonly fires: Fire[] = [];
  private readonly sites: Cull[] = [];
  private readonly bones: THREE.Bone[] = [];
  private readonly bodies: Body[] = [];
  private readonly bellSims: Bell[] = [];
  private readonly ropes = new Ropes();
  private readonly dyn = new Builder();
  private readonly loose = new Builder();

  constructor(ctx: Ctx) {
    this.world = ctx.world;
    this.sky = ctx.sky;
    this.m = materials(ctx.sky.u, this.gain);
    ctx.world.sites.forEach((s, i) => {
      const rng = new Rng((ctx.seed * 7919 + i * 104729) >>> 0);
      if (s.kind === 'lighthouse') this.lighthouse(s, rng);
      else if (s.kind === 'village') this.village(ctx.world.sites.filter((o) => o.island === s.island), rng);
      else if (s.kind === 'buoy') this.buoy(s, rng);
      else if (s.kind === 'pole') this.pole(s, rng);
    });
    const skeleton = new THREE.Skeleton(this.bones, this.bones.map(() => new THREE.Matrix4()));
    ctx.scene.add(...this.dyn.build(skeleton), ...this.loose.build(), ...fireMeshes(this.fires, ctx.sky.u, this.gain), this.ropes.build(this.m.rope));
    for (const s of this.sites) ctx.scene.add(s.group);
    for (const b of this.bellSims) this.bells.push(b.out);
  }

  update(f: Frame): void {
    // lamps and beacons answer the dark, whether night or the storm's gloom
    const dark = Math.max(f.env.night, f.env.storm * 0.6), night = smoothstep(0.05, 0.8, dark), dt = Math.min(Math.max(f.dt, 1e-3), 0.05);
    for (const l of this.lamps) {
      const t = f.t + l.seed * 10;
      const g = l.fire
        ? (0.86 + 0.08 * Math.sin(t * 9.3) * Math.sin(t * 5.1) + 0.06 * Math.sin(t * 17.3)) * (0.55 + 0.45 * night)
        : (0.93 + 0.05 * Math.sin(t * 6.1) + 0.03 * Math.sin(t * 13.7)) * smoothstep(l.on, l.on + 0.15, dark);
      this.gain.value[l.slot] = g;
      // a beacon by day is a smoky glow; after dusk it floods the headland
      l.light.intensity = l.power * g * (l.fire ? 0.15 + 0.85 * night : 1);
    }
    for (const b of this.bodies) b.update(f, dt);
    for (const b of this.bellSims) b.update(dt);
    this.ropes.update();
    // hide whole sites below the horizon
    const cam = f.camera.position, hc = Math.acos(Math.min(1, (R - 1) / cam.length()));
    for (const s of this.sites) {
      const dp = s.center.length();
      s.group.visible = cam.angleTo(s.center) - s.radius / dp < hc + Math.acos(Math.min(1, (R - 1) / (dp + s.radius)));
    }
  }

  /** Register a lamp whose light sits at `pos` (the caller fills it in once the lamp is placed). */
  private lamp(pos: THREE.Vector3, color: number, power: number, range: number, fire: boolean, on = 0): number {
    const light: LightSource = { pos, color: new THREE.Color(color), intensity: 0, range };
    this.sky.lights.add(light);
    this.lamps.push({ slot: this.lamps.length, light, power, fire, on, seed: this.lamps.length * 1.618 });
    return this.lamps.length - 1;
  }

  private site(b: Builder, center: THREE.Vector3, radius: number): void {
    const group = new THREE.Group();
    group.add(...b.build());
    this.sites.push({ group, center, radius });
  }

  /** A new floating or anchored body; the dynamic builder's following parts ride on it. */
  private body<T extends Body>(b: T): T {
    this.dyn.bone = this.bones.push(b.bone) - 1;
    this.bodies.push(b);
    return b;
  }

  // -------------------------------------------------------------------------------------------
  /**
   * A tapered masonry tower on a headland: a plinth founded below the rock, string courses, quoined door and
   * windows, a corbelled gallery with an iron railing, a watch room and an iron cresset holding the beacon fire.
   */
  private lighthouse(site: Site, rng: Rng): void {
    const m = this.m, b = new Builder(), P = new Place(this.world, site.pos, site.facing), F = P.F;
    const H = rng.range(4.3, 5.8), rb = rng.range(0.5, 0.6), rt = rb * rng.range(0.7, 0.77);
    const style = rng.int(4), turret = rng.next() < 0.5;
    let gMin = Infinity, gMax = -Infinity;
    for (let k = 0; k < 24; k++) {
      for (let q = 0; q <= 4; q++) {
        const r = (q / 4) * (rb + 0.55), a = (k / 24) * TAU, g = P.h(r * Math.cos(a), -r * Math.sin(a));
        gMin = Math.min(gMin, g);
        gMax = Math.max(gMax, g);
      }
    }
    const yP = gMax + 0.1, yT = yP + H, c1 = yP + H * 0.36, c2 = yP + H * 0.7;
    const rad = (y: number) => rb + (rt - rb) * THREE.MathUtils.clamp((y - yP) / H, 0, 1);
    const tiles = (r: number, tile = T_STONE) => Math.max(1, Math.round((TAU * r) / tile));
    // soot under the fire, damp at the foot, faint rain streaks down the shaft (in the tower's frame)
    const local = new THREE.Vector3(), inv = F.clone().invert();
    const grime: Paint = (x, y, z, c) => {
      local.set(x, y, z).applyMatrix4(inv);
      const soot = smoothstep(yT - 1.6, yT + 0.3, local.y) * 0.45, damp = 1 - smoothstep(yP - 0.2, yP + 0.9, local.y);
      const a = Math.atan2(local.z, local.x), streak = 0.5 + 0.5 * Math.sin(a * 23 + Math.sin(a * 7) * 3);
      c.multiplyScalar(1 - soot - damp * 0.28 - 0.07 * streak * smoothstep(yP, yT, local.y));
      c.g *= 1 + damp * 0.05;
    };
    const slot = this.lamp(new THREE.Vector3(), 0xff7a2a, 30, 28, true);
    const natural = 0xd6cec2, white = 0xe8e1d4, ochre = 0xa84a36;

    // plinth in two battered tiers, founded below the lowest rock under it
    b.add(m.stone, lathe(crease([[0, gMin - 0.6], [rb + 0.52, gMin - 0.6], [rb + 0.48, yP - 0.1], [rb + 0.3, yP - 0.1], [rb + 0.28, yP], [rb - 0.05, yP]]), 40, tiles(rb + 0.5), T_STONE), F, 0xa49c92, grime);
    // the shaft in sections of bare, limewashed or ochre-banded masonry
    type Section = [number, number, THREE.Material, number];
    const sections: Section[] =
      style === 0 ? [[yP + 0.1, yT, m.stone, natural]]
        : style === 1 ? [[yP + 0.1, c1, m.stone, natural], [c1, yT, m.wash, white]]
          : style === 2 ? [[yP + 0.1, c1, m.stone, natural], ...[0, 1, 2, 3].map((k): Section => [c1 + ((yT - c1) * k) / 4, c1 + ((yT - c1) * (k + 1)) / 4, m.wash, k % 2 ? white : ochre])]
            : [[yP + 0.1, c2, m.stone, natural], [c2, yT, m.wash, white]];
    for (const [y0, y1, mat, tint] of sections) {
      const n = Math.max(1, Math.ceil((y1 - y0) / 0.3)), prof: number[][] = [];
      for (let k = 0; k <= n; k++) prof.push([rad(y0 + ((y1 - y0) * k) / n), y0 + ((y1 - y0) * k) / n]);
      b.add(mat, lathe(prof, 40, tiles(rb), T_STONE, 0, TAU, y0), F, tint, grime);
    }
    const [, , topMat, topTint] = sections[sections.length - 1];
    // base moulding, broken for the door, and the string courses
    const aD = Math.PI / 2, gap = 0.16 / rb;
    b.add(m.dressed, lathe(crease([[rb + 0.07, yP], [rb + 0.07, yP + 0.09], [rb + 0.01, yP + 0.15], [rb - 0.03, yP + 0.15]]), 36, tiles(rb, T_DRESSED), T_DRESSED, aD + gap, aD + TAU - gap), F, natural, grime);
    for (const y of [c1, c2]) {
      const r = rad(y);
      b.add(m.dressed, lathe(crease([[r - 0.03, y - 0.04], [r + 0.045, y - 0.04], [r + 0.045, y + 0.005], [r + 0.005, y + 0.045], [r - 0.03, y + 0.045]]), 40, tiles(r, T_DRESSED), T_DRESSED), F, natural, grime);
    }
    // corbels stepping out under the gallery, the gallery slab and its railing
    const nc = Math.round((TAU * rt) / 0.23);
    for (let k = 0; k < nc; k++) {
      const a = ((k + 0.5) / nc) * TAU;
      for (let t = 0; t < 3; t++) {
        const d = 0.1 + t * 0.075;
        b.add(m.dressed, box(0.1, 0.105, d, null, T_DRESSED), wall(F, a, rt - 0.04 + d / 2, 0, yT - 0.33 + t * 0.11), natural, grime);
      }
    }
    const rg = rt + 0.32, yG = yT + 0.085;
    b.add(m.dressed, lathe(crease([[rt - 0.06, yT], [rg - 0.05, yT], [rg, yT + 0.035], [rg, yG], [rt - 0.06, yG]]), 48, tiles(rg, T_DRESSED), T_DRESSED), F, natural, grime);
    const rr = rg - 0.035, np = Math.round((TAU * rr) / 0.19);
    const post = tube([V(0, 0, 0), V(0, 0.17, 0)], 0.009, 6, ironUV(0.009), 2);
    const knob = lathe([[0, 0], [0.012, 0.004], [0.016, 0.016], [0.011, 0.027], [0, 0.031]], 8, 1, T_IRON);
    for (let k = 0; k < np; k++) {
      const a = (k / np) * TAU, x = rr * Math.cos(a), z = -rr * Math.sin(a);
      b.add(m.iron, post, at(F, x, yG, z), 0x77685c);
      b.add(m.iron, knob, at(F, x, yG + 0.165, z), 0x77685c);
    }
    b.add(m.iron, tube(circle(rr, 72, yG + 0.165), 0.011, 6, ironUV(0.011)), F, 0x77685c);
    b.add(m.iron, tube(circle(rr, 72, yG + 0.09), 0.007, 5, ironUV(0.007)), F, 0x77685c);
    // the watch room: a masonry drum with four tall lamp-lit openings, cornice and stone cone
    const rw = rt * 0.74, y1w = yG + 0.72;
    b.add(topMat, lathe([[rw, yG - 0.02], [rw, yG + 0.35], [rw, y1w]], 32, tiles(rw), T_STONE), F, topTint, grime);
    for (let k = 0; k < 4; k++) this.opening(b, F, Math.PI / 4 + (k * Math.PI) / 2, rw, yG + 0.16, 0.13, 0.34, slot, 1, grime);
    b.add(m.dressed, lathe(crease([[rw - 0.02, y1w], [rw + 0.07, y1w], [rw + 0.07, y1w + 0.07], [rw - 0.02, y1w + 0.07]]), 32, tiles(rw, T_DRESSED), T_DRESSED), F, natural, grime);
    const yR = y1w + 0.47;
    b.add(m.dressed, lathe(crease([[rw + 0.07, y1w + 0.07], [0.08, yR], [0, yR]]), 32, tiles(rw, T_DRESSED), T_DRESSED), F, 0x8a8278, grime);
    // the cresset: a flared iron stem and a basket of curving bars around the coal bed
    b.add(m.iron, lathe(crease([[0, yR - 0.05], [0.055, yR - 0.05], [0.042, yR + 0.12], [0.1, yR + 0.15], [0.1, yR + 0.17], [0, yR + 0.17]]), 16, 1, T_IRON), F, 0x5a4c44);
    const yB = yR + 0.17, br = (t: number) => 0.09 + 0.18 * Math.pow(t, 0.75);
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * TAU, pts = [0, 0.25, 0.5, 0.75, 1, 1.12].map((t) => V(br(t) * Math.cos(a), yB + 0.3 * t, -br(t) * Math.sin(a)));
      b.add(m.iron, tube(pts, 0.011, 5, ironUV(0.011), 2), F, 0x5a4c44);
    }
    for (const t of [0.04, 0.5, 1]) b.add(m.iron, tube(circle(br(t), 36, yB + 0.3 * t), 0.012, 5, ironUV(0.012)), F, 0x5a4c44);
    b.extra = [slot, 2];
    b.add(m.glow, lathe([[0, yB + 0.005], [0.085, yB + 0.005], [0.16, yB + 0.1], [0.19, yB + 0.16], [0.12, yB + 0.21], [0, yB + 0.23]], 16, 1, 1), F);
    this.fires.push({ base: V(0, yB + 0.1, 0).applyMatrix4(F), slot, r: 0.19, h: 0.9, seed: rng.range(0, 9) });
    this.lamps[slot].light.pos.set(0, yB + 1.2, 0).applyMatrix4(F);
    this.emitters.push({ kind: 'smoke', pos: V(0, yB + 1.05, 0).applyMatrix4(F), size: 1 });

    // the door, facing inland: plank leaf with iron straps behind quoined jambs, lintel and threshold
    const rD = rad(yP);
    for (const t of [-0.066, 0, 0.066]) b.add(m.wood, box(0.064, 0.34, 0.022, board(m.wood, rng)), wall(F, aD, rD + 0.01, t, yP), 0x8a7a6a);
    for (const y of [0.07, 0.25]) b.add(m.iron, box(0.2, 0.018, 0.006, null, T_IRON), wall(F, aD, rD + 0.024, 0, yP + y), 0x5a4c44);
    b.add(m.iron, tube(circle(0.02, 12), 0.004, 4, ironUV(0.004)), wall(F, aD, rD + 0.03, 0.05, yP + 0.17).multiply(at(IDENT, 0, 0, 0, 0, Math.PI / 2)), 0x5a4c44);
    this.quoins(b, F, aD, rD, yP, 0.2, 0.34, 4, rng, grime, 0.03);
    b.add(m.dressed, box(0.28, 0.045, 0.16, null, T_DRESSED), wall(F, aD, rD + 0.07, 0, yP), natural, grime);
    // stair windows climbing the shaft, and maybe a stair turret on the flank
    const aT = aD + 1.25;
    for (const [f, a] of [[0.2, aD - 0.7], [0.52, aD + 2.5], [0.84, aD + 4.2]]) this.opening(b, F, a, rad(yP + H * f), yP + H * f, 0.075, 0.15, slot, 1, grime);
    if (turret) {
      // the turret's axis leans with the shaft's batter (a shear), so it stays against the wall all the way up
      const yTu = yP + H * 0.55, k = (rt - rb) / H, cx = (y: number) => rad(y) + 0.05, rtu = (y: number) => 0.215 - (0.02 * (y - yP)) / (yTu - yP);
      const washed = topMat === m.wash && style !== 2, Ft = at(F, 0, 0, 0, aT), prof: number[][] = [];
      const lean = Ft.clone().multiply(new THREE.Matrix4().set(1, k, 0, rb + 0.05 - k * yP, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1));
      for (let j = 0; j <= 8; j++) {
        const y = yP - 0.06 + ((yTu - yP + 0.06) * j) / 8;
        prof.push([rtu(y), y]);
      }
      b.add(washed ? m.wash : m.stone, lathe(prof, 24, 1, T_STONE), lean, washed ? white : natural, grime);
      b.add(m.dressed, lathe(crease([[0.17, yTu], [0.235, yTu], [0.235, yTu + 0.05], [0, yTu + 0.42]]), 24, 1, T_DRESSED), lean, 0x8a8278, grime);
      for (const f of [0.14, 0.3, 0.46]) {
        const y = yP + H * f;
        this.opening(b, at(Ft, cx(y), 0, 0), 0, rtu(y), y, 0.035, 0.11, slot, 1, grime);
      }
    }
    this.site(b, V(0, yP + H / 2, 0).applyMatrix4(F), H / 2 + 1.6);
  }

  /** Alternating long and short dressed blocks flanking an opening of width w on a round wall, and its lintel. */
  private quoins(b: Builder, F: THREE.Matrix4, a: number, r: number, y: number, w: number, h: number, n: number, rng: Rng, paint: Paint, deep = 0): void {
    for (let k = 0; k < n; k++) {
      const wq = k % 2 ? 0.045 : 0.07, hq = h / n, d = 0.07 + (k ? 0 : deep);
      for (const s of [-1, 1]) {
        b.add(this.m.dressed, box(wq, hq, d, null, T_DRESSED), wall(F, a, r - 0.005 + (k ? 0 : deep / 2), s * (w / 2 + wq / 2), y + k * hq), (k + s) % 2 ? 0xe0d8cc : 0xd2cabe, paint);
      }
    }
    b.add(this.m.dressed, box(w + 0.14, 0.055 + rng.next() * 0.02, 0.075, null, T_DRESSED), wall(F, a, r, 0, y + h), 0xe0d8cc, paint);
  }

  /** A window on a round wall: quoined jambs, sill and lintel standing proud, and the room recessed behind. */
  private opening(b: Builder, F: THREE.Matrix4, a: number, r: number, y: number, w: number, h: number, slot: number, mode: number, paint: Paint): void {
    b.extra = [slot, mode];
    b.add(this.m.glow, panel(w + 0.01, h), wall(F, a, r + 0.004, 0, y));
    this.quoins(b, F, a, r, y, w, h, Math.max(2, Math.round(h / 0.08)), new Rng(Math.floor((a + y) * 1000)), paint);
    b.add(this.m.dressed, box(w + 0.1, 0.035, 0.07, null, T_DRESSED), wall(F, a, r + 0.01, 0, y - 0.035), 0xe0d8cc, paint);
  }

  // -------------------------------------------------------------------------------------------
  /** The fishing village: the pier with its head, lantern and drying nets, every hut and its walkway, the skiffs. */
  private village(group: Site[], rng: Rng): void {
    const pier = group.find((s) => s.kind === 'pier');
    if (!pier) return;
    const m = this.m, b = new Builder(), P = new Place(this.world, pier.pos, pier.facing);
    const hw = 0.3, BENT = 1;
    // the deck starts where the beach falls a hand below it
    let s0 = 0;
    while (s0 < pier.size - 3 && Math.max(P.h(-hw, s0), P.h(hw, s0)) > DECK - 0.22) s0 += 0.1;
    const s1 = pier.size, nb = Math.max(2, Math.round((s1 - s0 - 0.4) / BENT));
    const bz = Array.from({ length: nb + 1 }, (_, k) => s0 + 0.3 + (k * (s1 - s0 - 0.45)) / nb);
    const headZ = nb >= 6 ? bz[nb - 1] - 0.5 : Infinity, zEnd = bz[nb] + 0.15;
    const half = (z: number) => (z >= headZ ? 0.85 : hw);
    const blocked = new Set<string>(); // bent:side where a walkway lands, so no fender pile stands there
    const racks = new Set<string>();
    const walks: [number, number][] = []; // pier side and z of each walkway landing

    // huts first: their walkways decide where the pier's sides stay clear
    let hutIx = 0;
    for (const hs of group.filter((s) => s.kind === 'hut')) {
      const [hx, hz] = P.map(hs.pos), f = V(hs.facing.x, hs.facing.y, hs.facing.z);
      const yaw = Math.atan2(f.dot(P.e1), f.dot(P.e2)), side = Math.sign(hx) || 1;
      const W = rng.range(0.92, 1.05), D = rng.range(0.72, 0.8), VER = 0.36;
      this.hut(b, P.sub(hx, hz, yaw), W, D, VER, rng, hutIx++ % 2 === 0);
      // a walkway from the veranda straight on to the pier's side
      const sy = Math.sin(yaw), cy = Math.cos(yaw), ax = hx + sy * (D / 2 + VER), az = hz + cy * (D / 2 + VER);
      const t = (side * hw - ax) / sy, zw = az + cy * t;
      if (sy * -side > 0.3 && t > 0.3 && t < 7 && zw > s0 + 0.4 && zw < Math.min(zEnd, headZ) - 0.3) {
        this.walkway(b, P, ax, az, side * hw, zw, rng);
        walks.push([side, zw]);
        bz.forEach((z, k) => Math.abs(z - zw) < 0.45 && blocked.add(`${k}:${side}`));
      }
    }
    // skiffs alongside in bays with water under them, a net rack in some of the others
    let skiffs = 0;
    for (let k = 1; k < nb - 1; k++) {
      for (const side of [1, -1]) {
        const zc = (bz[k] + bz[k + 1]) / 2, x = side * (hw + 0.55);
        if (zc + 0.6 > headZ || walks.some(([s, z]) => s === side && Math.abs(z - zc) < 1.2)) continue;
        const deep = Math.max(P.h(x, zc), P.h(x, zc - 0.5), P.h(x, zc + 0.5)) < -0.32;
        if (deep && skiffs < 3 && (k + (side > 0 ? 0 : 1)) % 2 === 0) {
          this.mooredSkiff(P, x, zc, side * (hw + 0.16), bz[k], bz[k + 1], rng);
          skiffs++;
        } else if (racks.size < 2 && k % 3 === 1) racks.add(`${k}:${side}`);
      }
    }
    // bents: piles, cap beam, bolted cross bracing, fender piles (some carrying net poles)
    bz.forEach((z, k) => {
      const hk = half(z), piles = hk === hw ? [-hw, hw] : [-0.85, -hw, hw, 0.85], F = P.sub(0, z).F;
      for (const x of piles) {
        const g = P.h(x, z) - 0.35;
        b.add(m.wood, log(DECK - 0.165 - g, 0.055, 0.048, m.wood, rng, 0.008), at(F, x, g, 0, rng.range(0, TAU)), 0xd8d0c4, tide);
      }
      b.add(m.wood, box(0.08, 2 * hk + 0.22, 0.08, board(m.wood, rng)), span(F, V(-hk - 0.11, DECK - 0.125, 0), V(hk + 0.11, DECK - 0.125, 0)), 0xc8c0b4);
      const lo = Math.min(Math.max(P.h(-hk, z), P.h(hk, z)) + 0.14, DECK - 0.5), hi = DECK - 0.24;
      for (const s of [1, -1]) {
        const ya = s > 0 ? hi : lo, yb = s > 0 ? lo : hi, zz = s * 0.078;
        b.add(m.wood, log(Math.hypot(2 * hk, hi - lo), 0.024, 0.022, m.wood, rng, 0.004), span(F, V(-hk, ya, zz), V(hk, yb, zz)), 0xc8c0b4, tide);
        for (const [x, y] of [[-hk, ya], [hk, yb]]) {
          b.add(m.iron, lathe(crease([[0, 0], [0.016, 0], [0.016, 0.008], [0, 0.012]]), 8, 1, T_IRON), at(F, x, y, zz + s * 0.024, 0, (s * Math.PI) / 2), 0x6a5a50);
        }
      }
      for (const s of [1, -1]) {
        if (blocked.has(`${k}:${s}`)) continue;
        const x = s * (hk + 0.16), g = P.h(x, z) - 0.35, topY = racks.has(`${k}:${s}`) || racks.has(`${k - 1}:${s}`) ? DECK + 0.95 : DECK + 0.2;
        b.add(m.wood, log(topY - g, 0.052, 0.045, m.wood, rng, 0.01), at(F, x, g, 0, rng.range(0, TAU)), 0xd0c8bc, tide);
        b.add(m.rope, tube(circle(0.058, 12), 0.012, 5, ropeUV(0.012)), at(F, x, DECK + 0.13, 0), 0xb8a888);
      }
    });
    // walings tying the piles along each side above mean water, stringers on the caps, then the deck planks
    for (let k = 0; k < nb; k++) {
      const hk = half(bz[k]);
      if (hk !== half(bz[k + 1])) continue;
      for (const s of [1, -1]) {
        b.add(m.wood, log(bz[k + 1] - bz[k] + 0.1, 0.03, 0.03, m.wood, rng, 0.003), spanW(P.at(s * (hk + 0.08), 0.12, bz[k] - 0.05), P.at(s * (hk + 0.08), 0.12, bz[k + 1] + 0.05)), 0xb8b0a4, (x, y, z, c) => wetBelow(Math.hypot(x, y, z) - R, 0.4, c));
      }
    }
    const stringers = (z: number) => (half(z) === hw ? [-hw + 0.05, -0.1, 0.1, hw - 0.05] : [-0.8, -0.5, -0.2, 0.1, 0.4, 0.8]);
    const ends = [s0 - 0.3, ...bz.slice(0, -1).map((z, k) => (z + bz[k + 1]) / 2), zEnd];
    for (let k = 0; k < ends.length - 1; k++) {
      for (const x of stringers(ends[k + 1] - 0.01)) {
        b.add(m.wood, box(0.06, ends[k + 1] - ends[k] + 0.03, 0.06, board(m.wood, rng)), spanW(P.at(x, DECK - 0.055, ends[k] - 0.015), P.at(x, DECK - 0.055, ends[k + 1] + 0.015)), 0xc0b8ac);
      }
    }
    // a stone abutment where the deck meets the beach
    const gA = Math.min(P.h(-hw, s0 - 0.3), P.h(hw, s0 - 0.3));
    b.add(m.dressed, box(2 * hw + 0.2, DECK - 0.085 - gA + 0.25, 0.32, null, T_DRESSED), at(P.sub(0, s0 - 0.3).F, 0, gA - 0.25, 0), 0xb8b0a4, tide);
    for (let z = s0 - 0.42; z < zEnd - 0.05; z += 0.118) {
      const hk = half(z + 0.06), L = 2 * hk + 0.05 + rng.range(-0.02, 0.02), j = rng.range(-0.015, 0.015);
      b.add(m.wood, box(0.106, L, 0.025, board(m.wood, rng)), spanW(P.at(-L / 2 + j, DECK - 0.0125, z + 0.06), P.at(L / 2 + j, DECK - 0.0125, z + 0.06)), rng.next() < 0.15 ? 0x9a9084 : 0xe8e0d4);
    }
    // drying nets: tall fender poles carry a bar along the pier's side, the net hangs over it on both sides
    for (const key of racks) {
      const [k, s] = key.split(':').map(Number), x = s * (hw + 0.16), z0 = bz[k], z1 = bz[k + 1];
      b.add(m.wood, log(z1 - z0, 0.022, 0.02, m.wood, rng, 0.01), spanW(P.at(x, DECK + 0.92, z0), P.at(x, DECK + 0.92, z1)), 0xd0c8bc);
      for (const z of [z0, z1]) b.add(m.rope, tube(circle(0.058, 12), 0.01, 5, ropeUV(0.01)), at(P.sub(x, z).F, 0, DECK + 0.92, 0), 0xb8a888);
      const Fn = at(P.sub(x, (z0 + z1) / 2).F, 0, DECK + 0.92, 0, Math.PI / 2), [cloth, corks] = net(z1 - z0 - 0.32, 0.6, rng);
      b.add(m.net, cloth, Fn, rng.next() < 0.5 ? 0x7a6c58 : 0x5e6a64);
      b.add(m.net, corks, Fn, 0xc8a878);
    }
    // the head: a lantern hung out over the water, casks, baskets, a coil, a ladder down
    if (headZ < Infinity) {
      const Fh = P.sub(0.62, zEnd - 0.12).F;
      b.add(m.wood, box(0.07, 0.95, 0.07, board(m.wood, rng)), at(Fh, 0, DECK, 0), 0xc8c0b4);
      b.add(m.wood, box(0.05, 0.32, 0.05, board(m.wood, rng)), span(Fh, V(0, DECK + 0.88, -0.04), V(0, DECK + 0.88, 0.28)), 0xc8c0b4);
      this.lantern(b, at(Fh, 0, DECK + 0.855, 0.22));
      cask(b, m, at(P.sub(-0.55, headZ + 0.35).F, 0, DECK, 0), 0.26, 0.075, 0.095, rng, m.tar, 0xffffff);
      cask(b, m, at(P.sub(-0.35, headZ + 0.3).F, 0, DECK, 0), 0.26, 0.075, 0.095, rng, m.tar, 0xffffff);
      basket(b, m, at(P.sub(0.5, headZ + 0.3).F, 0, DECK, 0), 0.07, 0.12);
      basket(b, m, at(P.sub(0.66, headZ + 0.38).F, 0, DECK, 0), 0.06, 0.1);
      coil(b, m, at(P.sub(-0.5, zEnd - 0.3).F, 0, DECK, 0), 0.11);
      this.ladder(b, P.sub(-0.45, zEnd + 0.012), rng);
    }
    this.site(b, P.at(0, 0, (s0 + s1) / 2), (s1 - s0) / 2 + 8);
  }

  /** A pier lantern: iron frame, peaked cap and four lamp-lit panes, hanging from its hook at F. */
  private lantern(b: Builder, F: THREE.Matrix4): void {
    const m = this.m, s = 0.055, slot = this.lamp(V(0, -0.18, 0).applyMatrix4(F), 0xffa050, 4, 9, false, 0.2);
    b.add(m.iron, tube([V(0, 0, 0), V(0, -0.05, 0)], 0.005, 4, ironUV(0.005)), F, 0x4a4038);
    b.add(m.iron, lathe(crease([[0, -0.11], [s + 0.02, -0.11], [s + 0.02, -0.095], [0, -0.05]]), 4, 1, T_IRON, Math.PI / 4, Math.PI / 4 + TAU), F, 0x4a4038);
    b.add(m.iron, box(2 * s + 0.03, 0.02, 2 * s + 0.03, null, T_IRON), at(F, 0, -0.27, 0), 0x4a4038);
    for (const [x, z] of [[-s, -s], [s, -s], [s, s], [-s, s]]) b.add(m.iron, box(0.01, 0.16, 0.01, null, T_IRON), at(F, x, -0.26, z), 0x4a4038);
    b.extra = [slot, 0];
    for (let k = 0; k < 4; k++) b.add(m.glow, panel(2 * s - 0.006, 0.15), at(F, 0, -0.255, 0, (k * Math.PI) / 2).multiply(at(IDENT, 0, 0, s - 0.003)));
  }

  /** A ladder from a deck edge at P's origin down into the seabed, leaning out along P's +Z. */
  private ladder(b: Builder, P: Place, rng: Rng): void {
    const m = this.m, g = Math.min(P.h(-0.1, 0.2), P.h(0.1, 0.2)) - 0.1, lean = 0.12, top = DECK + 0.12;
    const rail = (s: number, y: number) => V(s * 0.1, y, (top - y) * lean);
    for (const s of [-1, 1]) b.add(m.wood, log(rail(s, g).distanceTo(rail(s, top)), 0.017, 0.016, m.wood, rng, 0.004), span(P.F, rail(s, g), rail(s, top)), 0xd0c8bc, tide);
    for (let y = Math.max(g + 0.12, -0.3); y < DECK; y += 0.12) {
      b.add(m.wood, log(0.2, 0.011, 0.011, m.wood, rng, 0.002, 3), span(P.F, rail(-1, y), rail(1, y)), 0xc8c0b4, tide);
    }
  }

  /** A plank walkway on posts from a hut veranda (ax, az) to the pier side (bx, bz), with a rope handrail. */
  private walkway(b: Builder, P: Place, ax: number, az: number, bx: number, bz: number, rng: Rng): void {
    const m = this.m, len = Math.hypot(bx - ax, bz - az), dx = (bx - ax) / len, dz = (bz - az) / len;
    const pt = (s: number, o: number, y: number) => P.at(ax + dx * s - dz * o, y, az + dz * s + dx * o);
    const yaw = Math.atan2(dx, dz), n = Math.max(1, Math.ceil((len - 0.5) / 0.85)), rail: THREE.Vector3[] = [];
    for (let k = 0; k <= n; k++) {
      const s = 0.18 + ((len - 0.5) * k) / n, Fb = P.sub(ax + dx * s, az + dz * s, yaw).F;
      for (const o of [-0.26, 0.26]) {
        const g = P.h(ax + dx * s - dz * o, az + dz * s + dx * o) - 0.3, top = o > 0 ? DECK + 0.3 : DECK - 0.09;
        b.add(m.wood, log(top - g, 0.034, 0.03, m.wood, rng, 0.012), at(Fb, -o, g, 0, rng.range(0, TAU)), 0xd0c8bc, tide);
        if (o > 0) rail.push(V(-o, top - 0.03, 0).applyMatrix4(Fb));
      }
      b.add(m.wood, box(0.06, 0.6, 0.08, board(m.wood, rng)), span(Fb, V(-0.3, DECK - 0.112, 0), V(0.3, DECK - 0.112, 0)), 0xc0b8ac);
    }
    for (const o of [-0.12, 0.12]) b.add(m.wood, box(0.05, len - 0.06, 0.05, board(m.wood, rng)), spanW(pt(0, o, DECK - 0.047), pt(len - 0.06, o, DECK - 0.047)), 0xc0b8ac);
    for (let s = 0.05; s < len - 0.1; s += 0.1) {
      const L = 0.4 + rng.range(-0.02, 0.02), j = rng.range(-0.012, 0.012);
      b.add(m.wood, box(0.09, L, 0.022, board(m.wood, rng)), spanW(pt(s, -L / 2 + j, DECK - 0.011), pt(s, L / 2 + j, DECK - 0.011)), rng.next() < 0.12 ? 0x9a9084 : 0xe0d8cc);
    }
    for (let k = 1; k < rail.length; k++) {
      const a = rail[k - 1], c = rail[k], dn = a.clone().normalize();
      b.add(m.rope, tube(Array.from({ length: 9 }, (_, i) => a.clone().lerp(c, i / 8).addScaledVector(dn, -0.24 * (i / 8) * (1 - i / 8))), 0.009, 4, ropeUV(0.009)), IDENT, 0xb8a888);
    }
  }

  /** A skiff moored alongside the pier at (x, z), its lines made fast to the fender piles at x = fx, z0 and z1. */
  private mooredSkiff(P: Place, x: number, z: number, fx: number, z0: number, z1: number, rng: Rng): void {
    const paints = [0x5f7f96, 0xa4543c, 0x5b8a76, 0xc29a4a, 0xd8d2c4], flip = rng.next() < 0.5;
    this.dyn.bone = this.bones.length; // the hull rides the bone body() is about to add
    const [bowL, sternL] = skiff(this.dyn, this.m, rng.range(0.95, 1.08), paints[rng.int(paints.length)], rng);
    const s = this.body(new Skiff(P.dir(x, z), P.e2.clone().multiplyScalar(flip ? -1 : 1), bowL, sternL));
    this.ropes.add(s.bow, P.at(fx, DECK + 0.13, flip ? z0 : z1), 1.12, 0.009);
    this.ropes.add(s.stern, P.at(fx, DECK + 0.13, flip ? z1 : z0), 1.12, 0.009);
  }

  // -------------------------------------------------------------------------------------------
  /**
   * One stilt hut in its own place (front toward the pier): crooked stilts with lashed bracing, a plank platform
   * with a veranda, board-and-batten walls with a door and propped shutters, a steep thatched roof with rafter
   * tails under the eaves, and every other one an outside chimney stack at a gable.
   */
  private hut(b: Builder, H: Place, W: number, D: number, VER: number, rng: Rng, chimney: boolean): void {
    const m = this.m, F = H.F, F0 = DECK, wallH = rng.range(0.46, 0.52), pitch = rng.range(0.86, 0.95), tanP = Math.tan(pitch);
    const xMin = -W / 2 - 0.06, xMax = W / 2 + 0.06 + (chimney ? 0.3 : 0), zMin = -D / 2 - 0.06, zMax = D / 2 + VER;
    const wood = (w: number, h: number, d: number, M: THREE.Matrix4, tint = 0xe0d8cc, l = h, r = h) =>
      b.add(m.wood, box(w, h, d, board(m.wood, rng), T_WOOD, l, r), M, tint);
    const beam = (a: THREE.Vector3, c: THREE.Vector3, w: number, d: number) => wood(w, a.distanceTo(c), d, span(F, a, c), 0xc8c0b4);
    // stilts, lashed cross bracing
    const cols = [-W / 2, 0, W / 2, ...(chimney ? [W / 2 + 0.27] : [])], rows = [-D / 2, D / 2, zMax - 0.05];
    for (const x of cols) {
      for (const z of rows) {
        const g = H.h(x, z) - 0.3;
        b.add(m.wood, log(F0 - 0.165 - g, 0.05, 0.042, m.wood, rng, 0.01), at(F, x, g, z, rng.range(0, TAU)), 0xd8d0c4, tide);
      }
    }
    for (const z of rows) {
      for (let i = 0; i + 1 < cols.length; i++) {
        const xa = cols[i], xc = cols[i + 1], o = z === rows[0] ? -0.068 : 0.068;
        const lo = Math.min(Math.max(H.h(xa, z), H.h(xc, z)) + 0.12, F0 - 0.45), hi = F0 - 0.22, up = i % 2 === 0;
        const a = V(xa, up ? lo : hi, z + o), c = V(xc, up ? hi : lo, z + o);
        b.add(m.wood, log(a.distanceTo(c), 0.022, 0.02, m.wood, rng, 0.004), span(F, a, c), 0xc8c0b4, tide);
        for (const p of [a, c]) b.add(m.rope, tube(circle(0.058, 10), 0.01, 4, ropeUV(0.01)), at(F, p.x, p.y, z), 0xb8a888);
      }
    }
    // bearers, joists and floor planks
    for (const z of rows) beam(V(xMin - 0.03, F0 - 0.125, z), V(xMax + 0.03, F0 - 0.125, z), 0.07, 0.08);
    for (let x = xMin + 0.04; x < xMax; x += 0.24) beam(V(x, F0 - 0.055, zMin), V(x, F0 - 0.055, zMax), 0.045, 0.06);
    for (let z = zMin + 0.055; z < zMax; z += 0.117) {
      const j = rng.range(-0.02, 0.02);
      wood(0.105, xMax - xMin + rng.range(-0.02, 0.02), 0.025, span(F, V(xMin + j, F0 - 0.0125, z), V(xMax + j, F0 - 0.0125, z)), rng.next() < 0.15 ? 0xa09488 : 0xe8e0d4);
    }
    // corner posts and the wall plates just inside the boards
    const eave = F0 + wallH;
    for (const x of [-W / 2, W / 2]) for (const z of [-D / 2, D / 2]) wood(0.06, wallH, 0.06, at(F, x, F0, z), 0xb8b0a4);
    for (const z of [-D / 2 + 0.04, D / 2 - 0.04]) beam(V(-W / 2 + 0.03, eave - 0.03, z), V(W / 2 - 0.03, eave - 0.03, z), 0.06, 0.06);
    for (const x of [-W / 2 + 0.04, W / 2 - 0.04]) beam(V(x, eave - 0.03, -D / 2 + 0.03), V(x, eave - 0.03, D / 2 - 0.03), 0.06, 0.06);
    // walls of vertical boards with battens over the joints; door and window openings snap to whole boards
    const slot = this.lamp(new THREE.Vector3(), 0xff9a48, 2.6, 6, false, rng.range(0.22, 0.6));
    const gableTop = (z: number) => eave + (D / 2 - Math.abs(z)) * tanP - 0.012, wy0 = F0 + 0.2, wy1 = F0 + 0.35;
    const winZ = rng.range(-0.12, 0.04);
    const walls: Wall[] = [
      { n: 0, c: D / 2, len: W, win: null, door: -rng.range(0.05, 0.2) * W, gable: false },
      { n: 1, c: W / 2, len: D, win: chimney ? null : -winZ, door: null, gable: true },
      { n: 2, c: -D / 2, len: W, win: rng.range(-0.2, 0.2) * W, door: null, gable: false },
      { n: 3, c: -W / 2, len: D, win: winZ, door: null, gable: true },
    ];
    for (const w of walls) {
      // the wall's frame: +Z out of the wall, x along it
      const Fw = at(F, w.n % 2 ? w.c : 0, 0, w.n % 2 ? 0 : w.c, (w.n * Math.PI) / 2), On = (x: number, y: number, z: number) => Fw.clone().multiply(at(IDENT, x, y, z));
      const nb = Math.round((w.len - 0.06) / 0.1), bw = (w.len - 0.06) / nb, x0 = -w.len / 2 + 0.03;
      const snap = (c: number | null, half: number): [number, number] | null =>
        c === null ? null : [x0 + Math.max(0, Math.floor((c - half - x0) / bw + 0.5)) * bw, x0 + Math.min(nb, Math.ceil((c + half - x0) / bw - 0.5)) * bw];
      const door = snap(w.door, 0.11), win = snap(w.win, 0.07);
      const inside = (r: [number, number] | null, a: number, c: number) => r !== null && a > r[0] - 1e-6 && c < r[1] + 1e-6;
      for (let k = 0; k < nb; k++) {
        const a = x0 + k * bw, c = a + bw, tint = rng.next() < 0.2 ? 0xb0a698 : 0xe4dcd0;
        // a gable board's top follows the roof slope; along-wall x is the hut's -z on the right wall, +z on the left
        const za = w.n === 1 ? -a : a, zc = w.n === 1 ? -c : c;
        const tl = w.gable ? gableTop(za) : eave - 0.005, tr = w.gable ? gableTop(zc) : eave - 0.005;
        const segs: [number, number][] = inside(door, a, c) ? [[F0 + 0.4, 9]] : inside(win, a, c) ? [[F0, wy0], [wy1, 9]] : [[F0, 9]];
        for (const [y0, y1] of segs) {
          const hl = y1 === 9 ? tl - y0 : y1 - y0, hr = y1 === 9 ? tr - y0 : y1 - y0;
          b.add(m.wood, box(bw - 0.006, Math.min(hl, hr), 0.018, board(m.wood, rng), T_WOOD, hl, hr), On(a + bw / 2, y0, 0), tint);
        }
        const edge = (r: [number, number] | null) => r !== null && a > r[0] - 1e-6 && a < r[1] + 1e-6;
        if (k && !edge(door) && !edge(win)) {
          const hb = (w.gable ? gableTop(za) : eave) - F0 - 0.03;
          b.add(m.wood, box(0.026, hb, 0.01, board(m.wood, rng)), On(a, F0, 0.014), 0xc8c0b4);
        }
      }
      if (door) {
        const [d0, d1] = door, dc = (d0 + d1) / 2, dn = Math.round((d1 - d0) / 0.075);
        for (const x of [d0 - 0.0175, d1 + 0.0175]) b.add(m.wood, box(0.035, 0.43, 0.016, board(m.wood, rng)), On(x, F0, 0.017), 0xa89e90);
        b.add(m.wood, box(d1 - d0 + 0.07, 0.035, 0.016, board(m.wood, rng)), On(dc, F0 + 0.4, 0.017), 0xa89e90);
        for (let i = 0; i < dn; i++) b.add(m.wood, box((d1 - d0) / dn - 0.004, 0.415, 0.02, board(m.wood, rng)), On(d0 + ((i + 0.5) * (d1 - d0)) / dn, F0, -0.002), 0x9c9284);
        for (const y of [0.07, 0.3]) b.add(m.wood, box(d1 - d0 - 0.03, 0.03, 0.012, board(m.wood, rng)), On(dc, F0 + y, 0.014), 0x8c8274);
        b.add(m.iron, box(0.012, 0.05, 0.008, null, T_IRON), On(d1 - 0.035, F0 + 0.19, 0.024), 0x4a4038);
      }
      if (win) {
        const [w0, w1] = win, wc = (w0 + w1) / 2, ww = w1 - w0;
        b.extra = [slot, 0];
        b.add(m.glow, panel(ww + 0.08, wy1 - wy0 + 0.06), On(wc, wy0 - 0.03, -0.09));
        for (const y of [wy0 - 0.02, wy1]) b.add(m.wood, box(ww + 0.066, 0.02, 0.016, board(m.wood, rng)), On(wc, y, 0.017), 0xa89e90);
        for (const x of [w0 - 0.011, w1 + 0.011]) b.add(m.wood, box(0.022, wy1 - wy0, 0.016, board(m.wood, rng)), On(x, wy0, 0.017), 0xa89e90);
        // a shutter hinged at the head, propped open on a stick
        const sh = wy1 - wy0 + 0.02, Fs = Fw.clone().multiply(at(IDENT, wc, wy1 + 0.02, 0.03, 0, -rng.range(0.7, 1))).multiply(at(IDENT, 0, -sh, 0));
        for (const x of [-ww / 4 - 0.008, ww / 4 + 0.008]) b.add(m.wood, box(ww / 2 + 0.03, sh, 0.016, board(m.wood, rng)), Fs.clone().multiply(at(IDENT, x, 0, 0)), 0xb4aa9c);
        const tip = V(0, 0.01, 0.01).applyMatrix4(Fs), foot = V(wc, wy0 - 0.12, 0.012).applyMatrix4(Fw);
        b.add(m.wood, log(tip.distanceTo(foot), 0.007, 0.006, m.wood, rng, 0.002, 3), span(IDENT, foot, tip, foot.clone().normalize()), 0xc8c0b4);
        if (w.n === 3) this.lamps[slot].light.pos.copy(V(wc, wy0 + 0.08, 0.3).applyMatrix4(Fw));
      }
    }
    // the roof: two thatched slabs with ragged eaves over rafters, a ridge pole, the bound ridge roll, gable horns
    const S = (D / 2 + 0.24) / Math.cos(pitch), thick = 0.095, ridge = eave + (D / 2) * tanP;
    const ovL = 0.2, ovR = chimney ? 0.035 : 0.2;
    for (const back of [false, true]) {
      const Fr = at(F, 0, ridge, 0, back ? Math.PI : 0, pitch), [l, r] = back ? [ovR, ovL] : [ovL, ovR];
      const [outside, under] = this.thatch(W + l + r, S, thick, rng), M = Fr.clone().multiply(at(IDENT, (r - l) / 2, 0, 0));
      b.add(m.thatch, outside, M);
      b.add(m.thatch, under, M, 0x8a7a64);
      for (let x = -W / 2 - l + 0.08; x < W / 2 + r - 0.04; x += 0.27) {
        b.add(m.wood, log(S - 0.06, 0.017, 0.016, m.wood, rng, 0.004), Fr.clone().multiply(span(IDENT, V(x, -0.019, 0.03), V(x, -0.019, S - 0.03))), 0xb0a698);
      }
    }
    b.add(m.wood, log(W + ovL + ovR - 0.06, 0.03, 0.028, m.wood, rng, 0.004), span(F, V(-W / 2 - ovL + 0.03, ridge - 0.03, 0), V(W / 2 + ovR - 0.03, ridge - 0.03, 0)), 0xb0a698);
    const rollY = ridge + 0.05;
    b.add(m.thatch, tube([V(-W / 2 - ovL + 0.03, rollY, 0), V(W / 2 + ovR - 0.03, rollY, 0)], 0.1, 12, [0, 0.5, 1 / T_THATCH, 0], 3), F, 0xd8c8a4);
    for (let x = -W / 2 - ovL + 0.12; x < W / 2 + ovR - 0.08; x += 0.22) {
      b.add(m.rope, tube(circle(0.104, 16), 0.008, 4, ropeUV(0.008)), at(F, x, rollY, 0, 0, 0, Math.PI / 2), 0xa89878);
    }
    for (const xg of chimney ? [-W / 2 - ovL + 0.05] : [-W / 2 - ovL + 0.05, W / 2 + ovR - 0.05]) {
      for (const s of [1, -1]) {
        const p = (t: number) => V(xg, ridge - t * Math.sin(pitch) + (thick + 0.012) * Math.cos(pitch), s * (t * Math.cos(pitch) + (thick + 0.012) * Math.sin(pitch)));
        const a = p(0.32), e = p(0).add(p(0).sub(a).setLength(0.24));
        b.add(m.wood, log(a.distanceTo(e), 0.015, 0.012, m.wood, rng, 0.008), span(F, a, e), 0xb0a698);
      }
    }
    // the chimney: a clay-rendered rubble stack on the platform beside the gable, capped with a pot
    if (chimney) {
      const cx = W / 2 + 0.18, topY = rollY + 0.32;
      b.add(m.stone, box(0.22, topY - F0, 0.22, null, T_STONE), at(F, cx, F0, 0), 0xe0c4a8, (x, y, z, c) => c.multiplyScalar(1 - smoothstep(topY - 0.3, topY, Math.hypot(x, y, z) - R) * 0.5));
      b.add(m.dressed, box(0.28, 0.045, 0.28, null, T_DRESSED), at(F, cx, topY, 0), 0x9a9088);
      b.add(m.stone, lathe([[0, topY + 0.04], [0.06, topY + 0.04], [0.05, topY + 0.1], [0.042, topY + 0.15], [0.048, topY + 0.16], [0.036, topY + 0.16], [0.03, topY + 0.1]], 12, 1, 0.4), at(F, cx, 0, 0), 0x9a5a40);
      this.emitters.push({ kind: 'smoke', pos: V(cx, topY + 0.2, 0).applyMatrix4(F), size: 0.4 });
    }
    // a ladder off the side of the veranda, and odds and ends lying about it
    this.ladder(b, H.sub(xMin - 0.017, zMax - 0.17, -Math.PI / 2), rng);
    basket(b, m, at(F, W / 2 - 0.12, F0, D / 2 + 0.16), 0.065, 0.11);
    coil(b, m, at(F, W / 2 - 0.16, F0, zMax - 0.12), 0.09);
    b.add(m.wood, tube([V(W / 2 - 0.3, F0 + 0.01, D / 2 + 0.07), V(W / 2 - 0.36, F0 + 0.5, D / 2 + 0.03)], 0.009, 5, grain(m.wood, rng), 3), F, 0xd8ccb8);
  }

  /** A thatch slab in its own frame: x along the ridge (centred), y out of the roof, z down the slope. Each course
   *  of bundles thickens to its butt ends and steps down onto the next; the eave is ragged and thins out. Returns
   *  the outside with its cut edges, and the underside. */
  private thatch(len: number, S: number, thick: number, rng: Rng): [Geo, Geo] {
    const g = new Geo(), under = new Geo(), nx = Math.ceil(len / 0.06), ns = Math.ceil(S / 0.021), ph = rng.range(0, TAU);
    const raw = Array.from({ length: nx + 1 }, () => rng.range(-0.04, 0.03));
    const ends = raw.map((e, i) => S + (e * 2 + (raw[i - 1] ?? e) + (raw[i + 1] ?? e)) / 4);
    const top = (i: number, s: number, end: number) =>
      thick * (1 - 0.5 * smoothstep(end - 0.12, end, s)) + 0.011 * ((s / 0.085 + 0.18 * Math.sin(i * 0.37 + ph)) % 1) ** 2 + 0.005 * Math.sin(i * 1.3 + s * 23 + ph);
    const x = (i: number) => -len / 2 + (len * i) / nx;
    grid(g, ns, nx, (j, i) => {
      const s = (ends[i] * j) / ns;
      return [x(i), top(i, s, ends[i]), s, x(i) / T_THATCH, s / T_THATCH];
    });
    grid(under, nx, 4, (i, j) => {
      const s = (ends[i] * j) / 4;
      return [x(i), 0, s, x(i) / T_THATCH, s / T_THATCH];
    });
    grid(g, nx, 1, (i, j) => [x(i), j ? top(i, ends[i], ends[i]) : 0, ends[i], x(i) / T_THATCH, (j * 0.06) / T_THATCH]);
    for (const [i, s] of [[nx, 1], [0, -1]]) {
      grid(g, ns, 1, (j, k) => {
        const z = (ends[i] * j) / ns, up = s > 0 ? !k : !!k;
        return [x(i), up ? top(i, z, ends[i]) : 0, z, z / T_THATCH, (up ? 0.06 : 0) / T_THATCH];
      });
    }
    return [g, under];
  }

  // -------------------------------------------------------------------------------------------
  /** A cask buoy on a riser to a sinker stone; some carry a bell in an iron cage, others a staff and wicker ball. */
  private buoy(site: Site, rng: Rng): void {
    const m = this.m, d = this.dyn, up = V(site.pos.x, site.pos.y, site.pos.z), f = V(site.facing.x, site.facing.y, site.facing.z);
    const h = Math.max(0.42, Math.min(0.6, site.size)), draft = h * 0.42;
    const body = this.body(new Buoy(up, f, draft));
    const colors = [0xa04a36, 0x2e2a28, 0xe2dccd, 0x3e5a6e];
    cask(d, m, IDENT, h, h * 0.3, h * 0.38, rng, m.wood, colors[rng.int(colors.length)], (_x, y, _z, c) => {
      c.lerp(ALGAE, (1 - smoothstep(draft - 0.06, draft + 0.06, y)) * 0.75);
    });
    d.add(m.iron, tube(circle(0.025, 10), 0.006, 4, ironUV(0.006)), at(IDENT, 0, -0.022, 0, 0, 0, Math.PI / 2), 0x5a4c44);
    if (rng.next() < 0.6) {
      const q = 0.085, yt = h + 0.36;
      for (const [x, z] of [[q, q], [-q, q], [-q, -q], [q, -q]]) d.add(m.iron, tube([V(x, h - 0.03, z), V(x * 0.9, yt, z * 0.9)], 0.009, 5, ironUV(0.009), 2), IDENT, 0x5a4c44);
      const sq = [[1, 1], [-1, 1], [-1, -1], [1, -1], [1, 1]].map(([x, z]) => V(x * q * 0.9, yt, z * q * 0.9));
      d.add(m.iron, tube(sq, 0.01, 5, ironUV(0.01)), IDENT, 0x5a4c44);
      d.add(m.iron, lathe(crease([[0, yt - 0.01], [q * 1.2, yt - 0.01], [0, yt + 0.09]]), 4, 1, T_IRON, Math.PI / 4, Math.PI / 4 + TAU), IDENT, 0x4a4038);
      d.add(m.iron, tube([V(0, yt - 0.01, 0), V(0, yt - 0.035, 0)], 0.006, 4, ironUV(0.006)), IDENT, 0x5a4c44);
      this.hangBell(body.bone, V(0, yt - 0.035, 0));
    } else {
      d.add(m.wood, log(0.46, 0.016, 0.014, m.wood, rng, 0.004), at(IDENT, 0, h - 0.03, 0), 0xd0c8bc);
      d.add(m.rope, lathe([[0, -0.065], [0.04, -0.05], [0.065, 0], [0.04, 0.05], [0, 0.065]], 10, 2, 0.2), at(IDENT, 0, h + 0.48, 0), 0x8a6a48);
    }
    // the sinker half-buried in the seabed and the riser up to the cask's eye
    const seabed = this.world.height(up);
    this.loose.add(m.dressed, box(0.24, 0.12, 0.2, null, T_DRESSED), at(new Place(this.world, up, f).F, 0, seabed - 0.06, 0, rng.range(0, TAU)), 0x6a6a5e);
    this.ropes.add(body.eye, up.clone().multiplyScalar(R + seabed + 0.04), 1.25, 0.008, R + seabed);
  }

  /** A crooked marker pole driven into the seabed, weathered pale at its head, with a topmark or a bell. */
  private pole(site: Site, rng: Rng): void {
    const m = this.m, d = this.dyn, up = V(site.pos.x, site.pos.y, site.pos.z), f = V(site.facing.x, site.facing.y, site.facing.z);
    const depth = -site.height, L = depth + 0.3 + site.size;
    const body = this.body(new Pole(up, f, up.clone().multiplyScalar(R - depth - 0.3), rng.range(0.06, 0.16)));
    d.add(m.wood, log(L, 0.066, 0.048, m.wood, rng, 0.05), IDENT, 0xd8d0c4, (_x, y, _z, c) => {
      wetBelow(y - depth - 0.3, 0.25, c);
      c.multiplyScalar(1 + 0.25 * smoothstep(L - 0.6, L, y));
    });
    const kind = rng.int(3);
    if (kind === 0) {
      // a withy broom lashed to the head
      for (let k = 0; k < 11; k++) {
        const a = (k / 11) * TAU + rng.range(0, 0.4), r = rng.range(0.06, 0.13), lean = V(Math.cos(a) * r, 0.5, -Math.sin(a) * r);
        d.add(m.wood, log(lean.length(), 0.008, 0.004, m.wood, rng, 0.02, 0), span(IDENT, V(0, L - 0.2, 0), V(0, L - 0.2, 0).add(lean)), 0x8a7a62);
      }
      for (const y of [L - 0.16, L - 0.04]) d.add(m.rope, tube(circle(0.056, 12, y), 0.01, 4, ropeUV(0.01)), IDENT, 0xa89878);
    } else if (kind === 1) {
      cask(d, m, at(IDENT, 0, L + 0.27, 0, 0, Math.PI), 0.27, 0.075, 0.095, rng, m.wood, 0x2e2a28);
    } else {
      const arm = 0.2, ya = L - 0.12;
      d.add(m.wood, box(0.045, arm + 0.06, 0.045, board(m.wood, rng)), span(IDENT, V(-0.06, ya, 0), V(arm, ya, 0)), 0xb8b0a4);
      d.add(m.iron, tube([V(arm - 0.03, ya - 0.0225, 0), V(arm - 0.03, ya - 0.05, 0)], 0.005, 4, ironUV(0.005)), IDENT, 0x5a4c44);
      this.hangBell(body.bone, V(arm - 0.03, ya - 0.05, 0));
    }
  }

  /** A bell swinging from `pivot` on a body's bone. */
  private hangBell(body: THREE.Bone, pivot: THREE.Vector3): void {
    const s = new Bell(body, pivot), owner = this.dyn.bone;
    this.dyn.bone = this.bones.push(s.bone) - 1;
    bell(this.dyn, this.m);
    this.dyn.bone = owner;
    this.bellSims.push(s);
  }
}
