// The land on the sphere: a chunked cube-sphere with a quadtree level of detail on each face. Chunks near the
// camera split until their cells are well under a metre; the whole globe stays coarse for the orbit view. Chunks
// over the horizon are skipped. Meshes are built in workers (terrain-worker.ts) from the world's heightAt and
// regionMix, and a node only gives way to its children once all four are built, so there are no holes.
import * as THREE from 'three';
import { faceDir, R } from '../sim/sphere.ts';
import { v3 } from '../sim/math.ts';
import { buildChunk, chunkIndex, CHUNK_N, WEIGHTS, type ChunkData, type ChunkRequest } from './terrain-build.ts';

const NONE = 0, PENDING = 1, READY = 2;
// A chunk has ~49 KB of vertex data. Shared indices are allocated once; detail residency stays below 48 MiB.
const CACHE_BYTES = 48 * 1024 * 1024, UNUSED_MS = 10_000;
const ADMIT_PER_UPDATE = 1, EVICT_PER_UPDATE = 4;

interface Node {
  key: string;
  face: number; level: number; i: number; j: number;
  /** Unit vector to the node's centre. */
  dir: THREE.Vector3;
  /** Angle from the centre to a corner, and the side's length in metres. */
  half: number; side: number;
  state: number;
  mesh: THREE.Mesh | null;
  minH: number; maxH: number;
  used: number;
  needed: number;
  bytes: number;
  dist: number;
  kids: Node[] | null;
}

export interface TerrainStats {
  drawn: number; built: number; pending: number; queued: number;
  /** Resident vertex arrays (shared indices excluded), and worker results still waiting for admission. */
  residentBytes: number; queuedBytes: number;
}

export class Terrain {
  readonly group = new THREE.Group();
  readonly material: THREE.Material;
  /** How close chunks split, in chunk sides: higher is finer. */
  detail = 1.3;
  /** The finest level (cells of about 0.4 m at 6), and the level every visible chunk reaches at least. */
  maxLevel = 6;
  minLevel = 2;
  /** While true new requests and mesh admissions wait: the camera is moving faster than the land should chase it. */
  hold = false;
  stats: TerrainStats = { drawn: 0, built: 0, pending: 0, queued: 0, residentBytes: 0, queuedBytes: 0 };
  private readonly nodes = new Map<string, Node>();
  private readonly roots: Node[] = [];
  #faces!: () => void;
  /** Resolves once the six faces of the whole planet are built. */
  readonly faces = new Promise<void>((r) => { this.#faces = r; });
  private readonly workers: Worker[] = [];
  private readonly idle: Worker[] = [];
  /** The requests each worker has yet to answer. */
  private readonly load = new Map<Worker, number>();
  private readonly inFlight = new Map<number, Node>();
  // Keep a worker occupied until its result is admitted or discarded. At most four results can wait here.
  private readonly completed: { node: Node; chunk: ChunkData; worker: Worker }[] = [];
  private residentBytes = 0;
  private disposed = false;
  private readonly index: [THREE.BufferAttribute, THREE.BufferAttribute];
  private readonly flip: boolean[] = [];
  private nextId = 1;
  private frame = 0;
  private wanted = 0;
  private waiters: (() => void)[] = [];
  private readonly drawn: Node[] = [];

  constructor(material: THREE.Material, workers = Math.max(1, Math.min(4, (navigator.hardwareConcurrency || 4) - 1))) {
    this.material = material;
    this.index = [new THREE.BufferAttribute(chunkIndex(false), 1), new THREE.BufferAttribute(chunkIndex(true), 1)];
    // which faces run clockwise seen from outside
    const a = v3(), b = v3(), c = v3();
    for (let f = 0; f < 6; f++) {
      faceDir(f, -0.5, -0.5, a); faceDir(f, -0.49, -0.5, b); faceDir(f, -0.5, -0.49, c);
      const cx = c.x - a.x, cy = c.y - a.y, cz = c.z - a.z, bx = b.x - a.x, by = b.y - a.y, bz = b.z - a.z;
      const nx = cy * bz - cz * by, ny = cz * bx - cx * bz, nz = cx * by - cy * bx;
      this.flip.push(nx * a.x + ny * a.y + nz * a.z < 0);
    }
    try {
      for (let k = 0; k < Math.min(4, workers); k++) {
        const w = new Worker(new URL('./terrain-worker.ts', import.meta.url), { type: 'module' });
        w.onmessage = (e: MessageEvent<ChunkData>) => this.receive(w, e.data);
        w.onerror = (e) => console.error('terrain worker', e.message);
        this.workers.push(w);
        this.idle.push(w);
      }
    } catch {
      // no workers: chunks are built on the main thread, a few a frame
    }
    // the six faces are asked for first, so there is soon a whole planet to draw; built here, they held the page still
    // for seconds as the game started
    for (let f = 0; f < 6; f++) {
      const n = this.node(f, 0, 0, 0, -40, 220);
      this.roots.push(n);
      if (this.workers.length) this.ask(n, this.workers.reduce((a, b) => ((this.load.get(b) ?? 0) < (this.load.get(a) ?? 0) ? b : a)));
      else this.accept(n, buildChunk({ id: 0, face: f, level: 0, i: 0, j: 0 }));
    }
  }

  /** Sends worker w the request for node n's chunk. */
  private ask(n: Node, w: Worker): void {
    const id = this.nextId++;
    n.state = PENDING;
    this.inFlight.set(id, n);
    this.load.set(w, (this.load.get(w) ?? 0) + 1);
    const i = this.idle.indexOf(w);
    if (i >= 0) this.idle.splice(i, 1);
    w.postMessage({ id, face: n.face, level: n.level, i: n.i, j: n.j } satisfies ChunkRequest);
  }

  private node(face: number, level: number, i: number, j: number, minH: number, maxH: number): Node {
    const key = `${face}/${level}/${i}/${j}`;
    let n = this.nodes.get(key);
    if (n) return n;
    const s = 2 / (1 << level), d = v3();
    faceDir(face, -1 + (i + 0.5) * s, -1 + (j + 0.5) * s, d);
    const dir = new THREE.Vector3(d.x, d.y, d.z);
    // the node's corner, for its angular radius
    faceDir(face, -1 + i * s, -1 + j * s, d);
    const half = Math.acos(Math.min(1, dir.x * d.x + dir.y * d.y + dir.z * d.z)) * 1.05;
    n = { key, face, level, i, j, dir, half, side: (Math.PI / 2 / (1 << level)) * R, state: NONE, mesh: null, minH, maxH, used: performance.now(), needed: 0, bytes: 0, dist: 0, kids: null };
    this.nodes.set(key, n);
    return n;
  }

  private children(n: Node): Node[] {
    if (!n.kids) {
      const l = n.level + 1, i = n.i * 2, j = n.j * 2, lo = n.minH - 6, hi = n.maxH + 18;
      n.kids = [this.node(n.face, l, i, j, lo, hi), this.node(n.face, l, i + 1, j, lo, hi), this.node(n.face, l, i, j + 1, lo, hi), this.node(n.face, l, i + 1, j + 1, lo, hi)];
    }
    return n.kids;
  }

  private accept(n: Node, c: ChunkData): void {
    const bytes = c.position.byteLength + c.normal.byteLength + c.weights.byteLength;
    if (this.residentBytes + bytes > CACHE_BYTES) {
      // Preserve coarse coverage and every parent/child the current view depends on. Pressure may evict unused
      // detail before its usual expiry, but it never uploads a chunk past the byte ceiling.
      const unused = [...this.nodes.values()].filter((k) => k.mesh && k.level > 2 && k.needed !== this.frame)
        .sort((a, b) => a.used - b.used);
      for (const k of unused.slice(0, EVICT_PER_UPDATE)) {
        if (this.residentBytes + bytes <= CACHE_BYTES) break;
        this.release(k);
      }
      if (this.residentBytes + bytes > CACHE_BYTES) { n.state = NONE; return; }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(c.position, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(c.normal, 3));
    const ib = new THREE.InterleavedBuffer(c.weights, WEIGHTS);
    for (let k = 0; k < 4; k++) g.setAttribute(`aW${k}`, new THREE.InterleavedBufferAttribute(ib, 4, k * 4, true));
    g.setIndex(this.index[this.flip[n.face] ? 1 : 0]);
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(c.bound[0], c.bound[1], c.bound[2]), c.bound[3]);
    const m = new THREE.Mesh(g, this.material);
    m.position.set(c.centre[0], c.centre[1], c.centre[2]);
    m.matrixAutoUpdate = false;
    m.updateMatrix();
    m.receiveShadow = true;
    m.castShadow = n.level >= 4;
    m.visible = false;
    m.userData.chunk = n.key;
    this.group.add(m);
    n.mesh = m;
    n.minH = c.minH;
    n.maxH = c.maxH;
    n.state = READY;
    n.bytes = bytes;
    this.residentBytes += bytes;
    if (n.level === 0 && this.roots.every((r) => r.state === READY)) this.#faces();
  }

  private receive(w: Worker, c: ChunkData): void {
    const n = this.inFlight.get(c.id);
    this.inFlight.delete(c.id);
    const load = (this.load.get(w) ?? 1) - 1;
    this.load.set(w, load);
    if (this.disposed) return;
    if (n && n.state === PENDING && n.level > 0) {
      this.completed.push({ node: n, chunk: c, worker: w });
    } else {
      // Startup awaits faces before the first update, so roots cannot wait in the admission queue.
      if (n && n.state === PENDING) this.accept(n, c);
      if (load === 0) this.idle.push(w);
    }
  }

  private release(n: Node): void {
    if (!n.mesh) return;
    this.group.remove(n.mesh);
    n.mesh.geometry.dispose();
    // the renderer keeps what it drew the chunk with (its uniforms, one set for each pass it was drawn in) until the
    // mesh itself is let go; without this a long match piled them up by the tens of thousands
    n.mesh.dispose();
    n.mesh = null;
    this.residentBytes -= n.bytes;
    n.bytes = 0;
    n.state = NONE;
  }

  /** Picks the chunks to draw from where the camera is, and asks for the ones still missing. */
  update(eye: THREE.Vector3): void {
    if (this.disposed) return;
    this.frame++;
    const now = performance.now();
    const camR = eye.length(), cam = eye.clone().divideScalar(camR), camAlt = camR - R;
    const hc = Math.acos(R / Math.max(camR, R + 0.5));
    for (const n of this.drawn) if (n.mesh) n.mesh.visible = false;
    this.drawn.length = 0;
    const want: Node[] = [];
    const visible = (n: Node): boolean => {
      const edge = Math.max(0, Math.acos(Math.min(1, Math.max(-1, cam.dot(n.dir)))) - n.half);
      const hn = n.maxH > 0 ? Math.acos(R / (R + n.maxH)) : 0;
      const vert = camAlt > n.maxH ? camAlt - n.maxH : camAlt < n.minH ? n.minH - camAlt : 0;
      n.dist = Math.hypot(edge * R, vert);
      return edge <= hc + hn + 0.003;
    };
    const visit = (n: Node): void => {
      if (!visible(n)) return;
      n.used = now;
      n.needed = this.frame;
      const split = n.level < this.maxLevel && (n.level < this.minLevel || n.dist < this.detail * n.side) && (n.maxH > -6 || n.level < 3);
      if (split) {
        const kids = this.children(n);
        let ready = true;
        for (const k of kids) {
          if (!visible(k)) continue;
          k.used = now;
          k.needed = this.frame;
          if (k.state === READY) continue;
          ready = false;
          if (k.state === NONE) want.push(k);
        }
        if (ready) { for (const k of kids) visit(k); return; }
      }
      if (n.mesh) { n.mesh.visible = true; this.drawn.push(n); }
    };
    for (const r of this.roots) visit(r);
    // Recheck demand after the camera has moved, before creating geometry. A completed child remains PENDING
    // until admitted, so traversal keeps drawing its ready parent throughout this queue.
    this.completed.sort((a, b) => a.node.dist / a.node.side - b.node.dist / b.node.side);
    let admitted = 0;
    for (let i = 0; i < this.completed.length;) {
      const result = this.completed[i]!;
      const needed = result.node.needed === this.frame;
      if (needed && (this.hold || admitted >= ADMIT_PER_UPDATE)) { i++; continue; }
      this.completed.splice(i, 1);
      if (needed) { this.accept(result.node, result.chunk); admitted++; }
      else result.node.state = NONE;
      this.idle.push(result.worker);
    }
    this.wanted = want.length;
    // nearest and coarsest first
    want.sort((a, b) => a.dist / a.side - b.dist / b.side);
    if (!this.hold) {
      if (this.workers.length) {
        for (const n of want) {
          const w = this.idle.at(-1);
          if (!w) break;
          this.ask(n, w);
        }
      } else {
        for (const n of want.slice(0, ADMIT_PER_UPDATE)) this.accept(n, buildChunk({ id: 0, face: n.face, level: n.level, i: n.i, j: n.j }, CHUNK_N));
      }
    }
    // Expire by elapsed time, including when slow frames mean very few updates. Bound disposal work as well.
    let evicted = 0, built = 0;
    for (const n of this.nodes.values()) if (n.mesh) {
      if (evicted < EVICT_PER_UPDATE && n.level > 2 && n.needed !== this.frame && now - n.used > UNUSED_MS) {
        this.release(n); evicted++;
      } else built++;
    }
    const queuedBytes = this.completed.reduce((sum, { chunk: c }) => sum + c.position.byteLength + c.normal.byteLength + c.weights.byteLength, 0);
    this.stats = { drawn: this.drawn.length, built, pending: this.inFlight.size, queued: want.length + this.completed.length,
      residentBytes: this.residentBytes, queuedBytes };
    if (!this.busy) for (const w of this.waiters.splice(0)) w();
  }

  /** True while chunks the view wants are still being built. */
  get busy(): boolean {
    return this.wanted > 0 || this.inFlight.size > 0 || this.completed.length > 0;
  }

  /** Resolves once every chunk the view wants is built (keep calling update meanwhile). */
  settled(): Promise<void> {
    return this.busy ? new Promise((r) => this.waiters.push(r)) : Promise.resolve();
  }

  dispose(): void {
    this.disposed = true;
    this.completed.length = 0;
    this.inFlight.clear();
    this.idle.length = 0;
    for (const w of this.workers) w.terminate();
    for (const n of this.nodes.values()) this.release(n);
  }
}
