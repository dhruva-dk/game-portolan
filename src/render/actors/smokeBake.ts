// Smoke as a volume, baked into a flipbook of sprites lit from six sides: the six-way lightmaps that shipped games
// shade smoke with (as Unity's VFX Graph and Unreal's Niagara do). A puff of smoke is a density field: a ball swollen
// and torn by gradient noise, rising as it grows, its edges eaten away as it ages, with a hot core that cools. For
// each of sixteen moments of its life the field is laid into a 64³ volume on the GPU, then looked through from the
// front, and at every step along each look the light that would reach that point from each of six directions (from
// the sprite's right, left, top, bottom, front and back) is marched out through the volume. What comes out is, per
// texel of the sprite: how much of the light from each side gets scattered back to the eye, how opaque it is, and how
// hot. A particle then lights its sprite from wherever the sun, the moon and the sky really are round it
// (tsl/particles.ts), so a puff backlit by a low sun glows at its thin edges and goes dark in its heart, and one lit
// from the side is bright on that side only, without anything being drawn as a volume at run time.
//
// The bake runs one moment a frame for the first sixteen frames the particles run, a few milliseconds each.
import { ClampToEdgeWrapping, HalfFloatType, LinearFilter, Storage3DTexture, StorageTexture, type ComputeNode, type WebGPURenderer } from 'three/webgpu';
import {
  Fn, Loop, abs, clamp, dot, exp, float, floor, fract, instanceIndex, length, max, mix, pow, sin, smoothstep, texture3D, textureStore, uniform,
  uvec2, uvec3, vec3, vec4,
} from 'three/tsl';
import type { F, V3 } from './tsl/kit.ts';

/** The flipbook: frames across and down, texels per frame side, and how many moments of a puff's life it holds. */
export const FLIP = { cols: 4, rows: 4, cell: 128, frames: 16 } as const;
const SIZE = FLIP.cols * FLIP.cell;
const VOL = 64;
/** Steps through the puff along each look, and toward each light. */
const STEPS = 40, LIGHT_STEPS = 8;
/** Extinction at full density, per unit of the sprite's half-width. */
const SIGMA = 6;

function sheet(): StorageTexture {
  const t = new StorageTexture(SIZE, SIZE);
  t.type = HalfFloatType;
  t.minFilter = t.magFilter = LinearFilter;
  t.wrapS = t.wrapT = ClampToEdgeWrapping;
  t.generateMipmaps = false;
  return t;
}

/** Light scattered to the eye from the sprite's right, left, top and bottom (r, g, b, a), as a share of what falls. */
export const SMOKE_SIDES = sheet();
/** Light from its front and back (r, g), how hot (b) and how opaque (a). */
export const SMOKE_DEPTH = sheet();

const volume = new Storage3DTexture(VOL, VOL, VOL);
volume.type = HalfFloatType;
volume.minFilter = volume.magFilter = LinearFilter;
volume.wrapS = volume.wrapT = volume.wrapR = ClampToEdgeWrapping;
volume.generateMipmaps = false;

const moment = uniform(0);

const hash33 = (c: V3): V3 =>
  fract(sin(vec3(dot(c, vec3(127.1, 311.7, 74.7)), dot(c, vec3(269.5, 183.3, 246.1)), dot(c, vec3(113.5, 271.9, 124.6)))).mul(43758.5453));

/** Gradient noise, about −0.7…0.7. */
const perlin = Fn(([p]: [V3]) => {
  const i = floor(p), f = fract(p);
  const u = f.mul(f).mul(f).mul(f.mul(f.mul(6).sub(15)).add(10));
  const g = (x: number, y: number, z: number): F => {
    const o = vec3(x, y, z);
    return dot(hash33(i.add(o)).mul(2).sub(1).normalize(), f.sub(o));
  };
  const a = mix(mix(g(0, 0, 0), g(1, 0, 0), u.x), mix(g(0, 1, 0), g(1, 1, 0), u.x), u.y);
  const b = mix(mix(g(0, 0, 1), g(1, 0, 1), u.x), mix(g(0, 1, 1), g(1, 1, 1), u.x), u.y);
  return mix(a, b, u.z);
}).setLayout({ name: 'smokePerlin', type: 'float', inputs: [{ name: 'p', type: 'vec3' }] });

const fbm = (p: V3): F => perlin(p).mul(0.55).add(perlin(p.mul(2.03).add(17.1)).mul(0.28)).add(perlin(p.mul(4.11).add(31.7)).mul(0.14));

/** The lobes a puff is made of, as a cumulus is: centres and radii in the sprite's box at birth. */
const LOBES: [number, number, number, number][] = [
  [0, -0.02, 0, 0.4], [0.3, 0.12, 0.06, 0.28], [-0.3, 0.08, -0.08, 0.3], [0.04, 0.32, 0.1, 0.27], [-0.12, -0.26, 0.14, 0.24],
  [0.2, -0.22, -0.15, 0.22],
];

/** The puff at `t` (0 born … 1 gone) at p in the sprite's box (−1…1): density in x, heat in y. */
const puff = (p: V3, t: F): { density: F; heat: F } => {
  // it swells and rises as it ages; the noise is carried out with it, so its billows grow rather than slide
  const swell = t.mul(0.2).add(1);
  const q = p.mul(float(1.35).sub(t.mul(0.45))).sub(vec3(0, t.mul(0.45), 0));
  // the lobes, run smoothly together (a polynomial smooth minimum of their distances)
  let shape: F = float(1e3);
  for (const [x, y, z, r] of LOBES) {
    const d = length(p.sub(vec3(x, y, z).mul(swell))).sub(swell.mul(r));
    const h = clamp(shape.sub(d).mul(1 / 0.24).mul(0.5).add(0.5), 0, 1);
    shape = mix(shape, d, h).sub(h.mul(h.oneMinus()).mul(0.24));
  }
  // billows over them: cauliflower lumps from the folded noise
  const lumps = float(0.6).sub(abs(perlin(q.mul(2.1).add(vec3(3.1, 1.7, 5.3))))).mul(0.5)
    .add(float(0.35).sub(abs(perlin(q.mul(4.3).add(vec3(9.2, 4.4, 1.3))))).mul(0.26))
    .add(perlin(q.mul(9.1).add(vec3(2.5, 8.8, 6.1))).mul(0.1));
  const edge = lumps.mul(0.4).sub(shape).sub(0.08);
  // a soft rim deepening toward the middle, thinning out over its life
  const body = smoothstep(-0.05, 0.36, edge).mul(smoothstep(0, 0.6, edge).mul(0.6).add(0.4)).mul(float(1.1).sub(t.mul(0.55)));
  // as it ages the noise eats in from the edges, leaving wisps
  const torn = fbm(q.mul(4.2).add(vec3(11.3, 2.9, 7.7))).mul(0.5).add(0.5);
  const density = max(body.sub(pow(t, 1.5).mul(0.5).mul(torn.add(0.15))), 0);
  // a hot core that shrinks and cools
  const r = length(p);
  const core = t.oneMinus().mul(0.42).add(0.08);
  // hottest in the folds of the billows, where the burning gas is thickest, cool at their skins
  const veins = clamp(float(0.35).add(lumps.mul(1.6)), 0, 1.3);
  const heat = smoothstep(core, core.mul(0.1), r.sub(lumps.mul(0.3))).mul(veins).mul(pow(t.oneMinus(), 1.5));
  return { density, heat };
};

const fill: ComputeNode = Fn(() => {
  const id = instanceIndex;
  const x = id.mod(VOL), y = id.div(VOL).mod(VOL), z = id.div(VOL * VOL);
  const p = vec3(x.toFloat(), y.toFloat(), z.toFloat()).add(0.5).div(VOL / 2).sub(1);
  const t = moment.div(FLIP.frames - 1);
  const { density, heat } = puff(p, t);
  textureStore(volume, uvec3(x, y, z), vec4(density, heat, 0, 1));
})().compute(VOL ** 3, [64]);

/** The six directions the light is gathered from, in the sprite's frame: x right, y up, z toward the eye. */
const SIDES: [number, number, number][] = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];

const light: ComputeNode = Fn(() => {
  const id = instanceIndex;
  const tx = id.mod(FLIP.cell), ty = id.div(FLIP.cell);
  // the texel's place across the sprite, y up
  const u = tx.toFloat().add(0.5).div(FLIP.cell / 2).sub(1);
  const v = float(1).sub(ty.toFloat().add(0.5).div(FLIP.cell / 2));
  const at = (p: V3) => texture3D(volume, p.mul(0.5).add(0.5)).level(float(0));
  const seen = float(1).toVar();
  const lit = SIDES.map(() => float(0).toVar());
  const hot = float(0).toVar();
  const dz = 2 / STEPS, dl = 1.6 / LIGHT_STEPS;
  Loop(STEPS, ({ i }) => {
    const p = vec3(u, v, float(1 - dz / 2).sub(i.toFloat().mul(dz))).toVar();
    const here = at(p);
    const d = here.x.mul(SIGMA);
    const a = float(1).sub(exp(d.mul(-dz)));
    SIDES.forEach((s, k) => {
      // optical depth toward the light, with a little of the light scattered many times kept, as clouds keep it
      let tau: F = float(0);
      for (let j = 1; j <= LIGHT_STEPS; j++) tau = tau.add(at(p.add(vec3(s[0], s[1], s[2]).mul(j * dl))).x);
      tau = tau.mul(SIGMA * dl);
      const through = exp(tau.negate()).mul(0.72).add(exp(tau.mul(-0.22)).mul(0.28));
      lit[k].addAssign(seen.mul(a).mul(through));
    });
    hot.addAssign(seen.mul(a).mul(here.y));
    seen.mulAssign(a.oneMinus());
  });
  const alpha = seen.oneMinus();
  const per = float(1).div(max(alpha, 1e-4));
  const cell = moment.toUint();
  const ox = cell.mod(FLIP.cols).mul(FLIP.cell), oy = cell.div(FLIP.cols).mul(FLIP.cell);
  const to = uvec2(ox.add(tx), oy.add(ty));
  textureStore(SMOKE_SIDES, to, clamp(vec4(lit[0], lit[1], lit[2], lit[3]).mul(per), 0, 1));
  textureStore(SMOKE_DEPTH, to, vec4(clamp(lit[4].mul(per), 0, 1), clamp(lit[5].mul(per), 0, 1), clamp(hot.mul(per), 0, 1), alpha));
})().compute(FLIP.cell * FLIP.cell, [64]);

let baked = 0;

/** Bakes the next moment of the flipbook, if any are left; true once all are. */
export function bakeSmoke(renderer: WebGPURenderer): boolean {
  if (baked >= FLIP.frames) return true;
  moment.value = baked;
  renderer.compute(fill);
  renderer.compute(light);
  baked++;
  return baked >= FLIP.frames;
}
