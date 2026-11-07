// The scanned ground near the eye, held on the GPU. Every region paints with five or so scans of its own, eighty-one
// in all, at 2K: far more than a GPU should hold at once. So the GPU keeps a fixed number of slots, two texture
// arrays (surface and detail, see scan-worker.ts), and the scans of the regions round the eye are streamed into them,
// nearest region first, the least recently wanted giving way. Anything whose scan is not in (or too far to tell)
// takes the scan's mean colour, roughness and height, which is what its mips settle to with distance anyway: the
// whole planet is always painted, and only the near ground ever needs the detail.
//
// The slots are filled straight from a worker's decoded mips with writeTexture, so loading one never makes the GPU
// redo every other slot's mips, and no copy of the arrays is kept on the CPU.
import { ExternalTexture, LinearFilter, LinearMipmapLinearFilter, RepeatWrapping, Vector3, Vector4, type WebGPURenderer } from 'three/webgpu';
import { uniformArray, renderGroup } from 'three/tsl';
import { regionAt } from '../../sim/world/index.ts';
import { R } from '../../sim/sphere.ts';
import { LAYERS, ROLE, ROLE_COUNT, SCANS } from './library.ts';
import { SCAN_MEANS } from './means.ts';
import type { ScanRequest, ScanResult } from './scan-worker.ts';

/** Slots on the GPU, and their size: 24 × 1024² × 2 arrays × 4 bytes, with mips, is 270 MB. */
export const SLOTS = 24;
export const SCAN_SIZE = 1024;
const LEVELS = Math.log2(SCAN_SIZE) + 1;
/** How far round the eye the regions whose ground is streamed in reach, metres. */
const REACH = 320;
/** Scans being decoded at once. */
const IN_FLIGHT = 2;
/** How often the wanted scans are worked out again, seconds. */
const EVERY = 0.3;

/** The little of WebGPU used here, which TypeScript's DOM library does not describe. */
interface Device {
  createTexture(d: { size: [number, number, number]; format: string; usage: number; mipLevelCount: number; dimension: '2d' }): unknown;
  queue: {
    writeTexture(dst: { texture: unknown; mipLevel: number; origin: [number, number, number] }, data: Uint8Array, layout: { bytesPerRow: number; rowsPerImage: number }, size: [number, number, number]): void;
  };
}
const TEXTURE_BINDING = 0x04, COPY_DST = 0x02;

/** The order a region's roles come in: what the most ground is painted with first. */
const ORDER = [ROLE.top, ROLE.cliff, ROLE.beach, ROLE.slope, ROLE.wetShore, ROLE.seabed];

export class ScanCache {
  /** Albedo (sRGB) and height; normal x, y, roughness and occlusion. Sampled as arrays, one layer per slot. */
  readonly surface: ExternalTexture;
  readonly detail: ExternalTexture;
  /** Per region × role, three vec4s: (tint, metres per repeat), (far colour, slot or −1), (wetness, normal strength,
   *  mean roughness, mean height). */
  readonly paint = uniformArray(LAYERS.map((l) => new Vector4(...l.tint, l.scale)), 'vec4').setGroup(renderGroup);
  readonly far = uniformArray(LAYERS.map(() => new Vector4(0.2, 0.2, 0.2, -1)), 'vec4').setGroup(renderGroup);
  readonly feel = uniformArray(LAYERS.map((l) => new Vector4(l.wet, l.normalScale, 0.8, 0.5)), 'vec4').setGroup(renderGroup);
  /** Scans resident now, for the stats. */
  resident = 0;

  readonly #device: Device;
  readonly #base: string;
  readonly #slotOf = new Int16Array(SCANS.length).fill(-1);
  readonly #inSlot = new Int16Array(SLOTS).fill(-1);
  readonly #wantedAt = new Float64Array(SLOTS);
  readonly #pending = new Map<number, number>();
  readonly #workers: Worker[] = [];
  readonly #idle: Worker[] = [];
  #clock = 0;
  #since = Infinity;
  #wanted: number[] = [];

  // the base is made absolute here: the build's is relative, and a worker would resolve it against its own script
  constructor(renderer: WebGPURenderer, base = new URL(import.meta.env.BASE_URL, document.baseURI).href) {
    this.#base = base;
    this.#device = (renderer.backend as unknown as { device: Device }).device;
    this.surface = this.#array('rgba8unorm-srgb');
    this.detail = this.#array('rgba8unorm');
    for (let s = 0; s < SCANS.length; s++) this.#paint(s);
    for (let k = 0; k < IN_FLIGHT; k++) {
      const w = new Worker(new URL('./scan-worker.ts', import.meta.url), { type: 'module' });
      w.onmessage = (e: MessageEvent<ScanResult>) => this.#receive(w, e.data);
      w.onerror = (e) => console.error('scan worker', e.message);
      this.#workers.push(w);
      this.#idle.push(w);
    }
  }

  #array(format: string): ExternalTexture {
    const gpu = this.#device.createTexture({
      size: [SCAN_SIZE, SCAN_SIZE, SLOTS], format, usage: TEXTURE_BINDING | COPY_DST, mipLevelCount: LEVELS, dimension: '2d',
    });
    const t = new ExternalTexture(gpu as never);
    (t as unknown as { isArrayTexture: boolean }).isArrayTexture = true;
    t.wrapS = t.wrapT = RepeatWrapping;
    t.minFilter = LinearMipmapLinearFilter;
    t.magFilter = LinearFilter;
    t.anisotropy = 8;
    return t;
  }

  /** Streams in the scans of the regions round the eye. */
  update(eye: Vector3, dt: number): void {
    this.#clock += dt;
    this.#since += dt;
    if (this.#since >= EVERY) {
      this.#since = 0;
      this.#wanted = wantedScans(eye);
      const now = this.#clock;
      for (const s of this.#wanted) {
        const slot = this.#slotOf[s];
        if (slot >= 0) this.#wantedAt[slot] = now;
      }
    }
    for (const s of this.#wanted) {
      if (!this.#idle.length) break;
      if (this.#slotOf[s] >= 0 || [...this.#pending.values()].includes(s)) continue;
      const slot = this.#freeSlot();
      if (slot < 0) break;
      // the scan that was here goes at once, so nothing samples the slot while it is being refilled
      const old = this.#inSlot[slot];
      if (old >= 0) {
        this.#slotOf[old] = -1;
        this.#paint(old);
      }
      this.#inSlot[slot] = -1;
      this.#pending.set(slot, s);
      this.#wantedAt[slot] = this.#clock;
      const w = this.#idle.pop()!;
      const req: ScanRequest = { id: s, base: this.#base, maps: SCANS[s].maps, size: SCAN_SIZE };
      w.postMessage(req);
    }
  }

  /** A slot no wanted scan needs: an empty one, or the one wanted longest ago. */
  #freeSlot(): number {
    const keep = new Set(this.#wanted);
    let best = -1, oldest = Infinity;
    for (let i = 0; i < SLOTS; i++) {
      if (this.#pending.has(i)) continue;
      const s = this.#inSlot[i];
      if (s < 0) return i;
      if (keep.has(s)) continue;
      if (this.#wantedAt[i] < oldest) { oldest = this.#wantedAt[i]; best = i; }
    }
    return best;
  }

  #receive(w: Worker, r: ScanResult): void {
    this.#idle.push(w);
    let slot = -1;
    for (const [k, s] of this.#pending) if (s === r.id) slot = k;
    if (slot < 0) return;
    this.#pending.delete(slot);
    if (r.error) {
      console.error('scan', SCANS[r.id].key, r.error);
      return;
    }
    const write = (t: ExternalTexture, mips: Uint8Array[]) => {
      mips.forEach((data, level) => {
        const s = SCAN_SIZE >> level;
        this.#device.queue.writeTexture({ texture: t.sourceTexture, mipLevel: level, origin: [0, 0, slot] }, data, { bytesPerRow: s * 4, rowsPerImage: s }, [s, s, 1]);
      });
    };
    write(this.surface, r.surface);
    write(this.detail, r.detail);
    this.#inSlot[slot] = r.id;
    this.#slotOf[r.id] = slot;
    this.#paint(r.id);
    this.resident = this.#inSlot.reduce((n, s) => n + (s >= 0 ? 1 : 0), 0);
  }

  /** Writes where a scan is and its far look into every role that paints with it. */
  #paint(scan: number): void {
    const m = SCAN_MEANS[SCANS[scan].key] ?? [0.2, 0.2, 0.2, 0.8, 0.5];
    const slot = this.#slotOf[scan];
    LAYERS.forEach((l, i) => {
      if (l.scan !== scan) return;
      (this.far.array[i] as Vector4).set(m[0] * l.tint[0], m[1] * l.tint[1], m[2] * l.tint[2], slot);
      const f = this.feel.array[i] as Vector4;
      f.z = m[3];
      f.w = m[4];
    });
  }

  /** Resolves when every scan wanted round the eye now is in. */
  async settled(eye: Vector3): Promise<void> {
    const want = wantedScans(eye);
    while (want.some((s) => this.#slotOf[s] < 0)) {
      this.update(eye, EVERY);
      await new Promise((r) => setTimeout(r, 30));
    }
  }

  dispose(): void {
    for (const w of this.#workers) w.terminate();
  }
}

const _p = new Vector3(), _e = new Vector3(), _n = new Vector3();

/** The scans of the regions within reach of the point under the eye, nearest region first, as many as fit. */
function wantedScans(eye: Vector3): number[] {
  const up = _p.copy(eye).normalize();
  const pole = Math.abs(up.y) > 0.99 ? new Vector3(0, 0, 1) : new Vector3(0, 1, 0);
  _e.crossVectors(pole, up).normalize();
  _n.crossVectors(up, _e);
  const near = new Map<number, number>();
  const look = (d: number, b: number) => {
    const th = d / R;
    const q = { x: 0, y: 0, z: 0 };
    const c = Math.cos(th), s = Math.sin(th), cb = Math.cos(b), sb = Math.sin(b);
    q.x = up.x * c + (_n.x * cb + _e.x * sb) * s;
    q.y = up.y * c + (_n.y * cb + _e.y * sb) * s;
    q.z = up.z * c + (_n.z * cb + _e.z * sb) * s;
    const r = regionAt(q);
    if (!near.has(r) || near.get(r)! > d) near.set(r, d);
  };
  look(0, 0);
  for (const d of [50, 110, 180, 250, REACH]) for (let k = 0; k < 24; k++) look(d, (k / 24) * 2 * Math.PI);
  const regions = [...near.entries()].sort((a, b) => a[1] - b[1]).map(([r]) => r);
  const out: number[] = [];
  for (const r of regions) {
    for (const role of ORDER) {
      const s = LAYERS[r * ROLE_COUNT + role].scan;
      if (!out.includes(s)) out.push(s);
    }
  }
  return out.slice(0, SLOTS);
}
