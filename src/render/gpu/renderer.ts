// The WebGPU renderer: three's WebGPURenderer on the WebGPU backend and nothing else. There is no WebGL path; a
// browser without a WebGPU adapter stops here with a clear error.
//
// The frame is drawn below the screen's resolution and reconstructed to it by the temporal upscaler in post.ts, so the
// renderer's own pixel ratio is the screen's, up to the floor's panel: every pass that wants fewer pixels asks for
// them itself.
import { WebGPURenderer, NoToneMapping, SRGBColorSpace } from 'three/webgpu';
import { tightenPrivates } from './wgsl.ts';
import { shape } from './shape.ts';
import { batchSubmits } from './submits.ts';

export interface GpuInfo {
  vendor: string;
  architecture: string;
  /** The device's limits the effects size themselves by. */
  maxWorkgroupStorage: number;
  maxInvocations: number;
  /** The kind of device, which sets the share of the screen the scene is drawn at. */
  form: keyof typeof RENDER_SCALE;
}

/** The share of the screen's pixels the scene is drawn at before the upscaler, for each kind of device. */
export const RENDER_SCALE = { phone: 0.5, tablet: 0.62, desktop: 0.75 } as const;

/** The most pixels the canvas holds: the panel of an M1 iPad Air, the floor. A screen set to show more than its panel
 *  has (an iPad's More Space), or a larger panel, gets this many and is stretched to fit, rather than every pass after
 *  the upscaler paying for pixels the floor can't afford. */
const MAX_PIXELS = 2360 * 1640;

/** The canvas's pixels per CSS pixel for a canvas w × h CSS pixels. */
export const pixelRatio = (w: number, h: number): number =>
  Math.min(devicePixelRatio || 1, 3, Math.sqrt(MAX_PIXELS / Math.max(1, w * h)));

// The little of the WebGPU API this file touches; three owns the device itself.
interface Adapter {
  features: ReadonlySet<string>;
  limits: Record<string, number>;
  info?: { vendor: string; architecture: string };
}
interface Gpu {
  requestAdapter(options?: { powerPreference?: string }): Promise<Adapter | null>;
}
interface ShaderSource { code: string }
interface Device { createShaderModule(d: ShaderSource): unknown }

// Three builds materials ahead of drawing them (compileAsync), yielding to the page after every step of every one,
// through scheduler.yield where the browser has it and otherwise a whole animation frame each time, which on Safari
// stretched the building of the planet's materials over minutes. There a yield gives the page back only once the
// building has held it for YIELD_AFTER ms, by a message to the page's own task queue: the title is drawn between
// stretches that long, and the building goes on as soon as it is.
const YIELD_AFTER = 40;
const S = globalThis as unknown as { scheduler?: { yield?: () => Promise<void> } };
if (!S.scheduler?.yield) {
  const channel = new MessageChannel(), waiting: (() => void)[] = [];
  let since = performance.now();
  channel.port1.onmessage = () => { since = performance.now(); waiting.shift()?.(); };
  S.scheduler = {
    ...S.scheduler,
    yield: () => (performance.now() - since < YIELD_AFTER ? Promise.resolve() : new Promise<void>((r) => { waiting.push(r); channel.port2.postMessage(0); })),
  };
}

export async function createRenderer(canvas: HTMLCanvasElement): Promise<{ renderer: WebGPURenderer; info: GpuInfo }> {
  const gpu = (navigator as Navigator & { gpu?: Gpu }).gpu;
  if (!gpu) throw new Error('Portolan needs WebGPU, and this browser has none');
  const adapter = await gpu.requestAdapter({ powerPreference: 'high-performance' });
  if (!adapter) throw new Error('Portolan needs WebGPU, and this device offered no adapter');
  const renderer = new WebGPURenderer({
    canvas, antialias: false, alpha: false, depth: true, stencil: false, powerPreference: 'high-performance',
    // the bounce light's buffer is packed floats (post.ts)
    requiredFeatures: ['rg11b10ufloat-renderable'].filter((f) => adapter.features.has(f)),
    requiredLimits: {
      maxComputeWorkgroupStorageSize: adapter.limits.maxComputeWorkgroupStorageSize,
      maxComputeInvocationsPerWorkgroup: adapter.limits.maxComputeInvocationsPerWorkgroup,
      maxStorageBuffersPerShaderStage: adapter.limits.maxStorageBuffersPerShaderStage,
      maxStorageTexturesPerShaderStage: adapter.limits.maxStorageTexturesPerShaderStage,
      maxSampledTexturesPerShaderStage: adapter.limits.maxSampledTexturesPerShaderStage,
      maxColorAttachmentBytesPerSample: adapter.limits.maxColorAttachmentBytesPerSample,
    },
  } as ConstructorParameters<typeof WebGPURenderer>[0]);
  await renderer.init();
  const backend = renderer.backend as unknown as { isWebGPUBackend?: boolean; device: Device };
  if (!backend.isWebGPUBackend) throw new Error('Portolan needs WebGPU, and three fell back to WebGL');
  // every shader three writes passes through here on its way to the device (wgsl.ts)
  const device = backend.device, compile = device.createShaderModule.bind(device);
  device.createShaderModule = (d: ShaderSource) => compile({ ...d, code: tightenPrivates(d.code) });
  // and every pass, submission and copy is counted for the frame log (shape.ts)
  shape.install(backend.device as unknown as Parameters<typeof shape.install>[0]);
  // and handed to the queue together (submits.ts)
  batchSubmits(backend.device as unknown as Parameters<typeof batchSubmits>[0]);
  // a lost device says what it was last given
  (backend.device as unknown as { lost: Promise<{ reason: string; message: string }> }).lost.then((info) => {
    if (info.reason !== 'destroyed') console.error(`GPU lost (${info.reason || 'unknown'}: ${info.message}); the last pass submitted: ${shape.lastSubmitted}`);
  });
  renderer.toneMapping = NoToneMapping;
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.setPixelRatio(pixelRatio(innerWidth, innerHeight));
  renderer.shadowMap.enabled = true;
  const ai = adapter.info ?? { vendor: '', architecture: '' };
  // an iPhone's screen is short and dense: a landscape height under 500 CSS pixels on a 3x display
  const phone = (devicePixelRatio >= 2.5 && Math.min(innerWidth, innerHeight) < 500) || /iPhone/.test(navigator.userAgent);
  // an iPad calls itself a Mac, and is told apart by its touch screen
  const form = phone ? 'phone' : navigator.maxTouchPoints > 0 ? 'tablet' : 'desktop';
  return {
    renderer,
    info: {
      vendor: ai.vendor, architecture: ai.architecture,
      maxWorkgroupStorage: adapter.limits.maxComputeWorkgroupStorageSize,
      maxInvocations: adapter.limits.maxComputeInvocationsPerWorkgroup,
      form,
    },
  };
}
