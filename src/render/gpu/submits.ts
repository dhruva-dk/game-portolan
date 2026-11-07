// Hands three's command buffers to the queue together. three submits every render and every compute on its own, and
// each submission is a trip to the GPU process; here they are held and submitted at once when the task that drew them
// ends, so a frame is a handful of submissions however many passes it has.
//
// What reaches the queue between submissions keeps its place. A buffer written is written before everything held
// runs, which is only safe if nothing held reads it: so every buffer a held pass binds, draws from or copies is noted,
// and writing one of those first submits what is held. Anything else (a texture written, a read back, a buffer or
// texture destroyed) always does.

type Fn = (...a: unknown[]) => unknown;
type Proto = { prototype: Record<string, Fn> };
interface Queue { submit(buffers: unknown[]): void; writeBuffer(buffer: object, ...a: unknown[]): void; [op: string]: unknown }
interface BindGroupEntry { resource: unknown }

const GPU = globalThis as unknown as Record<string, Proto>;

export function batchSubmits(device: { queue: Queue; createBindGroup(d: { entries: BindGroupEntry[] }): object }): void {
  const queue = device.queue, submit = queue.submit.bind(queue);
  let held: unknown[] = [];
  /** The buffers what is held (and what is being recorded) uses. */
  let used = new Set<object>();
  const flush = () => {
    if (!held.length) return;
    const buffers = held;
    held = [];
    used = new Set();
    submit(buffers);
  };
  queue.submit = (buffers: unknown[]) => {
    if (!held.length) queueMicrotask(flush);
    held.push(...buffers);
  };
  const writeBuffer = queue.writeBuffer.bind(queue);
  queue.writeBuffer = (buffer: object, ...a: unknown[]) => {
    if (used.has(buffer)) flush();
    writeBuffer(buffer, ...a);
  };
  const first = (target: Record<string, unknown>, name: string) => {
    const f = target[name] as Fn | undefined;
    if (f) target[name] = function (this: unknown, ...a: unknown[]) { flush(); return f.apply(this, a); };
  };
  for (const op of ['writeTexture', 'copyExternalImageToTexture', 'onSubmittedWorkDone']) first(queue, op);
  for (const op of ['mapAsync', 'destroy']) first(GPU.GPUBuffer.prototype, op);
  first(GPU.GPUTexture.prototype, 'destroy');
  first(GPU.GPUQuerySet.prototype, 'destroy');

  // the buffers in each bind group, noted as it is made
  const groups = new WeakMap<object, object[]>();
  const createBindGroup = device.createBindGroup.bind(device);
  device.createBindGroup = (d: { entries: BindGroupEntry[] }) => {
    const g = createBindGroup(d);
    const buffers: object[] = [];
    for (const e of d.entries) {
      const r = e.resource as { buffer?: object } | object;
      if (r && 'buffer' in r && r.buffer) buffers.push(r.buffer);
      else if (r instanceof (GPU.GPUBuffer as unknown as new () => object)) buffers.push(r);
    }
    groups.set(g, buffers);
    return g;
  };
  // and every use of one: argument `at` of each method is a buffer, or (for setBindGroup) a bind group
  const note = (proto: Record<string, Fn>, name: string, at: number[], group = false) => {
    const f = proto[name];
    if (!f) return;
    proto[name] = function (this: unknown, ...a: unknown[]) {
      for (const i of at) {
        const x = a[i] as object | null | undefined;
        if (!x) continue;
        if (group) for (const b of groups.get(x) ?? []) used.add(b);
        else used.add(x);
      }
      return f.apply(this, a);
    };
  };
  for (const pass of ['GPURenderPassEncoder', 'GPUComputePassEncoder', 'GPURenderBundleEncoder']) {
    const p = GPU[pass]?.prototype;
    if (!p) continue;
    note(p, 'setBindGroup', [1], true);
    note(p, 'setVertexBuffer', [1]);
    note(p, 'setIndexBuffer', [0]);
    note(p, 'drawIndirect', [0]);
    note(p, 'drawIndexedIndirect', [0]);
    note(p, 'dispatchWorkgroupsIndirect', [0]);
  }
  const e = GPU.GPUCommandEncoder.prototype;
  note(e, 'copyBufferToBuffer', [0, 2]);
  note(e, 'clearBuffer', [0]);
  note(e, 'resolveQuerySet', [3]);
  first(e, 'copyBufferToTexture');
  first(e, 'copyTextureToBuffer');
}
