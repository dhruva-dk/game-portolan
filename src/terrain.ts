// Seabed and islands: one seamless quadtree terrain over the cube-sphere, sampled straight from world.height so
// anything placed with it sits exactly on the ground, shaded with scanned materials projected triplanar in each
// island's own frame (cliffs never stretch), rock strata, basalt columns, wet sand, caustics and vertex AO.
import * as THREE from 'three';
import { R, HN, SOLID, Rng, clamp01, faceDir, normalize, smoothstep, type V3 } from './sim.ts';
import { sampleCube } from './craft.ts';
import type { Site, World } from './world.ts';
import { LAYER, loadTexture } from './post.ts';
import { WIND_GLSL, applyWeather, type LightSource } from './sky.ts';
import { GRAVITY, SWELL_GLSL, SWELL_UNIFORMS } from './ocean.ts';
import type { Ctx, Frame } from './main.ts';
import type { Emitter } from './fx.ts';
import sandWhiteCol from './assets/sand_white_color.jpg';
import sandWhiteNrm from './assets/sand_white_normal.jpg';
import sandBlackCol from './assets/sand_black_color.jpg';
import sandBlackNrm from './assets/sand_black_normal.jpg';
import cliffCol from './assets/rock_cliff_color.jpg';
import cliffNrm from './assets/rock_cliff_normal.jpg';
import coastCol from './assets/rock_coast_color.jpg';
import coastNrm from './assets/rock_coast_normal.jpg';
import basaltCol from './assets/rock_basalt_color.jpg';
import basaltNrm from './assets/rock_basalt_normal.jpg';
import lavaCol from './assets/lava_color.jpg';
import lavaNrm from './assets/lava_normal.jpg';
import mossCol from './assets/moss_color.jpg';
import mossNrm from './assets/moss_normal.jpg';
import gravelCol from './assets/gravel_color.jpg';
import gravelNrm from './assets/gravel_normal.jpg';

// ---------------------------------------------------------------------------------------------
// Materials: every scanned set goes into one layer of two texture arrays (colour, normal), so the whole terrain is
// one shader with two samplers; roughness is per material and crevice occlusion comes from the albedo. Tile sizes
// are world units per texture repeat; `aspect` undoes the squash of non-square sources into the square layers.
const LAYERS = [
  { maps: [sandWhiteCol, sandWhiteNrm], size: 1.6, aspect: 2 }, // 0 coral sand, beaches, seabed
  { maps: [sandBlackCol, sandBlackNrm], size: 1.4, aspect: 1 }, // 1 black volcanic sand
  { maps: [cliffCol, cliffNrm], size: 7, aspect: 1 }, // 2 layered sandstone cliffs
  { maps: [coastCol, coastNrm], size: 4, aspect: 1 }, // 3 grey coastal rock, reef rock
  { maps: [basaltCol, basaltNrm], size: 4, aspect: 1 }, // 4 dark basalt
  { maps: [lavaCol, lavaNrm], size: 3.5, aspect: 1 }, // 5 ropey lava
  { maps: [mossCol, mossNrm], size: 3, aspect: 1 }, // 6 moss / turf
  { maps: [gravelCol, gravelNrm], size: 1.8, aspect: 1 }, // 7 shingle, scree, coral rubble
];
const TEX = 1024;

/** Island materials as the shader sees them: sand + 3·rock + 9·volcano. */
const SAND = { white: 0, gold: 1, black: 2 };
const ROCK = { limestone: 0, sandstone: 1, basalt: 2 };

// ---------------------------------------------------------------------------------------------
// Quadtree tiles on the cube-sphere. Each tile is a TQ×TQ grid sampled from world.height at its vertices, with
// skirts hanging from its rim so neighbours at different levels never show a crack. Tiles live in two BatchedMeshes
// (ground that casts shadows, deep seabed that is shaded flat), so the whole planet is two draw calls per pass.
const TQ = 32;
const TV = TQ + 1;
const TB = TQ + 3; // grid with a one-vertex border for normals and curvature
const TILE_VERTS = TV * TV + 4 * TV;
const TILE_INDEX = TQ * TQ * 6 + 4 * TQ * 6;
const CHUNK = 32; // tiles per batch (its vertices still fit 16-bit indices)
const MAX_LEVEL = 7; // finest spacing ≈ 0.08 units
const FACE_ARC = (Math.PI / 2) * R;
const SPLIT_PX = 1.5; // allowed screen-space height error, pixels
const MIN_PX = 3; // never refine below this on-screen vertex spacing (sub-pixel triangles only cost)
const SPACING_PX = 18; // vertex spacing never exceeds this on visible ground, pixels
const BUILD_MS = 0.3; // CPU time to build one sampled tile
const DEEP = -6; // tiles wholly below this lie under enough water to hide them: coarse, unlit, no shadows
const SILT = 'vec3(0.12, 0.13, 0.12)'; // albedo of the deep floor, shared by both seabed shaders
const FLOW_WIDTH = 3.4; // half-width of an old lava flow's tongue, world units (world.ts lava strokes)

const byPriority = (a: Node, b: Node) => b.priority - a.priority;

/** True when everything within angle `spread` of direction `dir`, up to radius `top`, lies behind the sea sphere's
 *  horizon as seen from the camera (unit direction `camDir`, radius `camR`). */
function belowHorizon(dir: THREE.Vector3, spread: number, top: number, camDir: THREE.Vector3, camR: number): boolean {
  const ang = Math.acos(THREE.MathUtils.clamp(dir.dot(camDir), -1, 1)) - spread;
  return ang > Math.acos(Math.min(1, R / camR)) + Math.acos(Math.min(1, R / Math.max(R, top)));
}

class Node {
  slot = -1;
  used = -1; // frame stamp when last visited by the selection (or generated)
  children: Node[] | null = null;
  readonly axis = new THREE.Vector3(); // bounding cone around the tile's directions
  cosA = 1;
  readonly sphere = new THREE.Sphere();
  hMin: number;
  hMax: number;
  err = 0; // world-unit height error of this tile against the true surface
  priority = 0; // projected error while it waits to be sampled
  hgt: Float32Array | null = null; // sampled grid (with border), kept so children reuse every other sample
  parent: Node | null = null;
  readonly pool: number; // 0 ground that casts shadows, 1 seabed
  readonly face: number;
  readonly level: number;
  readonly x: number;
  readonly y: number;
  readonly spacing: number;
  constructor(face: number, level: number, x: number, y: number, bounds: HeightPyramid) {
    this.face = face;
    this.level = level;
    this.x = x;
    this.y = y;
    this.spacing = FACE_ARC / (TQ << level);
    [this.hMin, this.hMax] = bounds.range(face, level, x, y);
    this.pool = this.hMax > DEEP ? 0 : 1;
    // bounds before any sampling: corners, edge midpoints and centre at both extreme heights
    const G = 1 << level;
    box.makeEmpty();
    this.axis.set(0, 0, 0);
    for (let j = 0; j <= 2; j++) {
      for (let i = 0; i <= 2; i++) {
        faceDir(face, ((x + i / 2) / G) * 2 - 1, ((y + j / 2) / G) * 2 - 1, v);
        if (i === 1 && j === 1) this.axis.copy(v);
        box.expandByPoint(v2a.copy(v).multiplyScalar(R + this.hMin));
        box.expandByPoint(v2a.copy(v).multiplyScalar(R + this.hMax));
      }
    }
    for (let k = 0; k < 4; k++) {
      faceDir(face, ((x + (k & 1)) / G) * 2 - 1, ((y + (k >> 1)) / G) * 2 - 1, v);
      this.cosA = Math.min(this.cosA, v.dot(this.axis));
    }
    box.getBoundingSphere(this.sphere);
    this.sphere.radius += this.spacing * TQ * 0.06; // the face bulges between the sampled points
  }
}

/** Min and max of world.heights over every power-of-two block of each cube face: exact bounds for any tile, so a
 *  coarse tile knows about an islet none of its vertices happened to land on. */
class HeightPyramid {
  private readonly lo: Float32Array[] = [];
  private readonly hi: Float32Array[] = [];
  constructor(heights: Float32Array) {
    this.lo.push(heights);
    this.hi.push(heights);
    for (let n = HN >> 1; n >= 1; n >>= 1) {
      const lo = new Float32Array(6 * n * n), hi = new Float32Array(6 * n * n);
      const pl = this.lo[this.lo.length - 1], ph = this.hi[this.hi.length - 1], m = n * 2;
      for (let f = 0; f < 6; f++) {
        for (let j = 0; j < n; j++) {
          for (let i = 0; i < n; i++) {
            const a = f * m * m + 2 * j * m + 2 * i, b = a + m, o = f * n * n + j * n + i;
            lo[o] = Math.min(pl[a], pl[a + 1], pl[b], pl[b + 1]);
            hi[o] = Math.max(ph[a], ph[a + 1], ph[b], ph[b + 1]);
          }
        }
      }
      this.lo.push(lo);
      this.hi.push(hi);
    }
  }
  /** Bounds of tile (x, y) at quadtree level ≤ log2(HN): one cell of pyramid level log2(HN) - level. */
  range(face: number, level: number, x: number, y: number): [number, number] {
    const m = Math.log2(HN) - level, n = 1 << level, o = face * n * n + y * n + x;
    return [this.lo[m][o], this.hi[m][o]];
  }
}

// scratch buffers for tile generation
const DIR = new Float64Array(TB * TB * 3);
const HGT = new Float64Array(TB * TB);
const pos = new Float32Array(TILE_VERTS * 3);
const nrm = new Float32Array(TILE_VERTS * 3);
const dat = new Float32Array(TILE_VERTS * 4);
const idx = new Uint32Array(TILE_INDEX);
const scratchGeo = new THREE.BufferGeometry();
scratchGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
scratchGeo.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
scratchGeo.setAttribute('aData', new THREE.BufferAttribute(dat, 4));
scratchGeo.setIndex(new THREE.BufferAttribute(idx, 1));
scratchGeo.boundingSphere = new THREE.Sphere();
const tv: V3 = { x: 0, y: 0, z: 0 };
const box = new THREE.Box3();
const v = new THREE.Vector3();
const v2 = new THREE.Vector2();
const v2a = new THREE.Vector3();

/** Per-island data on the CPU, mirroring the shader's island frame and bedding. */
interface IslandInfo {
  c: THREE.Vector3; // frame centre (unit)
  e: THREE.Vector3; // frame east
  n: THREE.Vector3; // frame north
  radius: number; // footprint, world units
  tilt: [number, number]; // bedding dip
  s: number; // bedding phase
}

/** Equal-sized tile slots in batches of CHUNK, one draw call per batch and pass. Batches stay small (≈2 MB) because
 *  writing a tile into a buffer the GPU may still be reading makes ANGLE/Metal copy the whole buffer first. */
class Pool {
  readonly meshes: THREE.BatchedMesh[] = [];
  readonly slots: (Node | null)[];
  readonly shown: Uint8Array;
  readonly want: Uint8Array;
  constructor(size: number, material: THREE.Material, shadows: boolean) {
    this.slots = new Array(size).fill(null);
    this.shown = new Uint8Array(size);
    this.want = new Uint8Array(size);
    for (let c = 0; c < size / CHUNK; c++) {
      const m = new THREE.BatchedMesh(CHUNK, CHUNK * TILE_VERTS, CHUNK * TILE_INDEX, material);
      m.frustumCulled = false; // per-tile culling happens inside the batch
      m.castShadow = shadows;
      m.receiveShadow = true;
      for (let s = 0; s < CHUNK; s++) {
        m.addInstance(m.addGeometry(scratchGeo, TILE_VERTS, TILE_INDEX));
        m.setVisibleAt(s, false);
      }
      this.meshes.push(m);
    }
  }
  /** Write the scratch tile into a slot: only that slot's ranges are uploaded. */
  write(slot: number): void {
    this.meshes[Math.floor(slot / CHUNK)].setGeometryAt(slot % CHUNK, scratchGeo);
  }
  /** Show exactly the slots wanted this frame. */
  flush(): void {
    for (let s = 0; s < this.slots.length; s++) {
      if (this.want[s] === this.shown[s]) continue;
      this.meshes[Math.floor(s / CHUNK)].setVisibleAt(s % CHUNK, this.want[s] === 1);
      this.shown[s] = this.want[s];
    }
  }
}

/** Surface distance from a unit direction to an island's footprint edge (negative inside). */
const gapTo = (il: IslandInfo, x: number, y: number, z: number) =>
  Math.acos(Math.min(1, il.c.x * x + il.c.y * y + il.c.z * z)) * R - il.radius;

class Ground {
  readonly pools: Pool[];
  private readonly roots: Node[] = [];
  private readonly queue: Node[] = [];
  private readonly frustum = new THREE.Frustum();
  private readonly mat4 = new THREE.Matrix4();
  private readonly camDir = new THREE.Vector3();
  private stamp = 0;
  private job: Node | null = null; // tile being sampled into DIR/HGT, possibly across frames
  private jobRow = 0;
  private camR = 0;
  private pxPerRad = 1;
  private readonly openness: Float32Array;
  private readonly bounds: HeightPyramid;
  private readonly world: World;
  private readonly islands: IslandInfo[];
  /** old lava flows as world-space segments (ax, ay, az, bx, by, bz) and their bounding sphere */
  private readonly flows: Float32Array;
  private readonly flowBounds = new THREE.Sphere();

  constructor(world: World, islands: IslandInfo[], material: THREE.Material, seabedMaterial: THREE.Material) {
    this.world = world;
    this.islands = islands;
    const seg: number[] = [], pts: THREE.Vector3[] = [];
    for (const s of world.sites) {
      if (s.kind !== 'lavaflow' || !s.path) continue;
      const p = s.path.map((q) => new THREE.Vector3(q.x, q.y, q.z).multiplyScalar(R));
      for (let i = 1; i < p.length; i++) seg.push(...p[i - 1].toArray(), ...p[i].toArray());
      pts.push(...p);
    }
    this.flows = Float32Array.from(seg);
    if (pts.length) this.flowBounds.setFromPoints(pts);
    this.flowBounds.radius += FLOW_WIDTH;
    this.openness = bakeOpenness(world);
    this.bounds = new HeightPyramid(world.heights);
    this.pools = [new Pool(480, material, true), new Pool(160, seabedMaterial, false)];
    for (let f = 0; f < 6; f++) {
      const n = new Node(f, 0, 0, 0, this.bounds);
      this.job = n;
      this.jobRow = 0;
      this.sample(Infinity);
      this.build(n);
      this.roots.push(n);
    }
  }

  /** Pick the tiles for this camera, generate missing ones within `budget` ms, and show exactly the chosen set. */
  update(camera: THREE.PerspectiveCamera, height: number, budget: number): void {
    this.stamp++;
    this.camR = camera.position.length();
    this.camDir.copy(camera.position).divideScalar(this.camR);
    this.pxPerRad = height / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
    this.mat4.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.mat4);
    const cam = camera.position, deadline = performance.now() + budget;
    for (;;) {
      for (const p of this.pools) p.want.fill(0);
      this.queue.length = 0;
      for (const n of this.roots) this.select(n, cam);
      if (!this.queue.length) break;
      // most visible error first; a tile half-sampled last frame is finished while it is still wanted
      this.queue.sort(byPriority);
      if (!this.job || !this.queue.includes(this.job)) {
        this.job = this.queue[0];
        this.jobRow = 0;
      }
      // a finished grid is built only with time to spare, else first thing next frame
      if (!this.sample(deadline) || performance.now() + BUILD_MS > deadline) break;
      const built = this.build(this.job);
      this.job = null;
      if (!built) break;
    }
    for (const p of this.pools) p.flush();
  }

  private visible(n: Node): boolean {
    if (belowHorizon(n.axis, Math.acos(n.cosA), R + n.hMax, this.camDir, this.camR)) return false;
    return this.frustum.intersectsSphere(n.sphere);
  }

  private wantsSplit(n: Node, cam: THREE.Vector3): boolean {
    if (n.level >= MAX_LEVEL || (n.pool === 1 && n.level >= 2)) return false;
    const d = Math.max(0.05, n.sphere.distanceToPoint(cam));
    const px = (n.spacing / d) * this.pxPerRad;
    // keep the ground densely enough sampled for smooth shading and silhouettes, and true to the height field
    return px > SPACING_PX || (px > MIN_PX && (n.err / d) * this.pxPerRad > SPLIT_PX);
  }

  private select(n: Node, cam: THREE.Vector3): void {
    if (!this.visible(n)) return;
    n.used = this.stamp; // visited: neither it nor anything above it may be evicted this frame
    if (this.wantsSplit(n, cam)) {
      if (!n.children) {
        const l = n.level + 1, x = n.x * 2, y = n.y * 2, b = this.bounds;
        n.children = [0, 1, 2, 3].map((k) => new Node(n.face, l, x + (k & 1), y + (k >> 1), b));
        for (const c of n.children) c.parent = n;
      }
      let ready = true;
      for (const c of n.children) {
        if (c.slot < 0) {
          ready = false;
          if (!c.err) c.err = n.err * 0.5; // a guess for prioritising until it is sampled
          c.priority = c.err / Math.max(0.05, c.sphere.distanceToPoint(cam));
          this.queue.push(c);
        }
      }
      if (ready) {
        for (const c of n.children) this.select(c, cam);
        return;
      }
    }
    this.pools[n.pool].want[n.slot] = 1;
  }

  /** 1 on an old flow's centreline, falling to 0 at its edge. */
  private lavaAt(x: number, y: number, z: number): number {
    const f = this.flows;
    let best = Infinity;
    for (let i = 0; i < f.length; i += 6) {
      const dx = f[i + 3] - f[i], dy = f[i + 4] - f[i + 1], dz = f[i + 5] - f[i + 2];
      const px = x - f[i], py = y - f[i + 1], pz = z - f[i + 2];
      const t = clamp01((px * dx + py * dy + pz * dz) / (dx * dx + dy * dy + dz * dz));
      best = Math.min(best, (px - dx * t) ** 2 + (py - dy * t) ** 2 + (pz - dz * t) ** 2);
    }
    return Math.max(0, 1 - Math.sqrt(best) / FLOW_WIDTH);
  }

  /** A free slot, else the one held longest by a tile the selection has not visited this frame (with its whole
   *  subtree, which nothing can reach any more), else -1. */
  private claimSlot(pool: Pool): number {
    let best: Node | null = null;
    for (let s = 0; s < pool.slots.length; s++) {
      const o = pool.slots[s];
      if (!o) return s;
      if (o.used < this.stamp && o.level > 0 && (!best || o.used < best.used)) best = o;
    }
    if (!best) return -1;
    const slot = best.slot;
    this.release(best);
    return slot;
  }

  private release(n: Node): void {
    if (n.slot >= 0) this.pools[n.pool].slots[n.slot] = null;
    n.slot = -1;
    n.hgt = null;
    if (n.children) for (const c of n.children) this.release(c);
    n.children = null; // pruned: rebuilt on demand, so the tree never outgrows what is cached
  }

  /** Sample the job's height grid a row at a time until done (true) or the deadline passes (resumed next frame). */
  private sample(deadline: number): boolean {
    const n = this.job!, G = TQ << n.level, up = n.parent?.hgt;
    for (; this.jobRow < TB; this.jobRow++) {
      if (performance.now() > deadline) return false;
      const j = this.jobRow, gj = n.y * TQ + j - 1, pj = gj / 2 - (n.y >> 1) * TQ + 1;
      for (let i = 0; i < TB; i++) {
        const k = j * TB + i, gi = n.x * TQ + i - 1, pi = gi / 2 - (n.x >> 1) * TQ + 1;
        faceDir(n.face, (gi / G) * 2 - 1, (gj / G) * 2 - 1, tv);
        DIR[k * 3] = tv.x;
        DIR[k * 3 + 1] = tv.y;
        DIR[k * 3 + 2] = tv.z;
        // a quarter of the samples coincide with the parent's
        HGT[k] = up && Number.isInteger(pi) && Number.isInteger(pj) && pi >= 0 && pj >= 0 && pi < TB && pj < TB
          ? up[pj * TB + pi] : this.world.height(tv);
      }
    }
    return true;
  }

  /** Turn the sampled grid into a tile in a batch slot; false when every slot is in use this frame. */
  private build(n: Node): boolean {
    const pool = this.pools[n.pool], slot = n.level === 0 ? pool.slots.indexOf(null) : this.claimSlot(pool);
    if (slot < 0) return false;
    const world = this.world;
    let hMin = Infinity, hMax = -Infinity;
    // candidate islands for texture frames: those whose footprint can reach this tile
    const cx = DIR[(TB * TB >> 1) * 3], cy = DIR[(TB * TB >> 1) * 3 + 1], cz = DIR[(TB * TB >> 1) * 3 + 2];
    const tileAng = (n.spacing * TQ) / R;
    const near: number[] = [];
    let nearest = 0, nearestD = Infinity;
    for (let i = 0; i < this.islands.length; i++) {
      const a = gapTo(this.islands[i], cx, cy, cz);
      if (a < tileAng * R + 40) near.push(i);
      if (a < nearestD) {
        nearestD = a;
        nearest = i;
      }
    }
    if (!near.length) near.push(nearest);
    let err = 0;
    const lavaNear = this.flows.length > 0 &&
      v.set(cx, cy, cz).multiplyScalar(R).distanceTo(this.flowBounds.center) < this.flowBounds.radius + tileAng * R;
    for (let j = 0; j < TV; j++) {
      for (let i = 0; i < TV; i++) {
        const k = (j + 1) * TB + i + 1, o = j * TV + i;
        const h = HGT[k], dx = DIR[k * 3], dy = DIR[k * 3 + 1], dz = DIR[k * 3 + 2];
        const r = R + h;
        pos[o * 3] = dx * r;
        pos[o * 3 + 1] = dy * r;
        pos[o * 3 + 2] = dz * r;
        // normal from the border-extended grid (central differences on the true surface)
        const kl = k - 1, kr = k + 1, kd = k - TB, ku = k + TB;
        const rl = R + HGT[kl], rr = R + HGT[kr], rd = R + HGT[kd], ru = R + HGT[ku];
        const ax = DIR[kr * 3] * rr - DIR[kl * 3] * rl, ay = DIR[kr * 3 + 1] * rr - DIR[kl * 3 + 1] * rl;
        const az = DIR[kr * 3 + 2] * rr - DIR[kl * 3 + 2] * rl;
        const bx = DIR[ku * 3] * ru - DIR[kd * 3] * rd, by = DIR[ku * 3 + 1] * ru - DIR[kd * 3 + 1] * rd;
        const bz = DIR[ku * 3 + 2] * ru - DIR[kd * 3 + 2] * rd;
        let nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;
        const nl = Math.hypot(nx, ny, nz) || 1;
        nx /= nl; ny /= nl; nz /= nl;
        nrm[o * 3] = nx;
        nrm[o * 3 + 1] = ny;
        nrm[o * 3 + 2] = nz;
        // curvature: how far this vertex sits from its neighbours' mean, the error a coarser grid would make here
        const lap = (HGT[kl] + HGT[kr] + HGT[kd] + HGT[ku]) * 0.25 - h;
        if (i > 0 && j > 0 && i < TQ && j < TQ) err = Math.max(err, Math.abs(lap));
        if (h < hMin) hMin = h;
        if (h > hMax) hMax = h;
        tv.x = dx; tv.y = dy; tv.z = dz;
        // occlusion: the baked large-scale openness, deepened in fine creases on close tiles
        const crease = n.level >= 5 ? Math.max(0, Math.min(0.45, (lap / n.spacing) * 0.5)) : 0;
        let isl = near[0], best = Infinity;
        for (const i2 of near) {
          const a = gapTo(this.islands[i2], dx, dy, dz);
          if (a < best) {
            best = a;
            isl = i2;
          }
        }
        dat[o * 4] = world.climate(tv);
        dat[o * 4 + 1] = sampleCube(this.openness, HN, tv) * (1 - crease);
        dat[o * 4 + 2] = lavaNear ? this.lavaAt(dx * R, dy * R, dz * R) : 0;
        dat[o * 4 + 3] = isl;
      }
    }
    // skirts: copies of the rim hung below it, deep enough to cover the step to a coarser neighbour
    const missed = Math.max(0, n.hMax - hMax, hMin - n.hMin);
    // (bounded: a coarse tile over a missed peak must not hang its skirt through the planet)
    const skirt = Math.min(n.spacing + 4 * Math.max(err, missed) + 0.05, n.spacing * 3 + 1.5);
    const rims = [(i: number) => i, (i: number) => TQ * TV + i, (i: number) => i * TV, (i: number) => i * TV + TQ];
    for (let e = 0; e < 4; e++) {
      for (let i = 0; i < TV; i++) {
        const src = rims[e](i), o = TV * TV + e * TV + i;
        const px = pos[src * 3], py = pos[src * 3 + 1], pz = pos[src * 3 + 2];
        const s = 1 - skirt / Math.hypot(px, py, pz);
        pos[o * 3] = px * s;
        pos[o * 3 + 1] = py * s;
        pos[o * 3 + 2] = pz * s;
        for (let c = 0; c < 3; c++) nrm[o * 3 + c] = nrm[src * 3 + c];
        for (let c = 0; c < 4; c++) dat[o * 4 + c] = dat[src * 4 + c];
      }
    }
    // triangles: each quad split along its flatter diagonal, so ridges and gullies keep their crease
    let w = 0;
    for (let j = 0; j < TQ; j++) {
      for (let i = 0; i < TQ; i++) {
        const a = j * TV + i, b = a + 1, c = a + TV + 1, d = a + TV;
        const ha = HGT[(j + 1) * TB + i + 1], hb = HGT[(j + 1) * TB + i + 2];
        const hc = HGT[(j + 2) * TB + i + 2], hd = HGT[(j + 2) * TB + i + 1];
        if (Math.abs(ha - hc) <= Math.abs(hb - hd)) {
          idx[w++] = a; idx[w++] = b; idx[w++] = c;
          idx[w++] = a; idx[w++] = c; idx[w++] = d;
        } else {
          idx[w++] = a; idx[w++] = b; idx[w++] = d;
          idx[w++] = b; idx[w++] = c; idx[w++] = d;
        }
      }
    }
    for (let e = 0; e < 4; e++) {
      const outward = e === 0 || e === 3; // bottom and right rims wind one way, top and left the other
      for (let i = 0; i < TQ; i++) {
        const a = rims[e](i), b = rims[e](i + 1), as = TV * TV + e * TV + i, bs = as + 1;
        if (outward) {
          idx[w++] = a; idx[w++] = as; idx[w++] = b;
          idx[w++] = b; idx[w++] = as; idx[w++] = bs;
        } else {
          idx[w++] = a; idx[w++] = b; idx[w++] = as;
          idx[w++] = b; idx[w++] = bs; idx[w++] = as;
        }
      }
    }
    // bounds of what is drawn; the error also counts any relief the grid holds but these vertices missed
    box.makeEmpty();
    for (let o = 0; o < TILE_VERTS; o++) box.expandByPoint(v.fromArray(pos, o * 3));
    box.getBoundingSphere(n.sphere);
    scratchGeo.boundingSphere!.copy(n.sphere);
    n.hMin = Math.min(n.hMin, hMin);
    n.hMax = Math.max(n.hMax, hMax);
    n.err = Math.max(err, missed) + (n.spacing * n.spacing) / (8 * R);
    n.used = this.stamp;
    n.hgt = Float32Array.from(HGT);
    pool.slots[slot] = n;
    n.slot = slot;
    pool.write(slot);
    return true;
  }
}

/** Sky openness per HN cell from the coarse height grid: how much of the horizon nearby ground leaves free. */
function bakeOpenness(world: World): Float32Array {
  const out = new Float32Array(6 * HN * HN).fill(1);
  const H = world.heights, cell = FACE_ARC / HN;
  const dirs = [[1, 0], [0.7, 0.7], [0, 1], [-0.7, 0.7], [-1, 0], [-0.7, -0.7], [0, -1], [0.7, -0.7]];
  for (let f = 0; f < 6; f++) {
    for (let j = 0; j < HN; j++) {
      for (let i = 0; i < HN; i++) {
        const c = f * HN * HN + j * HN + i, h0 = H[c];
        if (h0 < -24) continue;
        let occ = 0;
        for (const [dx, dy] of dirs) {
          let m = 0;
          for (const r of [2, 4, 8, 14]) {
            const x = Math.min(HN - 1, Math.max(0, Math.round(i + dx * r)));
            const y = Math.min(HN - 1, Math.max(0, Math.round(j + dy * r)));
            m = Math.max(m, (H[f * HN * HN + y * HN + x] - h0) / (r * cell));
          }
          occ += m / Math.sqrt(1 + m * m); // sine of the horizon elevation
        }
        out[c] = 1 - 0.85 * (occ / dirs.length);
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Shader. The ground is a MeshStandardMaterial (IBL, shadows, fog and point lights stay shared with the rest of
// the scene) whose albedo, normal, roughness, occlusion and emission are computed here per fragment.
const VERT_PARS = /* glsl */ `
attribute vec4 aData;
varying vec3 vWPos;
varying vec3 vWNrm;
varying vec4 vData;
flat varying int vIsl;
varying float vSwellH;
uniform float uTime;
uniform float uSimTime;
uniform float uPlanetR;
${WIND_GLSL}
${SWELL_GLSL}
`;

const VERT_MAIN = /* glsl */ `
#include <worldpos_vertex>
{
  vec4 tw = modelMatrix * vec4(transformed, 1.0);
  vWPos = tw.xyz;
  vWNrm = normalize(mat3(modelMatrix) * objectNormal);
  vData = aData;
  vIsl = int(aData.w + 0.5);
  vec3 up = normalize(tw.xyz);
  float h = length(tw.xyz) - uPlanetR;
  vSwellH = 0.0;
  // the instantaneous sea level along the shore, for the swash film on wet sand
  if (h > -1.5 && h < 3.0) { vec3 sn; vSwellH = dot(swell(up, uTime, uSimTime, sn), up); }
}
`;

const FRAG_PARS = /* glsl */ `
precision highp sampler2DArray;
uniform sampler2DArray tCol;
uniform sampler2DArray tNrm;
uniform sampler2D tIsl;
uniform vec2 uLayerScale[${LAYERS.length}];
uniform vec4 uCaldera;
uniform float uTime;
uniform float uPlanetR;
uniform vec3 uKeyDir;
uniform float uStorm;
uniform float uNight;
uniform float uSwellAmp;
varying vec3 vWPos;
varying vec3 vWNrm;
varying vec4 vData;
flat varying int vIsl;
varying float vSwellH;

// One scanned layer projected in the island frame (lp local position, nl local normal) along the axes whose
// weight w is non-zero; the tangent normals are whiteout-blended so projections meet without seams.
vec3 triCol(int layer, vec3 lp, vec3 nl, vec3 w, bool wantN, out vec3 n) {
  vec2 sc = uLayerScale[layer];
  float L = float(layer);
  vec3 col = vec3(0.0);
  n = vec3(0.0);
  if (w.x > 0.0) {
    float s = nl.x < 0.0 ? -1.0 : 1.0;
    vec3 uvw = vec3(vec2(lp.y * s, lp.z) * sc, L);
    col += texture(tCol, uvw).rgb * w.x;
    if (wantN) {
      vec3 tn = texture(tNrm, uvw).xyz * 2.0 - 1.0;
      tn = vec3(tn.xy + vec2(s * nl.y, nl.z), tn.z * abs(nl.x));
      n += vec3(s * tn.z, s * tn.x, tn.y) * w.x;
    }
  }
  if (w.y > 0.0) {
    float s = nl.y < 0.0 ? -1.0 : 1.0;
    vec3 uvw = vec3(vec2(-s * lp.x, lp.z) * sc, L);
    col += texture(tCol, uvw).rgb * w.y;
    if (wantN) {
      vec3 tn = texture(tNrm, uvw).xyz * 2.0 - 1.0;
      tn = vec3(tn.xy + vec2(-s * nl.x, nl.z), tn.z * abs(nl.y));
      n += vec3(-s * tn.x, s * tn.z, tn.y) * w.y;
    }
  }
  if (w.z > 0.0) {
    float s = nl.z < 0.0 ? -1.0 : 1.0;
    vec3 uvw = vec3(vec2(lp.x, s * lp.y) * sc, L);
    col += texture(tCol, uvw).rgb * w.z;
    if (wantN) {
      vec3 tn = texture(tNrm, uvw).xyz * 2.0 - 1.0;
      tn = vec3(tn.xy + vec2(nl.x, s * nl.y), tn.z * abs(nl.z));
      n += vec3(tn.x, s * tn.y, s * tn.z) * w.z;
    }
  }
  n = wantN ? normalize(n) : nl;
  return col;
}

struct Mat { int layer; float w; float rough; vec3 tint; };

// Caustics from short wind-driven ripples: refracted sunlight focuses where the ripple surface's curvature folds
// the rays, so brightness is 1/|det(I + d·Hessian)| over a handful of travelling waves.
float causticAt(vec2 x, vec2 wd, float d, float t) {
  float hxx = 0.0, hyy = 0.0, hxy = 0.0;
  for (int i = 0; i < 4; i++) {
    float fi = float(i);
    float ang = (fi - 1.5) * 1.15 + sin(fi * 7.31) * 0.3;
    vec2 dir = vec2(wd.x * cos(ang) - wd.y * sin(ang), wd.x * sin(ang) + wd.y * cos(ang));
    float k = 6.0 + fi * 2.6;
    float s = 0.055 * k * sin(dot(dir, x) * k - sqrt(9.8 * k) * 0.55 * t + fi * 2.17);
    hxx -= s * dir.x * dir.x;
    hyy -= s * dir.y * dir.y;
    hxy -= s * dir.x * dir.y;
  }
  float det = (1.0 + d * hxx) * (1.0 + d * hyy) - d * d * hxy * hxy;
  return 1.0 / max(abs(det), 0.2);
}

// Bedding: a tilted, gently folded height coordinate whose integer steps are bed boundaries, and a per-bed
// hardness. Mirrored in TypeScript (bedAt/bedHard) so carved stacks put real ledges on the painted beds.
float bedCoord(vec3 lp, vec2 tilt, float s) {
  float hs = lp.z + dot(lp.xy, tilt) + 0.9 * sin(0.17 * lp.x + 1.3 * sin(0.11 * lp.y + s))
    + 0.7 * sin(0.13 * lp.y + 1.1 * sin(0.19 * lp.x - s));
  return hs * 0.62 + 0.3 * sin(hs * 0.41 + s);
}
float bedHard(float bed, float s) { return fract(sin(bed * 1.731 + s) * 43.758); }

// Hexagonal column joints: cell centre offset and distance to the nearest joint for a point in the plane.
vec3 hexCell(vec2 p) {
  const vec2 s = vec2(1.0, 1.7320508);
  vec4 c = floor(vec4(p, p - vec2(0.5, 1.0)) / s.xyxy) + 0.5;
  vec4 h = vec4(p - c.xy * s, p - (c.zw + 0.5) * s);
  vec2 o = dot(h.xy, h.xy) < dot(h.zw, h.zw) ? h.xy : h.zw;
  vec2 a = abs(o);
  return vec3(o, 0.5 - max(dot(a, s * 0.5), a.x));
}
`;

// The surface model, evaluated once at map_fragment; the later chunks read its results. Below ~7 units the sea
// above absorbs nearly everything, so the deep floor takes a two-fetch path; up close everything is sampled.
const FRAG_SURFACE = /* glsl */ `
vec3 tCol;
vec3 tN;
float tRough = 0.95, tAO = vData.y, tCaustic = 0.0;
{
  vec3 P = vWPos;
  float r = length(P);
  vec3 up = P / r;
  float h = r - uPlanetR, depth = -h;
  vec3 Ng = normalize(vWNrm);
  tN = Ng;
  vec4 nz = texture(uSky.noise, P * 0.0071);
  float nA = nz.b, nB = nz.r; // patches a few units across, tracts tens of units across
  vec3 silt = ${SILT} * (0.7 + 0.6 * nA);
  tCol = silt;
  // the water hides the floor sooner the further away it is, so distant shelves take the cheap path too
  float dist = length(P - cameraPosition), floorAt = mix(7.0, 3.0, smoothstep(40.0, 90.0, dist));
  if (depth < floorAt) {
    vec4 isl = texelFetch(tIsl, ivec2(vIsl * 2, 0), 0);
    vec4 isp = texelFetch(tIsl, ivec2(vIsl * 2 + 1, 0), 0);
    vec3 U = isl.xyz;
    vec3 E = normalize(cross(abs(U.y) < 0.99 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0), U));
    vec3 Nn = cross(U, E);
    vec3 rel = P - U * uPlanetR;
    vec3 lp = vec3(dot(rel, E), dot(rel, Nn), dot(rel, U));
    vec3 nl = vec3(dot(Ng, E), dot(Ng, Nn), dot(Ng, U));
    float upl = dot(Ng, up), steep = 1.0 - upl;
    int code = int(isl.w + 0.5);
    int sandC = code % 3, rockC = (code / 3) % 3;
    bool volcano = code >= 9, carved = vData.z < 0.0;
    float trop = 1.0 - smoothstep(0.3, 0.8, vData.x), polar = smoothstep(1.3, 1.75, vData.x);
    // fine relief only where it can be seen: near, and not blurred by more than a little water
    bool close = dist < 45.0 && depth < 2.5;

    // where each material belongs: sand below the berm, rock on the steep, turf on the rest, scree between
    float rock = smoothstep(0.38, 0.58, steep + (nA - 0.5) * 0.3);
    float beachTop = mix(0.9, 1.9, trop) + (nB - 0.5) * 1.2 + (nA - 0.5) * 0.4;
    float sand = (1.0 - smoothstep(beachTop - 0.35, beachTop + 0.35, h)) * (1.0 - rock);
    float rest = 1.0 - rock - sand;
    float scree = rest * smoothstep(0.2, 0.36, steep + (nA - 0.5) * 0.2);
    float turf = rest - scree;
    // on the seabed reef rock (tropical crests) and algae-dark outcrops break through the sand
    float reef = trop * smoothstep(-0.2, 0.6, depth) * (1.0 - smoothstep(2.0, 3.5, depth))
      * smoothstep(0.5, 0.62, nA + nB * 0.3);
    float outcrop = smoothstep(0.6, 0.68, nB + nA * 0.15) * smoothstep(1.0, 3.0, depth);
    float under = max(reef, outcrop) * sand;
    sand -= under;
    rock += under;
    float lava = volcano ? smoothstep(0.35, 0.65, vData.z + (nA - 0.5) * 0.5) * (1.0 - smoothstep(-0.5, 0.3, depth))
      : 0.0;
    float ash = volcano ? smoothstep(9.0, 15.0, h + (nB - 0.5) * 8.0) : 0.0;
    // the volcano's upper flanks: charcoal ash streaked with ochre, rusting to red scoria toward the crater
    vec3 ashTint = mix(vec3(2.1, 1.6, 1.2), vec3(3.5, 2.25, 0.95), 0.8 * smoothstep(0.38, 0.66, nB + nA * 0.35));
    ashTint = mix(ashTint, vec3(3.0, 1.5, 0.95), smoothstep(22.0, 32.0, h + (nA - 0.5) * 6.0));
    vec3 turfTint = mix(vec3(0.85, 0.95, 0.6), vec3(0.8, 0.68, 0.45), polar);
    turfTint = mix(mix(turfTint, vec3(0.72, 1.0, 0.52), trop), ashTint, ash);
    // carved rock has no soil on it: its flat tops stay rock, lichened
    if (carved) { rock += turf + scree + sand; turf = 0.0; scree = 0.0; sand = 0.0; }
    Mat ms = Mat(sandC < 2 ? 0 : volcano ? 1 : 7, sand * (1.0 - lava), 0.85,
      sandC == 0 ? vec3(1.08, 1.04, 0.95) : sandC == 1 ? vec3(1.0, 0.86, 0.64)
        : volcano ? vec3(1.6) : vec3(0.75, 0.77, 0.8));
    Mat mr = Mat(rockC == 2 ? 4 : under > rock * 0.5 || rockC == 0 ? 3 : 2, rock * (1.0 - lava), 0.8,
      mix(volcano ? vec3(1.3, 1.08, 0.9) : rockC == 2 ? vec3(2.0, 2.0, 2.1)
        : rockC == 1 ? vec3(0.95, 0.88, 0.8) : vec3(1.15, 1.1, 1.0),
        vec3(0.62, 0.72, 0.58), under / max(rock, 1e-3)));
    Mat mt = Mat(ash > 0.5 ? 1 : 6, turf * (1.0 - lava), 0.95, turfTint);
    Mat mc = Mat(volcano ? 1 : 7, scree * (1.0 - lava), 0.85,
      volcano ? ashTint * 0.9 : rockC == 2 ? vec3(0.6, 0.6, 0.64)
        : rockC == 1 ? vec3(0.78, 0.7, 0.6) : vec3(0.92, 0.9, 0.84));
    // the strongest two (a fixed sorting network keeps everything in registers); lava overlays them
    if (mr.w > ms.w) { Mat x = ms; ms = mr; mr = x; }
    if (mt.w > mr.w) { Mat x = mr; mr = mt; mt = x; if (mr.w > ms.w) { x = ms; ms = mr; mr = x; } }
    if (mc.w > mr.w) { Mat x = mr; mr = mc; mc = x; if (mr.w > ms.w) { x = ms; ms = mr; mr = x; } }
    if (lava > mr.w) { mr = ms; ms = Mat(5, lava, 0.36, vec3(0.9, 0.86, 0.84)); }

    // the two strongest materials, each from its one or two facing projections, joined by height blending
    vec3 tw = pow(abs(nl), vec3(8.0));
    tw /= tw.x + tw.y + tw.z;
    tw = max(tw - 0.08, 0.0);
    tw /= tw.x + tw.y + tw.z;
    vec3 n0, n1;
    vec3 c0 = triCol(ms.layer, lp, nl, tw, close, n0) * ms.tint;
    vec3 c1 = c0;
    n1 = n0;
    float t = mr.w / max(ms.w + mr.w, 1e-4);
    if (t > (dist < 45.0 ? 0.02 : 0.15) && depth < 3.0) {
      c1 = triCol(mr.layer, lp, nl, tw, close, n1) * mr.tint;
      float l0 = dot(c0, vec3(0.3, 0.5, 0.2)) / dot(ms.tint, vec3(0.3, 0.5, 0.2));
      float l1 = dot(c1, vec3(0.3, 0.5, 0.2)) / dot(mr.tint, vec3(0.3, 0.5, 0.2));
      t = clamp((t - 0.5) * 2.5 + 0.5 + (l1 - l0) * 1.5, 0.0, 1.0);
    }
    vec3 col = mix(c0, c1, t);
    vec3 nLoc = normalize(mix(n0, n1, t));
    float rgh = mix(ms.rough, mr.rough, t);
    // calm the orange sandstone scan
    if (ms.layer == 2 || mr.layer == 2) col = mix(vec3(dot(col, vec3(0.3, 0.5, 0.2))), col, 0.7);
    float lum = dot(col, vec3(0.3, 0.5, 0.2));
    float ao = mix(1.0, smoothstep(0.0, 0.3, lum), 0.35);

    // strata: tilted beds; hard ones stand proud with lit brows over shadowed feet, joints break each bed
    vec3 nAdd = vec3(0.0);
    float strata = volcano ? 0.0 : rock * (rockC == 1 ? 0.8 : rockC == 0 ? 0.6 : 0.2);
    if (strata > 0.02 && dist < 150.0) {
      float hw = bedCoord(lp, isp.xy, isp.z), bed = floor(hw), f = fract(hw);
      float hard = bedHard(bed, isp.z), tone = bedHard(bed, isp.z + 2.7);
      vec3 bedCol = mix(vec3(0.82, 0.78, 0.74), vec3(1.12, 1.06, 0.96), tone) * mix(0.85, 1.05, hard);
      col *= mix(vec3(1.0), bedCol, strata * 0.7);
      float e = 0.14;
      float ta = clamp(f / e, 0.0, 1.0), tb = clamp((1.0 - f) / e, 0.0, 1.0);
      float pa = ta * ta * (3.0 - 2.0 * ta), pb = tb * tb * (3.0 - 2.0 * tb);
      float dp = max(0.0, hard - 0.4) * 1.6 * (6.0 * ta * (1.0 - ta) / e * pb - pa * 6.0 * tb * (1.0 - tb) / e) * 0.62;
      float seam = 1.0 - smoothstep(0.0, 0.03, min(f, 1.0 - f));
      float along = tw.x > tw.y ? lp.y : lp.x;
      float jx = along * (0.35 + 0.2 * bedHard(bed, isp.z + 5.1)) + bedHard(bed, isp.z + 6.3) * 7.0 + (nA - 0.5) * 0.6;
      float joint = (1.0 - smoothstep(0.0, 0.04, abs(fract(jx) - 0.5) - 0.45)) * step(0.35, hard);
      col *= 1.0 - strata * (0.25 * seam + 0.35 * joint);
      // carved rock carries real ledges, except along the waterline band it keeps clear for hulls
      float painted = carved ? 1.0 - smoothstep(2.5, 4.0, h) : 1.0;
      nAdd = -U * clamp(dp, -2.0, 2.0) * 0.35 * strata * (1.0 - abs(nl.z)) * painted;
      ao *= 1.0 - strata * (0.25 * seam + 0.3 * joint + 0.25 * clamp(dp, 0.0, 1.0));
    }
    // basalt cliffs part into hexagonal columns: dark joints, a tone and a facet per column
    float cols = rockC == 2 && !volcano && !carved ? rock : 0.0;
    if (cols > 0.02) {
      vec3 hc = hexCell(lp.xy * 1.6 + isp.z * 13.0);
      float joint = 1.0 - smoothstep(0.0, 0.06, hc.z);
      float tone = bedHard(dot(floor(lp.xy * 1.6 - hc.xy + 0.5), vec2(1.0, 57.0)), isp.z);
      col *= mix(1.0, mix(0.7, 1.15, tone) * (1.0 - joint * 0.6), cols);
      nAdd += normalize(E * hc.x + Nn * hc.y) * cols * 0.5 * (1.0 - abs(nl.z));
      ao *= 1.0 - joint * 0.5 * cols;
    }
    // old pahoehoe: ropes wrinkled across the flow, glassy on their crests
    if (lava > 0.01) {
      vec3 dh = normalize(up * upl - Ng + 1e-4 * E);
      float ph = dot(P, dh) * 7.0 + nA * 9.0 + sin(dot(P, E) * 1.3) * 1.5;
      nAdd += dh * sin(ph) * 0.4 * lava;
      col *= 1.0 - 0.18 * lava * (0.5 + 0.5 * cos(ph));
    }
    // moss on the tops of temperate rock, snow lying on polar flats
    float moss = (carved ? 0.6 : 1.0 - polar) * (1.0 - trop) * rock * smoothstep(0.35, 0.7, upl + (nA - 0.5) * 0.6)
      * smoothstep(1.0, 2.5, h);
    col = mix(col, vec3(0.13, 0.18, 0.06) * (0.6 + 0.8 * lum), moss * 0.8);
    float snow = polar * smoothstep(0.62, 0.8, upl + (nA - 0.5) * 0.3) * smoothstep(1.5, 3.0, h)
      * smoothstep(0.45, 0.58, nB + nA * 0.25);
    col = mix(col, vec3(0.88, 0.91, 0.97), snow);

    // seabed: wave ripples across the sand, coral rubble in the tropics, pale bars, silt toward the deep
    vec3 nRip = vec3(0.0);
    if (depth > -0.2) {
      float rip = sand * smoothstep(-0.2, 0.6, depth) * (1.0 - smoothstep(5.0, 7.0, depth));
      vec2 rd = vec2(cos(isp.w), sin(isp.w));
      float ph = dot(lp.xy, rd) * 13.0 + 2.4 * sin(dot(lp.xy, vec2(0.37, 0.61)))
        + 1.6 * sin(dot(lp.xy, vec2(-0.83, 0.29)));
      nRip = (E * rd.x + Nn * rd.y) * cos(ph) * 0.3 * rip;
      col *= 1.0 - 0.1 * rip * (sin(ph) * 0.5 + 0.5);
      float rubble = trop * smoothstep(0.55, 0.68, nA + nB * 0.2) * smoothstep(0.6, 1.5, depth) * sand;
      col = mix(col, mix(vec3(0.85, 0.72, 0.68), vec3(0.95, 0.92, 0.85), nB) * (0.6 + 0.8 * lum), rubble * 0.7);
      col *= 1.0 + 0.08 * smoothstep(2.0, 0.3, depth) * sand * (1.0 - polar);
      col = mix(col, col * vec3(0.55, 0.62, 0.6), outcrop * (1.0 - reef));
    }

    // wet band: sand darkens up to the swash limit and stays glossy where the last wave drained
    float wetTop = 0.35 + uSwellAmp * 0.45 + (nA - 0.5) * 0.3;
    float wet = 1.0 - smoothstep(wetTop - 0.25, wetTop + 0.3, h);
    float film = (1.0 - smoothstep(vSwellH + 0.05, vSwellH + 0.35, h)) * step(-0.3, h);
    col *= mix(1.0, 0.58, wet * (1.0 - rock * 0.4));
    rgh = mix(rgh, 0.32, wet);
    rgh = mix(rgh, 0.07, film);
    rgh = mix(rgh, 0.55, snow);
    rgh = mix(rgh, 0.9, moss);

    vec3 nW = normalize(E * nLoc.x + Nn * nLoc.y + U * nLoc.z + nAdd + nRip);
    nW = normalize(mix(nW, Ng, snow * 0.6 + film * 0.5));
    float deep = smoothstep(floorAt - 3.0, floorAt, depth);
    tCol = mix(col, silt, deep);
    tN = normalize(mix(nW, Ng, deep));
    tRough = clamp(rgh, 0.04, 1.0);
    tAO *= ao;

    // caustics, projected along the refracted key light; fading with depth, a low sun and the storm's overcast
    float sunUp = dot(up, uKeyDir);
    if (depth > 0.0 && sunUp > 0.0 && dist < 60.0) {
      vec3 T = refract(-uKeyDir, up, 0.75);
      vec2 xs = lp.xy - vec2(dot(T, E), dot(T, Nn)) * depth / max(-dot(T, U), 0.2);
      float c = causticAt(xs, vec2(cos(isp.w), sin(isp.w)), min(depth, 2.5) * 0.9, uTime);
      float aa = 1.0 - smoothstep(0.08, 0.3, length(fwidth(xs)) * 19.0);
      tCaustic = (c - 1.0) * smoothstep(0.0, 0.35, sunUp) * exp(-depth * 0.25) * (1.0 - 0.85 * uStorm) * aa
        * smoothstep(0.0, 0.25, depth) * (1.0 - deep);
    }

    // the caldera floor smoulders: faint by day, glowing red through the smoke at night
    if (volcano && uCaldera.w > 0.0) {
      float dc = acos(clamp(dot(up, uCaldera.xyz), -1.0, 1.0)) * uPlanetR / uCaldera.w;
      // fissures follow the noise's mid contour: a branching net of thin lines, not blotches
      float fn = texture(uSky.noise, P * 0.06 + vec3(0.0, uTime * 0.003, 0.0)).a;
      float crack = 1.0 - smoothstep(0.0, 0.035, abs(fn - 0.5));
      float pulse = 0.75 + 0.25 * sin(uTime * 0.7 + nA * 6.0);
      float vent = 1.0 - smoothstep(0.0, 0.32, dc);
      vec3 glow = vec3(7.0, 1.7, 0.35) * (1.0 - smoothstep(0.3, 0.75, dc)) * crack
        + vec3(20.0, 5.0, 1.0) * vent * vent * vent;
      totalEmissiveRadiance += glow * pulse * (0.12 + 0.88 * uNight);
    }
  }
}
diffuseColor.rgb = tCol;
`;

const FRAG_AO = /* glsl */ `
reflectedLight.indirectDiffuse *= tAO;
reflectedLight.indirectSpecular *= tAO * tAO;
reflectedLight.directDiffuse *= 1.0 + tCaustic * vec3(1.0, 0.97, 0.88) * 1.4;
`;

function terrainMaterial(ctx: Ctx, arrays: THREE.Texture[], islandTex: THREE.DataTexture, caldera: THREE.Vector4) {
  const m = new THREE.MeshStandardMaterial({ roughness: 1, metalness: 0 });
  const uniforms = {
    ...ctx.sky.u,
    ...SWELL_UNIFORMS,
    tCol: { value: arrays[0] },
    tNrm: { value: arrays[1] },
    tIsl: { value: islandTex },
    uLayerScale: { value: LAYERS.map((l) => new THREE.Vector2(1 / (l.size * l.aspect), 1 / l.size)) },
    uCaldera: { value: caldera },
  };
  m.onBeforeCompile = (s) => {
    Object.assign(s.uniforms, uniforms);
    s.vertexShader = s.vertexShader
      .replace('#include <common>', `#include <common>\n${VERT_PARS}`)
      .replace('#include <worldpos_vertex>', VERT_MAIN);
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', `#include <common>\n${FRAG_PARS}`)
      .replace('#include <map_fragment>', FRAG_SURFACE)
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = tRough;')
      .replace('#include <normal_fragment_maps>', 'normal = normalize((viewMatrix * vec4(tN, 0.0)).xyz);')
      .replace('#include <aomap_fragment>', FRAG_AO);
  };
  applyWeather(m, 0.8);
  return m;
}

/** The deep floor: under this much water only its silhouette and tone reach the eye, so it is shaded flat. */
function seabedMaterial(ctx: Ctx): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { uAmbient: ctx.sky.u.uAmbient, uKeyColor: ctx.sky.u.uKeyColor, uKeyDir: ctx.sky.u.uKeyDir },
    vertexShader: /* glsl */ `
      #include <common>
      #include <batching_pars_vertex>
      varying vec3 vN;
      void main() {
        #include <batching_vertex>
        vN = normal;
        gl_Position = projectionMatrix * viewMatrix * modelMatrix * batchingMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uAmbient;
      uniform vec3 uKeyColor;
      uniform vec3 uKeyDir;
      varying vec3 vN;
      void main() {
        vec3 light = uAmbient + uKeyColor * max(dot(normalize(vN), uKeyDir), 0.0) / 3.14159;
        gl_FragColor = vec4(${SILT} * light, 1.0);
      }`,
  });
}

/** Copy the loaded scans into the array layers (resizing the odd-sized ones), once their images have arrived. */
function fillArrays(renderer: THREE.WebGLRenderer, arrays: THREE.DataArrayTexture[], sources: THREE.Texture[][]): void {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = TEX;
  const g = canvas.getContext('2d')!, resized = new THREE.CanvasTexture(canvas);
  const at = new THREE.Vector3();
  for (let a = 0; a < arrays.length; a++) {
    renderer.initTexture(arrays[a]);
    sources.forEach((maps, layer) => {
      const img = maps[a].image as HTMLImageElement;
      let src: THREE.Texture = maps[a];
      if (img.width !== TEX || img.height !== TEX) {
        g.drawImage(img, 0, 0, TEX, TEX);
        src = resized;
      }
      renderer.copyTextureToTexture(src, arrays[a], null, at.set(0, 0, layer));
    });
  }
  resized.dispose();
  for (const maps of sources) for (const t of maps) t.dispose();
}

// ---------------------------------------------------------------------------------------------
// Landmark geology the height field cannot carry: bedded sea stacks with overhangs, basalt column stacks and the
// arch's span. Each piece wraps the field's own solid (what ships collide with stays inside the rock), lives in
// its island's shader frame and shares the ground material, so rock and ground meet without a seam.

/** Tangent frame at a site: x along `facing`, y to its left, z = height above sea level. */
class Local {
  readonly U: THREE.Vector3;
  readonly F: THREE.Vector3;
  readonly S: THREE.Vector3;
  constructor(pos: V3, facing: V3) {
    this.U = new THREE.Vector3(pos.x, pos.y, pos.z).normalize();
    this.F = new THREE.Vector3(facing.x, facing.y, facing.z);
    this.F.addScaledVector(this.U, -this.F.dot(this.U)).normalize();
    this.S = new THREE.Vector3().crossVectors(this.U, this.F);
  }
  dir(x: number, y: number, out: V3): V3 {
    out.x = this.U.x + (this.F.x * x + this.S.x * y) / R;
    out.y = this.U.y + (this.F.y * x + this.S.y * y) / R;
    out.z = this.U.z + (this.F.z * x + this.S.z * y) / R;
    return normalize(out);
  }
  at(x: number, y: number, z: number, out: THREE.Vector3): THREE.Vector3 {
    this.dir(x, y, out);
    return out.multiplyScalar(R + z);
  }
}

/** A mesh under construction in the ground's vertex format (aData = climate, AO, -1 for carved rock, island). */
class Geo {
  readonly pos: number[] = [];
  readonly dat: number[] = [];
  readonly idx: number[] = [];
  vert(p: THREE.Vector3, climate: number, ao: number, island: number): number {
    this.pos.push(p.x, p.y, p.z);
    this.dat.push(climate, ao, -1, island);
    return this.pos.length / 3 - 1;
  }
  quad(a: number, b: number, c: number, d: number): void {
    this.idx.push(a, b, c, a, c, d);
  }
  geometry(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('aData', new THREE.Float32BufferAttribute(this.dat, 4));
    g.setIndex(this.idx);
    g.computeVertexNormals();
    g.computeBoundingSphere();
    return g;
  }
}

const lpTmp = new THREE.Vector3();
/** TypeScript twin of the shader's bedCoord() at world point p (bed boundaries at integers). */
function bedAt(isl: IslandInfo, p: THREE.Vector3): number {
  lpTmp.copy(isl.c).multiplyScalar(-R).add(p);
  const x = lpTmp.dot(isl.e), y = lpTmp.dot(isl.n), z = lpTmp.dot(isl.c), s = isl.s;
  const hs = z + isl.tilt[0] * x + isl.tilt[1] * y + 0.9 * Math.sin(0.17 * x + 1.3 * Math.sin(0.11 * y + s)) +
    0.7 * Math.sin(0.13 * y + 1.1 * Math.sin(0.19 * x - s));
  return hs * 0.62 + 0.3 * Math.sin(hs * 0.41 + s);
}
const bedHard = (bed: number, s: number) => {
  const v = Math.sin(bed * 1.731 + s) * 43.758;
  return v - Math.floor(v);
};
/** How far a hard bed stands proud of the wall at world point p, as a fraction of the local overhang: a weathered
 *  undercut below, a crisp brow above, and each block between joints (`block`) its own reach. */
function proudAt(isl: IslandInfo, p: THREE.Vector3, block = 0): number {
  const hw = bedAt(isl, p), bed = Math.floor(hw), f = hw - bed;
  const reach = 0.55 + 0.6 * bedHard(bed * 7.3 + block, isl.s + 1.9);
  return Math.max(0, bedHard(bed, isl.s) - 0.4) * 1.6 * reach * smoothstep(0, 0.3, f) * smoothstep(0, 0.035, 1 - f);
}

/** The field around a pillar site sampled along rays from its centre: the solid any rock built there must wrap. */
class Pillar {
  readonly L: Local;
  readonly n = 64;
  readonly step = 0.08;
  readonly k: number;
  readonly h: Float32Array;
  zBot = -14;
  zTop = 0.5;
  readonly solid: Float32Array; // per ray, where the field crosses SOLID: hulls stop there
  constructor(world: World, site: Site) {
    this.L = new Local(site.pos, site.facing);
    this.k = Math.ceil((site.size * 1.5 + 3) / this.step);
    this.h = new Float32Array(this.n * (this.k + 1));
    for (let a = 0; a < this.n; a++) {
      const ca = Math.cos((a / this.n) * Math.PI * 2), sa = Math.sin((a / this.n) * Math.PI * 2);
      for (let i = 0; i <= this.k; i++) {
        this.h[a * (this.k + 1) + i] = world.height(this.L.dir(ca * i * this.step, sa * i * this.step, tv));
      }
    }
    // walls start where the pillar stands free inside the sampled disc, and stop where its rounded top begins
    const edge = this.k * this.step * 0.9;
    const free = (z: number) => {
      for (let a = 0; a < this.n; a++) if (this.reach(a, z) > edge) return false;
      return true;
    };
    while (this.zBot < 0 && !free(this.zBot)) this.zBot += 0.25;
    const shoulder = (z: number) => {
      for (let a = 0; a < this.n; a++) if (this.reach(a, z) < this.reach(a, 0) - site.size * 0.15) return true;
      return false;
    };
    while (this.zTop < site.height && !shoulder(this.zTop)) this.zTop += 0.1;
    this.solid = Float32Array.from({ length: this.n }, (_, a) => this.reach(a, SOLID));
  }
  /** Pull a point near the waterline back inside the line where the sim stops hulls, and never into the field. */
  inside(x: number, y: number, z: number): [number, number] {
    const w = 1 - smoothstep(2.5, 3.5, z), r = Math.hypot(x, y);
    if (w <= 0 || r < 1e-6) return [x, y];
    const f = (((Math.atan2(y, x) / (Math.PI * 2)) * this.n) % this.n + this.n) % this.n;
    const a0 = Math.floor(f) % this.n, a1 = (a0 + 1) % this.n, t = f - Math.floor(f);
    const lim = (a: number) => Math.max(this.solid[a], this.reach(a, z) + 0.03);
    const L = lim(a0) * (1 - t) + lim(a1) * t;
    const k = r > L ? 1 + ((L - r) / r) * w : 1;
    return [x * k, y * k];
  }
  /** Outermost radius on ray a where the field reaches height z (0 if nowhere). */
  reach(a: number, z: number): number {
    const o = a * (this.k + 1);
    for (let i = this.k; i >= 0; i--) {
      const hi = this.h[o + i];
      if (hi < z) continue;
      return i === this.k ? i * this.step : (i + (hi - z) / (hi - this.h[o + i + 1])) * this.step;
    }
    return 0;
  }
  /** Field height on ray a at radius rho. */
  heightAt(a: number, rho: number): number {
    const x = Math.min(this.k - 1.001, rho / this.step), i = Math.floor(x), o = a * (this.k + 1) + i;
    return this.h[o] + (this.h[o + 1] - this.h[o]) * (x - i);
  }
  /** Angle of ray a. */
  angle(a: number): number {
    return (a / this.n) * Math.PI * 2;
  }
}

const wp = new THREE.Vector3();
const dirTmp = new THREE.Vector3();

/** Bedded sea stack: the pillar's skin pushed out where hard beds stand proud (overhangs grow with height), a
 *  wave-cut notch at the waterline, joints cut down the faces, folded under the field's rounded top. */
function stackWalls(g: Geo, P: Pillar, isl: IslandInfo, island: number, climate: number, fine: boolean,
  rng: Rng) {
  const n = fine ? P.n : P.n / 4, span = P.zTop - P.zBot;
  const rows = Math.max(3, Math.ceil(span / (fine ? 0.15 : 0.6)));
  const joints = Array.from({ length: 4 + Math.floor(rng.next() * 4) }, () => rng.next() * n).sort((x, y) => x - y);
  const base = g.pos.length / 3;
  const ring = (row: number, z: number, inset: number, lip: boolean) => {
    for (let a = 0; a < n; a++) {
      const ray = a * (P.n / n), ang = P.angle(ray), ca = Math.cos(ang), sa = Math.sin(ang);
      let rho = P.reach(ray, z) + 0.07, zz = z, ao = 1;
      if (lip) {
        rho = Math.max(0.2, rho - 0.4);
        zz = P.heightAt(ray, rho) - 0.15;
      } else if (inset) {
        rho -= inset;
      } else {
        // overhang reach: low above the water where hulls pass, larger high on the stack; none in the notch
        const amp = (0.18 + 0.34 * smoothstep(2.5, 9, z)) * (1 - smoothstep(-0.7, -0.2, z) + smoothstep(0.6, 1.3, z)) *
          (1 - smoothstep(P.zTop - 1.2, P.zTop, z));
        const block = joints.filter((j) => j <= a).length;
        const prot = (z2: number) => amp * proudAt(isl, P.L.at(ca * rho, sa * rho, z2, wp), block);
        const jd = Math.min(...joints.map((j) => Math.min(Math.abs(a - j), n - Math.abs(a - j))));
        const cut = jd < 0.6 ? 0.08 : 0;
        const here = prot(z);
        rho += Math.max(-0.04, here - cut) + 0.05 * Math.sin(ang * 5 + z * 0.9 + isl.s) * Math.sin(ang * 3 - z * 0.4);
        // shade under ledges, in the joints and down at the foot
        ao = (1 - THREE.MathUtils.clamp((prot(z + 0.35) - here) * 2.2, 0, 0.55)) * (cut ? 0.6 : 1) *
          (0.55 + 0.45 * smoothstep(P.zBot, P.zBot + 2, z));
      }
      P.L.at(...P.inside(ca * rho, sa * rho, zz), zz, wp);
      g.vert(wp, climate, ao, island);
    }
    if (row > 0) {
      const r0 = base + (row - 1) * n, r1 = base + row * n;
      for (let a = 0; a < n; a++) {
        const b = (a + 1) % n;
        g.quad(r0 + a, r0 + b, r1 + b, r1 + a);
      }
    }
  };
  ring(0, P.zBot - 0.6, 0.15, false);
  for (let j = 0; j <= rows; j++) ring(j + 1, P.zBot + (span * j) / rows, 0, false);
  ring(rows + 2, P.zTop, 0, true);
}

/** Polar stack of hexagonal basalt columns over the pillar: each column tall enough to cover the field in its
 *  cell, faces flat, cross-fractured into drums with chamfered joints; hidden faces are never built. */
function basaltColumns(g: Geo, P: Pillar, island: number, climate: number, fine: boolean, rng: Rng): void {
  const d = 0.82, rc = d / Math.sqrt(3), rot = rng.next() * (Math.PI / 3), ch = 0.035;
  const span = Math.ceil((P.k * P.step) / d) + 1;
  const cells = new Map<number, { x: number; y: number; top: number }>();
  const key = (q: number, r: number) => (q + 64) * 256 + r + 64;
  const corner = (x: number, y: number, j: number, s: number): [number, number] => {
    const a = rot + (j * Math.PI) / 3 + Math.PI / 6;
    return [x + Math.cos(a) * s, y + Math.sin(a) * s];
  };
  const fieldAt = (x: number, y: number) => {
    const rho = Math.hypot(x, y), a = Math.round(((Math.atan2(y, x) / (Math.PI * 2)) * P.n + P.n) % P.n) % P.n;
    return rho >= P.k * P.step ? -99 : P.heightAt(a, rho);
  };
  for (let q = -span; q <= span; q++) {
    for (let r = -span; r <= span; r++) {
      const lx = d * (q + r / 2), ly = d * r * (Math.sqrt(3) / 2);
      const x = lx * Math.cos(rot) - ly * Math.sin(rot), y = lx * Math.sin(rot) + ly * Math.cos(rot);
      let top = fieldAt(x, y);
      for (let j = 0; j < 6; j++) top = Math.max(top, fieldAt(...corner(x, y, j, rc)));
      if (top < Math.max(P.zBot + 0.4, -1.5)) continue;
      cells.set(key(q, r), { x, y, top: top + 0.06 + rng.next() * 0.22 });
    }
  }
  const neighbours = [[1, 0], [0, 1], [-1, 1], [-1, 0], [0, -1], [1, -1]];
  const v = (x: number, y: number, z: number, ao: number) =>
    g.vert(P.L.at(...P.inside(x, y, z), z, wp), climate, ao, island);
  for (const [k, c] of cells) {
    const q = Math.floor(k / 256) - 64, r = (k % 256) - 64;
    const inner = (j: number) => corner(c.x, c.y, j, rc - ch);
    // top: slightly domed, chamfered into the sides
    const mid = v(c.x, c.y, c.top + 0.02, 1);
    for (let j = 0; j < 6; j++) {
      const a = v(...inner(j), c.top, 0.9), b = v(...inner((j + 1) % 6), c.top, 0.9);
      g.idx.push(mid, a, b);
    }
    // the fractures of this column
    const breaks: number[] = [];
    for (let z = P.zBot + rng.next() * 1.5; fine && z < c.top - 0.5; z += 0.9 + rng.next() * 1.1) breaks.push(z);
    for (let j = 0; j < 6; j++) {
      // the face toward neighbour j only shows above that neighbour's top
      const [dq, dr] = neighbours[j], nb = cells.get(key(q + dq, r + dr));
      const low = nb ? nb.top : P.zBot - 0.5;
      if (low >= c.top - ch) continue;
      const jj = (j + 5) % 6; // corner pair facing neighbour j
      const o0 = corner(c.x, c.y, jj, rc), o1 = corner(c.x, c.y, (jj + 1) % 6, rc);
      const i0 = inner(jj), i1 = inner((jj + 1) % 6);
      const zs = [low, ...breaks.filter((z) => z > low + 0.2 && z < c.top - 0.3), c.top];
      for (let s = 0; s + 1 < zs.length; s++) {
        const z0 = zs[s], z1 = zs[s + 1], ao = 0.6 + 0.4 * smoothstep(P.zBot, P.zBot + 2.5, z0);
        const b0 = s === 0 ? z0 : z0 + ch, t0 = z1 - ch;
        g.quad(v(...o0, b0, ao), v(...o1, b0, ao), v(...o1, t0, ao), v(...o0, t0, ao));
        g.quad(v(...o0, t0, ao), v(...o1, t0, ao), v(...i1, z1, ao * 0.8), v(...i0, z1, ao * 0.8));
        if (s > 0) g.quad(v(...i0, z0, ao * 0.8), v(...i1, z0, ao * 0.8), v(...o1, b0, ao), v(...o0, b0, ao));
      }
    }
  }
}

/** The arch's span: a lofted rock bridge from the crown of one foot to the other, its underside a rising vault
 *  over the sill, sides stepped by the same beds as the feet; both ends sink into the feet. */
function archSpan(g: Geo, site: Site, feet: Site[], isl: IslandInfo, island: number, climate: number, fine: boolean) {
  const L = new Local(site.pos, site.facing), half = site.size / 2, crown = site.height;
  const footR = (x: number) => {
    L.at(x, 0, 0, wp).normalize();
    let best = feet[0];
    const near = (f: Site) => wp.dot(dirTmp.set(f.pos.x, f.pos.y, f.pos.z));
    for (const f of feet) if (near(f) > near(best)) best = f;
    return best ? best.size : 3.2;
  };
  const ra = footR(-half), rb = footR(half);
  const ns = fine ? 64 : 16, nc = fine ? 36 : 12, spring = 3, apex = Math.max(spring + 6, crown - 3.6);
  const lo = -half + ra * 0.8, hi = half - rb * 0.8;
  const base = g.pos.length / 3;
  for (let i = 0; i <= ns; i++) {
    const x = -half + (2 * half * i) / ns, t = x / half;
    const zt = crown - 0.3 + 0.5 * (1 - t * t);
    const u = (x - (lo + hi) / 2) / ((hi - lo) / 2);
    const zb = Math.abs(u) < 1 ? spring + (apex - spring) * Math.pow(1 - u * u, 0.42) : spring;
    const w = 1.9 + 1.1 * t * t + 0.12 * Math.sin(x * 1.3 + isl.s);
    const mid = (zt + zb) / 2, hh = (zt - zb) / 2;
    for (let k = 0; k < nc; k++) {
      const phi = (k / nc) * Math.PI * 2, c = Math.cos(phi), s = Math.sin(phi);
      const sy = Math.sign(c) * Math.pow(Math.abs(c), 0.55), sz = Math.sign(s) * Math.pow(Math.abs(s), 0.55);
      let y = w * sy;
      const z = mid + hh * sz;
      // beds stand proud on the flanks, as on the feet
      y += Math.sign(sy) * Math.abs(sy) * (0.3 * proudAt(isl, L.at(x, y, z, wp)) + 0.06 * Math.sin(x * 2.1 + z * 1.7));
      const ao = sz < -0.3 ? 0.62 : 1;
      g.vert(L.at(x, y, z, wp), climate, ao, island);
    }
    if (i > 0) {
      const r0 = base + (i - 1) * nc, r1 = base + i * nc;
      for (let k = 0; k < nc; k++) {
        const b = (k + 1) % nc;
        g.quad(r0 + k, r0 + b, r1 + b, r1 + k);
      }
    }
  }
}

/** Every carved landmark of one island, at two levels of detail, shown only near and above the horizon. */
class Carved {
  readonly fine: THREE.Mesh;
  readonly coarse: THREE.Mesh;
  readonly sphere: THREE.Sphere;
  constructor(fine: THREE.BufferGeometry, coarse: THREE.BufferGeometry, material: THREE.Material) {
    this.fine = new THREE.Mesh(fine, material);
    this.coarse = new THREE.Mesh(coarse, material);
    for (const m of [this.fine, this.coarse]) m.castShadow = m.receiveShadow = true;
    this.sphere = fine.boundingSphere!.clone();
  }
  update(cam: THREE.Vector3): void {
    const d = this.sphere.distanceToPoint(cam), c = this.sphere.center;
    const seen = !belowHorizon(dirTmp.copy(c).normalize(), this.sphere.radius / R, c.length() + this.sphere.radius,
      v.copy(cam).normalize(), cam.length());
    this.fine.visible = seen && d < 90;
    this.coarse.visible = seen && d >= 90;
  }
}

function buildCarved(world: World, infos: IslandInfo[], material: THREE.Material): Carved[] {
  const out: Carved[] = [];
  world.islands.forEach((il, id) => {
    const stacks = world.sites.filter((s) => s.island === id && s.kind === 'stack');
    const arch = world.sites.find((s) => s.island === id && s.kind === 'arch');
    if (!stacks.length && !arch) return;
    const isl = infos[id], basalt = il.rock === 'basalt';
    const fine = new Geo(), coarse = new Geo();
    for (const s of stacks) {
      const P = new Pillar(world, s), climate = world.climate(s.pos);
      for (const [g, f] of [[fine, true], [coarse, false]] as const) {
        const rng = new Rng(il.seed ^ Math.floor(s.pos.x * 1e6));
        if (basalt) basaltColumns(g, P, id, climate, f, rng);
        else stackWalls(g, P, isl, id, climate, f, rng);
      }
    }
    if (arch) {
      const climate = world.climate(arch.pos);
      archSpan(fine, arch, stacks, isl, id, climate, true);
      archSpan(coarse, arch, stacks, isl, id, climate, false);
    }
    out.push(new Carved(fine.geometry(), coarse.geometry(), material));
  });
  return out;
}

// ---------------------------------------------------------------------------------------------
// The waterfall: the stream running down its gully to the lip, the sheet falling clear of the cliff on a ballistic
// arc straight into the sea, and the churned foam where it lands.

const WATER_VERT = /* glsl */ `
attribute vec3 aFlow;
varying vec3 vFlow;
`;
const WATER_FRAG_PARS = /* glsl */ `
uniform float uTime;
varying vec3 vFlow;
`;
// aFlow: across the flow 0..1, distance along it, speed. Streaks run with the water and tear into white in the fall.
const WATER_FRAG = /* glsl */ `
// a looser veil of spray hangs in front of the falling sheet (across coordinates 2..3)
float wVeil = step(1.5, vFlow.x);
float wx = vFlow.x - 2.0 * wVeil;
float wSpeed = vFlow.z;
float wFall = smoothstep(2.5, 6.0, wSpeed);
float wy = vFlow.y - uTime * wSpeed * (0.55 + 0.2 * wVeil);
float wn = texture(uSky.noise, vec3(wx * 1.6, wy * 0.09, 0.31 + 0.41 * wVeil)).a * 0.55
  + texture(uSky.noise, vec3(wx * 4.1, wy * 0.21, 0.67)).g * 0.45;
// clumps of white water racing down the sheet
float clump = smoothstep(0.55, 0.8, texture(uSky.noise, vec3(wx * 0.9, wy * 0.045, 0.13)).r);
float wWhite = mix(smoothstep(0.62, 0.85, wn) * 0.35, 0.5 + 0.5 * smoothstep(0.3, 0.7, wn + clump * 0.3), wFall);
float wEdge = smoothstep(0.0, 0.1 + 0.12 * wn, wx) * smoothstep(1.0, 0.9 - 0.12 * wn, wx);
diffuseColor.rgb = mix(vec3(0.02, 0.05, 0.045), vec3(0.86, 0.91, 0.93), wWhite);
diffuseColor.a = mix(0.88, mix(0.6, 0.98, smoothstep(0.25, 0.65, wn + clump * 0.2)), wFall)
  * mix(1.0, wEdge, wFall * 0.85 + 0.15) * mix(1.0, 0.45 * smoothstep(0.35, 0.7, wn), wVeil);
`;

const FOAM_VERT = /* glsl */ `
uniform float uTime;
uniform float uSimTime;
uniform float uPlanetR;
attribute vec2 aPolar;
varying vec2 vPolar;
varying vec3 vNrm;
${WIND_GLSL}
${SWELL_GLSL}
#include <fog_pars_vertex>
void main() {
  vec3 dir = normalize(position);
  vec3 n;
  vec3 p = dir * uPlanetR + swell(dir, uTime, uSimTime, n) + dir * 0.03;
  vPolar = aPolar;
  vNrm = n;
  vec4 mvPosition = viewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}
`;
const FOAM_FRAG = /* glsl */ `
uniform float uTime;
uniform vec3 uKeyDir;
uniform vec3 uKeyColor;
uniform vec3 uAmbient;
varying vec2 vPolar;
varying vec3 vNrm;
#include <fog_pars_fragment>
void main() {
  // churned foam boiling out from the plunge point, thinning into lace toward the rim
  float r = vPolar.x;
  vec2 q = vec2(cos(vPolar.y), sin(vPolar.y)) * r;
  float boil = texture(uSky.noise, vec3(q * 0.07, uTime * 0.03 - r * 0.03)).a * 0.6
    + texture(uSky.noise, vec3(q * 0.19, uTime * 0.05)).g * 0.4;
  float lace = smoothstep(0.42, 0.62, texture(uSky.noise, vec3(q * 0.1 - r * 0.05, uTime * 0.012 + 0.3)).a);
  float a = mix(smoothstep(0.25, 0.6, boil), lace, smoothstep(0.25, 0.85, r)) * (1.0 - smoothstep(0.6, 1.0, r));
  vec3 light = uKeyColor * max(dot(vNrm, uKeyDir), 0.0) * 0.8 + uAmbient;
  gl_FragColor = vec4(vec3(0.92, 0.96, 1.0) * light, a);
  #include <fog_fragment>
}
`;

class Waterfall {
  readonly meshes: THREE.Mesh[] = [];
  readonly plunge = new THREE.Vector3();
  constructor(ctx: Ctx, site: Site) {
    const world = ctx.world, L = new Local(site.pos, site.facing);
    const pos: number[] = [], flow: number[] = [], idx: number[] = [];
    const across = 10;
    // one row of a ribbon; `strip` 0 is the water itself, 2 the spray veil (the shader reads it from aFlow.x)
    const row = (pts: THREE.Vector3[], along: number, speed: number, join: boolean, strip = 0) => {
      const base = pos.length / 3;
      pts.forEach((p, j) => {
        pos.push(p.x, p.y, p.z);
        flow.push(j / across + strip, along, speed);
      });
      const prev = base - across - 1;
      if (!join) return;
      for (let j = 0; j < across; j++) idx.push(prev + j, base + j, base + j + 1, prev + j, base + j + 1, prev + j + 1);
    };
    // stream: from the spring at the gully's high point down to the lip, its level never rising downstream and
    // its edges on the banks
    const h = (x: number, y: number) => world.height(L.dir(x, y, tv));
    const floors: [number, number, number][] = [];
    for (let x = -12; x <= 0.001; x += 0.4) {
      let floor = Infinity, yf = 0;
      for (let y = -2.5; y <= 2.5; y += 0.1) {
        const hy = h(x, y);
        if (hy < floor) {
          floor = hy;
          yf = y;
        }
      }
      floors.push([x, floor, yf]);
    }
    let spring = 0;
    floors.forEach((f, i) => (f[1] > floors[spring][1] ? (spring = i) : 0));
    let level = Infinity, along = 0, yl = -1, yr = 1;
    for (const [x, floor, yf] of floors.slice(Math.min(spring, floors.length - 3))) {
      level = Math.min(level, floor + 0.2);
      const bank = (dir: number) => {
        let y = yf;
        while (Math.abs(y - yf) < 1.6 && h(x, y + dir * 0.05) < level) y += dir * 0.05;
        return y;
      };
      yl = bank(-1);
      yr = bank(1);
      const across0 = (j: number) => L.at(x, yl + ((yr - yl) * j) / across, level, wp.clone());
      row(Array.from({ length: across + 1 }, (_, j) => across0(j)), along, 1.4, along > 0);
      along += 0.4;
    }
    // the fall: launched off the lip fast enough to clear the cliff all the way down
    const z0 = level;
    let v0 = 1.5;
    const tEnd = Math.sqrt((2 * (z0 + 0.4)) / GRAVITY);
    const clear = () => {
      for (let t = 0.05; t < tEnd; t += 0.05) {
        const x = v0 * t, z = z0 - 0.5 * GRAVITY * t * t;
        if (Math.max(h(x, yl), h(x, 0), h(x, yr)) > z - 0.25) return false;
      }
      return true;
    };
    while (!clear() && v0 < 9) v0 += 0.25;
    const steps = 40, fallAt = along;
    // the sheet, then a wider veil of spray just in front of it
    for (const strip of [0, 2]) {
      along = fallAt + strip * 5;
      for (let i = strip ? 0 : 1; i <= steps; i++) {
        const t = tEnd * Math.pow(i / steps, 0.8), s = t / tEnd;
        const x = v0 * t + (strip ? 0.2 + 0.5 * s : 0), z = z0 - 0.5 * GRAVITY * t * t;
        if (i) along += Math.hypot(v0, GRAVITY * t) * (t - tEnd * Math.pow((i - 1) / steps, 0.8));
        const pts = Array.from({ length: across + 1 }, (_, j) => {
          const c = (j / across) * 2 - 1;
          const y = (yl + yr) / 2 + Math.max(1.7, (yr - yl) / 2) * c * (1 + 0.5 * s) * (strip ? 1.15 + 0.3 * s : 1);
          return L.at(x + 0.3 * s * (1 - c * c), y, z, new THREE.Vector3());
        });
        row(pts, along, 1.4 + GRAVITY * t, i > 0, strip);
      }
    }
    L.at(v0 * tEnd, (yl + yr) / 2, 0, this.plunge);

    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('aFlow', new THREE.Float32BufferAttribute(flow, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    const water = new THREE.MeshStandardMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide });
    water.onBeforeCompile = (s) => {
      s.uniforms.uTime = ctx.sky.u.uTime;
      s.vertexShader = s.vertexShader.replace('#include <common>', `#include <common>\n${WATER_VERT}`)
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvFlow = aFlow;');
      s.fragmentShader = s.fragmentShader.replace('#include <common>', `#include <common>\n${WATER_FRAG_PARS}`)
        .replace('#include <map_fragment>', WATER_FRAG)
        .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = mix(0.06, 0.5, wWhite);');
    };
    this.meshes.push(new THREE.Mesh(g, water));

    // foam where the fall lands, riding the swell
    const fpos: number[] = [], polar: number[] = [], fidx: number[] = [];
    const rings = 12, segs = 48, radius = 4.6;
    const P = new Local(this.plunge.clone().normalize(), site.facing);
    for (let i = 0; i <= rings; i++) {
      for (let k = 0; k < segs; k++) {
        const r = i / rings, a = (k / segs) * Math.PI * 2;
        P.at(Math.cos(a) * r * radius, Math.sin(a) * r * radius, 0, wp);
        fpos.push(wp.x, wp.y, wp.z);
        polar.push(r, a);
        if (i > 0) {
          const b = (k + 1) % segs;
          const o = (i - 1) * segs;
          fidx.push(o + k, o + b, o + segs + b, o + k, o + segs + b, o + segs + k);
        }
      }
    }
    const fg = new THREE.BufferGeometry();
    fg.setAttribute('position', new THREE.Float32BufferAttribute(fpos, 3));
    fg.setAttribute('aPolar', new THREE.Float32BufferAttribute(polar, 2));
    fg.setIndex(fidx);
    const foam = new THREE.Mesh(fg, new THREE.ShaderMaterial({
      uniforms: { ...THREE.UniformsLib.fog, ...ctx.sky.u, ...SWELL_UNIFORMS },
      vertexShader: FOAM_VERT,
      fragmentShader: FOAM_FRAG,
      transparent: true,
      depthWrite: false,
      fog: true,
    }));
    foam.layers.set(LAYER.OVER);
    this.meshes.push(foam);
  }
}

// ---------------------------------------------------------------------------------------------
export class Terrain {
  /** particle sources for fx.ts */
  readonly emitters: Emitter[] = [];
  private readonly ground: Ground;
  private readonly carved: Carved[];
  private glow: LightSource | null = null;
  private readonly arrays: THREE.DataArrayTexture[];
  private sources: THREE.Texture[][] | null;
  private readonly renderer: THREE.WebGLRenderer;
  private first = true;

  constructor(ctx: Ctx) {
    const world = ctx.world;
    this.renderer = ctx.pipeline.renderer;
    this.sources = LAYERS.map((l) => l.maps.map((url, i) => loadTexture(url, i === 0)));
    this.arrays = [0, 1].map((i) => {
      const t = new THREE.DataArrayTexture(null, TEX, TEX, LAYERS.length);
      t.colorSpace = i === 0 ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.minFilter = THREE.LinearMipmapLinearFilter;
      t.magFilter = THREE.LinearFilter;
      t.generateMipmaps = true;
      t.anisotropy = 4;
      t.source.dataReady = false;
      t.needsUpdate = true;
      return t;
    });

    // per-island frame data for the shader: centre + kind, then strata tilt, a seed and the ripple heading
    const isl = new Float32Array(world.islands.length * 8);
    const infos: IslandInfo[] = [];
    world.islands.forEach((il, i) => {
      const c = new THREE.Vector3(il.center.x, il.center.y, il.center.z);
      const e = new THREE.Vector3(Math.abs(c.y) < 0.99 ? 0 : 1, Math.abs(c.y) < 0.99 ? 1 : 0, 0).cross(c).normalize();
      const rng = new Rng(il.seed);
      const tilt: [number, number] = [(rng.next() - 0.5) * 0.25, (rng.next() - 0.5) * 0.25], s = rng.next() * 6.28;
      infos.push({ c, e, n: new THREE.Vector3().crossVectors(c, e), radius: il.radius, tilt, s });
      const code = SAND[il.sand] + 3 * ROCK[il.rock] + (il.kind === 'volcano' ? 9 : 0);
      isl.set([c.x, c.y, c.z, code, ...tilt, s, rng.next() * Math.PI * 2], i * 8);
    });
    const islandTex = new THREE.DataTexture(isl, world.islands.length * 2, 1, THREE.RGBAFormat, THREE.FloatType);
    islandTex.needsUpdate = true;

    const caldera = new THREE.Vector4();
    const cal = world.sites.find((s) => s.kind === 'caldera');
    if (cal) caldera.set(cal.pos.x, cal.pos.y, cal.pos.z, cal.size);

    const material = terrainMaterial(ctx, this.arrays, islandTex, caldera);
    this.ground = new Ground(world, infos, material, seabedMaterial(ctx));
    for (const p of this.ground.pools) ctx.scene.add(...p.meshes);
    this.carved = buildCarved(world, infos, material);
    for (const c of this.carved) ctx.scene.add(c.fine, c.coarse);

    const fall = world.sites.find((s) => s.kind === 'waterfall');
    if (fall) {
      const w = new Waterfall(ctx, fall);
      ctx.scene.add(...w.meshes);
      this.emitters.push({ kind: 'mist', pos: w.plunge.clone().setLength(R + 0.5), size: 3 });
    }
    // the volcano: smoke and embers from the caldera floor, steam from fumaroles on the crater walls, a glow at night
    if (cal) {
      const L = new Local(cal.pos, cal.pos.y > 0.9 ? { x: 1, y: 0, z: 0 } : { x: 0, y: 1, z: 0 });
      const floor = world.height(cal.pos);
      this.emitters.push(
        { kind: 'smoke', pos: L.at(0, 0, floor + 1.5, new THREE.Vector3()), size: cal.size },
        { kind: 'embers', pos: L.at(0, 0, floor + 0.5, new THREE.Vector3()), size: 2.5 },
      );
      const rng = new Rng(world.seed ^ 0xca1d);
      for (let k = 0; k < 3; k++) {
        const a = rng.next() * Math.PI * 2, r = cal.size * (0.45 + rng.next() * 0.35);
        const x = Math.cos(a) * r, y = Math.sin(a) * r;
        const pos = L.at(x, y, world.height(L.dir(x, y, tv)) + 0.2, new THREE.Vector3());
        this.emitters.push({ kind: 'steam', pos, size: 0.8 });
      }
      const pos = L.at(0, 0, floor + 4, new THREE.Vector3());
      this.glow = { pos, color: new THREE.Color(1, 0.32, 0.07), intensity: 0, range: 28 };
      ctx.sky.lights.add(this.glow);
    }
  }

  update(f: Frame): void {
    if (this.sources) {
      fillArrays(this.renderer, this.arrays, this.sources);
      this.sources = null;
    }
    // the world is drawn at about 0.7 of the canvas (the pipeline's dynamic resolution), so tiles are sized for those
    // pixels; a fixed factor keeps the scale's own steps from re-streaming tiles
    this.ground.update(f.camera, this.renderer.getDrawingBufferSize(v2).y * 0.7, this.first ? 1500 : 0.7);
    for (const c of this.carved) c.update(f.camera.position);
    if (this.glow) this.glow.intensity = (0.15 + f.env.night) * (5 + Math.sin(f.t * 1.3) + 0.6 * Math.sin(f.t * 3.7));
    this.first = false;
  }
}
