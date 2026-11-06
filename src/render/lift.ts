// The sea the regions' events move: the Jade Shoals' falling tide, the Mangrove's flood, the reef tide running to one
// side of the Great Atoll, the low tide under Moonbow Arch. Each disc of LIFTS raises or draws down the water, in its
// own region only. The shaders read it through planet.ts seaLift (uLiftAt, uLiftR, uSeaShare), the GPU planet's
// through seaLiftNode; the hulls, the loot and the splashes ride it through seaLift here, which works it out the same
// way.
import * as THREE from 'three';
import type { Node } from 'three/webgpu';
import { Fn, If, asin, atan, clamp, dot, float, floor, fract, ivec2, max, mix, mod, smoothstep, sqrt, texture, vec2, vec3 } from 'three/tsl';
import { R } from '../sim/sphere.ts';
import { LIFTS, regionMix, type RegionMix } from '../sim/world/index.ts';
import { U } from './engine.ts';
import { P } from './gpu/uniforms.ts';

type F = Node<'float'>;
type V3 = Node<'vec3'>;
type V4 = Node<'vec4'>;

/** The most discs planet.ts's arrays hold. */
export const MAX_LIFTS = 5;
/** The regions whose water moves, each a channel of the share texture. */
const LIFTERS = [...new Set(LIFTS.map((l) => l.region))];
if (LIFTS.length > MAX_LIFTS || LIFTERS.length > 4) throw new Error(`the sea's lifts outgrow planet.ts: ${LIFTS.length} discs in ${LIFTERS.length} regions`);

const W = 512, H = 256;
let share: Uint8Array | null = null;
let shareTex: THREE.DataTexture | null = null, shareTexels: THREE.DataTexture | null = null;
const now = new Float32Array(LIFTS.length);
let on = false;

/** Each lifting region's share of the water over the planet, by latitude and longitude as uSeaTint: one channel a region. */
export function liftShareTexture(): THREE.DataTexture {
  if (shareTex) return shareTex;
  const d = new Uint8Array(W * H * 4), p = { x: 0, y: 0, z: 0 }, mix: RegionMix = { a: 0, b: 0, t: 0 };
  for (let y = 0; y < H; y++) {
    const lat = ((y + 0.5) / H - 0.5) * Math.PI;
    for (let x = 0; x < W; x++) {
      const lon = ((x + 0.5) / W - 0.5) * Math.PI * 2;
      p.x = Math.cos(lat) * Math.cos(lon); p.y = Math.sin(lat); p.z = -Math.cos(lat) * Math.sin(lon);
      regionMix(p, mix);
      for (let c = 0; c < LIFTERS.length; c++) {
        const ri = LIFTERS[c];
        d[(y * W + x) * 4 + c] = Math.round(255 * (mix.a === ri ? 1 - mix.t : mix.b === ri ? mix.t : 0));
      }
    }
  }
  share = d;
  const tex = new THREE.DataTexture(d, W, H, THREE.RGBAFormat, THREE.UnsignedByteType);
  tex.magFilter = tex.minFilter = THREE.LinearFilter;
  tex.wrapS = THREE.RepeatWrapping;
  tex.colorSpace = THREE.NoColorSpace;
  tex.needsUpdate = true;
  LIFTS.forEach((l, i) => {
    U.uLiftAt.value[i].set(l.pos.x, l.pos.y, l.pos.z, 0);
    U.uLiftR.value[i].set(l.r, l.fade, LIFTERS.indexOf(l.region), 0);
    (P.liftAt.array[i] as THREE.Vector4).set(l.pos.x, l.pos.y, l.pos.z, 0);
    (P.liftR.array[i] as THREE.Vector4).set(l.r, l.fade, LIFTERS.indexOf(l.region), 0);
  });
  shareTex = tex;
  return tex;
}

/** How far each of LIFTS moves the sea now, metres at its middle (environment.ts liftsNow). */
export function setLifts(by: readonly number[]): void {
  on = false;
  for (let i = 0; i < LIFTS.length; i++) {
    now[i] = share ? by[i] ?? 0 : 0;
    U.uLiftAt.value[i].w = now[i];
    (P.liftAt.array[i] as THREE.Vector4).w = now[i];
    if (now[i] !== 0) on = true;
  }
  U.uLiftOn.value = on ? 1 : 0;
  P.liftOn.value = on ? 1 : 0;
}

/**
 * On the GPU planet, how far the events have raised the sea over `up`, a direction from the planet's centre, metres:
 * seaLift's sum as nodes. The discs, their reach and their regions never change, so only how far each moves the sea
 * now is read from the uniforms. The share table is read filtered; with `loads`, for a material out of samplers, it
 * is filtered by hand from four texel loads of a copy WebGPU reads without one.
 */
export function seaLiftNode(up: V3, loads = false): F {
  const tex = liftShareTexture();
  if (loads && !shareTexels) {
    shareTexels = new THREE.DataTexture(tex.image.data, W, H, THREE.RGBAFormat, THREE.UnsignedByteType);
    shareTexels.magFilter = shareTexels.minFilter = THREE.NearestFilter;
    shareTexels.colorSpace = THREE.NoColorSpace;
    shareTexels.needsUpdate = true;
  }
  const uv = vec2(atan(up.z.negate(), up.x).mul(0.5 / Math.PI).add(0.5), asin(clamp(up.y, -1, 1)).mul(1 / Math.PI).add(0.5));
  let mixes: V4;
  if (loads) {
    const st = uv.mul(vec2(W, H)).sub(0.5), i0 = floor(st), f = fract(st);
    const at = (dx: number, dy: number): V4 =>
      texture(shareTexels!).load(ivec2(vec2(mod(i0.x.add(dx + W), W), clamp(i0.y.add(dy), 0, H - 1)))) as unknown as V4;
    mixes = mix(mix(at(0, 0), at(1, 0), f.x), mix(at(0, 1), at(1, 1), f.x), f.y);
  } else mixes = texture(tex, uv).level(float(0)) as unknown as V4;
  const channel = [mixes.x, mixes.y, mixes.z, mixes.w];
  let h: F = float(0);
  LIFTS.forEach((l, i) => {
    const now = ((P.liftAt as unknown as { element(i: number): V4 }).element(i)).w;
    const d = sqrt(max(float(2).sub(dot(up, vec3(l.pos.x, l.pos.y, l.pos.z)).mul(2)), 0)).mul(R);
    h = h.add(now.mul(smoothstep(l.r, l.r + l.fade, d).oneMinus()).mul(channel[LIFTERS.indexOf(l.region)]));
  });
  return h;
}

/** The sea's surface over `up` on the GPU planet, metres from the centre: the tide's level and the events' lift,
 *  which is only worked out while some event moves the water. */
export const seaLevelNode = (up: V3, loads = false): F =>
  Fn(() => {
    const level = float(P.planet.y).toVar();
    If(P.liftOn.greaterThan(0), () => {
      level.addAssign(seaLiftNode(up, loads));
    });
    return level;
  })() as unknown as F;

const smooth = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** How far the events have moved the sea over a world point, metres. */
export function seaLift(p: { x: number; y: number; z: number }): number {
  if (!on || !share) return 0;
  const n = Math.hypot(p.x, p.y, p.z) || 1, x = p.x / n, y = p.y / n, z = p.z / n;
  let h = 0, texel = -1;
  for (let i = 0; i < LIFTS.length; i++) {
    if (now[i] === 0) continue;
    const l = LIFTS[i], d = R * Math.sqrt(Math.max(0, 2 - 2 * (x * l.pos.x + y * l.pos.y + z * l.pos.z)));
    const f = 1 - smooth(l.r, l.r + l.fade, d);
    if (f <= 0) continue;
    if (texel < 0) {
      const u = Math.floor((Math.atan2(-z, x) / (2 * Math.PI) + 0.5) * W) % W;
      const v = Math.min(H - 1, Math.max(0, Math.floor((Math.asin(Math.max(-1, Math.min(1, y))) / Math.PI + 0.5) * H)));
      texel = (v * W + u) * 4;
    }
    h += now[i] * f * (share[texel + LIFTERS.indexOf(l.region)] / 255);
  }
  return h;
}
