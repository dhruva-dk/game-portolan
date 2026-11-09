// What the parchment is made of, as node functions: lattice hashes and noise that wrap, so a tile repeats without a
// seam, and the paper's fibres.
import type { Node } from 'three/webgpu';
import { clamp, cos, dot, float, floor, fract, length, max, mix, mod, sin, smoothstep, sqrt, vec2 } from 'three/tsl';

export type F = Node<'float'>;
export type V2 = Node<'vec2'>;
export type V3 = Node<'vec3'>;
export type V4 = Node<'vec4'>;

const TAU = Math.PI * 2;

/** A hash in [0, 1) of a lattice point (small whole numbers) and a salt. */
export function hash(p: V2, salt: number): F {
  return fract(sin(dot(p, vec2(12.9898 + salt * 0.731, 78.233 + salt * 1.379))).mul(43758.5453)) as F;
}

/** Value noise in [0, 1) at `p`, wrapping every `period` cells. */
export function wrapNoise(p: V2, period: number, salt: number): F {
  const i = floor(p), f = fract(p), u = f.mul(f).mul(f.mul(-2).add(3));
  const at = (dx: number, dy: number): F => hash(mod(i.add(vec2(dx, dy)), period) as V2, salt);
  const a = at(0, 0), b = at(1, 0), c = at(0, 1), d = at(1, 1);
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y) as F;
}

/** Fractal noise in about [-1, 1] over a unit tile, starting `base` cells across and doubling `octaves` times. */
export function wrapFbm(uv: V2, base: number, octaves: number, salt: number): F {
  let v: F = float(0), amp = 0.55, f = base;
  for (let o = 0; o < octaves; o++) {
    v = v.add(wrapNoise(uv.mul(f) as V2, f, salt + o * 13).mul(2).sub(1).mul(amp)) as F;
    amp *= 0.5;
    f *= 2;
  }
  return v;
}

export interface FibreLayer {
  /** Cells across the unit tile; each holds `per` fibres. */
  cells: number;
  per: number;
  /** Half-length and half-width, in cells (the length at most one cell, so the 3×3 cells round a point hold every
   *  fibre that reaches it). */
  length: readonly [number, number];
  width: readonly [number, number];
  salt: number;
}

export interface Fibres {
  /** The height of the fibre on top here, 0..1. */
  height: F;
  /** Whether a fibre lies here at all, 0..1. */
  cover: F;
  /** Its shade: below 0 a dark (unbleached) fibre, above a pale one. */
  tint: F;
}

/**
 * The fibres of one layer at `uv` (a unit tile, wrapping): each a slightly bent strand, rounded across and tapering at
 * its ends, at a random place and angle in its cell.
 */
export function fibres(uv: V2, l: FibreLayer): Fibres {
  const p = uv.mul(l.cells), c = floor(p);
  let height: F = float(0), cover: F = float(0), tint: F = float(0);
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    const n = c.add(vec2(dx, dy)), w = mod(n, l.cells) as V2;
    for (let k = 0; k < l.per; k++) {
      const s = l.salt + k * 17;
      const ctr = n.add(vec2(hash(w, s), hash(w, s + 1)));
      const ang = hash(w, s + 2).mul(TAU), dir = vec2(cos(ang), sin(ang)), side = vec2(dir.y.negate(), dir.x);
      const L = mix(l.length[0], l.length[1], hash(w, s + 3)), bend = hash(w, s + 4).sub(0.5).mul(0.7);
      const q = p.sub(ctr), t = clamp(dot(q, dir).div(L), -1, 1);
      const on = dir.mul(t.mul(L)).add(side.mul(bend.mul(L).mul(t.mul(t).oneMinus())));
      const d = length(q.sub(on));
      const wd = mix(l.width[0], l.width[1], hash(w, s + 5)).mul(t.mul(t).mul(0.6).oneMinus());
      const u = clamp(d.div(wd), 0, 1);
      const profile = sqrt(u.mul(u).oneMinus());
      height = max(height, profile.mul(mix(0.6, 1, hash(w, s + 6)))) as F;
      cover = max(cover, smoothstep(1, 0.5, u)) as F;
      tint = tint.add(profile.mul(hash(w, s + 7).sub(0.62))) as F;
    }
  }
  return { height, cover, tint };
}
