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
  wind: readonly [number, number];
  paint: Vec3; sail: Vec3;
  /** The sails' pattern (materials.ts: 0 plain, 1 band, 2 stripes). */
  pattern: number;
  /** Her canvas's own phase, radians. */
  phase: number;
  /** Her cloth berth (cloth.ts), and how much of the drawn canvas is its (0 when she has none). */
  berth: number; share: number;
}

/** Writes an instance into a at float o. */
export function pack(a: Float32Array, o: number, s: Instance) {
  a.set([...s.position, s.brace, ...s.forward, s.wind[0], ...s.up, s.wind[1],
    ...s.paint, s.pattern, ...s.sail, s.phase, s.berth, s.share, 0, 0], o);
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
