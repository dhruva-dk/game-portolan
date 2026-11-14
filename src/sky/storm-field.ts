// The storm's cloud and rain as the eye's ray is marched through them (storm.ts draws with it).
//
// The storm stands at the safe cap's edge (sim/storm.ts), and everything here is laid out by how far past that edge a
// point lies (e, metres along the sea; negative in the calm) and how high it is (h, metres over the sea):
//   rain       from the edge in, under the cloud's base: shafts of heavier rain in thinner, streaked, falling
//   the base   BASE metres up, all but level (rolls along the edge any deeper read as stripes), its front out over the calm
//   the cloud  over the base, its face leaning back LEAN metres a metre up, so the eye in the calm sees the towers
//              rise behind one another to a crown of billows at CROWN against the sky; along the edge the towers
//              stand forward and back in bays and headlands
// Billows and shafts come from the clouds' baked Perlin-Worley volume (cloud-noise.ts).
//
// The cloud is dense enough to be taken as a surface: the billows' (the face, crown and base pushed out and in by
// them). The march finds where the ray first crosses it (between two samples, by their distances in from it), and
// the cloud there is lit as a surface: by which way it faces (its slope read from the billows), the sky over it,
// how high it stands (dark at its base, bright at its crown), the sun on it and, against the sun, its silver lining.
// A ray that passes close by without crossing it sees its edge, soft over a pixel or so. The rain in front is summed
// along the way.
//
// The march: from where the ray enters the storm (or the eye), the step is the distance to the nearest cloud or rain
// while there is none (the bounds below, then the billows' own surface), and STEP, growing with distance, in the rain.

import { Break, If, acos, atan, clamp, cos, dot, exp, float, length, max, min, mix, normalize, pow, select, sin, smoothstep, sqrt, texture3D, vec3 } from 'three/tsl';
import type { Storage3DTexture } from 'three/webgpu';
import { R } from '../world/sphere';
import { STORM_FOOT } from '../palette';
import { loop, type FloatNode, type Vec3Node } from '../tsl';

/** The cloud's base, metres up, and how far its rolls lift and lower it, each ROLL_WIDTH metres across: barely, since
 *  deeper rolls, seen from the calm, lie as rows of wood-grain stripes over the wall's foot (review21–23). */
export const BASE = 58;
const ROLL = 0.5, ROLL_WIDTH = 26;
/** How far the base's front stands out over the calm (metres, negative: in the calm), and how far the face leans back
 * a metre up; how far its billows reach either side of it. */
const SHELF = -12, LEAN = 0.8, FACE = 60;
/** Along the edge the towers stand forward and back over the base, in bays and headlands: by up to BAY metres, the
 * swells WAVES metres apart (two, crossing). */
const BAY = 40, WAVES = [140, 61] as const;
/** The crown's mean height, metres, and how far its billows rise and fall about it. */
const CROWN = 250, CROWN_BILLOW = 95;
/** The storm's air ends this high, over its tallest billows. */
export const TOP = CROWN + CROWN_BILLOW + 10;
/** The billows' pattern repeats every this many metres (its largest cells a quarter of it), and drifts this fast. */
const CLOUD_TILE = 380, CHURN = [0.6, 0.35, 0.2] as const;
/** The finer billows on them: their pattern's tile, as a share of the coarser's. Their slope is read across SLOPE
 * metres. */
const FINE = 0.29, SLOPE = 5;
/** The billows folded into heaps: their fold scaled by PUFF and lowered by PUFF_MID, back to about −1…1; the crease
 *  between heaps rounded over CREASE of the fold. */
const PUFF = 1.5, PUFF_MID = 0.75, CREASE = 0.25;
/** The round heads over the heaps (the coarse Worley's cells, domed): how far they reach, in the billows' units, and
 *  their mean (so the wall stands where it did). */
const HEADS = 1.0, HEAD_MID = 0.5;
/** The heads' pattern's tile as a share of the billows' (its cells a quarter of it: about 115 m, so the crown is a bank
 *  of many heads, as art/target/idea.png's, rather than a few the wall's height that read as one slab). */
const HEAD_TILE = 1.2;
/** The rain's pattern: across (its shafts a quarter of it), along its fall, how far it leans a metre down, how fast it
 * falls (m/s); and how far in from the edge it thickens. */
const RAIN_TILE = 90, RAIN_LONG = 520, RAIN_LEAN = 0.25, FALL = 11, RAIN_RAMP = 10;
/** The rain's extinction, per metre, thin and heavy. */
const RAIN_THIN = 1 / 300, RAIN_HEAVY = 1 / 45;
/** The step in the rain at the eye, metres, how much longer it grows a metre further off, and the most steps. */
const STEP = 5, GROW = 0.035, STEPS = 28;
/** The cloud's edge, where the ray passes close by it, is soft over this many metres, and this share of the distance
 * more (about a pixel). */
const SOFT = 1, SOFT_FAR = 0.004;
/** The cloud's light, as shares of the storm's air light: at its base and its crown; the rain's. */
const DARK = 0.45, BRIGHT = 2.6, RAIN_LIGHT = 0.95;
/** The light from the calm on whatever of the cloud faces it, as a share of the storm's air light. */
const CALM = 0.3;
/** The sun's light on the cloud, as a share of a white surface's, and on its thin edges seen against the sun (the
 * silver lining). */
const SUNLIT = 0.55, LINING = 0.15;
/** Two tones, as the world's solids (sky/light.ts): the cloud is in its crown's light or its base's, the edge between
 *  where its height and its facing the sun together cross TONE_AT, over TONE_EDGE, so it follows the billows. */
const TONE_AT = 0.4, TONE_EDGE = 0.04;
/** How much a billow's facing the sky lifts it toward the crown's tone, so each head is lit over and dark under. */
const SKYWARD = 0.8;
/** The warm rim along the face's foot: the sunlit calm's gold light (palette STORM_FOOT) thrown up onto whatever of
 *  the face looks out over it, as a share of the sun's on a white surface, fading out RIM_UP metres over the base. */
const RIM = 0.5, RIM_UP = 45;
/** The storm's state as the shaders read it (storm.ts's uniforms). */
export interface Cap {
  centre: Vec3Node;
  radius: FloatNode;
  whole: FloatNode;
  clock: FloatNode;
  /** Two axes square to the centre and each other, and the metres along the edge a radian round them. */
  across: [Vec3Node, Vec3Node];
  size: FloatNode;
}

/** The light the field is lit by: the storm's own air's (violet), the sun's on a white surface square to it (world
 * direction `toward`), and any lightning's (glow(q): radiance at world position q). */
export interface FieldLight { air: Vec3Node; sun: Vec3Node; toward: Vec3Node; glow(q: Vec3Node): Vec3Node }

/** What a march gives: the light along the ray (radiance), what survives of what lies behind, how far it got (m), and
 * what survived to `mark` metres along. */
export interface Marched { light: Vec3Node; T: FloatNode; reached: FloatNode; atMark: FloatNode }

const hg = (c: FloatNode, g: number): FloatNode => float((1 - g * g) / (4 * Math.PI)).div(pow(float(1 + g * g).sub(c.mul(2 * g)), 1.5));

export function createStormField(cap: Cap, shape: Storage3DTexture) {
  /** Metres past the cap's edge over the unit vector u. */
  const edge = (u: Vec3Node): FloatNode => acos(clamp(dot(u, cap.centre), -1, 1)).sub(cap.radius).mul(R).sub(cap.whole.mul(1e4));
  /** The nearest the cloud or rain comes to the calm, metres past the edge (negative). */
  const OUTERMOST = SHELF - FACE - BAY * 0.6;
  const churn = vec3(...CHURN).mul(cap.clock);

  /** The billows at q, about −1…1: the Perlin-Worley's cells, finer ones on them. */
  const billows = (q: Vec3Node): FloatNode => {
    const n = texture3D(shape, q.add(churn).div(CLOUD_TILE)).level(float(0));
    const f = texture3D(shape, q.sub(churn).div(CLOUD_TILE * FINE)).level(float(0));
    // folded about its middle, the fold rounded (so the march, which steps by the field, doesn't terrace it): rounded
    // heads with creases between, as cumulus heaps
    const x = n.r.mul(0.55).add(n.b.mul(0.15)).add(f.r.mul(0.3)).sub(0.4).mul(2.8);
    // and over them the coarse Worley's cells as round heads (a dome over each: the cell's inverted distance,
    // rounded), so the wall stands as heaped cumulus rather than a sheet
    const g = clamp(texture3D(shape, q.add(churn).div(CLOUD_TILE * HEAD_TILE)).level(float(0)).g, 0, 1), dome = sqrt(g.mul(float(2).sub(g)));
    return sqrt(x.mul(x).add(CREASE * CREASE)).mul(PUFF).sub(PUFF_MID).add(dome.sub(HEAD_MID).mul(HEADS));
  };

  /** The cloud at q (up: its unit vector, h: its height, e: past the edge): how far in from its surface q is
   * (negative: out of it), from each of its face, crown and base, and the billows there. */
  const cloudAt = (q: Vec3Node, up: Vec3Node, h: FloatNode, e: FloatNode) => {
    const lift = billows(q);
    const roll = e.mul((2 * Math.PI) / ROLL_WIDTH).add(lift.mul(2));
    const base = float(BASE).add(sin(roll).mul(ROLL));
    // the billows grow with height: small and tight over the shelf, towers higher up, which stand forward and back
    const reach = mix(0.45, 1, smoothstep(BASE, CROWN * 0.7, h));
    const along = atan(dot(up, cap.across[0]), dot(up, cap.across[1])).mul(cap.size);
    const bay = sin(along.div(WAVES[0])).mul(0.6).add(sin(along.div(WAVES[1]).add(1.3)).mul(0.4)).add(0.4).mul(BAY);
    const front = float(SHELF).add(max(h.sub(base), 0).mul(LEAN)).add(bay.mul(mix(0.4, 1, smoothstep(BASE, BASE + 50, h))));
    const face = e.sub(front).add(lift.mul(FACE).mul(reach));
    const top = float(CROWN).add(lift.mul(CROWN_BILLOW)).sub(h);
    const under = h.sub(base).add(lift.mul(5)).mul(1.5);
    // the base's slope across its rolls (metres up a metre in)
    const rolling = cos(roll).mul((ROLL * 2 * Math.PI) / ROLL_WIDTH);
    return { lift, reach, face, top, under, rolling, inside: min(min(face, top), under) };
  };

  /** The cloud's light at q on its surface, seen along d. */
  const shade = (q: Vec3Node, d: Vec3Node, lit: FieldLight): Vec3Node => {
    const up = normalize(q), h = length(q).sub(R);
    const c = cloudAt(q, up, h, edge(up));
    // the surface: the crown's top (up), the base (down) or the face (out over the calm, leaning up), bent by the
    // billows' slope
    const out = normalize(up.mul(dot(up, cap.centre)).sub(cap.centre));
    const onTop = c.top.lessThan(min(c.face, c.under)), onBase = c.under.lessThan(c.face);
    const flat = select(onTop, up, select(onBase, normalize(up.negate().add(out.mul(c.rolling))), normalize(up.mul(LEAN).sub(out))));
    const slope = vec3(billows(q.add(vec3(SLOPE, 0, 0))), billows(q.add(vec3(0, SLOPE, 0))), billows(q.add(vec3(0, 0, SLOPE)))).sub(c.lift).div(SLOPE);
    const amplitude = select(onTop, float(CROWN_BILLOW), select(onBase, float(5), c.reach.mul(FACE)));
    const normal = normalize(flat.sub(slope.mul(amplitude)));
    const high = smoothstep(BASE, CROWN, h);
    const facing = clamp(dot(normal, lit.toward), 0, 1);
    const tone = smoothstep(TONE_AT - TONE_EDGE, TONE_AT + TONE_EDGE, high.mul(0.35).add(facing.mul(0.55)).add(c.lift.mul(0.3)).add(dot(normal, up).mul(SKYWARD)));
    // the sky's light from above (the sea's, under the base), less in the hollows between the billows
    const sky = max(dot(normal, up).mul(0.45).add(0.6), 0.3).mul(clamp(c.lift.mul(0.3).add(0.9), 0.7, 1.2));
    // and the light of the open, sunlit calm, coming in level under the shelf
    const toCalm = clamp(dot(normal, out.negate()), 0, 1);
    const air = lit.air.mul(mix(DARK, BRIGHT, tone).mul(sky).add(toCalm.mul(CALM)));
    const sun = lit.sun.mul(tone.mul(high).mul(SUNLIT / Math.PI));
    // against the sun, its light through the billows' thin edges
    const lining = lit.sun.mul(hg(dot(d, lit.toward), 0.6).mul(LINING * 4 * Math.PI)).mul(high).mul(float(1).sub(clamp(dot(normal, d.negate()), 0, 1)));
    const rim = lit.sun.mul(vec3(...STORM_FOOT)).mul(toCalm.mul(float(1).sub(smoothstep(BASE, BASE + RIM_UP, h))).mul(RIM / Math.PI));
    return air.add(sun).add(lining).add(rim).add(lit.glow(q));
  };

  /**
   * Marches the ray from o along unit d from `from` to `to` metres, starting `jitter` (0…1) of a step in; `mark` is a
   * distance along it whose transmittance is wanted (where the lightning stands).
   */
  const march = (o: Vec3Node, d: Vec3Node, from: FloatNode, to: FloatNode, jitter: FloatNode, mark: FloatNode, lit: FieldLight): Marched => {
    const L = vec3(0).toVar(), T = float(1).toVar(), atMark = float(1).toVar();
    const t = from.add(jitter.mul(STEP)).toVar();
    // the cloud: whether the ray has crossed its surface, and where (or where it passed closest, and how close as a
    // share of the soft edge's width); its distance in at the last sample, and the step from there
    const hit = float(0).toVar(), where = o.toVar(), miss = float(1e4).toVar();
    const before = float(-1e4).toVar(), last = float(0).toVar();
    loop('storm', STEPS, () => {
      If(t.greaterThanEqual(to).or(T.lessThan(0.02)).or(hit.greaterThan(0)), () => {
        Break();
      });
      const q = o.add(d.mul(t)).toVar();
      const r = length(q), up = q.div(r).toVar(), h = r.sub(R).toVar();
      const e = edge(up).toVar();
      const inStep = float(STEP).add(t.mul(GROW));
      const least = max(t.mul(SOFT_FAR), 0.6);
      // how far q is from anywhere cloud or rain can be (half-spaces round each: the face at its furthest out, over
      // the crown's highest, under the base's lowest; the rain's front, over the base's highest)
      const frontOut = float(OUTERMOST).add(max(h.sub(BASE + ROLL), 0).mul(LEAN));
      const cloudOff = max(max(frontOut.sub(e).mul(1 / Math.hypot(1, LEAN)), h.sub(CROWN + CROWN_BILLOW)), float(BASE - ROLL - 4).sub(h));
      const rainOff = max(float(-RAIN_RAMP * 0.5).sub(e), h.sub(BASE + ROLL));
      const step = max(min(cloudOff, rainOff), least).toVar();
      const inside = float(-1e4).toVar();
      If(step.lessThan(inStep), () => {
        If(cloudOff.lessThan(inStep), () => {
          inside.assign(cloudAt(q, up, h, e).inside);
          If(inside.greaterThan(0), () => {
            // crossed: back to where, between the last sample and this, the surface lies
            const back = select(before.greaterThan(-1e3), last.mul(inside.div(inside.sub(before))), float(0));
            where.assign(q.sub(d.mul(back)));
            hit.assign(1);
          }).Else(() => {
            const near = inside.negate().div(max(t.mul(SOFT_FAR), SOFT));
            If(near.lessThan(miss), () => {
              miss.assign(near);
              where.assign(q);
            });
          });
        });
        If(hit.equal(0), () => {
          // the rain: under the base, from the edge in, in shafts, streaked, falling
          const rho = float(0).toVar(), shaft = float(0).toVar(), streak = float(0).toVar();
          If(rainOff.lessThan(inStep), () => {
            const across = up.mul(R / RAIN_TILE).add(vec3(h.mul(RAIN_LEAN / RAIN_TILE), h.add(cap.clock.mul(FALL)).div(RAIN_LONG), 0));
            const n = texture3D(shape, across).level(float(0));
            shaft.assign(smoothstep(0.3, 0.7, n.r));
            streak.assign(smoothstep(0.35, 0.85, n.a));
            const ramp = smoothstep(0, RAIN_RAMP, e.add(n.g.sub(0.5).mul(8)));
            rho.assign(mix(RAIN_THIN, RAIN_HEAVY, shaft).mul(streak.mul(0.8).add(0.6)).mul(ramp).mul(smoothstep(BASE + ROLL, BASE - ROLL, h)));
          });
          // in the rain, the step; short of the cloud's billows (and clear of the rain): toward their surface
          step.assign(select(rho.greaterThan(1e-6), inStep, max(min(inside.negate().mul(0.6), rainOff.add(inStep)), least)));
          If(rho.greaterThan(1e-6), () => {
            // a heavy shaft darker than the thinner rain round it, its streaks paler; darker up toward the base
            const S = lit.air.mul(RAIN_LIGHT).mul(mix(1.25, 0.55, shaft)).mul(streak.mul(0.35).add(0.85)).mul(mix(1.15, 0.6, smoothstep(0, BASE, h))).add(lit.glow(q));
            const stepT = exp(rho.mul(step).negate());
            L.addAssign(S.mul(T.mul(float(1).sub(stepT))));
            T.mulAssign(stepT);
          });
        });
      });
      If(t.lessThan(mark), () => {
        atMark.assign(T);
      });
      before.assign(inside);
      last.assign(step);
      t.addAssign(step);
    });
    // the cloud where the ray met it, or its soft edge where the ray passed by
    const cover = select(hit.greaterThan(0), float(1), float(1).sub(smoothstep(0, 1, miss))).toVar();
    If(cover.greaterThan(0), () => {
      L.addAssign(shade(where, d, lit).mul(T.mul(cover)));
      T.mulAssign(float(1).sub(cover));
    });
    // a march that ran out of steps grazing the billows, its ray still in the cloud's body: the rest of it is cloud
    const reached = min(t, to).toVar();
    const end = o.add(d.mul(reached)), up = normalize(end), h = length(end).sub(R);
    const solid = smoothstep(-FACE, FACE * 0.3, edge(up).sub(float(SHELF).add(max(h.sub(BASE), 0).mul(LEAN))))
      .mul(smoothstep(BASE - ROLL, BASE + ROLL, h)).mul(smoothstep(CROWN + CROWN_BILLOW * 0.5, CROWN - CROWN_BILLOW * 0.5, h))
      .mul(select(t.lessThan(to), float(1), float(0)));
    const body = lit.air.mul(mix(DARK, BRIGHT, smoothstep(BASE, CROWN, h)).mul(0.6));
    return { light: L.add(body.mul(T.mul(solid))), T: T.mul(float(1).sub(solid)), reached, atMark };
  };

  return { edge, march, OUTERMOST };
}
