// PROTOTYPE (archipelago look): the generated islands drawn on the sphere. Throwaway; it answers whether a light,
// airy tropical archipelago reaches the north star's look on this sea and sky, and what it costs. (The fjord coast
// before it is kept at the tag fjord-prototype.)
//
//   islands  each 128 m tile that has land is a mesh at four spacings (2, 4, 8, 16 m), the one drawn chosen by its
//            distance; skirts hang from the tiles' edges so neighbours at different spacings never show a crack;
//            heights from the generated map in the vertex shader, normals from it in the fragment, the scans' detail
//            near; the sun's shadow from a march over the heights (in compute, a few frames apart)
//   palms    the old game's coconut palm, a few seeds of it at three levels of detail, instanced round the eye
//   granite  the old game's sea boulders and granite slabs, the same way
//   shore    the sea told the depth and the bed under it (sand, seagrass, coral, lit through by caustics), and the
//            hills' shadow
//
// The patch is a plane laid on the sphere round the ship's start by the azimuthal-equidistant map (as the waves are).
import {
  BufferGeometry, ClampToEdgeWrapping, DataTexture, DataUtils, Float32BufferAttribute, Group, HalfFloatType, InstancedMesh, LinearFilter,
  Frustum, LinearMipmapLinearFilter, Matrix4, Mesh, MeshBasicNodeMaterial, RedFormat, RepeatWrapping, RGBAFormat, SRGBColorSpace, Sphere, StorageTexture,
  TextureLoader, UnsignedByteType, Vector2, Vector3, Vector4, type ComputeNode, type Material, type PerspectiveCamera, type Texture, type WebGPURenderer,
} from 'three/webgpu';
import {
  Fn, abs, acos, cameraPosition, clamp, cos, dot, float, floor, fract, length, max, min, mix, normalize, positionGeometry, positionWorld,
  select, sin, smoothstep, texture, textureStore, uniform, uvec2, varyingProperty, vec2, vec3, vec4, instanceIndex, pow,
} from 'three/tsl';
import type { Object3D } from 'three';
import { R, U, shared } from '../world.ts';
import { ambientAt, moonAt, sunAt } from '../sky.ts';
import { SHORE } from '../ocean.ts';
import { TILE, type LandMaps } from './gen.ts';
import { PLANTS as ATOLL_PLANTS } from '../../render/flora/coralAtolls.ts';
import { ROCK_UNIFORMS, rockById, rockMaterial } from '../../render/rocks/index.ts';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Nd = any;

const SIZE = 4096, HALF = SIZE / 2;
/** Beyond these distances (m) a tile is drawn at the next coarser spacing. */
const TILE_LOD = [200, 480, 1100];
const SHADOW_N = 512;

const DEBUG = new Set((new URLSearchParams(location.search).get('debug') ?? '').split(','));

const LAND = shared({
  anchor: uniform(new Vector3(0, 1, 0)),
  e1: uniform(new Vector3(1, 0, 0)),
  e2: uniform(new Vector3(0, 0, 1)),
});

// ---------------------------------------------------------------- the plane on the sphere

/** The point of the sphere a point of the plane lies on, and the plane's x and y carried there. */
function frameAt(q: Nd): { up: Nd; tx: Nd; ty: Nd } {
  const r = max(length(q), 0.01);
  const d = q.div(r);
  const th = r.div(R);
  const c = cos(th), s = sin(th);
  const dir = LAND.e1.mul(d.x).add(LAND.e2.mul(d.y));
  const up = LAND.anchor.mul(c).add(dir.mul(s));
  const tr = LAND.anchor.mul(s.negate()).add(dir.mul(c));
  const tp = LAND.e1.mul(d.y.negate()).add(LAND.e2.mul(d.x));
  return { up, tx: tr.mul(d.x).sub(tp.mul(d.y)), ty: tr.mul(d.y).add(tp.mul(d.x)) };
}

/** The point of the plane under a unit direction from the planet's centre. */
function planeOf(u: Nd): Nd {
  const c = clamp(dot(u, LAND.anchor), -1, 1);
  const t = u.sub(LAND.anchor.mul(c));
  return vec2(dot(t, LAND.e1), dot(t, LAND.e2)).mul(acos(c).mul(R).div(max(length(t), 1e-7)));
}

const uvOf = (q: Nd): Nd => q.div(SIZE).add(0.5);

/** Light gathered by the rippled surface onto the bed: a cheap iterated warp, bright threads on a darker floor. */
function caustics(q: Nd, t: Nd): Nd {
  const p = q.div(0.24);
  const acc = float(0).toVar();
  const i = p.toVar();
  for (let n = 0; n < 3; n++) {
    const tt = t.mul(1 - 3.5 / (n + 1)).mul(0.6);
    i.assign(p.add(vec2(cos(tt.sub(i.x)).add(sin(tt.add(i.y))), sin(tt.sub(i.y)).add(cos(tt.add(i.x))))));
    acc.addAssign(float(1).div(length(vec2(p.x.div(sin(i.x.add(tt)).div(0.006)), p.y.div(cos(i.y.add(tt)).div(0.006))))));
  }
  const c = float(1.17).sub(pow(acc.div(3), 1.4));
  return pow(abs(c), 7).min(3);
}

// ---------------------------------------------------------------- the land

interface Detail { tex: Texture; mean: Vector3; scale: number }

/** Copies of a few shapes at three levels of detail, kept round the eye. */
interface Scatter {
  /** Per item: x, y, turn (rad), scale, variant, base height. */
  items: Float32Array;
  stride: number;
  /** Per variant, per level: the meshes (one per material). */
  meshes: InstancedMesh[][][];
  far: number[];
  /** Made once: each copy's matrix (16 floats), and the middle of it (world) with a radius that holds it. */
  matrices?: Float32Array;
  spheres?: Float32Array;
  /** The copy's reach above its base, metres at scale 1. */
  height: number;
}

export class Land {
  readonly group = new Group();
  readonly maps: LandMaps;
  readonly #tiles: { meshes: Mesh[]; centre: Vector2 }[] = [];
  readonly #shadow: ComputeNode;
  readonly #anchor: Vector3;
  readonly #e1: Vector3;
  readonly #e2: Vector3;
  readonly #scatters: Scatter[] = [];
  #at = new Vector2(1e9, 1e9);
  readonly #look = new Vector3();
  #frame = 0;

  /** Generates the islands round `anchor` (x along `east`) in a worker and makes everything that draws them. */
  static async create(anchor: Vector3, east: Vector3, seed = 7): Promise<Land> {
    const worker = new Worker(new URL('./gen.worker.ts', import.meta.url), { type: 'module' });
    const t = performance.now();
    const maps = await new Promise<LandMaps>((ok, fail) => {
      worker.onmessage = (e) => ok(e.data as LandMaps);
      worker.onerror = (e) => fail(e);
      worker.postMessage({ seed });
    });
    worker.terminate();
    console.info(`land: generated in ${Math.round(performance.now() - t)} ms`, maps.timing, `${maps.tiles.length} tiles, ${maps.palms.length / 4} palms, ${maps.rocks.length / 5} rocks`);
    const details = await loadDetails();
    return new Land(maps, anchor, east, details);
  }

  private constructor(maps: LandMaps, anchor: Vector3, east: Vector3, details: Record<string, Detail>) {
    this.maps = maps;
    this.#anchor = anchor.clone().normalize();
    this.#e1 = east.clone().addScaledVector(this.#anchor, -east.dot(this.#anchor)).normalize();
    this.#e2 = new Vector3().crossVectors(this.#anchor, this.#e1);
    (LAND.anchor.value as Vector3).copy(this.#anchor);
    (LAND.e1.value as Vector3).copy(this.#e1);
    (LAND.e2.value as Vector3).copy(this.#e2);

    const n = maps.n, cn = maps.cn;
    const half = new Uint16Array(n * n);
    for (let i = 0; i < n * n; i++) half[i] = DataUtils.toHalfFloat(maps.height[i]);
    const heightTex = new DataTexture(half, n, n, RedFormat, HalfFloatType);
    heightTex.minFilter = heightTex.magFilter = LinearFilter;
    heightTex.wrapS = heightTex.wrapT = ClampToEdgeWrapping;
    heightTex.needsUpdate = true;
    const rgba = (data: Uint8Array, srgb: boolean) => {
      const t = new DataTexture(data, cn, cn, RGBAFormat, UnsignedByteType);
      t.minFilter = LinearMipmapLinearFilter;
      t.magFilter = LinearFilter;
      t.wrapS = t.wrapT = ClampToEdgeWrapping;
      t.generateMipmaps = true;
      t.anisotropy = 4;
      if (srgb) t.colorSpace = SRGBColorSpace;
      t.needsUpdate = true;
      return t;
    };
    const colourTex = rgba(maps.colour, true), bedTex = rgba(maps.bed, true), materialTex = rgba(maps.material, false);
    const shadowTex = new StorageTexture(SHADOW_N, SHADOW_N);
    shadowTex.minFilter = shadowTex.magFilter = LinearFilter;
    shadowTex.wrapS = shadowTex.wrapT = ClampToEdgeWrapping;
    shadowTex.generateMipmaps = false;

    /** Height at a point of the plane, sinking to the deep beyond the patch. */
    const heightAt = (q: Nd): Nd => {
      const h = texture(heightTex).sample(uvOf(q)).level(float(0)).r;
      return mix(h, float(-46), smoothstep(HALF - 220, HALF - 10, max(abs(q.x), abs(q.y))));
    };
    const shadowAt = (q: Nd): Nd => select(max(abs(q.x), abs(q.y)).lessThan(HALF), texture(shadowTex).sample(uvOf(q)).level(float(0)).r, float(1));

    // ----- the sea's side of the shore: the bed's colour, lit through by caustics where the sun reaches it
    SHORE.depth = (up: Nd) => heightAt(planeOf(normalize(up))).negate();
    SHORE.bed = (up: Nd) => {
      const q = planeOf(normalize(up));
      const depth = heightAt(q).negate();
      const sun = shadowAt(q).mul(smoothstep(0.0, 0.25, dot(normalize(up), U.sunDir)));
      // the threads blur to their mean with distance, and the deeper the bed the softer they are
      const dist = length(cameraPosition.sub(normalize(up).mul(R)));
      const sharp = float(1).sub(smoothstep(25, 90, dist)).mul(smoothstep(0.2, 1.2, depth)).mul(float(1).sub(smoothstep(5, 14, depth))).mul(sun);
      const c = mix(float(0.32), caustics(q, U.time), sharp);
      return texture(bedTex).sample(uvOf(q)).rgb.mul(c.mul(sun.mul(0.8).add(0.2)).mul(1.1).add(0.7));
    };
    SHORE.shadow = (up: Nd) => shadowAt(planeOf(normalize(up)));

    // ----- the sun's shadow: from each texel, march toward the sun over the heights (the planet curving away under the ray)
    this.#shadow = Fn(() => {
      const x = instanceIndex.mod(SHADOW_N), y = instanceIndex.div(SHADOW_N);
      const q = vec2(float(x).add(0.5), float(y).add(0.5)).div(SHADOW_N).sub(0.5).mul(SIZE);
      const f = frameAt(q);
      const L = U.sunDir;
      const el = dot(f.up, L);
      const flat = vec2(dot(L, f.tx), dot(L, f.ty));
      const fl = max(length(flat), 1e-4);
      const dir = flat.div(fl);
      const rise = el.div(fl);
      const h0 = max(heightAt(q), 0).add(1.5);
      const lit = float(1).toVar();
      for (let i = 0; i < 22; i++) {
        const t = 4 * 1.25 ** i;
        const ray = h0.add(rise.mul(t)).sub((t * t) / (2 * R));
        const soft = 0.025 * t + 1;
        lit.assign(min(lit, smoothstep(-soft, soft, ray.sub(heightAt(q.add(dir.mul(t)))))));
      }
      textureStore(shadowTex, uvec2(x, y), vec4(select(el.greaterThan(-0.04), lit, float(0)), 0, 0, 1));
    })().compute(SHADOW_N * SHADOW_N, [64]);

    // ----- the islands' tiles
    const ground = groundMaterial({ heightAt, shadowAt, colourTex, materialTex, details, texel: SIZE / n });
    const v = new Vector3(), up = new Vector3();
    for (const t of maps.tiles) {
      const centre = new Vector2(t.x + TILE / 2, t.y + TILE / 2);
      this.#cpuUp(centre.x, centre.y, up);
      const sphere = new Sphere(v.copy(up).multiplyScalar(R + 20), TILE * 0.75 + 40);
      const meshes = t.lods.map((l, k) => {
        const g = new BufferGeometry();
        g.setAttribute('position', new Float32BufferAttribute(l.pos, 3));
        g.setIndex(Array.from(l.index));
        g.boundingSphere = sphere.clone();
        const m = new Mesh(g, ground);
        m.name = `tile${k}`;
        m.visible = false;
        m.matrixAutoUpdate = false;
        this.group.add(m);
        return m;
      });
      this.#tiles.push({ meshes, centre });
    }

    // ----- palms and granite
    ROCK_UNIFORMS.uSea.value.set(0, 0, 0, R);
    if (!DEBUG.has('nopalms')) this.#palms();
    if (!DEBUG.has('norocks')) this.#rocks();
  }

  /** The coconut palms: six seeds of the palm at three levels of detail, each copy turned to lean toward the sea. */
  #palms(): void {
    const coconut = ATOLL_PLANTS.find((p) => p.id === 'coconutPalm')!;
    const src = this.maps.palms, count = src.length / 4, K = 4;
    const items = new Float32Array(count * 6);
    const per = new Array(K).fill(0);
    const q = new Vector2();
    for (let i = 0; i < count; i++) {
      const vt = Math.floor(src[i * 4 + 3]) % K;
      items.set([src[i * 4], src[i * 4 + 1], src[i * 4 + 2], 0.8 + 0.35 * ((src[i * 4 + 3] * 0.618) % 1), vt, this.heightAt(q.set(src[i * 4], src[i * 4 + 1])) - 0.2], i * 6);
      per[vt]++;
    }
    const meshes = Array.from({ length: K }, (_, vt) => [0, 1, 2].map((lod) => instanced(coconut.build(101 + vt * 37, lod as 0 | 1 | 2), per[vt], `palm${vt}.${lod}`)));
    console.info('land: palm triangles per level', [0, 1, 2].map((l) => meshes[0][l].reduce((t, m) => t + (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3, 0)));
    this.#addScatter({ items, stride: 6, meshes, far: [45, 160, 1400], height: 16 });
  }

  /** Granite: boulders by the shore, slabs and tors on the hills, four shapes of each, scaled to each copy's size. */
  #rocks(): void {
    const src = this.maps.rocks, count = src.length / 5;
    const forms = [rockById('seaBoulder')!, rockById('graniteSlab')!];
    const K = 4, mid = [2.5, 12];
    const items = new Float32Array(count * 6);
    const per = new Array(K * 2).fill(0);
    const q = new Vector2();
    for (let i = 0; i < count; i++) {
      const kind = src[i * 5 + 4], size = src[i * 5 + 2], vt = kind * K + (Math.floor(src[i * 5 + 3]) % K);
      items.set([src[i * 5], src[i * 5 + 1], (src[i * 5 + 3] * 0.37) % (Math.PI * 2), size / mid[kind], vt, this.heightAt(q.set(src[i * 5], src[i * 5 + 1])) - 0.12 * size], i * 6);
      per[vt]++;
    }
    const meshes = Array.from({ length: K * 2 }, (_, vt) => [0, 1, 2].map((lod) => {
      const kind = Math.floor(vt / K), form = forms[kind];
      const parts = form.parts(7 + vt * 13, mid[kind], lod as 0 | 1 | 2, { skin: 'tropicGranite' });
      return parts.map((p) => {
        const m = new InstancedMesh(p.geo, rockMaterial(p.skin ?? 'tropicGranite') as unknown as Material, Math.max(1, per[vt]));
        m.count = 0;
        m.frustumCulled = false;
        m.name = `granite${vt}.${lod}`;
        return m;
      });
    }).map((l) => l.flat()));
    this.#addScatter({ items, stride: 6, meshes, far: [40, 180, 1000], height: 6 });
  }

  /** Each copy's matrix and bounds, made once: the copies never move, only which level and whether they are drawn. */
  #addScatter(s: Scatter): void {
    const n = s.items.length / s.stride;
    s.matrices = new Float32Array(n * 16);
    s.spheres = new Float32Array(n * 4);
    const up = new Vector3(), x = new Vector3(), z = new Vector3(), tx = new Vector3(), ty = new Vector3(), Y = new Vector3();
    for (let k = 0; k < n; k++) {
      const i = k * s.stride, px = s.items[i], py = s.items[i + 1], a = s.items[i + 2], s0 = s.items[i + 3];
      this.#cpuUp(px, py, up);
      // the plane's x and y carried to this point (as frameAt), turned by the copy's own turn
      this.#cpuUp(px + 1, py, tx).sub(up).normalize();
      this.#cpuUp(px, py + 1, ty).sub(up).normalize();
      x.copy(tx).multiplyScalar(Math.cos(a)).addScaledVector(ty, Math.sin(a)).normalize();
      z.crossVectors(x, up);
      M.makeBasis(x.multiplyScalar(s0), Y.copy(up).multiplyScalar(s0), z.multiplyScalar(s0));
      M.setPosition(up.clone().multiplyScalar(R + s.items[i + 5]));
      M.toArray(s.matrices, k * 16);
      const h = s.height * s0;
      s.spheres.set([up.x * (R + s.items[i + 5] + h / 2), up.y * (R + s.items[i + 5] + h / 2), up.z * (R + s.items[i + 5] + h / 2), h * 0.75 + 2], k * 4);
    }
    for (const v of s.meshes) for (const l of v) for (const m of l) this.group.add(m);
    this.#scatters.push(s);
  }

  /** The unit vector from the planet's centre under a point of the plane (CPU). */
  #cpuUp(x: number, y: number, out: Vector3): Vector3 {
    const r = Math.max(Math.hypot(x, y), 0.01), th = r / R;
    return out.copy(this.#anchor).multiplyScalar(Math.cos(th))
      .addScaledVector(this.#e1, (x / r) * Math.sin(th)).addScaledVector(this.#e2, (y / r) * Math.sin(th));
  }

  /** The point of the plane under a world position (CPU). */
  planeOf(p: Vector3, out = new Vector2()): Vector2 {
    const u = TMP.copy(p).normalize();
    const c = Math.min(1, Math.max(-1, u.dot(this.#anchor)));
    const t = u.addScaledVector(this.#anchor, -c);
    const l = Math.max(t.length(), 1e-9);
    const k = (Math.acos(c) * R) / l;
    return out.set(t.dot(this.#e1) * k, t.dot(this.#e2) * k);
  }

  /** Height of the land (or the seabed) at a point of the plane, bilinear (CPU). */
  heightAt(q: Vector2): number {
    const { n, height } = this.maps;
    const x = (q.x / SIZE + 0.5) * n - 0.5, y = (q.y / SIZE + 0.5) * n - 0.5;
    if (x < 0 || y < 0 || x >= n - 1 || y >= n - 1) return -46;
    const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi, i = yi * n + xi;
    return (height[i] * (1 - fx) + height[i + 1] * fx) * (1 - fy) + (height[i + n] * (1 - fx) + height[i + n + 1] * fx) * fy;
  }

  /** Each frame: each tile at the spacing its distance asks for; the palms and rocks round the eye re-sorted when it moves. */
  update(renderer: WebGPURenderer, camera: PerspectiveCamera): void {
    const eye = this.planeOf(camera.position, Q);
    const lift = Math.max(0, camera.position.length() - R);
    for (const t of this.#tiles) {
      const d = Math.hypot(t.centre.distanceTo(eye) - TILE * 0.5, lift * 0.5);
      const k = d < TILE_LOD[0] ? 0 : d < TILE_LOD[1] ? 1 : d < TILE_LOD[2] ? 2 : 3;
      for (let i = 0; i < 4; i++) t.meshes[i].visible = i === k;
    }
    // the copies re-sorted when the eye moves a few metres or turns a couple of degrees
    const look = camera.getWorldDirection(V3);
    if (this.#at.distanceTo(eye) > 4 || look.dot(this.#look) < 0.9994) {
      this.#at.copy(eye);
      this.#look.copy(look);
      FRUSTUM.setFromProjectionMatrix(PV.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
      for (const s of this.#scatters) this.#place(s, eye);
    }
    if (this.#frame++ % 4 === 0) renderer.compute(this.#shadow);
  }

  /** Every copy within reach and in view into its shape's mesh at the level its distance asks for. */
  #place(s: Scatter, eye: Vector2): void {
    const { items, stride, meshes, far, matrices, spheres } = s;
    for (const v of meshes) for (const l of v) for (const m of l) m.count = 0;
    // a little wider than the view, so turning between re-sorts never shows a copy popping in at the edge
    const planes = FRUSTUM.planes;
    for (let i = 0, k = 0; i < items.length; i += stride, k++) {
      const d = Math.hypot(items[i] - eye.x, items[i + 1] - eye.y);
      if (d > far[2]) continue;
      V3.fromArray(spheres!, k * 4);
      const r = spheres![k * 4 + 3] + 6;
      let inside = true;
      for (let p = 0; p < 6 && inside; p++) inside = planes[p].distanceToPoint(V3) > -r;
      if (!inside) continue;
      const lod = d < far[0] ? 0 : d < far[1] ? 1 : 2;
      for (const m of meshes[items[i + 4]][lod]) (m.instanceMatrix.array as Float32Array).set(matrices!.subarray(k * 16, k * 16 + 16), 16 * m.count++);
    }
    for (const v of meshes) for (const l of v) for (const m of l) {
      m.instanceMatrix.clearUpdateRanges();
      m.instanceMatrix.addUpdateRange(0, Math.max(16, m.count * 16));
      m.instanceMatrix.needsUpdate = true;
      m.visible = m.count > 0;
    }
  }
}
const TMP = new Vector3(), Q = new Vector2(), M = new Matrix4(), V3 = new Vector3(), PV = new Matrix4(), FRUSTUM = new Frustum();
void Vector4;

/** One InstancedMesh per mesh of a built plant, sharing its geometry and material. */
function instanced(o: Object3D, count: number, name: string): InstancedMesh[] {
  const out: InstancedMesh[] = [];
  o.traverse((c) => {
    const mesh = c as unknown as Mesh;
    if (!mesh.isMesh) return;
    const m = new InstancedMesh(mesh.geometry, mesh.material as Material, Math.max(1, count));
    m.count = 0;
    m.frustumCulled = false;
    m.name = name;
    out.push(m);
  });
  return out;
}

// ---------------------------------------------------------------- the ground's material

interface GroundInputs {
  heightAt: (q: Nd) => Nd;
  shadowAt: (q: Nd) => Nd;
  colourTex: Texture;
  materialTex: Texture;
  details: Record<string, Detail>;
  texel: number;
}

function groundMaterial(t: GroundInputs): MeshBasicNodeMaterial {
  const mat = new MeshBasicNodeMaterial();
  const vQ = varyingProperty('vec2', 'vLandQ');

  mat.positionNode = Fn(() => {
    const q = positionGeometry.xy;
    // the skirt hangs a few metres below the tile's edge
    const h = t.heightAt(q).sub(positionGeometry.z.mul(6));
    vQ.assign(q);
    return frameAt(q).up.mul(h.add(R));
  })();

  mat.colorNode = Fn(() => {
    const q = vQ;
    const uv = uvOf(q);
    const f = frameAt(q);
    const e = t.texel;
    const hx = t.heightAt(q.add(vec2(e, 0))).sub(t.heightAt(q.sub(vec2(e, 0)))).div(2 * e);
    const hy = t.heightAt(q.add(vec2(0, e))).sub(t.heightAt(q.sub(vec2(0, e)))).div(2 * e);
    const n = normalize(f.up.sub(f.tx.mul(hx)).sub(f.ty.mul(hy)));
    const col = DEBUG.has('mip0') ? texture(t.colourTex).sample(uv).level(float(0)) : texture(t.colourTex).sample(uv);
    const w = texture(t.materialTex).sample(uv);
    const dry = w.r, wet = w.g, rock = w.b, green = w.a;
    const dist = length(cameraPosition.sub(positionWorld));

    // near: the scans' detail over the map's colour (their own colour divided out, so near and far agree)
    const near = float(1).sub(smoothstep(50, 240, dist));
    const d = t.details;
    const ratio = (k: string, uvd: Nd) => texture(d[k].tex).sample(uvd.div(d[k].scale)).rgb
      .add(texture(d[k].tex).sample(vec2(uvd.x.mul(0.6).sub(uvd.y.mul(0.8)), uvd.x.mul(0.8).add(uvd.y.mul(0.6))).div(d[k].scale * 2.7)).rgb)
      .mul(0.5).div(vec3(d[k].mean.x, d[k].mean.y, d[k].mean.z));
    const sum = max(dry.add(wet).add(rock).add(green), 1e-3);
    const detail = ratio('sand', q).mul(dry).add(ratio('wet', q).mul(wet)).add(ratio('rock', q).mul(rock)).add(ratio('green', q).mul(green)).div(sum);
    const albedo = col.rgb.mul(mix(vec3(1), clamp(detail, vec3(0.2), vec3(2.4)), near));

    // the light: the sun (shadowed by the hills), the moon, and the sky over the open part of the dome
    const L = U.sunDir;
    const shadow = t.shadowAt(q);
    const sunE = sunAt(f.up), moonE = moonAt(f.up), amb = ambientAt(f.up);
    const open = dot(n, f.up).mul(0.5).add(0.5);
    const E = sunE.mul(max(dot(n, L), 0).mul(shadow)).add(moonE.mul(max(dot(n, U.moonDir), 0))).add(amb.mul(open));
    if (DEBUG.has('albedo')) return vec4(albedo.mul(4), 1);
    if (DEBUG.has('raw')) return vec4(col.rgb.mul(4), 1);
    if (DEBUG.has('mat')) return vec4(vec3(dry, rock, green).mul(2), 1);
    if (DEBUG.has('near')) return vec4(vec3(near, 0, 0), 1);
    return vec4(albedo.mul(E).div(Math.PI), 1);
  })();
  return mat;
}

// ---------------------------------------------------------------- the scans

async function loadDetails(): Promise<Record<string, Detail>> {
  const loader = new TextureLoader();
  const base = `${import.meta.env.BASE_URL}tex/`;
  const want: Record<string, [string, number]> = {
    sand: ['regions/coralAtolls/shellSand_albedo', 3],
    wet: ['regions/jadeShoals/tidalSand_albedo', 4],
    green: ['regions/jadeShoals/duneGrass_albedo', 3],
    rock: ['rocks/granite_d', 6],
  };
  const out: Record<string, Detail> = {};
  await Promise.all(Object.entries(want).map(async ([k, [file, scale]]) => {
    const tex = await loader.loadAsync(`${base}${file}.jpg`);
    tex.wrapS = tex.wrapT = RepeatWrapping;
    tex.colorSpace = SRGBColorSpace;
    tex.anisotropy = 8;
    out[k] = { tex, mean: meanOf(tex.image as HTMLImageElement), scale };
  }));
  return out;
}

/** The scan's mean colour, linear. */
function meanOf(img: HTMLImageElement | ImageBitmap): Vector3 {
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const g = c.getContext('2d')!;
  g.drawImage(img, 0, 0, 32, 32);
  const d = g.getImageData(0, 0, 32, 32).data;
  const lin = (x: number) => { const v = x / 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  const m = new Vector3();
  for (let i = 0; i < d.length; i += 4) m.x += lin(d[i]), m.y += lin(d[i + 1]), m.z += lin(d[i + 2]);
  return m.multiplyScalar(4 / d.length);
}

void floor; void fract;
