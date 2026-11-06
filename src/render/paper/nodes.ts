// What the parchment is made of, as node functions: lattice hashes and noise that wrap, so a tile repeats without a
// seam; the paper's fibres; and pigment by Kubelka and Munk's two-flux model, as Curtis et al. use it for
// watercolour ("Computer-Generated Watercolor", SIGGRAPH 1997).
//
// Kubelka–Munk treats a layer of pigment as absorbing (K) and scattering (S) per unit thickness. A layer x thick
// reflects R and lets through T of the light; laid over a ground that reflects Rg, the pair reflect
// R + T² Rg / (1 - R Rg), the light bouncing between them. So a thin transparent wash darkens the paper under it the
// way real ink does: the paper shows through, warmed or cooled by the pigment, and two washes over one another mix
// as pigments mix (subtractively), not as coloured glass does. Each pigment is given as Curtis gives one: the colour
// a unit layer shows over white and over black, from which K and S follow.
import type { Node } from 'three/webgpu';
import { clamp, cos, dot, exp, float, floor, fract, length, max, mix, mod, sin, smoothstep, sqrt, vec2, vec3 } from 'three/tsl';

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

// ---------------------------------------------------------------- Kubelka–Munk

export interface Pigment {
  K: readonly [number, number, number];
  S: readonly [number, number, number];
}

/**
 * A pigment from the colours a unit layer of it shows over white (`white`) and over black (`black`), linear, each
 * channel 0 < black < white < 1 (Curtis et al., section 5.1).
 */
export function pigment(white: readonly [number, number, number], black: readonly [number, number, number]): Pigment {
  const K: number[] = [], S: number[] = [];
  for (let c = 0; c < 3; c++) {
    const Rw = white[c], Rb = black[c];
    const a = 0.5 * (Rw + (Rb - Rw + 1) / Rb), b = Math.sqrt(a * a - 1);
    const z = (b * b - (a - Rw) * (a - 1)) / (b * (1 - Rw));
    const s = (1 / b) * 0.5 * Math.log((z + 1) / (z - 1));
    S.push(s);
    K.push(s * (a - 1));
  }
  return { K: K as unknown as Pigment['K'], S: S as unknown as Pigment['S'] };
}

/** The pigments of the parchment: inks, washes and wax. */
export const PIGMENT = {
  /** Iron-gall ink, brown-black and transparent. */
  ink: pigment([0.1, 0.07, 0.045], [0.012, 0.009, 0.006]),
  /** Ultramarine, for deep water: transparent, and granulating. */
  ultramarine: pigment([0.1, 0.2, 0.52], [0.012, 0.018, 0.045]),
  /** Viridian, for shoal water. */
  viridian: pigment([0.18, 0.45, 0.4], [0.015, 0.04, 0.035]),
  /** Yellow ochre, for the land: earthy, a little opaque. */
  ochre: pigment([0.72, 0.5, 0.18], [0.2, 0.13, 0.045]),
  /** Burnt sienna, for high ground. */
  sienna: pigment([0.45, 0.2, 0.08], [0.06, 0.025, 0.01]),
  /** Vermilion, for rubrics and rhumb lines: opaque. */
  vermilion: pigment([0.7, 0.1, 0.04], [0.3, 0.035, 0.015]),
} as const;

/** What a layer of a pigment `x` thick reflects (R) and lets through (T), per channel. */
export function layer(p: Pigment, x: F): { R: V3; T: V3 } {
  const K = vec3(...p.K), S = vec3(...p.S);
  const a = K.div(S).add(1), b = sqrt(a.mul(a).sub(1));
  const bSx = b.mul(S).mul(max(x, 1e-4));
  const e1 = exp(bSx), e2 = exp(bSx.negate());
  const sh = e1.sub(e2).mul(0.5), ch = e1.add(e2).mul(0.5);
  const c = a.mul(sh).add(b.mul(ch));
  return { R: sh.div(c) as V3, T: b.div(c) as V3 };
}

/** A pigment layer `x` thick laid over a ground reflecting `ground`: what the two reflect together. */
export function over(p: Pigment, x: F, ground: V3): V3 {
  const { R, T } = layer(p, x);
  return R.add(T.mul(T).mul(ground).div(R.mul(ground).oneMinus())) as V3;
}

/**
 * The same layer as an overlay for the page to blend over the paper (which it can only do as `colour · α + under ·
 * (1 − α)`): matched to what Kubelka–Munk gives over a ground of `ground`.
 */
export function overlay(p: Pigment, x: F, ground: V3): { colour: V3; alpha: F } {
  const { R, T } = layer(p, x);
  const through = T.mul(T).div(R.mul(ground).oneMinus());
  const alpha = clamp(float(1).sub(dot(through, vec3(0.3, 0.45, 0.25))), 0, 1);
  const total = R.add(through.mul(ground));
  const colour = clamp(total.sub(ground.mul(alpha.oneMinus())).div(max(alpha, 1e-3)), 0, 1);
  return { colour: colour as V3, alpha: alpha as F };
}
