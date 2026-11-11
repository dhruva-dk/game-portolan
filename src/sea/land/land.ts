// PROTOTYPE (land look): the generated coast drawn on the sphere. Throwaway; it answers whether code-made land reaches
// the north star's look on this sea and sky, and what it costs. Not the shipping design (see the land handoff).
//
//   terrain  nested square grids round the eye (a clipmap), each twice as coarse as the one inside it, snapped to
//            their own spacing so nothing swims, the outer band of each morphed onto the next one's grid; heights,
//            normals, colour and the near detail from the generated maps; the sun's shadow from a march over the
//            heights (in compute, a few frames apart); the forest far off drawn as canopy on the ground itself
//   trees    one camera-facing card each, shape and shading made in the shader (no textures), out to ~450 m, the
//            nearest first; past that the canopy on the ground takes over
//   shore    the sea told the depth under it (shallows, surf, waves calmed) and the mountains' shadow on it
//
// The patch is a plane laid on the sphere round the ship's start by the azimuthal-equidistant map (as the waves are).
import {
  BufferGeometry, ClampToEdgeWrapping, DataTexture, DataUtils, Float32BufferAttribute, Group, HalfFloatType, InstancedBufferAttribute, InstancedBufferGeometry,
  LinearFilter, LinearMipmapLinearFilter, Mesh, MeshBasicNodeMaterial, RedFormat, RepeatWrapping, RGBAFormat, SRGBColorSpace, StorageTexture,
  TextureLoader, UnsignedByteType, Vector2, Vector3, type ComputeNode, type PerspectiveCamera, type Texture, type WebGPURenderer,
} from 'three/webgpu';
import {
  Fn, abs, acos, atan, cameraPosition, clamp, cos, cross, dot, exp, float, floor, fract, fwidth, instanceIndex, length, max, min, mix, normalize,
  positionGeometry, positionWorld, pow, select, sin, smoothstep, sqrt, texture, textureStore, uniform, uvec2, varyingProperty, vec2, vec3, vec4, attribute,
} from 'three/tsl';
import { R, U, shared } from '../world.ts';
import { ambientAt, moonAt, sunAt } from '../sky.ts';
import { SHORE } from '../ocean.ts';
import type { LandMaps } from './gen.ts';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Nd = any;

const SIZE = 4096, HALF = SIZE / 2;
/** Cells a side of each clipmap level, the finest spacing (m), and how many levels. */
const M = 192, FINEST = 2, LEVELS = 5;
/** Where the cards give way to the canopy drawn on the ground, metres from the eye. */
const CARDS_OUT = [330, 470], CANOPY_IN = [250, 450];
/** The canopy's height over the ground, where the forest is full. */
const CANOPY = 13;
const SHADOW_N = 512;
const MAX_TREES = 32000;

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
const hash = (p: Nd): Nd => fract(sin(dot(p, vec2(127.1, 311.7))).mul(43758.5453));
function valueNoise(p: Nd): Nd {
  const i: Nd = floor(p), f: Nd = fract(p);
  const u: Nd = f.mul(f).mul(f.mul(-2).add(3));
  const a = hash(i), b = hash(i.add(vec2(1, 0))), c = hash(i.add(vec2(0, 1))), d = hash(i.add(vec2(1, 1)));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

// ---------------------------------------------------------------- the land

interface Detail { tex: Texture; mean: Vector3; scale: number }

export class Land {
  readonly group = new Group();
  readonly maps: LandMaps;
  readonly #levels: Mesh[] = [];
  readonly #trees: { mesh: Mesh; geo: InstancedBufferGeometry; attr: InstancedBufferAttribute; cells: Int32Array[]; cellN: number; at: Vector2 };
  readonly #shadow: ComputeNode;
  readonly #anchor: Vector3;
  readonly #e1: Vector3;
  readonly #e2: Vector3;
  #frame = 0;

  /** Generates the coast round `anchor` (x along `east`) in a worker and makes everything that draws it. */
  static async create(anchor: Vector3, east: Vector3, seed = 7): Promise<Land> {
    const worker = new Worker(new URL('./gen.worker.ts', import.meta.url), { type: 'module' });
    const t = performance.now();
    const maps = await new Promise<LandMaps>((ok, fail) => {
      worker.onmessage = (e) => ok(e.data as LandMaps);
      worker.onerror = (e) => fail(e);
      worker.postMessage({ seed });
    });
    worker.terminate();
    console.info(`land: generated in ${Math.round(performance.now() - t)} ms`, maps.timing, `${maps.trees.length / 4} trees`);
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

    const n = maps.n;
    const half = new Uint16Array(n * n);
    for (let i = 0; i < n * n; i++) half[i] = DataUtils.toHalfFloat(maps.height[i]);
    const heightTex = new DataTexture(half, n, n, RedFormat, HalfFloatType);
    heightTex.minFilter = heightTex.magFilter = LinearFilter;
    heightTex.wrapS = heightTex.wrapT = ClampToEdgeWrapping;
    heightTex.needsUpdate = true;
    const rgba = (data: Uint8Array, srgb: boolean) => {
      const t = new DataTexture(data, n, n, RGBAFormat, UnsignedByteType);
      t.minFilter = LinearMipmapLinearFilter;
      t.magFilter = LinearFilter;
      t.wrapS = t.wrapT = ClampToEdgeWrapping;
      t.generateMipmaps = true;
      t.anisotropy = 4;
      if (srgb) t.colorSpace = SRGBColorSpace;
      t.needsUpdate = true;
      return t;
    };
    const colourTex = rgba(maps.colour, true), normalTex = rgba(maps.normal, false), materialTex = rgba(maps.material, false);
    const shadowTex = new StorageTexture(SHADOW_N, SHADOW_N);
    shadowTex.minFilter = shadowTex.magFilter = LinearFilter;
    shadowTex.wrapS = shadowTex.wrapT = ClampToEdgeWrapping;
    shadowTex.generateMipmaps = false;

    /** Height at a point of the plane, sinking to the deep beyond the patch. */
    const heightAt = (q: Nd): Nd => {
      const h = texture(heightTex).sample(uvOf(q)).level(float(0)).r;
      return mix(h, float(-60), smoothstep(HALF - 220, HALF - 10, max(abs(q.x), abs(q.y))));
    };
    const shadowAt = (q: Nd): Nd => select(max(abs(q.x), abs(q.y)).lessThan(HALF), texture(shadowTex).sample(uvOf(q)).level(float(0)).r, float(1));

    // ----- the sea's side of the shore
    SHORE.depth = (up: Nd) => heightAt(planeOf(normalize(up))).negate();
    SHORE.bed = (up: Nd) => texture(colourTex).sample(uvOf(planeOf(normalize(up)))).rgb;
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
      const h0 = heightAt(q).add(2);
      const lit = float(1).toVar();
      for (let i = 0; i < 28; i++) {
        const t = 5 * 1.25 ** i;
        const ray = h0.add(rise.mul(t)).sub((t * t) / (2 * R));
        const soft = 0.025 * t + 1;
        lit.assign(min(lit, smoothstep(-soft, soft, ray.sub(heightAt(q.add(dir.mul(t)))))));
      }
      textureStore(shadowTex, uvec2(x, y), vec4(select(el.greaterThan(-0.04), lit, float(0)), 0, 0, 1));
    })().compute(SHADOW_N * SHADOW_N, [64]);

    // ----- the terrain
    const terrain = terrainMaterial({ heightAt, shadowAt, colourTex, normalTex, materialTex, details });
    for (let l = 0; l < LEVELS; l++) {
      const mesh = new Mesh(levelGeometry(l > 0), terrain);
      mesh.frustumCulled = false;
      mesh.userData = { center: new Vector2(), spacing: FINEST * 2 ** l, bias: l * 0.0012 };
      mesh.name = `land${l}`;
      mesh.visible = !DEBUG.has(`nol${l}`);
      this.#levels.push(mesh);
      this.group.add(mesh);
    }

    // ----- the trees, sorted into 64 m cells for gathering round the eye
    const cellN = SIZE / 64;
    const lists: number[][] = Array.from({ length: cellN * cellN }, () => []);
    for (let i = 0; i < maps.trees.length / 4; i++) {
      const cx = Math.min(cellN - 1, Math.max(0, Math.floor((maps.trees[i * 4] + HALF) / 64)));
      const cy = Math.min(cellN - 1, Math.max(0, Math.floor((maps.trees[i * 4 + 1] + HALF) / 64)));
      lists[cy * cellN + cx].push(i);
    }
    const quad = new BufferGeometry();
    quad.setAttribute('position', new Float32BufferAttribute([-0.5, 0, 0, 0.5, 0, 0, 0.5, 1, 0, -0.5, 1, 0], 3));
    quad.setIndex([0, 1, 2, 0, 2, 3]);
    const geo = new InstancedBufferGeometry();
    geo.index = quad.index;
    geo.setAttribute('position', quad.getAttribute('position'));
    const attr = new InstancedBufferAttribute(new Float32Array(MAX_TREES * 4), 4);
    attr.setUsage(35048); // DynamicDrawUsage
    geo.setAttribute('tree', attr);
    geo.instanceCount = 0;
    const trees = new Mesh(geo, treeMaterial(heightAt, shadowAt));
    trees.frustumCulled = false;
    trees.visible = !DEBUG.has('notrees');
    trees.name = 'trees';
    this.group.add(trees);
    this.#trees = { mesh: trees, geo, attr, cells: lists.map((l) => Int32Array.from(l)), cellN, at: new Vector2(1e9, 1e9) };
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
    if (x < 0 || y < 0 || x >= n - 1 || y >= n - 1) return -60;
    const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi, i = yi * n + xi;
    return (height[i] * (1 - fx) + height[i + 1] * fx) * (1 - fy) + (height[i + n] * (1 - fx) + height[i + n + 1] * fx) * fy;
  }

  /** Each frame: the grids follow the eye, the trees round it are gathered, the shadow is redone every few frames. */
  update(renderer: WebGPURenderer, camera: PerspectiveCamera): void {
    const eye = this.planeOf(camera.position, Q);
    for (let l = 0; l < LEVELS; l++) {
      const s = FINEST * 2 ** (l + 1);
      (this.#levels[l].userData.center as Vector2).set(Math.round(eye.x / s) * s, Math.round(eye.y / s) * s);
    }
    const tr = this.#trees;
    if (tr.at.distanceTo(eye) > 6) {
      tr.at.copy(eye);
      this.#gather(eye);
    }
    if (this.#frame++ % 4 === 0) renderer.compute(this.#shadow);
  }

  /** The trees within reach of the eye into the instance buffer, nearest cells first. */
  #gather(eye: Vector2): void {
    const { cells, cellN, attr, geo } = this.#trees;
    const reach = CARDS_OUT[1] + 40;
    const cx = (eye.x + HALF) / 64, cy = (eye.y + HALF) / 64, r = reach / 64;
    const near: [number, number][] = [];
    for (let y = Math.max(0, Math.floor(cy - r)); y <= Math.min(cellN - 1, Math.floor(cy + r)); y++) {
      for (let x = Math.max(0, Math.floor(cx - r)); x <= Math.min(cellN - 1, Math.floor(cx + r)); x++) {
        const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
        if (d < r + 0.75) near.push([d, y * cellN + x]);
      }
    }
    near.sort((a, b) => a[0] - b[0]);
    const src = this.maps.trees, dst = attr.array as Float32Array;
    let k = 0;
    for (const [, c] of near) {
      for (const i of cells[c]) {
        if (k >= MAX_TREES) break;
        dst[k * 4] = src[i * 4]; dst[k * 4 + 1] = src[i * 4 + 1]; dst[k * 4 + 2] = src[i * 4 + 2]; dst[k * 4 + 3] = src[i * 4 + 3];
        k++;
      }
    }
    attr.clearUpdateRanges();
    attr.addUpdateRange(0, Math.max(4, k * 4));
    attr.needsUpdate = true;
    geo.instanceCount = k;
  }
}
const TMP = new Vector3(), Q = new Vector2();

// ---------------------------------------------------------------- the clipmap's grids

/** (M+1)² vertices at integer grid coordinates (x, 0, z); a ring has the middle half cut out, less a cell each side so
 * the finer level always overlaps it. */
function levelGeometry(ring: boolean): BufferGeometry {
  const pos: number[] = [];
  for (let j = 0; j <= M; j++) for (let i = 0; i <= M; i++) pos.push(i, 0, j);
  const idx: number[] = [];
  const lo = M / 4 + 1, hi = (3 * M) / 4 - 1;
  for (let j = 0; j < M; j++) {
    for (let i = 0; i < M; i++) {
      if (ring && i >= lo && i < hi && j >= lo && j < hi) continue;
      const a = j * (M + 1) + i, b = a + 1, c = a + M + 1, d = c + 1;
      idx.push(a, b, c, b, d, c);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  return g;
}

// ---------------------------------------------------------------- the terrain's material

interface TerrainInputs {
  heightAt: (q: Nd) => Nd;
  shadowAt: (q: Nd) => Nd;
  colourTex: Texture;
  normalTex: Texture;
  materialTex: Texture;
  details: Record<string, Detail>;
}

function terrainMaterial(t: TerrainInputs): MeshBasicNodeMaterial {
  const mat = new MeshBasicNodeMaterial();
  const center = uniform(new Vector2()).onObjectUpdate(({ object }) => object!.userData.center as Vector2);
  const spacing = uniform(1).onObjectUpdate(({ object }) => object!.userData.spacing as number);
  const bias = uniform(0).onObjectUpdate(({ object }) => object!.userData.bias as number);
  const vQ = varyingProperty('vec2', 'vLandQ');
  const vH = varyingProperty('float', 'vLandH');

  mat.positionNode = Fn(() => {
    const g = positionGeometry.xz;
    const q = center.sub(spacing.mul(M / 2)).add(g.mul(spacing)).toVar();
    // the outer band morphs onto the grid of the level outside, so the two meet without cracks
    const edge = max(abs(q.x.sub(center.x)), abs(q.y.sub(center.y))).div(spacing.mul(M / 2));
    const k = smoothstep(0.8, 0.97, edge);
    q.subAssign(fract(g.mul(0.5)).mul(2).mul(spacing).mul(k));
    const ground = t.heightAt(q);
    const eye = length(cameraPosition.sub(frameAt(q).up.mul(R)));
    // far off, the forest's crowns are the ground
    const forest = texture(t.colourTex).sample(uvOf(q)).level(float(2)).a;
    const h = ground.add(forest.mul(CANOPY).mul(smoothstep(CANOPY_IN[0], CANOPY_IN[1], eye)));
    vQ.assign(q);
    vH.assign(ground);
    const p = frameAt(q).up.mul(h.add(R));
    // coarser levels a hair further back, so where two overlap the finer one shows
    return p.add(p.sub(cameraPosition).mul(bias));
  })();

  mat.colorNode = Fn(() => {
    const q = vQ;
    const uv = uvOf(q);
    const f = frameAt(q);
    const nm = texture(t.normalTex).sample(uv);
    const nx = nm.r.mul(2).sub(1), ny = nm.g.mul(2).sub(1);
    const nup = sqrt(max(float(1).sub(nx.mul(nx)).sub(ny.mul(ny)), 0.02));
    const n = normalize(f.tx.mul(nx).add(f.ty.mul(ny)).add(f.up.mul(nup)));
    const ao = nm.b, leaf = nm.a;
    const col = texture(t.colourTex).sample(uv);
    const forest = col.a;
    const w = texture(t.materialTex).sample(uv);
    const sand = w.r, snow = w.g, rock = w.b, grass = w.a;
    const dist = length(cameraPosition.sub(positionWorld));

    // near: the scans' detail over the map's colour (their own colour divided out, so near and far agree)
    const near = float(1).sub(smoothstep(60, 260, dist));
    const d = t.details;
    const ratio = (k: string, uvd: Nd) => texture(d[k].tex).sample(uvd.div(d[k].scale)).rgb.div(vec3(d[k].mean.x, d[k].mean.y, d[k].mean.z));
    const floorW = max(float(1).sub(sand).sub(snow).sub(grass), 0);
    const ground = ratio('sand', q).mul(sand).add(ratio('snow', q).mul(snow)).add(ratio('grass', q).mul(grass)).add(ratio('forest', q).mul(floorW))
      .div(max(sand.add(snow).add(grass).add(floorW), 1e-3));
    const ax = nx.mul(nx), ay = ny.mul(ny), az = nup.mul(nup).mul(0.4);
    const rockR = ratio('rock', vec2(q.y, vH)).mul(ax).add(ratio('rock', vec2(q.x, vH)).mul(ay)).add(ratio('rock', q).mul(az)).div(ax.add(ay).add(az));
    const detail = clamp(mix(ground, rockR, rock), vec3(0.15), vec3(2.6));
    const albedo = col.rgb.mul(mix(vec3(1), detail, near)).toVar();

    // far: the forest's crowns, conifers and the autumn broadleaves
    const canopy = forest.mul(smoothstep(CANOPY_IN[0], CANOPY_IN[1], dist));
    const fw = length(fwidth(q));
    const crowns = mix(valueNoise(q.div(4.5)).mul(0.7).add(valueNoise(q.div(1.7)).mul(0.3)), float(0.5), smoothstep(1.2, 4.0, fw));
    const autumn = mix(vec3(0.2, 0.075, 0.02), vec3(0.16, 0.12, 0.03), valueNoise(q.div(37)));
    // conifers the dark mass, the broadleaves in bright clumps through it
    const clump = smoothstep(0.55, 0.8, valueNoise(q.div(14).add(7)).mul(0.5).add(valueNoise(q.div(4)).mul(0.5)).add(leaf.sub(0.4).mul(0.5)));
    const crownCol = mix(vec3(0.026, 0.05, 0.03), autumn, clump);
    albedo.assign(mix(albedo, crownCol.mul(crowns.mul(1.1).add(0.45)), canopy));

    // the light: the sun (shadowed by the land), the moon, and the sky over the open part of the dome
    const L = U.sunDir;
    const shadow = t.shadowAt(q);
    const sunE = sunAt(f.up), moonE = moonAt(f.up), amb = ambientAt(f.up);
    const open = dot(n, f.up).mul(0.5).add(0.5).mul(ao);
    // the canopy scatters light more softly than bare ground takes it
    const nl = mix(max(dot(n, L), 0), dot(n, L).mul(0.5).add(0.5).mul(0.8), canopy);
    const E = sunE.mul(nl.mul(shadow)).add(moonE.mul(max(dot(n, U.moonDir), 0))).add(amb.mul(open));
    return vec4(albedo.mul(E).div(Math.PI), 1);
  })();
  return mat;
}

// ---------------------------------------------------------------- the trees' material

function treeMaterial(heightAt: (q: Nd) => Nd, shadowAt: (q: Nd) => Nd): MeshBasicNodeMaterial {
  const mat = new MeshBasicNodeMaterial();
  mat.alphaToCoverage = true;
  mat.alphaTest = 0.5;
  const tree = attribute('tree', 'vec4');
  const vUV = varyingProperty('vec2', 'vTreeUV');
  const vKind = varyingProperty('vec2', 'vTreeKind');
  const vRight = varyingProperty('vec3', 'vTreeRight');
  const vUp = varyingProperty('vec3', 'vTreeUp');
  const vLight = varyingProperty('float', 'vTreeShadow');

  mat.positionNode = Fn(() => {
    const q = tree.xy;
    const kind = floor(tree.w), seed = fract(tree.w);
    const f = frameAt(q);
    const base = f.up.mul(heightAt(q).sub(0.5).add(R));
    const toEye = cameraPosition.sub(base);
    const dist = length(toEye);
    const right = normalize(cross(f.up, toEye));
    // each tree leaves at its own distance, so the forest thins into the canopy rather than stepping
    const out = float(CARDS_OUT[0]).add(seed.mul(CARDS_OUT[1] - CARDS_OUT[0]));
    const keep = select(dist.lessThan(out), float(1), float(0));
    const height = tree.z.mul(keep);
    const width = height.mul(select(kind.greaterThan(0.5), float(0.8), float(0.46)));
    vUV.assign(vec2(positionGeometry.x.add(0.5), positionGeometry.y));
    vKind.assign(vec2(kind, seed));
    vRight.assign(right);
    vUp.assign(f.up);
    vLight.assign(shadowAt(q));
    return base.add(right.mul(positionGeometry.x.mul(width))).add(f.up.mul(positionGeometry.y.mul(height)));
  })();

  const shape = Fn(() => {
    const u = vUV.x.sub(0.5), v = vUV.y;
    const seed = vKind.y;
    const broad = vKind.x.greaterThan(0.5);
    // a conifer: tiers of drooping boughs narrowing to the tip, ragged at the ends
    const tier = fract(v.mul(6.5).add(seed.mul(3)));
    const cone = pow(max(float(1).sub(v), 0), 1.05).mul(0.5).mul(float(0.62).add(float(0.38).mul(tier)))
      .add(sin(v.mul(70).add(seed.mul(40))).mul(0.025)).mul(smoothstep(0.03, 0.09, v));
    const conifer = cone.sub(abs(u));
    // a broadleaf: a lumpy round crown on a short trunk
    const c = vec2(u.mul(1.15), v.sub(0.58));
    const a = atan(c.y, c.x);
    const lump = float(0.4).add(sin(a.mul(5).add(seed.mul(20))).mul(0.045)).add(sin(a.mul(11).add(seed.mul(9))).mul(0.03));
    const crown = lump.sub(length(c.mul(vec2(1, 1.15))));
    const trunk = float(0.035).sub(abs(u)).min(float(0.3).sub(v));
    const broadleaf = max(crown, trunk);
    const coniferTrunk = float(0.025).sub(abs(u)).min(float(0.12).sub(v));
    return select(broad, broadleaf, max(conifer, coniferTrunk));
  });

  mat.opacityNode = Fn(() => {
    const sd = shape();
    return clamp(sd.div(max(fwidth(sd), 1e-4)).add(0.5), 0, 1);
  })();

  mat.colorNode = Fn(() => {
    const u = vUV.x.sub(0.5), v = vUV.y;
    const seed = vKind.y;
    const broad = vKind.x.greaterThan(0.5);
    const up = normalize(vUp), right = normalize(vRight);
    const toEye = normalize(cross(right, up));
    // a rounded body: the side toward the edge of the card faces out
    const w = select(broad, float(0.42), pow(max(float(1).sub(v), 0.05), 1.05).mul(0.5));
    const sx = clamp(u.div(w), -1, 1);
    const n = normalize(right.mul(sx).add(toEye.mul(sqrt(max(float(1).sub(sx.mul(sx)), 0)))).add(up.mul(0.35)));
    const L = U.sunDir;
    const sunE = sunAt(up), amb = ambientAt(up);
    const wrap = dot(n, L).mul(0.6).add(0.4).max(0);
    // inside the crown is darker; the conifer's tiers shade the one below
    const tier = fract(v.mul(6.5).add(seed.mul(3)));
    const inner = select(broad, float(0.55).add(v.mul(0.5)), float(0.45).add(tier.mul(0.4)).add(v.mul(0.25)));
    const hue = fract(seed.mul(7.31));
    const conifer = mix(vec3(0.018, 0.04, 0.02), vec3(0.03, 0.05, 0.022), hue);
    const leaves = mix(mix(vec3(0.24, 0.085, 0.02), vec3(0.2, 0.15, 0.035), smoothstep(0.2, 0.6, hue)), vec3(0.055, 0.08, 0.025), smoothstep(0.75, 0.95, hue));
    const bark = vec3(0.05, 0.035, 0.025);
    const trunkZone = select(broad, v.lessThan(0.22), v.lessThan(0.08));
    const albedo = select(trunkZone, bark, select(broad, leaves, conifer));
    // light through the leaves when the sun is behind
    const through = pow(max(dot(toEye.negate(), L), 0), 4).mul(0.35);
    const E = sunE.mul(wrap.add(through).mul(vLight)).add(amb.mul(inner.mul(0.9)));
    return vec4(albedo.mul(E).mul(inner.mul(0.6).add(0.4)).div(Math.PI), 1);
  })();
  return mat;
}

// ---------------------------------------------------------------- the scans

async function loadDetails(): Promise<Record<string, Detail>> {
  const loader = new TextureLoader();
  const base = `${import.meta.env.BASE_URL}tex/`;
  const want: Record<string, [string, number]> = { sand: ['sand_d', 4], grass: ['grass_d', 3], snow: ['snow_d', 6], forest: ['forest_d', 3], rock: ['cliff_d', 14] };
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

void exp;
