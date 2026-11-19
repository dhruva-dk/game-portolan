// The storm's lightning (storm.ts draws it): every BOLT seconds a stroke from the cloud's base to the sea, a way into
// the storm, flickering two or three times. Each flicker lights the cloud and the rain round the stroke from within,
// and the stroke itself shows as a jagged white channel wherever the rain in front of it lets it through.
//
// Worked out on the CPU from the world's clock, so every frame of a moment agrees: where the stroke stands (in the
// wall within sight of the eye along it, when the eye is in the calm; somewhere about the eye, in the storm), and how
// bright its flicker is now.

import { Vector3 } from 'three/webgpu';
import { abs, cross, dot, exp, float, fract, length, luminance, max, min, normalize, smoothstep, uniform, vec3 } from 'three/tsl';
import { LIGHTNING, tint } from '../palette';
import type { Cap } from '../sim/storm';
import { hash01 } from '../world/random';
import { R, add, cross as crossV, dot as dotV, length as lengthV, normalize as normalizeV, scale, type Vec3 } from '../world/sphere';
import { BASE } from './storm-field';
import type { FloatNode, Vec3Node } from '../tsl';

/**
 * One stroke in each BOLT seconds, at a moment within it; its flickers (seconds from the stroke, and each one's
 * strength). It stands IN metres in from the edge, along the edge from the eye's nearest point of it by up to ALONG of
 * the eye's distance from it (at least NEAR metres), so it falls in the eye's view of the wall; or, in the storm,
 * DISTANCE (min, max) metres from the eye.
 */
const BOLT = 4.5, FLICKER = [[0, 0.07, 1], [0.1, 0.15, 0.4], [0.21, 0.34, 0.85]] as const;
const IN = 30, ALONG = 0.7, NEAR = 50, DISTANCE = [70, 200] as const;
/** How far round the stroke the cloud and rain are lit, metres (a Gaussian's width), and how brightly, as a multiple of the storm's air
 * light's luminance; the stroke's own channel: its radiance in the same units, its width (metres, and at least this
 * many radians, about a pixel), and how far it zigzags either side (metres, over two scales of its height). */
const REACH = 50, FLASH = 9, CHANNEL = 260, WIDTH = 0.35, PIXEL = 0.0016, ZIG = [6, 3, 1.1] as const, ZIG_LONG = [21, 8.3, 2.9] as const;
/** The flash's colour, against the storm's own light's (its luminance kept): the palette's lightning. */
const TINT = tint(LIGHTNING, 0.88);

/** A zigzag, −0.5…0.5, of period 1. */
const zig = (x: FloatNode): FloatNode => abs(fract(x).sub(0.5)).mul(2).sub(0.5);

/** held: the flicker held at its brightest (debug.ts ?bolt), for a still of it. */
export function createBolt(held: boolean) {
  /** Up over the stroke's foot, its flicker now (0 between strokes), and a seed for its shape. */
  const foot = uniform(new Vector3(0, 1, 0)), flash = uniform(0), seed = uniform(0);
  /** Where the flash lights the cloud from: in the base, over the stroke. */
  const centre = (): Vec3Node => foot.mul(R + BASE + 15);

  return {
    flash,
    /** The flash's light at world position q, radiance (air: the storm's air light). */
    glow: (air: Vec3Node, q: Vec3Node): Vec3Node =>
      vec3(luminance(air)).mul(vec3(...TINT)).mul(flash.mul(exp(length(q.sub(centre())).div(REACH).pow(2).negate())).mul(FLASH)),
    /** How far along the ray from o along unit d it passes the stroke, m. */
    nearest: (o: Vec3Node, d: Vec3Node): FloatNode => {
      const w = o.sub(foot.mul(R)), b = dot(d, foot);
      return b.mul(dot(foot, w)).sub(dot(d, w)).div(max(float(1).sub(b.mul(b)), 1e-4));
    },
    /**
     * The stroke's channel as the ray from o along unit d sees it, radiance (air: the storm's air light), if what
     * the pixel shows is no nearer than `metres`; `through` of it reaches the eye.
     */
    channel: (air: Vec3Node, o: Vec3Node, d: Vec3Node, metres: FloatNode, through: FloatNode): Vec3Node => {
      const w = o.sub(foot.mul(R)), b = dot(d, foot), dw = dot(d, w), uw = dot(foot, w), k = max(float(1).sub(b.mul(b)), 1e-4);
      const t = b.mul(uw).sub(dw).div(k), s = uw.sub(b.mul(dw)).div(k);
      // its height s along the stroke, and how far to one side of it the ray passes, across the view
      const side = normalize(cross(foot, d)), off = dot(w, side);
      const jag = ZIG.map((a, k): FloatNode => zig(s.div(ZIG_LONG[k]).add(seed.mul(1 + k * 2.7))).mul(a)).reduce((x, y) => x.add(y));
      const width = max(float(WIDTH), t.mul(PIXEL));
      const miss = abs(off.sub(jag)).div(width);
      const core = exp(miss.mul(miss).negate()).add(exp(miss.negate().mul(0.25)).mul(0.08));
      const along = smoothstep(-2, 2, s).mul(smoothstep(BASE + 10, BASE - 5, s)).mul(smoothstep(0, 1, metres.sub(t)));
      return vec3(luminance(air)).mul(vec3(...TINT)).mul(core.mul(along).mul(through).mul(flash).mul(CHANNEL).mul(min(float(WIDTH).div(width), 1)));
    },
    /** The stroke now (sim/storm.ts's cap; seconds: the world's clock; eye: where the eye is, world m). */
    update(cap: Cap, seconds: number, eye: Vec3, whole: boolean) {
      const n = Math.floor(seconds / BOLT), since = seconds - (n + hash01(n,0) * 0.8) * BOLT;
      const lit = held ? FLICKER[0] : FLICKER.find(([from, to]) => since >= from && since < to);
      flash.value = !whole && lit ? lit[2] : 0;
      if (!flash.value) return;
      seed.value = hash01(n,3);
      const u = normalizeV(eye), c = cap.centre, out = normalizeV(add(u, c, -dotV(u, c))), side = crossV(c, out);
      const off = (Math.acos(Math.min(1, Math.max(-1, dotV(u, c)))) - cap.radius) * R;
      const turn = (hash01(n,1) - 0.5) * 2;
      let at: Vec3;
      if (off > 0) {
        // in the storm: a way off the eye, any way round
        const far = DISTANCE[0] + hash01(n,2) * (DISTANCE[1] - DISTANCE[0]), way = add(scale(out, Math.cos(turn * Math.PI)), side, Math.sin(turn * Math.PI));
        at = normalizeV(add(u, way, far / R));
      } else {
        // in the calm: IN metres into the wall, along it either way from the eye's nearest point of it
        const a = cap.radius + IN / R, round = (turn * Math.max(NEAR, -off * ALONG)) / (R * Math.max(Math.sin(a), 0.05));
        const way = add(scale(out, Math.cos(round)), side, Math.sin(round));
        at = normalizeV(add(scale(c, Math.cos(a)), way, Math.sin(a)));
      }
      if (Number.isFinite(lengthV(at))) foot.value.set(...at);
      else flash.value = 0;
    },
  };
}
