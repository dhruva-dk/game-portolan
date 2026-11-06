// The plants on the planet: every region's kinds grown over its ground, built at three levels of detail in a
// few variants each, and drawn instanced, with the choosing done on the GPU.
//
// Where they grow is worked out off the main thread (scatter-worker.ts) from each kind's rules. Every copy is then a
// place, a size and a turn in one buffer. Each frame a compute pass looks at every copy once: it drops those outside
// the view (or whose shadow cannot reach it, along the sun), and appends each survivor to the list of the level of
// detail its distance asks for, two lists across a band where neighbouring levels cross-fade. The lists' lengths are
// copied into indirect draw arguments, so the draws read how many copies to draw from the GPU and nothing comes back
// to the CPU (Wihlidal, "Optimizing the Graphics Pipeline with Compute", GDC 2016; Haar and Aaltonen, "GPU-Driven
// Rendering Pipelines", SIGGRAPH 2015).
//
// A kind's variants and levels of detail are merged into one geometry per material, each piece tagged with its list,
// and drawn as one object with an indirect draw per piece: one object and one pipeline for every copy of a kind's
// bark, another for its leaves. The pieces of levels 0 and 1 cast shadows; the last does not.
import {
  BufferGeometry, Float32BufferAttribute, Frustum, Group, IndirectStorageBufferAttribute, Matrix4, Mesh, Sphere,
  StorageBufferAttribute, Uint32BufferAttribute, Vector3, Vector4,
  type BufferAttribute, type ComputeNode, type Material, type Object3D, type PerspectiveCamera, type WebGPURenderer,
} from 'three/webgpu';
import { Fn, If, atomicAdd, atomicLoad, atomicStore, bool, dot, instanceIndex, length, max, storage, uint, uniform, uniformArray, vec3 } from 'three/tsl';
import type { Node } from 'three/webgpu';
import { BEACONS, LANDMARKS } from '../../sim/world/index.ts';
import { P } from '../gpu/uniforms.ts';
import { floraMaterial, turn, type FieldNodes } from './nodes.ts';
import { SPECIES, type Lod, type Species } from './species.ts';
import { STRIDE, type Clearing, type ScatterSpec, type Scattered } from './scatter.ts';

type V3 = Node<'vec3'>;
type V4 = Node<'vec4'>;
type U = Node<'uint'>;

/** Levels of detail. */
const LEVELS = 3;
/** The share of a boundary's distance over which neighbouring levels cross-fade, either side of it. */
const BAND = 0.08;
/** Kinds sparser than this per 100 m² have a crown that needs room, and more variants to tell them apart. */
const SPARSE = 3;

interface Piece {
  bucket: number;
  geometry: BufferGeometry;
}

interface Command {
  bucket: number;
  count: number;
  first: number;
  base: number;
}

/** One drawn object: a kind's pieces for one material, merged. */
interface Drawn {
  mesh: Mesh;
  /** Where its copies stand, all of them, and the nearest and furthest the eye may be from one for it to draw. */
  sphere: Sphere;
  near: number;
  far: number;
}

const breathe = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

/** Every kind's rules for the worker, in the order it should plant them: the ones that need room first, widest first. */
function rules(): { specs: ScatterSpec[]; order: number[] } {
  const specs = SPECIES.map((s, i): ScatterSpec => {
    const sparse = s.density < SPARSE;
    const spacing = sparse && s.anchor === 'ground' ? Math.max(1.2, Math.min(6, 0.35 * Math.sqrt(100 / Math.max(s.density, 0.01)))) : 0;
    const under = s.maxHeight < 0;
    return {
      region: s.region, minHeight: s.minHeight, maxHeight: s.maxHeight, minSlope: s.minSlope, maxSlope: s.maxSlope,
      density: s.density, clump: s.clump, grove: s.grove, anchor: s.anchor, spacing,
      tilt: under ? 0.8 : sparse ? 0 : 0.55,
      size: under ? [0.6, 1.4] : sparse ? [0.8, 1.2] : [0.7, 1.3],
      variants: sparse ? 4 : 3,
      seed: 1013 + i * 7919,
    };
  });
  const order = specs.map((_, i) => i).sort((a, b) => specs[b].spacing - specs[a].spacing || a - b);
  return { specs, order };
}

function clearings(): Clearing[] {
  return [
    ...LANDMARKS.map((l) => ({ at: l.pos, r: l.r + 6 })),
    ...BEACONS.map((b) => ({ at: b.pos, r: b.r + 5 })),
  ];
}

/** Grows the plants in a worker. */
function grow(specs: ScatterSpec[], clear: Clearing[]): Promise<Scattered[]> {
  return new Promise((resolve, reject) => {
    const w = new Worker(new URL('./scatter-worker.ts', import.meta.url), { type: 'module' });
    w.onmessage = (e: MessageEvent<Scattered[]>) => {
      resolve(e.data);
      w.terminate();
    };
    w.onerror = (e) => reject(new Error(e.message));
    w.postMessage({ specs, clearings: clear });
  });
}

/** One geometry from many: every attribute any piece has (zeros where one lacks it), and each piece's list. */
function merge(pieces: Piece[]): { geometry: BufferGeometry; commands: Command[] } {
  const sizes = new Map<string, number>();
  let vertices = 0, indices = 0;
  for (const p of pieces) {
    for (const [name, a] of Object.entries(p.geometry.attributes)) if (!sizes.has(name)) sizes.set(name, (a as BufferAttribute).itemSize);
    vertices += p.geometry.getAttribute('position').count;
    indices += p.geometry.index ? p.geometry.index.count : p.geometry.getAttribute('position').count;
  }
  const arrays = new Map<string, Float32Array>();
  for (const [name, size] of sizes) arrays.set(name, new Float32Array(vertices * size).fill(name === 'color' ? 1 : 0));
  const bucket = new Float32Array(vertices);
  const index = new Uint32Array(indices);
  const commands: Command[] = [];
  let v = 0, k = 0;
  for (const p of pieces) {
    const g = p.geometry, n = g.getAttribute('position').count;
    for (const [name, size] of sizes) {
      const a = g.getAttribute(name) as BufferAttribute | undefined;
      if (!a) continue;
      const out = arrays.get(name)!;
      if (a.array instanceof Float32Array && !(a as { isInterleavedBufferAttribute?: boolean }).isInterleavedBufferAttribute && a.itemSize === size) {
        out.set(a.array.subarray(0, n * size), v * size);
      } else {
        for (let i = 0; i < n; i++) for (let c = 0; c < size; c++) out[(v + i) * size + c] = a.getComponent(i, c);
      }
    }
    bucket.fill(p.bucket, v, v + n);
    const count = g.index ? g.index.count : n;
    if (g.index) index.set(g.index.array as ArrayLike<number>, k);
    else for (let i = 0; i < n; i++) index[k + i] = i;
    commands.push({ bucket: p.bucket, count, first: k, base: v });
    v += n;
    k += count;
  }
  const geometry = new BufferGeometry();
  for (const [name, size] of sizes) geometry.setAttribute(name, new Float32BufferAttribute(arrays.get(name)!, size));
  geometry.setAttribute('aBucket', new Float32BufferAttribute(bucket, 1));
  geometry.setIndex(new Uint32BufferAttribute(index, 1));
  return { geometry, commands };
}

/** The meshes in a built plant, each with its geometry moved into the plant's frame. */
function meshesOf(root: Object3D): { material: Material; geometry: BufferGeometry; shadow: boolean }[] {
  const out: { material: Material; geometry: BufferGeometry; shadow: boolean }[] = [];
  root.updateMatrixWorld(true);
  const inverse = new Matrix4().copy(root.matrixWorld).invert();
  root.traverse((o) => {
    const m = o as Mesh;
    if (!m.isMesh || Array.isArray(m.material)) return;
    let g = m.geometry;
    const local = new Matrix4().multiplyMatrices(inverse, m.matrixWorld);
    if (!local.equals(new Matrix4())) g = g.clone().applyMatrix4(local);
    out.push({ material: m.material as Material, geometry: g, shadow: m.castShadow });
  });
  return out;
}

export class Flora {
  readonly group = new Group();
  readonly #eye = uniform(new Vector3());
  readonly #planes = uniformArray(Array.from({ length: 6 }, () => new Vector4()), 'vec4');
  readonly #frustum = new Frustum();
  readonly #m = new Matrix4();
  readonly #drawn: Drawn[] = [];
  #passes: ComputeNode[] = [];
  #live = false;
  readonly #ready: Promise<void>;
  /** Copies grown, for the record. */
  copies = 0;
  /** Each kind grown: its copies, and the size of its biggest variant's nearest build. */
  readonly kinds: { id: string; region: number; copies: number; height: number; radius: number; far: number }[] = [];

  constructor() {
    this.group.name = 'flora';
    this.#ready = this.#start().catch((e: unknown) => {
      console.warn('flora:', e);
    });
  }

  /** Resolves once every plant is grown, built and ready to draw. */
  settled(): Promise<void> {
    return this.#ready;
  }

  async #start(): Promise<void> {
    const { specs, order } = rules();
    const grown = await grow(order.map((i) => specs[i]), clearings());
    const scattered: Scattered[] = new Array(specs.length);
    order.forEach((i, k) => (scattered[i] = grown[k]));
    await this.#build(specs, scattered);
  }

  async #build(specs: ScatterSpec[], scattered: Scattered[]): Promise<void> {
    // the kinds that grow anywhere, and their variants' slots
    const kinds: { s: Species; spec: ScatterSpec; plants: Scattered; sv: number }[] = [];
    let svs = 0, copies = 0;
    SPECIES.forEach((s, i) => {
      const plants = scattered[i];
      if (!plants || plants.variant.length === 0) return;
      kinds.push({ s, spec: specs[i], plants, sv: svs });
      svs += specs[i].variants;
      copies += plants.variant.length;
    });
    this.copies = copies;
    if (!copies) return;
    const buckets = svs * LEVELS;

    // every copy, and each variant's count
    const place = new Float32Array(copies * STRIDE);
    const key = new Uint32Array(copies);
    const perVariant = new Uint32Array(svs);
    let at = 0;
    for (const k of kinds) {
      const n = k.plants.variant.length;
      place.set(k.plants.data, at * STRIDE);
      for (let i = 0; i < n; i++) {
        const sv = k.sv + k.plants.variant[i];
        key[at + i] = sv;
        perVariant[sv]++;
      }
      at += n;
    }
    // each bucket's list: as long as its variant has copies
    const base = new Uint32Array(buckets);
    let listed = 0;
    for (let sv = 0; sv < svs; sv++) for (let l = 0; l < LEVELS; l++) {
      base[sv * LEVELS + l] = listed;
      listed += perVariant[sv];
    }

    // build each kind's variants at each level, merged per material
    const fade = new Float32Array(buckets * 4);
    const shape = new Float32Array(svs * 4);
    const commands: Command[] = [];
    const objects: { material: Material; shadow: boolean; geometry: BufferGeometry; commands: Command[]; kind: (typeof kinds)[number]; levels: Set<number> }[] = [];
    for (const k of kinds) {
      const groups = new Map<string, { material: Material; shadow: boolean; pieces: Piece[]; levels: Set<number> }>();
      let height = 0, radius = 0, centre = 0;
      for (let v = 0; v < k.spec.variants; v++) {
        for (let l = 0 as Lod; l < LEVELS; l = (l + 1) as Lod) {
          const root = k.s.build(k.spec.seed * 31 + v * 104729 + 7, l);
          for (const part of meshesOf(root)) {
            const g = part.geometry;
            if (!g.getAttribute('position') || g.getAttribute('position').count === 0) continue;
            if (l === 0) {
              g.computeBoundingBox();
              const b = g.boundingBox!;
              height = Math.max(height, b.max.y);
              radius = Math.max(radius, Math.hypot(Math.max(-b.min.x, b.max.x), Math.max(-b.min.z, b.max.z)));
              centre = Math.max(centre, (b.max.y + Math.max(0, b.min.y)) / 2);
            }
            const shadow = part.shadow && l < 2;
            const id = `${part.material.uuid}:${shadow}`;
            const grp = groups.get(id) ?? groups.set(id, { material: part.material, shadow, pieces: [], levels: new Set() }).get(id)!;
            grp.pieces.push({ bucket: (k.sv + v) * LEVELS + l, geometry: g });
            grp.levels.add(l);
          }
        }
      }
      const [d1, d2, cull] = k.s.lods;
      const far = Math.max(d2 * 1.2, cull ?? Math.max(80, Math.min(1000, height * 200)));
      this.kinds.push({ id: k.s.id, region: k.s.region, copies: k.plants.variant.length, height, radius, far });
      const ends = [d1, Math.max(d2, d1 * 1.3), far];
      for (let v = 0; v < k.spec.variants; v++) {
        const sv = k.sv + v;
        shape.set([centre, Math.max(radius, (height - centre) * 1.1, 0.3), Math.min(40, height * 2.5), 0], sv * 4);
        for (let l = 0; l < LEVELS; l++) {
          const b = sv * LEVELS + l;
          const start = l === 0 ? 0 : ends[l - 1], end = ends[l];
          const inX = l === 0 ? -1e9 : start * (1 - BAND), inW = l === 0 ? 1 : 2 * start * BAND;
          const outZ = l === LEVELS - 1 ? end : end * (1 + BAND), outW = l === LEVELS - 1 ? end * BAND * 1.5 : 2 * end * BAND;
          fade.set([inX, inW, outZ, outW], b * 4);
        }
      }
      for (const grp of groups.values()) {
        const { geometry, commands: c } = merge(grp.pieces);
        objects.push({ material: grp.material, shadow: grp.shadow, geometry, commands: c, kind: k, levels: grp.levels });
      }
      await breathe();
    }

    // the buffers every copy and every draw reads
    const copiesAttr = new StorageBufferAttribute(place, 4);
    const keyAttr = new StorageBufferAttribute(key, 1);
    const baseAttr = new StorageBufferAttribute(base, 1);
    const fadeAttr = new StorageBufferAttribute(fade, 4);
    const shapeAttr = new StorageBufferAttribute(shape, 4);
    const shownAttr = new StorageBufferAttribute(new Uint32Array(Math.max(listed, 1)), 1);
    const countAttr = new StorageBufferAttribute(new Uint32Array(buckets), 1);
    for (const o of objects) for (const c of o.commands) commands.push(c);
    const args = new Uint32Array(commands.length * 5);
    const which = new Uint32Array(commands.length);
    commands.forEach((c, i) => {
      args.set([c.count, 0, c.first, c.base, 0], i * 5);
      which[i] = c.bucket;
    });
    const argsAttr = new IndirectStorageBufferAttribute(args, 5);
    const whichAttr = new StorageBufferAttribute(which, 1);

    const nodes: FieldNodes = {
      copies: storage(copiesAttr, 'vec4', copies * 2).toReadOnly() as unknown as FieldNodes['copies'],
      shown: storage(shownAttr, 'uint', listed).toReadOnly() as unknown as FieldNodes['shown'],
      base: storage(baseAttr, 'uint', buckets).toReadOnly() as unknown as FieldNodes['base'],
      fade: storage(fadeAttr, 'vec4', buckets).toReadOnly() as unknown as FieldNodes['fade'],
      eye: this.#eye as unknown as V3,
    };

    // the passes: clear the lists, sort the copies into them, hand their lengths to the draws
    const counts = storage(countAttr, 'uint', buckets).toAtomic() as unknown as { element(i: U): U };
    const clear = Fn(() => {
      atomicStore(counts.element(instanceIndex), uint(0));
    })().compute(buckets, [64]);
    const placeRead = storage(copiesAttr, 'vec4', copies * 2).toReadOnly() as unknown as { element(i: U): V4 };
    const keys = storage(keyAttr, 'uint', copies).toReadOnly() as unknown as { element(i: U): U };
    const shapes = storage(shapeAttr, 'vec4', svs).toReadOnly() as unknown as { element(i: U): V4 };
    const fades = storage(fadeAttr, 'vec4', buckets).toReadOnly() as unknown as { element(i: U): V4 };
    const bases = storage(baseAttr, 'uint', buckets).toReadOnly() as unknown as { element(i: U): U };
    const lists = storage(shownAttr, 'uint', listed) as unknown as { element(i: U): { assign(v: U): void } };
    const planes = this.#planes as unknown as { element(i: number): V4 };
    const eye = this.#eye as unknown as V3;
    const sort = Fn(() => {
      const i = instanceIndex;
      const a = placeRead.element(i.mul(2)), q = placeRead.element(i.mul(2).add(1));
      const sv = keys.element(i);
      const sh = shapes.element(sv);
      const up = turn(q, vec3(0, 1, 0));
      const c = a.xyz.add(up.mul(sh.x.mul(a.w))).toVar();
      const r = sh.y.mul(a.w).add(0.5).toVar();
      // the shadow's far end, along the sun, so a plant just out of view still darkens the ground in it
      const tip = c.sub(P.sunDir.mul(sh.z.mul(a.w))).toVar();
      const seen = bool(true).toVar();
      for (let k = 0; k < 6; k++) {
        const pl = planes.element(k);
        If(max(dot(pl.xyz, c), dot(pl.xyz, tip)).add(pl.w).lessThan(r.negate()), () => {
          seen.assign(false);
        });
      }
      If(seen, () => {
        const d = length(a.xyz.sub(eye)).toVar();
        for (let l = 0; l < LEVELS; l++) {
          const b = sv.mul(LEVELS).add(l).toVar();
          const f = fades.element(b);
          If(d.greaterThan(f.x).and(d.lessThan(f.z)), () => {
            const slot = atomicAdd(counts.element(b), uint(1)).toVar();
            lists.element(bases.element(b).add(slot)).assign(i);
          });
        }
      });
    })().compute(copies, [64]);
    const argsWrite = storage(argsAttr, 'uint', commands.length * 5) as unknown as { element(i: U): { assign(v: U): void } };
    const whichRead = storage(whichAttr, 'uint', commands.length).toReadOnly() as unknown as { element(i: U): U };
    const hand = Fn(() => {
      argsWrite.element(instanceIndex.mul(5).add(1)).assign(atomicLoad(counts.element(whichRead.element(instanceIndex))));
    })().compute(commands.length, [64]);
    this.#passes = [clear, sort, hand];

    // the drawn objects
    let ci = 0;
    for (const o of objects) {
      const material = floraMaterial(o.material, nodes);
      o.geometry.setIndirect(argsAttr, o.commands.map((_, j) => (ci + j) * 20));
      ci += o.commands.length;
      // where its copies stand: the kind's plants, all of them
      const d = o.kind.plants.data, n = o.kind.plants.variant.length;
      const centre = new Vector3();
      for (let i = 0; i < n; i++) centre.x += d[i * STRIDE], centre.y += d[i * STRIDE + 1], centre.z += d[i * STRIDE + 2];
      centre.multiplyScalar(1 / n);
      let reach = 0;
      for (let i = 0; i < n; i++) reach = Math.max(reach, Math.hypot(d[i * STRIDE] - centre.x, d[i * STRIDE + 1] - centre.y, d[i * STRIDE + 2] - centre.z));
      const sv = o.kind.sv;
      const plantR = shape[sv * 4 + 1] + shape[sv * 4 + 2];
      const sphere = new Sphere(centre, reach + plantR * 1.3 + 2);
      o.geometry.boundingSphere = sphere.clone();
      const levels = [...o.levels];
      const near = Math.min(...levels.map((l) => fade[(sv * LEVELS + l) * 4]));
      const far = Math.max(...levels.map((l) => fade[(sv * LEVELS + l) * 4 + 2]));
      const mesh = new Mesh(o.geometry, material);
      mesh.name = `flora:${o.kind.s.id}`;
      mesh.castShadow = o.shadow;
      mesh.receiveShadow = true;
      mesh.matrixAutoUpdate = false;
      if ((o.material as { transparent?: boolean }).transparent || material.transparent) mesh.renderOrder = 2;
      this.group.add(mesh);
      this.#drawn.push({ mesh, sphere, near, far });
    }
    this.group.matrixAutoUpdate = false;
    this.#live = true;
  }

  /** Sorts the copies for this eye; runs before the frame is drawn. */
  update(renderer: WebGPURenderer, camera: PerspectiveCamera): void {
    if (!this.#live) return;
    const eye = this.#eye.value as Vector3;
    camera.getWorldPosition(eye);
    this.#m.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this.#frustum.setFromProjectionMatrix(this.#m, camera.coordinateSystem, (camera as { reversedDepth?: boolean }).reversedDepth ?? false);
    const planes = this.#planes.array as Vector4[];
    this.#frustum.planes.forEach((p, i) => planes[i].set(p.normal.x, p.normal.y, p.normal.z, p.constant));
    // whole kinds out of reach are not drawn at all
    for (const d of this.#drawn) {
      const away = d.sphere.center.distanceTo(eye);
      d.mesh.visible = away - d.sphere.radius < d.far && away + d.sphere.radius > d.near;
    }
    renderer.compute(this.#passes);
  }
}
