// The frame's shape: what the GPU is handed each frame, which decides whether a tiled GPU (every iPad and iPhone)
// holds its budget. Every pass three begins is recorded against the system that asked for it (the sea, the clouds,
// the scene, the post chain), with the targets it loads from memory as it starts and stores as it ends, and every
// submission and texture copy is counted. Where the device can time passes (timestamp-query), one frame a second is
// timed pass by pass. The app logs the table on the device and the harness prints the same table headless; a frame
// with more passes or submissions than the committed run (shape.json) is flagged.
import committed from './shape.json';

/** The little of the WebGPU API this file touches. */
interface Texture { label: string; width: number; height: number; format: string; createView(d?: unknown): object }
interface Attachment { view: object; loadOp?: string; storeOp?: string; depthLoadOp?: string; depthStoreOp?: string }
interface PassDescriptor {
  label?: string;
  colorAttachments?: (Attachment | null)[];
  depthStencilAttachment?: Attachment;
  timestampWrites?: unknown;
}
interface Buffer { mapAsync(mode: number): Promise<void>; getMappedRange(): ArrayBuffer; unmap(): void }
interface Encoder {
  label: string;
  beginRenderPass(d: PassDescriptor): unknown;
  beginComputePass(d?: PassDescriptor): unknown;
  resolveQuerySet(q: object, first: number, count: number, b: Buffer, offset: number): void;
  copyBufferToBuffer(a: Buffer, ao: number, b: Buffer, bo: number, size: number): void;
  finish(): object;
}
interface Device {
  features: ReadonlySet<string>;
  queue: { submit(buffers: object[]): void };
  createQuerySet(d: { type: string; count: number }): object;
  createBuffer(d: { size: number; usage: number }): Buffer;
  createCommandEncoder(d?: { label?: string }): Encoder;
}
type Proto<T> = { prototype: T };
const GPU = globalThis as unknown as {
  GPUTexture: Proto<Texture>; GPUCommandEncoder: Proto<Encoder>; GPUQueue: Proto<{ submit(b: object[]): void }>;
  GPUBufferUsage: Record<string, number>; GPUMapMode: Record<string, number>;
};

/** Bytes a texel takes in the formats three draws into. */
const TEXEL: Record<string, number> = {
  r8unorm: 1, rg8unorm: 2, r16float: 2, rgba8unorm: 4, 'rgba8unorm-srgb': 4, bgra8unorm: 4, 'bgra8unorm-srgb': 4,
  rg16float: 4, r32float: 4, rgb10a2unorm: 4, rg11b10ufloat: 4, rgba16float: 8, rg32float: 8, rgba32float: 16,
  depth16unorm: 2, depth24plus: 4, depth32float: 4, 'depth24plus-stencil8': 4, 'depth32float-stencil8': 5,
};

export interface Pass {
  kind: 'render' | 'compute';
  system: string;
  /** What it draws into (its first target's name), or the encoder's. */
  label: string;
  /** Its targets' size, and how many it loads from memory and stores back. */
  size: string;
  loads: number;
  stores: number;
  /** The bytes those loads and stores move. */
  bytes: number;
  /** Milliseconds on the GPU, in a timed frame (else -1). */
  gpu: number;
}

export interface Frame { passes: Pass[]; submits: number; copies: number }

/** The committed run's passes and submissions, by screen. */
const COMMITTED = committed as Record<string, { passes: number; submits: number }>;

/** The most passes a timed frame times. */
const MAX_TIMED = 256;
/** Milliseconds between timed frames. */
const TIME_EVERY = 1000;

const blank = (): Frame => ({ passes: [], submits: 0, copies: 0 });

class FrameShape {
  /** The last whole frame, and the last whose passes were timed (null where the device can't time them). */
  last: Frame = blank();
  timed: Frame | null = null;
  #now: Frame = blank();
  #system = 'between';
  /** Frames since the last report, and how many of them were over the committed run. */
  #frames = 0;
  #over = 0;
  #worst: Frame | null = null;
  #reported = new Set<string>();
  /** The screen being drawn, and the passes and submissions of each of its frames so far. */
  #screen = '';
  #counts: [number, number][] = [];

  #device: Device | null = null;
  #query: object | null = null;
  #resolve: Buffer | null = null;
  #readback: Buffer | null = null;
  #timing = false;
  #mapping = false;
  #timedAt = 0;
  /** The log's own work, which is not the frame's. */
  #own = false;

  /** Watches every pass, submission and copy the device is handed from now on. */
  install(device: Device): void {
    this.#device = device;
    const textures = new WeakMap<object, Texture>();
    const { GPUTexture, GPUCommandEncoder, GPUQueue } = GPU;
    const createView = GPUTexture.prototype.createView;
    GPUTexture.prototype.createView = function (this: Texture, d?: unknown) {
      const v = createView.call(this, d);
      textures.set(v, this);
      return v;
    };
    const record = (kind: Pass['kind'], encoder: Encoder, d: PassDescriptor | undefined): Pass => {
      let loads = 0, stores = 0, bytes = 0, label = '', size = '';
      const take = (a: Attachment, load: string | undefined, store: string | undefined) => {
        const t = textures.get(a.view);
        if (!t) return;
        label ||= t.label;
        size ||= `${t.width}×${t.height}`;
        const b = t.width * t.height * (TEXEL[t.format] ?? 4);
        if (load === 'load') { loads++; bytes += b; }
        if (store === 'store') { stores++; bytes += b; }
      };
      for (const a of d?.colorAttachments ?? []) if (a) take(a, a.loadOp, a.storeOp);
      const z = d?.depthStencilAttachment;
      if (z) take(z, z.depthLoadOp, z.depthStoreOp);
      const system = /shadow/i.test(label) ? 'shadows' : this.#system;
      const pass: Pass = { kind, system, label: label || d?.label || encoder.label, size, loads, stores, bytes, gpu: -1 };
      this.#now.passes.push(pass);
      return pass;
    };
    // a timed frame has each pass write the time it starts and ends
    const timed = (d: PassDescriptor | undefined): PassDescriptor | undefined => {
      const i = this.#now.passes.length - 1;
      if (!this.#timing || d?.timestampWrites || i >= MAX_TIMED) return d;
      return { ...d, timestampWrites: { querySet: this.#query, beginningOfPassWriteIndex: 2 * i, endOfPassWriteIndex: 2 * i + 1 } };
    };
    const self = this;
    const beginRender = GPUCommandEncoder.prototype.beginRenderPass;
    GPUCommandEncoder.prototype.beginRenderPass = function (this: Encoder, d: PassDescriptor) {
      if (self.#own) return beginRender.call(this, d);
      record('render', this, d);
      return beginRender.call(this, timed(d)!);
    };
    const beginCompute = GPUCommandEncoder.prototype.beginComputePass;
    GPUCommandEncoder.prototype.beginComputePass = function (this: Encoder, d?: PassDescriptor) {
      if (self.#own) return beginCompute.call(this, d);
      record('compute', this, d);
      return beginCompute.call(this, timed(d));
    };
    const copy = (GPUCommandEncoder.prototype as unknown as Record<string, (...a: unknown[]) => unknown>);
    const copyTexture = copy.copyTextureToTexture;
    copy.copyTextureToTexture = function (this: Encoder, ...a: unknown[]) {
      self.#now.copies++;
      return copyTexture.apply(this, a);
    };
    const submit = GPUQueue.prototype.submit;
    GPUQueue.prototype.submit = function (this: unknown, b: object[]) {
      if (!self.#own) self.#now.submits++;
      return submit.call(this, b);
    };
    if (device.features.has('timestamp-query')) {
      const { GPUBufferUsage: U } = GPU;
      this.#query = device.createQuerySet({ type: 'timestamp', count: 2 * MAX_TIMED });
      this.#resolve = device.createBuffer({ size: 16 * MAX_TIMED, usage: U.QUERY_RESOLVE | U.COPY_SRC });
      this.#readback = device.createBuffer({ size: 16 * MAX_TIMED, usage: U.MAP_READ | U.COPY_DST });
    }
  }

  /** Whether the device can time its passes. */
  get timesPasses(): boolean {
    return this.#query !== null;
  }

  /** The passes begun from now on are this system's. */
  system(name: string): void {
    this.#system = name;
  }

  /** Ends the frame drawn since the last call and starts the next; `screen` is what the frame is compared against. */
  frame(screen: string): void {
    const f = this.#now;
    if (this.#timing) this.#readTimes(f);
    this.last = f;
    this.#now = blank();
    this.#system = 'between';
    if (screen !== this.#screen) {
      // the first frame of a screen carries the last one's leaving, so it starts the next
      this.#screen = screen;
      this.timed = null;
      this.#counts = [];
      return;
    }
    this.#frames++;
    if (this.#counts.length < 1800) this.#counts.push([f.passes.length, f.submits]);
    const c = COMMITTED[screen];
    if (c && (f.passes.length > c.passes || f.submits > c.submits)) {
      this.#over++;
      if (!this.#worst || f.passes.length > this.#worst.passes.length) this.#worst = f;
    }
    const now = performance.now();
    this.#timing = !!this.#query && !this.#mapping && now - this.#timedAt > TIME_EVERY;
    if (this.#timing) this.#timedAt = now;
  }

  /** Resolves the timed frame's timestamps into its passes once the GPU has written them. */
  #readTimes(f: Frame): void {
    const d = this.#device!, n = Math.min(f.passes.length, MAX_TIMED);
    this.#timing = false;
    if (!n) return;
    this.#own = true;
    const e = d.createCommandEncoder({ label: 'frame shape' });
    e.resolveQuerySet(this.#query!, 0, 2 * n, this.#resolve!, 0);
    e.copyBufferToBuffer(this.#resolve!, 0, this.#readback!, 0, 16 * n);
    d.queue.submit([e.finish()]);
    this.#own = false;
    this.#mapping = true;
    const rb = this.#readback!;
    rb.mapAsync(GPU.GPUMapMode.READ).then(() => {
      const t = new BigInt64Array(rb.getMappedRange(), 0, 2 * n);
      // a tiled GPU starts a pass's vertices while the last pass's pixels are still being drawn, so a pass's own
      // start and end overlap the one before it: each is given the time it adds after the last one ended, which sums
      // to the frame's
      let end = t[0];
      for (let i = 0; i < n; i++) {
        const from = t[2 * i] > end ? t[2 * i] : end, ns = Number(t[2 * i + 1] - from);
        // a pass the GPU skipped or a counter that wrapped reads as nothing
        f.passes[i].gpu = ns > 0 && ns < 1e9 ? ns / 1e6 : 0;
        if (t[2 * i + 1] > end) end = t[2 * i + 1];
      }
      rb.unmap();
      this.timed = f;
    }).catch(() => {}).finally(() => { this.#mapping = false; });
  }

  /** The frame as a table: its totals, then by system; with `passes`, every pass too. */
  table(screen: string, f: Frame = this.timed ?? this.last, passes = false): string {
    const ms = (x: number) => (x < 0 ? '–' : x.toFixed(2));
    const mb = (b: number) => (b / 1048576).toFixed(1);
    const sum = (ps: Pass[], k: 'loads' | 'stores' | 'bytes') => ps.reduce((s, p) => s + p[k], 0);
    const gpu = (ps: Pass[]) => (ps.some((p) => p.gpu >= 0) ? ps.reduce((s, p) => s + Math.max(p.gpu, 0), 0) : -1);
    const render = f.passes.filter((p) => p.kind === 'render').length;
    const c = COMMITTED[screen];
    const lines = [
      `frame ${screen}: ${f.passes.length} passes (${render} render, ${f.passes.length - render} compute), ` +
      `${f.submits} submits, ${f.copies} copies, ${sum(f.passes, 'loads')} loads and ${sum(f.passes, 'stores')} stores ` +
      `(${mb(sum(f.passes, 'bytes'))} MB), gpu ${ms(gpu(f.passes))} ms` +
      (c ? `; committed ${c.passes} passes, ${c.submits} submits` : '; no committed run'),
    ];
    const systems = new Map<string, Pass[]>();
    for (const p of f.passes) systems.set(p.system, [...(systems.get(p.system) ?? []), p]);
    lines.push(`  ${'system'.padEnd(12)} passes  load store     MB  gpu ms`);
    for (const [s, ps] of systems) {
      lines.push(`  ${s.padEnd(12)} ${String(ps.length).padStart(6)} ${String(sum(ps, 'loads')).padStart(5)} ` +
        `${String(sum(ps, 'stores')).padStart(5)} ${mb(sum(ps, 'bytes')).padStart(6)} ${ms(gpu(ps)).padStart(7)}`);
    }
    if (passes) {
      lines.push(`  ${'#'.padStart(3)} ${'system'.padEnd(12)} ${'kind'.padEnd(7)} ${'target'.padEnd(34)} ${'size'.padEnd(10)} ld st  gpu ms`);
      f.passes.forEach((p, i) => lines.push(`  ${String(i).padStart(3)} ${p.system.padEnd(12)} ${p.kind.padEnd(7)} ` +
        `${p.label.slice(0, 34).padEnd(34)} ${p.size.padEnd(10)} ${String(p.loads).padStart(2)} ${String(p.stores).padStart(2)} ${ms(p.gpu).padStart(7)}`));
    }
    return lines.join('\n');
  }

  /** The report for the frames since the last: the table (every pass, the first time a screen is reported), and a
   *  flag if any frame had more passes or submissions than the committed run. */
  report(screen: string): string {
    const first = !this.#reported.has(screen);
    this.#reported.add(screen);
    let out = this.table(screen, this.timed ?? this.last, first);
    if (this.#over) {
      const w = this.#worst!, c = COMMITTED[screen];
      out += `\nframe shape over the committed run: ${this.#over} of ${this.#frames} frames on ${screen}, the worst ` +
        `${w.passes.length} passes and ${w.submits} submits against ${c.passes} and ${c.submits}`;
    }
    this.#frames = this.#over = 0;
    this.#worst = null;
    return out;
  }

  /** The passes and submissions of this screen's steady frame (the median of its frames so far), for the harness to
   *  commit: a pass split shows as every frame over it, a one-off rebuild (the sky's tables) as a few. */
  steady(): { passes: number; submits: number } {
    const median = (k: 0 | 1) => this.#counts.map((c) => c[k]).sort((a, b) => a - b)[this.#counts.length >> 1] ?? 0;
    return { passes: median(0), submits: median(1) };
  }
}

export const shape = new FrameShape();
