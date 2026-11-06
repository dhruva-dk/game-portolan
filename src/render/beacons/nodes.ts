// The beacon kit's shaders as nodes: its noise, its rhythms, and the three kinds of material a beacon is made of (lit
// surfaces with glow, billboard particles and painted surfaces), each taking a look's TSL. A look hands each a
// function of what is in scope (the clock, the point in the beacon's own frame, the seeds) and gets back the colour,
// the glow, the motion or the shape.
//
// A glow is given as it reads against a lit deck and set at the lamps' scale, so an eye adapted to noon or to
// moonlight sees it the same; additive light is dimmed by the air between
// it and the eye but has no haze added over it; and the matter of smoke, mist and falling water is lit as a thin cloud
// by the sun and moon through the air and by the sky round it, instead of by a flat day colour.
import {
  AdditiveBlending, Color, DoubleSide, FrontSide, MeshBasicNodeMaterial, MeshStandardNodeMaterial, NormalBlending,
  type ColorRepresentation, type Node, type Side,
} from 'three/webgpu';
import {
  Fn, abs, attribute, cameraPosition, materialEmissive, cameraWorldMatrix, clamp, dot, exp, float, floor, fract, length, materialColor, materialRoughness, max, min,
  mix, modelViewMatrix, modelWorldMatrixInverse, normalLocal, normalView, normalize, positionGeometry, positionLocal, positionViewDirection,
  positionWorld, pow, reference, select, sin, smoothstep, uv, varying, varyingProperty, vec2, vec3, vec4,
} from 'three/tsl';
import { LAMP, P } from '../gpu/uniforms.ts';
import { aerialAt } from '../atmosphere/luts.ts';
import { thinCloudLight } from '../atmosphere/light.ts';
import { moved } from '../actors/tsl/kit.ts';
import type { Clock } from './kit.ts';

export type F = Node<'float'>;
export type V2 = Node<'vec2'>;
export type V3 = Node<'vec3'>;
export type V4 = Node<'vec4'>;

// ---------------------------------------------------------------- noise and rhythm

/** A hash of a point, 0…1 (Hoskins's hash without sine). */
export const bHash = Fn(([q]: [V3]) => {
  const p = fract(q.mul(vec3(0.1031, 0.103, 0.0973))).toVar();
  p.addAssign(dot(p, p.yxz.add(33.33)));
  return fract(p.x.add(p.y).mul(p.z));
}).setLayout({ name: 'bHash', type: 'float', inputs: [{ name: 'q', type: 'vec3' }] }) as unknown as (p: V3) => F;

/** A hash of a number, 0…1. */
export const bHash1 = (n: F): F => fract(sin(n).mul(43758.5453123));

/** Smooth value noise, 0…1. */
export const bNoise = Fn(([x]: [V3]) => {
  const i = floor(x), f0 = fract(x);
  const f = f0.mul(f0).mul(float(3).sub(f0.mul(2)));
  const h = (dx: number, dy: number, dz: number) => bHash(i.add(vec3(dx, dy, dz)));
  return mix(
    mix(mix(h(0, 0, 0), h(1, 0, 0), f.x), mix(h(0, 1, 0), h(1, 1, 0), f.x), f.y),
    mix(mix(h(0, 0, 1), h(1, 0, 1), f.x), mix(h(0, 1, 1), h(1, 1, 1), f.x), f.y),
    f.z,
  );
}).setLayout({ name: 'bNoise', type: 'float', inputs: [{ name: 'x', type: 'vec3' }] }) as unknown as (p: V3) => F;

/** Four octaves of bNoise, 0…1. */
export const bFbm = Fn(([q]: [V3]) => {
  const p = q.toVar(), s = float(0).toVar();
  for (const a of [0.5, 0.25, 0.125, 0.0625]) {
    s.addAssign(bNoise(p).mul(a));
    p.assign(p.mul(2.03).add(17.1));
  }
  return s.div(0.9375);
}).setLayout({ name: 'bFbm', type: 'float', inputs: [{ name: 'q', type: 'vec3' }] }) as unknown as (p: V3) => F;

/** Two quick beats then a rest, period p: the same rhythm as heartbeat() in the kit. */
export function bBeat(t: F, p: number | F): F {
  const x = fract(t.div(p));
  const a = x.sub(0.08).div(0.035), b = x.sub(0.2).div(0.04);
  return min(1, exp(a.mul(a).negate()).add(exp(b.mul(b).negate()).mul(0.7)));
}

/** A fully saturated hue, h in 0…1 round the wheel. */
export function bHue(h: F): V3 {
  return clamp(abs(fract(vec3(h).add(vec3(0, 2 / 3, 1 / 3))).mul(6).sub(3)).sub(1), 0, 1);
}

/** A colour as a node, linear, times `scale`. */
export function rgb(c: ColorRepresentation, scale = 1): V3 {
  const col = new Color(c);
  return vec3(col.r * scale, col.g * scale, col.b * scale);
}

/** Reads a `{ value }` record each time the object is drawn, as a float. */
export function num(rec: { value: number }): F {
  return reference('value', 'float', rec) as unknown as F;
}

// ---------------------------------------------------------------- the clock

/** The beacon's clock as nodes: seconds, and 0 for full day up to 1 for full night where it stands. */
export interface Clocked { t: F; night: F }

export function clocked(clock: Clock): Clocked {
  return { t: num(clock.uTime), night: num(clock.uNight) };
}

/**
 * A glow as it reads against a lit deck, set at the lamps' scale, and stronger again at night: a beacon is the
 * region's light, the brightest thing in it once the eye has adapted to the moon, where a lantern is only a ship's.
 */
function lamp(c: V3): V3 {
  return c.mul(LAMP).mul(mix(2.5, 15, P.night));
}

/** How much of the light from here reaches the eye through the air. */
function airLoss(): V3 {
  return aerialAt(positionWorld).loss;
}

// ---------------------------------------------------------------- lit surfaces

/** What a lit surface's fragment TSL has to hand: the point and its normal in the beacon's frame (after any instance's
 *  matrix), the clock, a fresnel term, and the colour so far. */
export interface LitCtx extends Clocked { local: V3; ln: V3; fres: F; colour: V3 }

export interface LitNodes {
  /** Moves a vertex: from `p` (in the mesh's own space, after any instance's matrix) to where it returns. */
  vertexNode?: (c: Clocked & { p: V3 }) => V3;
  /** The surface's colour. */
  albedoNode?: (c: LitCtx) => V3;
  /** The light it gives off (set at the lamps' scale). */
  emissiveNode?: (c: LitCtx) => V3;
  /** Its roughness, from the material's. */
  roughNode?: (c: LitCtx & { rough: F }) => F;
}

export interface LitBase {
  color: ColorRepresentation; roughness?: number; metalness?: number; flat?: boolean; side?: Side; transparent?: boolean; opacity?: number;
}

export function litNode(clock: Clock, o: LitBase & LitNodes): MeshStandardNodeMaterial {
  const m = new MeshStandardNodeMaterial({
    color: o.color, roughness: o.roughness ?? 0.8, metalness: o.metalness ?? 0, flatShading: o.flat ?? false,
    side: o.side ?? FrontSide, transparent: o.transparent ?? false, opacity: o.opacity ?? 1,
  });
  const c = clocked(clock);
  const vLocal = varyingProperty('vec3', 'vBeaconLocal') as unknown as V3;
  const vLN = varyingProperty('vec3', 'vBeaconNormal') as unknown as V3;
  m.positionNode = Fn(() => {
    vLocal.assign(positionLocal);
    vLN.assign(normalLocal);
    if (!o.vertexNode) return positionLocal;
    return moved(o.vertexNode({ ...c, p: positionLocal as unknown as V3 }));
  })();
  const fres = pow(float(1).sub(clamp(abs(dot(normalView, positionViewDirection)), 0, 1)), 3);
  const ctx: LitCtx = { ...c, local: vLocal, ln: normalize(vLN), fres, colour: materialColor as unknown as V3 };
  if (o.albedoNode) m.colorNode = o.albedoNode(ctx);
  if (o.emissiveNode) m.emissiveNode = lamp(o.emissiveNode(ctx));
  if (o.roughNode) m.roughnessNode = o.roughNode({ ...ctx, rough: materialRoughness as unknown as F });
  return m;
}

// ---------------------------------------------------------------- billboard particles

/** What a particle's motion sets: its place in the beacon's frame, half-width, alpha, colour, how much longer than
 *  wide it is drawn along `dir`, and `dir` itself. */
export interface Motion { pos?: V3; size?: F | number; alpha?: F | number; col?: V3; stretch?: F | number; dir?: V3 }

/** What a particle's shape has to hand: where across the quad (−1…1), the squared distance from its middle, its
 *  colour and alpha, and its first seed. */
export interface ShapeCtx { c: V2; r2: F; col: V3; a: F; seed: F }

export interface ParticleNodes {
  motionNode: (c: Clocked & { s: V4; pos: V3 }) => Motion;
  shapeNode?: (c: ShapeCtx) => F;
}

export interface ParticleBase {
  color: ColorRepresentation; day: number; night: number; blend?: 'add' | 'alpha'; matter?: ColorRepresentation; nearFade?: number;
}

/** Soft round glow: a hot core in a wide falloff. */
export const shapeSoft = ({ r2 }: ShapeCtx): F => exp(r2.mul(-4.5)).mul(float(1).sub(r2));
/** A tight spark with a faint halo. */
export const shapeSpark = ({ r2 }: ShapeCtx): F => exp(r2.mul(-28)).add(exp(r2.mul(-5)).mul(float(1).sub(r2)).mul(0.18));
/** A flame tongue: pointed at the top, round at the bottom. */
export const shapeFlame = ({ c, r2 }: ShapeCtx): F => {
  const w = float(1).sub(smoothstep(-1, 1, c.y).mul(0.85));
  const y = c.y.add(0.25);
  return exp(c.x.mul(c.x).div(max(0.02, w.mul(w).mul(0.32))).negate().sub(y.mul(y).mul(1.6))).mul(float(1).sub(r2.mul(0.5)));
};
/** A cloud puff for smoke and mist. */
export const shapePuff = ({ c, r2, seed }: ShapeCtx): F =>
  smoothstep(1, 0, r2).mul(bNoise(vec3(c.mul(2.3), seed.mul(37))).mul(0.4).add(0.6));
/** One soft halo with a brighter heart. */
export const shapeHalo = ({ r2 }: ShapeCtx): F =>
  exp(r2.mul(-3.2)).mul(float(1).sub(r2)).mul(0.85).add(exp(r2.mul(-14)).mul(0.4));

const asF = (v: F | number | undefined, d: number): F => (v === undefined ? float(d) : typeof v === 'number' ? float(v) : v);

/** The material for the kit's instanced quads (seeds in `aSeed`, bases in `aBase`), moved and shaped by the look's TSL. */
export function particlesNode(clock: Clock, o: ParticleBase & ParticleNodes): MeshBasicNodeMaterial {
  const add = o.blend !== 'alpha';
  const m = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: DoubleSide, blending: add ? AdditiveBlending : NormalBlending });
  m.fog = !add;
  const c = clocked(clock);
  const s = attribute<'vec4'>('aSeed') as V4, base = attribute<'vec3'>('aBase') as V3;
  const mo = o.motionNode({ ...c, s, pos: base });
  const pos = mo.pos ?? base, size = asF(mo.size, 1), stretch = asF(mo.stretch, 0), dir = mo.dir ?? vec3(0, 1, 0);
  let alpha = asF(mo.alpha, 1);
  const col = mo.col ?? vec3(1);
  const mv = modelViewMatrix.mul(vec4(pos, 1));
  const dv = modelViewMatrix.mul(vec4(dir, 0)).xyz;
  const dl = length(dv.xy);
  const up = select(dl.greaterThan(1e-4), dv.xy.div(max(dl, 1e-4)), vec2(0, 1));
  const rt = vec2(up.y, up.x.negate());
  // a stretched quad only grows along dir as far as dir faces across the view
  const along = float(1).add(stretch.mul(clamp(dl.div(max(length(dv), 1e-4)), 0, 1)));
  const q = positionGeometry.xy;
  const corner = mv.xy.add(rt.mul(q.x).add(up.mul(q.y).mul(along)).mul(size));
  if (o.nearFade) alpha = alpha.mul(smoothstep(o.nearFade * 0.4, o.nearFade, mv.z.negate()));
  const world = cameraWorldMatrix.mul(vec4(corner, mv.z, 1));
  m.positionNode = Fn(() => moved(modelWorldMatrixInverse.mul(world).xyz))();

  const vc = varying(q, 'vBeaconC') as unknown as V2;
  const va = varying(alpha, 'vBeaconA') as unknown as F;
  const vcol = varying(col, 'vBeaconCol') as unknown as V3;
  const vseed = varying(s.x, 'vBeaconSeed') as unknown as F;
  const r2 = dot(vc, vc);
  const shape = (o.shapeNode ?? shapeSoft)({ c: vc, r2, col: vcol, a: va, seed: vseed });
  const gain = mix(float(o.day), float(o.night), c.night);
  const glow = rgb(o.color).mul(vcol).mul(gain);
  m.opacityNode = select(r2.greaterThan(1), float(0), clamp(shape.mul(va), 0, 1));
  m.alphaTest = 0.003;
  if (add) m.colorNode = lamp(glow).mul(airLoss());
  else m.colorNode = rgb(o.matter ?? 0).mul(vcol).mul(thinCloudLight(positionWorld)).add(lamp(glow));
  return m;
}

// ---------------------------------------------------------------- painted surfaces

/** What a surface's paint sets: how bright its glow is, its colour (times the material's) and its alpha. */
export interface Paint { glow?: F; col?: V3; alpha?: F }

export interface SurfaceNodes {
  paintNode: (c: Clocked & { uv: V2; local: V3 }) => Paint;
  /** Moves a vertex from `p` in the mesh's space, by its uv. */
  vertexNode?: (c: Clocked & { p: V3; uv: V2 }) => V3;
}

export interface SurfaceBase {
  color: ColorRepresentation; day: number; night: number; blend?: 'add' | 'alpha'; matter?: ColorRepresentation; faceY?: boolean; side?: Side;
}

export function surfaceNode(clock: Clock, o: SurfaceBase & SurfaceNodes): MeshBasicNodeMaterial {
  const add = o.blend !== 'alpha';
  const m = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: o.side ?? DoubleSide, blending: add ? AdditiveBlending : NormalBlending });
  m.fog = !add;
  const c = clocked(clock);
  const vLocal = varyingProperty('vec3', 'vBeaconLocal') as unknown as V3;
  m.positionNode = Fn(() => {
    let p = (o.vertexNode ? o.vertexNode({ ...c, p: positionLocal as unknown as V3, uv: uv() }) : positionLocal) as V3;
    if (o.faceY) {
      // turned about the mesh's own up to face the eye
      const eye = modelWorldMatrixInverse.mul(vec4(cameraPosition, 1)).xyz;
      const d = length(eye.xz);
      const to = select(d.greaterThan(1e-3), eye.xz.div(max(d, 1e-3)), vec2(0, 1));
      p = vec3(to.y.mul(p.x), p.y, to.x.negate().mul(p.x)).add(vec3(to.x, 0, to.y).mul(p.z));
    }
    vLocal.assign(p);
    return o.vertexNode || o.faceY ? moved(p) : p;
  })();
  const paint = o.paintNode({ ...c, uv: uv(), local: vLocal });
  const glowAmt = paint.glow ?? float(1), col = paint.col ?? vec3(1), alpha = paint.alpha ?? float(1);
  const gain = mix(float(o.day), float(o.night), c.night);
  const glow = rgb(o.color).mul(col).mul(glowAmt).mul(gain);
  if (add) {
    m.colorNode = lamp(max(glow, vec3(0))).mul(airLoss());
  } else {
    m.colorNode = rgb(o.matter ?? 0).mul(col).mul(thinCloudLight(positionWorld)).add(lamp(glow));
    m.opacityNode = clamp(alpha, 0, 1);
    m.alphaTest = 0.003;
  }
  return m;
}

// ---------------------------------------------------------------- plain glows

/** An unlit glow that reads from far off at night: `colour` times `level`, at the lamps' scale, hazed as any surface. */
export function glowNode(colour: ColorRepresentation, level: { value: number }): MeshBasicNodeMaterial {
  const m = new MeshBasicNodeMaterial();
  m.colorNode = lamp(rgb(colour).mul(num(level)));
  return m;
}

/** A see-through glow added over what lies behind it: `colour` times `level` at the lamps' scale, dimmed by the air
 *  between it and the eye. */
export function addedGlowNode(colour: ColorRepresentation, level: number): MeshBasicNodeMaterial {
  const m = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: AdditiveBlending, fog: false });
  m.colorNode = lamp(rgb(colour).mul(level)).mul(airLoss());
  return m;
}

/** A standard surface whose emissive colour is a faint glow of its own, set at the actors' scale for glows so it reads
 *  at night as it does by day instead of blazing once the eye has adapted to moonlight. */
export function faintGlowNode(params: ConstructorParameters<typeof MeshStandardNodeMaterial>[0]): MeshStandardNodeMaterial {
  const m = new MeshStandardNodeMaterial(params);
  m.emissiveNode = materialEmissive.mul(LAMP).mul(2.5);
  return m;
}
