import { attribute, vec2 } from 'three/tsl';
import type { Vec3 } from '../../world/sphere.ts';

export const SLOTS = [
  'shipAt',
  'shipFwd',
  'shipUp',
  'shipPaint',
  'shipCloth',
  'shipBerth',
] as const;
export const STRIDE = SLOTS.length * 4;

export interface Instance {
  position: Vec3;
  forward: Vec3;
  up: Vec3;
  brace: number;
  wind: [number, number];
  paint: Vec3;
  sail: Vec3;
  pattern: number;
  phase: number;
  berth: number;
  share: number;
}

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

export function read() {
  const at = attribute('shipAt', 'vec4'),
    fwd = attribute('shipFwd', 'vec4'),
    up = attribute('shipUp', 'vec4');
  const paint = attribute('shipPaint', 'vec4'),
    cloth = attribute('shipCloth', 'vec4'),
    berth = attribute('shipBerth', 'vec4');
  return {
    position: at.xyz,
    brace: at.w,
    forward: fwd.xyz,
    up: up.xyz,
    wind: vec2(fwd.w, up.w),
    paint: paint.rgb,
    pattern: paint.w,
    sail: cloth.rgb,
    phase: cloth.w,
    berth: berth.x,
    share: berth.y,
  };
}
