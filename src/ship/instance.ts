// A ship's instance: what each drawn ship carries to the shaders, six vec4s interleaved in one buffer per level of
// detail. The one place its layout is known: the fleet packs it (pack), the materials read it by name (read).
//
//   shipAt     position xyz, brace w
//   shipFwd    forward xyz, the sails' wind across her w
//   shipUp     up xyz, the sails' wind along her w
//   shipPaint  paint rgb, the sails' pattern w
//   shipCloth  sail rgb, her canvas's phase w
//   shipBerth  her cloth berth x, its share y

import { attribute, vec2 } from 'three/tsl';
import type { Vec3 } from '../world/sphere.ts';

/** The attributes, in the order they lie in an instance. */
export const SLOTS = ['shipAt', 'shipFwd', 'shipUp', 'shipPaint', 'shipCloth', 'shipBerth'] as const;
/** Floats an instance. */
export const STRIDE = SLOTS.length * 4;

export interface Instance {
  position: Vec3; forward: Vec3; up: Vec3;
  /** The yards' turn about the masts, radians. */
  brace: number;
  /** The sails' wind as a share of full: across her (to port) and along her (ahead). */
  wind: [number, number];
  paint: Vec3; sail: Vec3;
  /** The sails' pattern (materials.ts: 0 plain, 1 band, 2 stripes). */
  pattern: number;
  /** Her canvas's own phase, radians. */
  phase: number;
  /** Her cloth berth (cloth.ts), and how much of the drawn canvas is its (0 when she has none). */
  berth: number; share: number;
}

/** Writes an instance into a at float o, in SLOTS' order. */
export function pack(a: Float32Array, o: number, s: Instance) {
  for (let j = 0; j < 3; j++) {
    a[o + j] = s.position[j];
    a[o + 4 + j] = s.forward[j];
    a[o + 8 + j] = s.up[j];
    a[o + 12 + j] = s.paint[j];
    a[o + 16 + j] = s.sail[j];
  }
  a[o + 3] = s.brace;
  a[o + 7] = s.wind[0];
  a[o + 11] = s.wind[1];
  a[o + 15] = s.pattern;
  a[o + 19] = s.phase;
  a[o + 20] = s.berth;
  a[o + 21] = s.share;
  a[o + 22] = a[o + 23] = 0;
}

/** The instance as a vertex shader reads it. */
export function read() {
  const at = attribute('shipAt', 'vec4'), fwd = attribute('shipFwd', 'vec4'), up = attribute('shipUp', 'vec4');
  const paint = attribute('shipPaint', 'vec4'), cloth = attribute('shipCloth', 'vec4'), berth = attribute('shipBerth', 'vec4');
  return {
    position: at.xyz, brace: at.w, forward: fwd.xyz, up: up.xyz, wind: vec2(fwd.w, up.w),
    paint: paint.rgb, pattern: paint.w, sail: cloth.rgb, phase: cloth.w, berth: berth.x, share: berth.y,
  };
}
