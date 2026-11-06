// The WebGPU renderer: three's WebGPURenderer on the WebGPU backend and nothing else. There is no WebGL path; a
// browser without a WebGPU adapter stops here with a clear error.
//
// The frame is drawn below the screen's resolution and reconstructed to it by the temporal upscaler in post.ts, so the
// renderer's own pixel ratio is the screen's: every pass that wants fewer pixels asks for them itself.
import { WebGPURenderer, NoToneMapping, SRGBColorSpace } from 'three/webgpu';

export interface GpuInfo {
  vendor: string;
  architecture: string;
  /** The device's limits the effects size themselves by. */
  maxWorkgroupStorage: number;
  maxInvocations: number;
  /** True on a phone-class GPU (an iPhone), where the internal resolution and the effects' budgets are trimmed. */
  phone: boolean;
}

/** The share of the screen's pixels the scene is drawn at before the upscaler, for each kind of device. */
export const RENDER_SCALE = { phone: 0.5, tablet: 0.62, desktop: 0.75 } as const;

// The little of the WebGPU API this file touches; three owns the device itself.
interface Adapter {
  features: ReadonlySet<string>;
  limits: Record<string, number>;
  info?: { vendor: string; architecture: string };
}
interface Gpu {
  requestAdapter(options?: { powerPreference?: string }): Promise<Adapter | null>;
}

export async function createRenderer(canvas: HTMLCanvasElement): Promise<{ renderer: WebGPURenderer; info: GpuInfo }> {
  const gpu = (navigator as Navigator & { gpu?: Gpu }).gpu;
  if (!gpu) throw new Error('Portolan needs WebGPU, and this browser has none');
  const adapter = await gpu.requestAdapter({ powerPreference: 'high-performance' });
  if (!adapter) throw new Error('Portolan needs WebGPU, and this device offered no adapter');
  const renderer = new WebGPURenderer({
    canvas, antialias: false, alpha: false, depth: true, stencil: false, powerPreference: 'high-performance',
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
  const backend = renderer.backend as { isWebGPUBackend?: boolean };
  if (!backend.isWebGPUBackend) throw new Error('Portolan needs WebGPU, and three fell back to WebGL');
  renderer.toneMapping = NoToneMapping;
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 3));
  renderer.shadowMap.enabled = true;
  const ai = adapter.info ?? { vendor: '', architecture: '' };
  // an iPhone's screen is short and dense: a landscape height under 500 CSS pixels on a 3x display
  const phone = (devicePixelRatio >= 2.5 && Math.min(innerWidth, innerHeight) < 500) || /iPhone/.test(navigator.userAgent);
  return {
    renderer,
    info: {
      vendor: ai.vendor, architecture: ai.architecture,
      maxWorkgroupStorage: adapter.limits.maxComputeWorkgroupStorageSize,
      maxInvocations: adapter.limits.maxComputeInvocationsPerWorkgroup,
      phone,
    },
  };
}
