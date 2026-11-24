import { Vector3 } from 'three/webgpu';
import {
  abs,
  cross,
  dot,
  exp,
  float,
  fract,
  length,
  luminance,
  max,
  min,
  normalize,
  smoothstep,
  uniform,
  vec3,
} from 'three/tsl';
import { LIGHTNING, tint } from '../palette.ts';
import type { StormDraw } from '../snapshot.ts';
import { hash01 } from '../../world/random.ts';
import { clamp } from '../../world/scalar.ts';
import { R, type Vec3 } from '../../world/sphere.ts';
import { BASE } from './storm-field.ts';
import type { FloatNode, Vec3Node } from '../tsl.ts';

const BOLT = 4.5,
  FLICKER = [
    [0, 0.07, 1],
    [0.1, 0.15, 0.4],
    [0.21, 0.34, 0.85],
  ] as const;
const STRIKE = [
    [0, 0.09, 1],
    [0.13, 0.22, 0.55],
    [0.28, 0.42, 1],
    [0.55, 0.64, 0.6],
  ] as const,
  EDGE = 8;
const IN = 30,
  ALONG = 0.7,
  NEAR = 50,
  DISTANCE = [70, 200] as const;
const REACH = 50,
  FLASH = 9,
  CHANNEL = 260,
  WIDTH = 0.35,
  PIXEL = 0.0016;
const ZIG = [6, 3, 1.1] as const,
  ZIG_LONG = [21, 8.3, 2.9] as const;
const TINT = tint(LIGHTNING, 0.88);

const zig = (x: FloatNode): FloatNode => abs(fract(x).sub(0.5)).mul(2).sub(0.5);

export function createBolt(held: boolean) {
  const foot = uniform(new Vector3(0, 1, 0)),
    flash = uniform(0),
    seed = uniform(0);
  const center = (): Vec3Node => foot.mul(R + BASE + 15);
  const tinted = (air: Vec3Node): Vec3Node =>
    vec3(luminance(air)).mul(vec3(...TINT));
  const u = new Vector3(),
    c = new Vector3(),
    out = new Vector3(),
    side = new Vector3(),
    way = new Vector3(),
    at = new Vector3();
  let last = -Infinity,
    closing = true,
    struck = -Infinity;

  return {
    flash,
    glow: (air: Vec3Node, q: Vec3Node): Vec3Node =>
      tinted(air).mul(
        flash
          .mul(exp(length(q.sub(center())).div(REACH).pow(2).negate()))
          .mul(FLASH)
      ),
    nearest: (o: Vec3Node, d: Vec3Node): FloatNode => {
      const w = o.sub(foot.mul(R)),
        b = dot(d, foot);
      return b
        .mul(dot(foot, w))
        .sub(dot(d, w))
        .div(max(float(1).sub(b.mul(b)), 1e-4));
    },
    channel: (
      air: Vec3Node,
      o: Vec3Node,
      d: Vec3Node,
      meters: FloatNode,
      through: FloatNode
    ): Vec3Node => {
      const w = o.sub(foot.mul(R)),
        b = dot(d, foot),
        dw = dot(d, w),
        uw = dot(foot, w),
        k = max(float(1).sub(b.mul(b)), 1e-4);
      const t = b.mul(uw).sub(dw).div(k),
        s = uw.sub(b.mul(dw)).div(k);
      const side = normalize(cross(foot, d)),
        off = dot(w, side);
      const jag = ZIG.map(
        (a, k): FloatNode =>
          zig(s.div(ZIG_LONG[k]).add(seed.mul(1 + k * 2.7))).mul(a)
      ).reduce((x, y) => x.add(y));
      const width = max(float(WIDTH), t.mul(PIXEL));
      const miss = abs(off.sub(jag)).div(width);
      const core = exp(miss.mul(miss).negate()).add(
        exp(miss.negate().mul(0.25)).mul(0.08)
      );
      const along = smoothstep(-2, 2, s)
        .mul(smoothstep(BASE + 10, BASE - 5, s))
        .mul(smoothstep(0, 1, meters.sub(t)));
      return tinted(air).mul(
        core
          .mul(along)
          .mul(through)
          .mul(flash)
          .mul(CHANNEL)
          .mul(min(float(WIDTH).div(width), 1))
      );
    },
    update(cap: StormDraw, seconds: number, eye: Vec3, whole: boolean) {
      if (seconds < last || !Number.isFinite(last)) struck = -Infinity;
      else if (cap.closing && !closing) struck = seconds;
      closing = cap.closing;
      last = seconds;
      const striking = seconds - struck < STRIKE[STRIKE.length - 1][1];
      const n = striking ? -1 - Math.floor(struck) : Math.floor(seconds / BOLT),
        since = striking
          ? seconds - struck
          : seconds - (n + hash01(n, 0) * 0.8) * BOLT;
      let lit = 0;
      for (const [from, to, strength] of striking ? STRIKE : FLICKER)
        if (since >= from && since < to) lit = strength;
      flash.value = whole ? 0 : held ? FLICKER[0][2] : lit;
      if (!flash.value) return;
      seed.value = hash01(n, 3);
      u.fromArray(eye).normalize();
      c.fromArray(cap.center);
      out.copy(u).addScaledVector(c, -u.dot(c)).normalize();
      side.crossVectors(c, out);
      const off = (Math.acos(clamp(u.dot(c), -1, 1)) - cap.radius) * R;
      const turn = striking ? 0 : (hash01(n, 1) - 0.5) * 2;
      if (off > 0) {
        const far = DISTANCE[0] + hash01(n, 2) * (DISTANCE[1] - DISTANCE[0]);
        way
          .copy(out)
          .multiplyScalar(Math.cos(turn * Math.PI))
          .addScaledVector(side, Math.sin(turn * Math.PI));
        at.copy(u)
          .addScaledVector(way, far / R)
          .normalize();
      } else {
        const a = cap.radius + (striking ? EDGE : IN) / R,
          round =
            (turn * Math.max(NEAR, -off * ALONG)) /
            (R * Math.max(Math.sin(a), 0.05));
        way
          .copy(out)
          .multiplyScalar(Math.cos(round))
          .addScaledVector(side, Math.sin(round));
        at.copy(c)
          .multiplyScalar(Math.cos(a))
          .addScaledVector(way, Math.sin(a))
          .normalize();
      }
      if (Number.isFinite(at.length())) foot.value.copy(at);
      else flash.value = 0;
    },
  };
}
