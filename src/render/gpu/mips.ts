// A storage texture's mip chain rebuilt in one compute pass: each level a 2×2 box down from the one above, every layer
// at once, a dispatch a level. three rebuilds a storage texture's mips after every write with a render pass for each
// level of each layer, which for the sea's twelve layers was 96 passes a frame.
import type { Texture, WebGPURenderer } from 'three/webgpu';

const SHADER = /* wgsl */ `
@group(0) @binding(0) var above: texture_2d_array<f32>;
@group(0) @binding(1) var level: texture_storage_2d_array<rgba16float, write>;

@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) id: vec3u) {
  let size = textureDimensions(level);
  if (id.x >= size.x || id.y >= size.y) { return; }
  let p = vec2i(id.xy) * 2;
  let l = i32(id.z);
  let sum = textureLoad(above, p, l, 0) + textureLoad(above, p + vec2i(1, 0), l, 0)
    + textureLoad(above, p + vec2i(0, 1), l, 0) + textureLoad(above, p + vec2i(1, 1), l, 0);
  textureStore(level, vec2i(id.xy), l, sum * 0.25);
}`;

/** One level of a mip chain made on the CPU: every layer's texels, layer after layer. */
export interface CpuMip { data: Uint8Array; width: number; height: number }

/**
 * The whole mip chain of an 8-bit RGBA array texture, built here: the base first (as three's `mipmaps` has it), then
 * each level a 2×2 box down from the one above, for every layer. Given as a data array texture's `mipmaps`, the
 * levels are written to the device as they are (renderer.ts), where three would build them with a render pass per
 * level per layer.
 */
export function cpuMips(base: Uint8Array, width: number, height: number, layers: number): CpuMip[] {
  const out: CpuMip[] = [{ data: base, width, height }];
  let above = base, w = width, h = height;
  while (w > 1 || h > 1) {
    const nw = Math.max(1, w >> 1), nh = Math.max(1, h >> 1);
    const level = new Uint8Array(nw * nh * layers * 4);
    for (let l = 0; l < layers; l++) {
      const from = l * w * h * 4, to = l * nw * nh * 4;
      for (let y = 0; y < nh; y++) {
        const y0 = Math.min(2 * y, h - 1), y1 = Math.min(2 * y + 1, h - 1);
        for (let x = 0; x < nw; x++) {
          const x0 = Math.min(2 * x, w - 1), x1 = Math.min(2 * x + 1, w - 1);
          const a = from + (y0 * w + x0) * 4, b = from + (y0 * w + x1) * 4, c = from + (y1 * w + x0) * 4, d = from + (y1 * w + x1) * 4;
          const o = to + (y * nw + x) * 4;
          for (let k = 0; k < 4; k++) level[o + k] = (above[a + k] + above[b + k] + above[c + k] + above[d + k] + 2) >> 2;
        }
      }
    }
    out.push({ data: level, width: nw, height: nh });
    above = level;
    w = nw;
    h = nh;
  }
  return out;
}

interface GpuTexture { width: number; height: number; depthOrArrayLayers: number; mipLevelCount: number; format: string; createView(d: object): object }
interface Pass { setPipeline(p: object): void; setBindGroup(i: number, g: object): void; dispatchWorkgroups(x: number, y: number, z: number): void; end(): void }
interface Device {
  createShaderModule(d: { code: string }): object;
  createComputePipeline(d: object): { getBindGroupLayout(i: number): object };
  createBindGroup(d: object): object;
  createCommandEncoder(d?: object): { beginComputePass(d?: object): Pass; finish(): object };
  queue: { submit(b: object[]): void };
}

export class MipChain {
  readonly #renderer: WebGPURenderer;
  readonly #texture: Texture;
  #levels: { group: object; x: number; y: number; z: number }[] | null = null;
  #pipeline: object | null = null;

  /** For an rgba16float storage array texture with a full chain of mips that three doesn't rebuild itself
   *  (mipmapsAutoUpdate off). */
  constructor(renderer: WebGPURenderer, texture: Texture) {
    this.#renderer = renderer;
    this.#texture = texture;
  }

  /** Rebuilds the chain from level 0: run after whatever writes it, once three has made the texture. */
  run(): void {
    const backend = this.#renderer.backend as unknown as { device: Device; get(o: object): { texture?: GpuTexture } };
    const device = backend.device;
    if (!this.#levels) {
      const t = backend.get(this.#texture).texture;
      if (!t) return;
      const pipeline = device.createComputePipeline({
        label: 'mips', layout: 'auto', compute: { module: device.createShaderModule({ code: SHADER }), entryPoint: 'main' },
      });
      const view = (l: number) => t.createView({ dimension: '2d-array', baseMipLevel: l, mipLevelCount: 1 });
      this.#levels = [];
      for (let l = 1; l < t.mipLevelCount; l++) {
        const w = Math.max(1, t.width >> l), h = Math.max(1, t.height >> l);
        const group = device.createBindGroup({
          layout: pipeline.getBindGroupLayout(0),
          entries: [{ binding: 0, resource: view(l - 1) }, { binding: 1, resource: view(l) }],
        });
        this.#levels.push({ group, x: Math.ceil(w / 8), y: Math.ceil(h / 8), z: t.depthOrArrayLayers });
      }
      this.#pipeline = pipeline;
    }
    const encoder = device.createCommandEncoder({ label: 'mips' });
    const pass = encoder.beginComputePass({ label: 'mips' });
    pass.setPipeline(this.#pipeline!);
    for (const l of this.#levels) {
      pass.setBindGroup(0, l.group);
      pass.dispatchWorkgroups(l.x, l.y, l.z);
    }
    pass.end();
    device.queue.submit([encoder.finish()]);
  }
}
