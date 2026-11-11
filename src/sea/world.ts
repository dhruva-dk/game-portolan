// The planet and what every shader on it shares: its radius, the clock, the sun and the moon, the camera.
//
// The planet's centre is the world origin and nothing assumes a global up: every shader takes its own up from where
// it is on the sphere, which is how one sun leaves half the planet in night and how the same shaders hold from the
// deck and from orbit.
import { Matrix4, Vector2, Vector3 } from 'three/webgpu';
import { renderGroup, uniform } from 'three/tsl';

/**
 * The planet's radius, metres. From a deck 10 m up the horizon is 173 m off and dips 6.6° below level. `?R=` sets
 * another, to see how the land reads on a flatter world (the land prototype's question; a render-only flattening
 * would give the look without changing the sailing).
 */
export const R = Number(new URLSearchParams(location.search || (import.meta.env.VITE_SEA_QUERY as string | undefined) || '').get('R')) || 1500;

/** Uniforms every shader reads alike: one buffer bound per render instead of a copy written into every draw. */
export function shared<T extends object>(uniforms: T): T {
  for (const u of Object.values(uniforms) as { isNode?: boolean; setGroup(g: unknown): unknown }[]) if (u.isNode) u.setGroup(renderGroup);
  return uniforms;
}

export const U = shared({
  /** Seconds on the shared clock, and since the last frame. */
  time: uniform(0),
  dt: uniform(1 / 60),
  /** Toward the sun and the moon, unit vectors in the world. */
  sunDir: uniform(new Vector3(0, 1, 0)),
  moonDir: uniform(new Vector3(0, -1, 0)),
  /** Irradiance each brings to the top of the air, in the scene's linear units. */
  sunLight: uniform(new Vector3(1, 1, 1)),
  moonLight: uniform(new Vector3(0, 0, 0)),
  /** The camera, for passes that are not draws (the air is traced in compute). */
  eye: uniform(new Vector3(0, R + 10, 0)),
  /** Clip space back to a world direction: the inverse of the view-projection without the eye's translation. */
  unproject: uniform(new Matrix4()),
  /** How much to scale the scene's light by for the screen (the eye's adaptation). */
  exposure: uniform(1),
  /** The wind at the sea, m/s, as a direction in the waves' first frame (x, z) and its speed. */
  wind: uniform(new Vector2(1, 0)),
});

// ---------------------------------------------------------------- the sphere, on the CPU

/** p moved `metres` along the great circle through p in direction t (both unit; t tangent at p). t is carried along. */
export function sail(p: Vector3, t: Vector3, metres: number): void {
  const a = metres / R, c = Math.cos(a), s = Math.sin(a);
  const px = p.x, py = p.y, pz = p.z;
  p.set(px * c + t.x * s, py * c + t.y * s, pz * c + t.z * s).normalize();
  t.set(t.x * c - px * s, t.y * c - py * s, t.z * c - pz * s);
  t.addScaledVector(p, -t.dot(p)).normalize();
}

/** Turns tangent t about the up p by `angle` radians, positive to port (counter-clockwise seen from above). */
export function turn(p: Vector3, t: Vector3, angle: number): void {
  const side = TMP.crossVectors(p, t);
  const c = Math.cos(angle), s = Math.sin(angle);
  t.multiplyScalar(c).addScaledVector(side, s).normalize();
}
const TMP = new Vector3();

/** Some tangent at p, the same one for nearby p: east of the planet's axis, or along x at the poles. */
export function eastAt(p: Vector3, out: Vector3): Vector3 {
  out.set(-p.z, 0, p.x);
  if (out.lengthSq() < 1e-8) out.set(1, 0, 0);
  return out.addScaledVector(p, -out.dot(p)).normalize();
}

// ---------------------------------------------------------------- the sky's bodies

/** The planet's axis is tilted toward the sun by this much, so the day runs from pole to pole a little off true. */
const TILT = 0.35;

/**
 * Where the sun and the moon stand, given a day's progress (0 to 1, one turn of the planet). The planet turns about y;
 * equivalently the sun turns round it. The moon runs a little slower and on a tilted path, so it is sometimes up by
 * day and sometimes away for a whole night.
 */
export function bodies(day: number, sun: Vector3, moon: Vector3): void {
  const a = day * Math.PI * 2;
  sun.set(Math.cos(a) * Math.cos(TILT), Math.sin(TILT), Math.sin(a) * Math.cos(TILT)).normalize();
  const b = a * 0.966 + 2.6, m = 0.45;
  moon.set(Math.cos(b) * Math.cos(m), Math.sin(-m) * Math.cos(b * 0.5), Math.sin(b) * Math.cos(m)).normalize();
}

/** The day's progress that puts the sun at `hour` (0–24, noon at 12) over the point p. */
export function dayFor(hour: number, p: Vector3): number {
  // the meridian through p, measured as bodies() measures the sun
  const lon = Math.atan2(p.z, p.x);
  return ((lon + (hour / 24 - 0.5) * Math.PI * 2) / (Math.PI * 2) + 2) % 1;
}

// ---------------------------------------------------------------- mips for storage textures

const MIP_SHADER = /* wgsl */ `
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

type GpuTexture = { createView(d: object): object; width: number; height: number; depthOrArrayLayers: number; mipLevelCount: number };
type GpuPass = { setPipeline(p: object): void; setBindGroup(i: number, g: object): void; dispatchWorkgroups(x: number, y: number, z: number): void; end(): void };
interface GpuDevice {
  createShaderModule(d: object): object;
  createComputePipeline(d: object): { getBindGroupLayout(i: number): object };
  createBindGroup(d: object): object;
  createCommandEncoder(d?: object): { beginComputePass(d?: object): GpuPass; finish(): object };
  queue: { submit(b: object[]): void };
}

/**
 * A storage array texture's mip chain rebuilt in one compute pass, each level a 2×2 box of the one above, every layer
 * at once. three would rebuild a written storage texture's mips with a render pass per level per layer (96 a frame
 * for the sea), so the texture is made with mipmapsAutoUpdate off and this runs after whatever writes it. It works
 * below three, on the device three made, because WebGPU will not sample and store one texture in a dispatch.
 */
export class MipChain {
  readonly #renderer: { backend: unknown };
  readonly #texture: object;
  #levels: { group: object; x: number; y: number; z: number }[] | null = null;
  #pipeline: object | null = null;

  constructor(renderer: { backend: unknown }, texture: object) {
    this.#renderer = renderer;
    this.#texture = texture;
  }

  run(): void {
    const backend = this.#renderer.backend as { device: GpuDevice; get(o: object): { texture?: GpuTexture } };
    const device = backend.device;
    if (!this.#levels) {
      const t = backend.get(this.#texture).texture;
      if (!t) return;
      const pipeline = device.createComputePipeline({
        label: 'mips', layout: 'auto', compute: { module: device.createShaderModule({ code: MIP_SHADER }), entryPoint: 'main' },
      });
      const view = (l: number) => t.createView({ dimension: '2d-array', baseMipLevel: l, mipLevelCount: 1 });
      this.#levels = [];
      for (let l = 1; l < t.mipLevelCount; l++) {
        const w = Math.max(1, t.width >> l), h = Math.max(1, t.height >> l);
        const group = device.createBindGroup({ layout: pipeline.getBindGroupLayout(0), entries: [{ binding: 0, resource: view(l - 1) }, { binding: 1, resource: view(l) }] });
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
