// The storm as the eye sees it (its rules are sim/storm.ts): outside the safe cap, a storm front. Seen from the calm,
// a wall standing at the cap's edge: rain from the sea up to a dark, rolled cloud base, and over it the cloud's face
// leaning back, tower behind tower, to a crown of lit billows against the sky (storm-field.ts); lightning in it every
// few seconds (storm-bolt.ts). From inside it: under the dark base, in driving rain, the sea and the ships near still
// in sight, dimmed. From high over it (the full map, in space): its crown's top, ringed by the face along its edge.
//
// The cloud and the rain are marched along the eye's ray from where it enters the storm's reach, a few dozen metres
// out over the calm (the edge is a cone from the planet's centre, so the ray meets it at the roots of a quadratic);
// past the march, what is left of the ray in the storm is taken as its even, thinner air (SIGMA).
//
// What it gives the sky (sky.ts):
//   depth(p)           0…1, how deep in the storm world position p lies: 0 in the cap, 1 SOFT metres past its edge
//   edge(p)            metres p lies past the cap's edge (negative in the calm): the sea draws the edge's line from it
//   veil(c, dir, m)    colour c seen m metres away along world direction dir from the eye, through the storm
//   dim(c, dir)        the same for the sky beyond it, without the march: for what a mirror shows (sky.reflect)
//   deck(c, dir, m)    the same seen from high over its top (the full map's eye, in space)

import { Vector3, type Storage3DTexture, type UniformNode } from 'three/webgpu';
import {
  Fn, If, abs, clamp, dot, exp, float, interleavedGradientNoise, max, min, mx_noise_float, normalize, screenCoordinate, select,
  smoothstep, sqrt, uniform, vec3,
} from 'three/tsl';
import type { Cap } from '../sim/storm';
import type { View } from '../view/view';
import { R, type Vec3 } from '../world/sphere';
import { createBolt } from './storm-bolt';
import { BASE, TOP, createStormField, type FieldLight } from './storm-field';
import type { BoolNode, FloatNode, Vec3Node } from '../tsl';

/** Its density rises from nothing at the cap's edge to full this many metres past it. */
const SOFT = 25;
/** Extinction in the storm's air past the march, per metre: a ship 60 m off in it is still there, dimmed (e⁻¹); and
 * its light there, as a share of the storm's air light. */
const SIGMA = 1 / 60, FAR_LIGHT = 0.7;
/** The cloud the mirror shows: its extinction through the storm, per metre, and its light. */
const MIRROR_SIGMA = 1 / 30, MIRROR_LIGHT = 0.8;
/**
 * The rain seen from inside: streaks this fine across (cycles over the sky's circle) and long down it, falling this
 * fast (sky heights a second), leaning with the wind; as light, this share of the storm's over the streaks.
 */
const STREAK = 220, STREAK_LONG = 3.5, STREAK_FALL = 1.6, STREAK_LEAN = 0.3, STREAK_LIGHT = 0.4;

/** The light the storm is drawn with (sky.ts): the storm's own air light, the sun's on a white surface square to it,
 * and toward the sun (world). */
export interface StormLight { air: Vec3Node; sun: Vec3Node; toward: Vec3Node }

/** shape: the clouds' Perlin-Worley volume (cloud-noise.ts); held: the lightning held lit (debug.ts ?bolt). */
export function createStormLook(view: View, shape: Storage3DTexture, held: boolean) {
  const centre = uniform(new Vector3(0, 1, 0));
  const radius = uniform(Math.PI);
  const outerCosine = uniform(-1);
  const clock = uniform(0), whole = uniform(1);
  const across: [UniformNode<'vec3', Vector3>, UniformNode<'vec3', Vector3>] = [
    uniform(new Vector3(1, 0, 0)), uniform(new Vector3(0, 0, 1)),
  ];
  const size = uniform(R);
  const field = createStormField({ centre, radius, whole, clock, across, size }, shape);
  const bolt = createBolt(held);

  /** Metres world position p lies past the cap's edge (far inside it everywhere while the cap is the whole planet). */
  const edge = (p: Vec3Node): FloatNode => field.edge(normalize(p));
  /** 0…1 how deep in the storm world position p lies. */
  const depth = (p: Vec3Node): FloatNode => smoothstep(0, SOFT, edge(p));

  /**
   * The eye's ray along world direction dir, up to `metres`: where it enters the storm's reach (the cone OUTERMOST
   * metres out from the edge, whose cosine is outerCosine) under its TOP, and where it leaves the storm's air or meets
   * what the pixel shows. Equal when it never enters.
   */
  const span = (dir: Vec3Node, metres: FloatNode): { enter: FloatNode; leave: FloatNode } => {
    const o = view.position, d = dir, k = outerCosine;
    const a = dot(o, centre), b = dot(d, centre), oo = dot(o, o), od = dot(o, d), k2 = k.mul(k);
    // the storm's shell: where the ray is below TOP, and in front of what the pixel shows
    const h = od.mul(od).sub(oo.sub((R + TOP) * (R + TOP)));
    const half = sqrt(max(h, 0));
    const lo = max(od.negate().sub(half), 0);
    const hi = select(h.lessThan(0), lo, max(min(od.negate().add(half), metres), lo));
    // (a + tb)² = cos²·|o + td|²: the cone and its mirror, which the pieces' midpoints tell apart
    const A = b.mul(b).sub(k2), B = a.mul(b).sub(k2.mul(od)).mul(2), C = a.mul(a).sub(k2.mul(oo));
    const disc = B.mul(B).sub(A.mul(C).mul(4));
    const A2 = select(abs(A).lessThan(1e-7), float(1e-7), A).mul(2), root = sqrt(max(disc, 0));
    const r1 = B.negate().sub(root).div(A2), r2 = B.negate().add(root).div(A2);
    const t1 = select(disc.lessThan(0), hi, clamp(min(r1, r2), lo, hi));
    const t2 = select(disc.lessThan(0), hi, clamp(max(r1, r2), lo, hi));
    const outside = (t: FloatNode): BoolNode => field.edge(normalize(o.add(d.mul(t)))).greaterThan(field.OUTERMOST);
    // the first of the pieces lo…t1, t1…t2, t2…hi whose midpoint lies outside the cap: a at its start, or what follows
    const first = (a: FloatNode, b: FloatNode, then: FloatNode): FloatNode => select(outside(a.add(b).mul(0.5)), a, then);
    const enter = first(lo, t1, first(t1, t2, first(t2, hi, hi)));
    return { enter, leave: select(whole.greaterThan(0), enter, hi) };
  };

  /** Colour c seen `metres` along world direction dir from the eye, through the storm lit by `light`, marched: in a
   *  function of its own (Fn), as the march's branches and variables need one, whichever shader it is called in. */
  const through = (c: Vec3Node, dir: Vec3Node, metres: FloatNode, light: StormLight): Vec3Node => Fn(() => {
    const seen = c.toVar();
    const { enter, leave } = span(dir, metres);
    If(leave.greaterThan(enter), () => {
      const o = view.position;
      const lit: FieldLight = { ...light, glow: (q) => bolt.glow(light.air, q) };
      const mark = bolt.nearest(o, dir);
      const jitter = interleavedGradientNoise(screenCoordinate);
      const m = field.march(o, dir, enter, leave, jitter, mark, lit);
      // past the march, the rest of the ray in the storm: its even air
      const end = o.add(dir.mul(m.reached));
      const rest = exp(max(leave.sub(m.reached), 0).mul(depth(end)).mul(-SIGMA));
      const far = light.air.mul(FAR_LIGHT).add(bolt.glow(light.air, end));
      const T = m.T.mul(rest);
      seen.assign(c.mul(T).add(m.light).add(far.mul(m.T.mul(float(1).sub(rest)))));
      If(bolt.flash.greaterThan(0), () => {
        seen.addAssign(bolt.channel(light.air, o, dir, metres, m.atMark));
      });
    });
    return seen;
  })();

  /** Colour c seen m metres along world direction dir from the eye, through the storm lit by `light`. */
  const veil = (c: Vec3Node, dir: Vec3Node, metres: FloatNode, light: StormLight): Vec3Node => {
    const seen = through(c, dir, metres, light);
    // from inside, the rain driving past the eye: streaks fixed to the sky's directions, falling
    const d = view.toSky(dir);
    const down = d.y.add(d.x.mul(STREAK_LEAN)).mul(STREAK_LONG).add(clock.mul(STREAK_FALL));
    const fall = mx_noise_float(vec3(d.x.mul(STREAK), down, d.z.mul(STREAK)));
    const under = smoothstep(BASE, BASE * 0.6, view.height);
    const streaks = smoothstep(0.45, 0.8, fall).mul(depth(view.position)).mul(under).mul(STREAK_LIGHT);
    return seen.add(light.air.add(bolt.glow(light.air, view.position)).mul(streaks));
  };

  /** What a mirror (the sea) shows of the storm, cheaply: the length of the ray in its reach, as an even cloud. */
  const dim = (c: Vec3Node, dir: Vec3Node, light: StormLight): Vec3Node => {
    const { enter, leave } = span(dir, float(1e5));
    const deep = max(depth(view.position.add(dir.mul(leave.add(enter).mul(0.5)))), 0.3);
    const T = exp(leave.sub(enter).mul(deep).mul(-MIRROR_SIGMA));
    return c.mul(T).add(light.air.mul(MIRROR_LIGHT).mul(float(1).sub(T)));
  };

  return {
    depth,
    edge,
    veil,
    dim,
    /** Colour c seen m metres along world direction dir from an eye high over the storm (the full map's, from space):
     *  the march alone, without the rain driving past the eye. */
    deck: through,
    /** The storm now (sim/storm.ts); seconds: the world's clock (Environment.clock), which its rain, billows and
     *  lightning run on; eye: where the eye is (world, m). */
    update(cap: Cap, seconds: number, eye: Vec3) {
      centre.value.fromArray(cap.centre);
      radius.value = cap.radius;
      // two axes square to the centre, for the bays along the edge
      const [one, two] = across;
      one.value.set(0, 1, 0).cross(centre.value);
      if (one.value.lengthSq() < 1e-6) one.value.set(1, 0, 0).cross(centre.value);
      one.value.normalize();
      two.value.crossVectors(centre.value, one.value);
      size.value = R * Math.sin(Math.min(cap.radius, Math.PI - 0.01));
      const all = cap.radius >= Math.PI - 0.01;
      whole.value = all ? 1 : 0;
      outerCosine.value = Math.cos(Math.max(0, Math.min(Math.PI, cap.radius + field.OUTERMOST / R)));
      clock.value = seconds;
      bolt.update(cap, seconds, eye, all);
    },
  };
}
