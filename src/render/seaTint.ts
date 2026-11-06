// Each region's water: its colour in deep water and how clear it is, blended over the planet across the regions'
// borders like the land, as a table by latitude and longitude. The WebGL water reads it through planet.ts seaTint;
// the GPU planet reads it through waterAt, as the deep water's own reflectance and the extinction along a path
// through it.
import * as THREE from 'three';
import type { Node } from 'three/webgpu';
import { asin, atan, clamp, float, floor, fract, ivec2, mix, mod, texture, vec2, vec3, vec4 } from 'three/tsl';
import { v3, type V3 as SimV3 } from '../sim/math.ts';
import { REGIONS, regionMix, type RegionId, type RegionMix } from '../sim/world/index.ts';

type V3 = Node<'vec3'>;
type V4 = Node<'vec4'>;

/** Each region's sea: its colour in deep water (sRGB) and how clear it is (0 murky to 1 glass). */
export const REGION_WATER: Record<RegionId, [number, number]> = {
  iceCrown: [0x0e3448, 0.75], fjords: [0x0c3036, 0.5], mistwood: [0x15342c, 0.35], spires: [0x0f3a46, 0.6],
  narrows: [0x1c3c38, 0.45], basaltStacks: [0x0b2832, 0.5], kelpShallows: [0x1e3c20, 0.4], blossomRun: [0x114450, 0.65],
  glassSea: [0x1c9098, 1], jadeShoals: [0x22805e, 0.85], coralAtolls: [0x1696a8, 0.95], spiceIsles: [0x125650, 0.6],
  fireArchipelago: [0x16262c, 0.45], weepingIsle: [0x18382c, 0.4], mangroveLabyrinth: [0x32381a, 0.15], maelstrom: [0x0d1e2a, 0.4],
};

const TINT_W = 512, TINT_H = 256;

/** The sea's colour and clarity over the planet, blended across region borders like the land. */
export function seaTintTexture(): THREE.DataTexture {
  const tex = new THREE.DataTexture(new Uint8Array(TINT_W * TINT_H * 4), TINT_W, TINT_H, THREE.RGBAFormat, THREE.UnsignedByteType);
  tex.magFilter = tex.minFilter = THREE.LinearFilter;
  tex.wrapS = THREE.RepeatWrapping;
  tex.colorSpace = THREE.NoColorSpace;
  return tex;
}

export function fillSeaTint(tex: THREE.DataTexture): void {
  const d = tex.image.data as Uint8Array, p = v3(), mix: RegionMix = { a: 0, b: 0, t: 0 }, c = new THREE.Color(), c2 = new THREE.Color();
  // linear colours in [0, 0.25] stored ×4 so dark seas keep their precision
  const cols = REGIONS.map((r) => new THREE.Color().setHex(REGION_WATER[r.id][0]));
  for (let y = 0; y < TINT_H; y++) {
    const lat = ((y + 0.5) / TINT_H - 0.5) * Math.PI;
    for (let x = 0; x < TINT_W; x++) {
      const lon = ((x + 0.5) / TINT_W - 0.5) * Math.PI * 2;
      p.x = Math.cos(lat) * Math.cos(lon); p.y = Math.sin(lat); p.z = -Math.cos(lat) * Math.sin(lon);
      regionMix(p, mix);
      c.copy(cols[mix.a]).lerp(c2.copy(cols[mix.b]), mix.t);
      const clear = REGION_WATER[REGIONS[mix.a].id][1] * (1 - mix.t) + REGION_WATER[REGIONS[mix.b].id][1] * mix.t;
      const o = (y * TINT_W + x) * 4;
      d[o] = Math.min(255, c.r * 4 * 255); d[o + 1] = Math.min(255, c.g * 4 * 255); d[o + 2] = Math.min(255, c.b * 4 * 255);
      d[o + 3] = clear * 255;
    }
  }
  tex.needsUpdate = true;
}

// ---------------------------------------------------------------- the GPU planet's

/** The deep water's diffuse reflectance, as a share of its colour as the regions give it. */
const DEEP = 0.5;
/** Extinction per metre through the clearest water (near pure water's own: red goes first) and the murkiest (silt
 *  and the stain of rotting leaves, which take the blue as well). */
const CLEAR: [number, number, number] = [0.42, 0.06, 0.035];
const MURKY: [number, number, number] = [0.55, 0.32, 0.5];

let gpuTint: THREE.DataTexture | null = null, gpuTexels: THREE.DataTexture | null = null;

function tintTexture(): THREE.DataTexture {
  if (!gpuTint) {
    gpuTint = seaTintTexture();
    fillSeaTint(gpuTint);
  }
  return gpuTint;
}

/** The sea's colour (linear) and clarity over `up`. With `loads`, for a material out of samplers, the table is
 *  filtered by hand from four texel loads of a copy WebGPU reads without a sampler. */
function tintAt(up: V3, loads: boolean): V4 {
  const tex = tintTexture();
  const uv = vec2(atan(up.z.negate(), up.x).mul(0.5 / Math.PI).add(0.5), asin(clamp(up.y, -1, 1)).mul(1 / Math.PI).add(0.5));
  let t: V4;
  if (loads) {
    if (!gpuTexels) {
      gpuTexels = new THREE.DataTexture(tex.image.data, TINT_W, TINT_H, THREE.RGBAFormat, THREE.UnsignedByteType);
      gpuTexels.magFilter = gpuTexels.minFilter = THREE.NearestFilter;
      gpuTexels.colorSpace = THREE.NoColorSpace;
      gpuTexels.needsUpdate = true;
    }
    const st = uv.mul(vec2(TINT_W, TINT_H)).sub(0.5), i0 = floor(st), f = fract(st);
    const at = (dx: number, dy: number): V4 =>
      texture(gpuTexels!).load(ivec2(vec2(mod(i0.x.add(dx + TINT_W), TINT_W), clamp(i0.y.add(dy), 0, TINT_H - 1)))) as unknown as V4;
    t = mix(mix(at(0, 0), at(1, 0), f.x), mix(at(0, 1), at(1, 1), f.x), f.y);
  } else t = texture(tex, uv).level(float(0)) as unknown as V4;
  return vec4(t.rgb.mul(0.25), t.a);
}

/** The water over `up` on the GPU planet: the deep water's own diffuse reflectance, and its extinction per metre. */
export function waterAt(up: V3, loads = false): { deep: V3; extinction: V3 } {
  const t = tintAt(up, loads);
  return { deep: t.rgb.mul(DEEP), extinction: mix(vec3(...MURKY), vec3(...CLEAR), t.a) };
}

const MIX: RegionMix = { a: 0, b: 0, t: 0 };
const CA = new THREE.Color(), CB = new THREE.Color();

/** The deep water's reflectance at p (any length), as waterAt has it, for the sea the sky draws past the horizon. */
export function seaDeepAt(p: SimV3, out: { set(x: number, y: number, z: number): unknown }): void {
  const l = Math.hypot(p.x, p.y, p.z) || 1;
  regionMix({ x: p.x / l, y: p.y / l, z: p.z / l }, MIX);
  CA.setHex(REGION_WATER[REGIONS[MIX.a].id][0]).lerp(CB.setHex(REGION_WATER[REGIONS[MIX.b].id][0]), MIX.t);
  out.set(CA.r * DEEP, CA.g * DEEP, CA.b * DEEP);
}
