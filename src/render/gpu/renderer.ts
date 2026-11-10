// The WebGPU renderer: three's WebGPURenderer on the WebGPU backend and nothing else. There is no WebGL path; a
// browser without a WebGPU adapter stops here with a clear error.
//
// The scene is drawn at a fixed share of the canvas and brought up to it with a bilinear sample (post.ts); the canvas
// holds the screen's pixels up to three quarters of the floor's panel each way. Every pass that wants fewer pixels
// asks for them itself.
import { Matrix3, TextureNode, WebGPURenderer, NoToneMapping, SRGBColorSpace, type Material, type Node } from 'three/webgpu';
import { tightenPrivates } from './wgsl.ts';
import { shape } from './shape.ts';
import { shouldReload } from './recover.ts';
import { batchSubmits } from './submits.ts';
import type { CpuMip } from './mips.ts';

export interface GpuInfo {
  vendor: string;
  architecture: string;
  /** The device's limits the effects size themselves by. */
  maxWorkgroupStorage: number;
  maxInvocations: number;
  /** The kind of device, which sets the share of the screen the scene is drawn at. */
  form: keyof typeof RENDER_SCALE;
}

// three gives a texture node made without uvs, and every sample taken of one, a uniform for its texture's uv transform,
// kept among each object's own uniforms and brought up to date for every object drawn. The planet's shaders take
// samples by the hundred and hardly any of their textures has a transform: on the iPad these uniforms were most of
// what each draw sent to the GPU. A texture node transforms its uvs only if its texture has a transform.
const IDENTITY = new Matrix3();
const transformed = TextureNode.prototype.getTransformedUV as (this: TextureNode, uv: Node) => Node;
TextureNode.prototype.getTransformedUV = function (this: TextureNode, uv: Node): Node {
  const t = this.value;
  if (t.matrixAutoUpdate) t.updateMatrix();
  return t.matrix.equals(IDENTITY) ? uv : transformed.call(this, uv);
} as typeof TextureNode.prototype.getTransformedUV;

// A shadow pass draws every object with one material, which three dresses in each object's own before drawing it:
// its alphaTest among the rest, and a material's version goes up whenever its alphaTest crosses zero. The plants' cut
// leaves have one and hulls and ground have none, so in every pass the version went up between one kind and the other,
// and three worked the material's whole cache key out again for each object drawn after (about a sixth of the CPU's
// frame in a fight). The shadow material's alphaTest now changes nothing, and its version goes up instead when an
// object's own material is not what it was the last time that object cast a shadow: what three rebuilds for.
const casters = new WeakMap<object, { material: Material; version: number }>();
const quiet = new WeakSet<Material>();
type RenderObject = (this: WebGPURenderer, object: object, scene: { overrideMaterial: Material | null }, camera: unknown, geometry: unknown, material: Material, ...rest: unknown[]) => void;
const renderObject = (WebGPURenderer.prototype as unknown as { renderObject: RenderObject }).renderObject;
(WebGPURenderer.prototype as unknown as { renderObject: RenderObject }).renderObject = function (object, scene, camera, geometry, material, ...rest) {
  const over = scene.overrideMaterial as (Material & { isShadowPassMaterial?: boolean; _alphaTest: number }) | null;
  if (over?.isShadowPassMaterial && material.allowOverride) {
    if (!quiet.has(over)) {
      quiet.add(over);
      Object.defineProperty(over, 'alphaTest', { get() { return this._alphaTest; }, set(v: number) { this._alphaTest = v; }, configurable: true });
    }
    const was = casters.get(object);
    if (!was || was.material !== material || was.version !== material.version) {
      over.needsUpdate = true;
      casters.set(object, { material, version: material.version });
    }
  }
  renderObject.call(this, object, scene, camera, geometry, material, ...rest);
};

/** The share of the canvas's width and height the scene is drawn at, for each kind of device. */
export const RENDER_SCALE = { phone: 0.6, tablet: 0.66, desktop: 0.9 } as const;

/** The most pixels the canvas holds: three quarters of the width and height of an M1 iPad Air's panel, the floor. The
 *  screen stretches the canvas to fit, and the chart drawn over it is the page's, at the panel's own pixels. */
const MAX_PIXELS = 1770 * 1230;

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
const YIELD_AFTER = 4;
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

/** The little of three's texture utils this file reaches into. */
interface ArrayTexture { isDataArrayTexture?: boolean; mipmaps: unknown[]; flipY: boolean; layerUpdates?: Set<number>; image: { depth: number } }
interface TextureUtils {
  updateTexture(texture: ArrayTexture, options: unknown): void;
  _copyBufferToTexture(image: CpuMip, textureGPU: object, descriptor: object, originDepth: number, flipY: boolean, depth: number, mipLevel: number): void;
}

function writeArrayMips(renderer: WebGPURenderer): void {
  const backend = renderer.backend as unknown as { textureUtils: TextureUtils; get(o: object): { texture?: object; textureDescriptorGPU?: object } };
  const utils = backend.textureUtils, update = utils.updateTexture.bind(utils);
  utils.updateTexture = (texture, options) => {
    // the layers three is about to write (all, if none in particular); it clears the set as it goes
    const layers = texture.layerUpdates?.size ? [...texture.layerUpdates] : null;
    update(texture, options);
    if (!texture.isDataArrayTexture || !texture.mipmaps.length) return;
    const data = backend.get(texture);
    if (!data.texture || !data.textureDescriptorGPU) return;
    const which = layers ?? [...Array(texture.image.depth).keys()];
    // (the base, mipmaps[0], three has written; it reads layer `depth` of each level's data itself)
    texture.mipmaps.forEach((m, i) => {
      if (i) for (const l of which) utils._copyBufferToTexture(m as CpuMip, data.texture!, data.textureDescriptorGPU!, l, texture.flipY, l, i);
    });
  };
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
  const backend = renderer.backend as unknown as { isWebGPUBackend?: boolean; device: Device };
  if (!backend.isWebGPUBackend) throw new Error('Portolan needs WebGPU, and three fell back to WebGL');
  // every shader three writes passes through here on its way to the device (wgsl.ts)
  const device = backend.device, compile = device.createShaderModule.bind(device);
  device.createShaderModule = (d: ShaderSource) => compile({ ...d, code: tightenPrivates(d.code) });
  // a data array texture that brings its own mips (mips.ts cpuMips) has them written level by level: three uploads only
  // an array's base level and builds the rest with a render pass per level per layer, which for the ships' ninety-one
  // emblems was 637 passes in one frame
  writeArrayMips(renderer);
  // and every pass, submission and copy is counted for the frame log (shape.ts)
  shape.install(backend.device as unknown as Parameters<typeof shape.install>[0]);
  // and handed to the queue together (submits.ts)
  batchSubmits(backend.device as unknown as Parameters<typeof batchSubmits>[0]);
  // a lost device says what it was last given: by its lost promise, and (WebKit does not always settle that) by the
  // first encoder it refuses
  const gone = (how: string) => {
    console.error(`GPU lost (${how}); the last pass submitted: ${shape.lastSubmitted}; ${shape.memory}`);
    // nothing brings a lost device back: start again at the title (a test wants to see the failure instead)
    if (!navigator.webdriver && shouldReload(sessionStorage, Date.now())) location.reload();
  };
  (backend.device as unknown as { lost: Promise<{ reason: string; message: string }> }).lost.then((info) => {
    if (info.reason !== 'destroyed') gone(`${info.reason || 'unknown'}: ${info.message}`);
  });
  const dev = device as unknown as { createCommandEncoder(d?: unknown): unknown }, encoder = dev.createCommandEncoder.bind(dev);
  let said = false;
  dev.createCommandEncoder = (d?: unknown) => {
    try {
      return encoder(d);
    } catch (e) {
      if (!said) { said = true; gone(String(e)); }
      throw e;
    }
  };
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
