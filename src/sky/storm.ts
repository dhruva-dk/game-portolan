// The storm as the eye sees it (its rules are sim/storm.ts): outside the safe cap, from the sea up to TOP metres,
// the air is rain and low cloud, dark violet. Seen from the calm it is a wall standing at the cap's edge: a curtain of
// cloud whose first WALL metres are thick (so from any distance it reads as a wall, its top billowed and lit), with
// shafts of rain hanging in it and lightning flickering inside. From inside it the air past the wall is thinner: the
// sea and the ships near stay in sight, dimmed, under driving rain.
//
// No march: the cap's edge is a cone from the planet's centre, so the eye's ray crosses it at the roots of a
// quadratic, and the storm's air between the sea and its TOP is that cone's outside cut by a sphere. The ray's length
// through it, up to whatever the pixel shows, is summed over the (at most three) pieces the roots cut it into, each
// weighed by how deep in the storm its middle lies (so the wall's foot and its edges, where the ray only grazes it,
// are soft). The same is done for a second cone WALL metres further out: what the ray runs between the two is in the
// wall. One noise read where the ray enters it breaks the wall into curtains of rain, streaked up and down and
// falling, with a ragged top: the light in it is the sky's, dimmed (sky.ts gives it).
//
// Lightning: every few seconds (BOLT) a stroke in the storm near the eye, two or three flickers lighting the cloud
// round it from within (FLASH), worked out on the CPU from the world's clock, so every frame of a moment agrees.
//
// What it gives the sky (sky.ts):
//   depth(p)           0…1, how deep in the storm world position p lies: 0 in the cap, 1 SOFT metres past its edge
//   edge(p)            metres p lies past the cap's edge (negative in the calm): the sea draws the edge's line from it
//   veil(c, dir, m)    colour c seen m metres away along world direction dir from the eye, through the storm
//   dim(c, dir)        the same for the sky beyond it, without the curtains: for what a mirror shows (sky.reflect)
//   deck(c, dir, m)    the same seen from high over its top (the full map's eye, in space): its billowed cloud top

import { Vector3 } from 'three/webgpu';
import { Fn, abs, acos, clamp, dot, exp, float, length, max, min, mix, mx_noise_float, normalize, select, smoothstep, sqrt, uniform, vec3 } from 'three/tsl';
import type { Cap } from '../sim/storm';
import type { View } from '../view/view';
import { R, add, cross, dot as dotV, length as lengthV, normalize as normalizeV, scale, type Vec3 } from '../world/sphere';
import type { FloatNode, Vec3Node } from '../tsl';

/** The storm's air reaches this high over the sea, metres: over the horizon from 650 m away. */
const TOP = 320;
/** Its density rises from nothing at the cap's edge to full this many metres past it. */
const SOFT = 25;
/**
 * Extinction in the storm, per metre: in its wall, the first WALL metres past the edge, rain and cloud through which
 * nothing shows (e⁻³ across 36 m); past it, thinner, so a ship 60 m off inside it is still there, dimmed (e⁻¹).
 * Its curtains thin it by up to CURTAIN of itself; it thins from FADE of TOP up, to nothing at TOP.
 */
const WALL = 45, SIGMA_WALL = 1 / 12, SIGMA = 1 / 60, CURTAIN = 0.75, FADE = 0.62;
/**
 * The rain's curtains' size, metres: across, and up and down (streaks); how far they lean with height (metres across
 * a metre up), and how fast they fall, metres a second. They hang from a cloud BASE metres up, whose billows are
 * BILLOW across.
 */
const ACROSS = 18, ALONG = 140, LEAN = 0.3, FALL = 9, BASE = 140, BILLOW = 55;
/** The light at the storm's foot and at its top, as shares of what sky.ts gives it. */
const FOOT = 0.26, CROWN = 1.25;
/** The light in a shaft of heavy rain and in the thinner air between shafts, as shares of the storm's. */
const SHAFT = 0.4, GAP = 1.7;
/**
 * The rain seen from inside: streaks this fine across (cycles over the sky's circle) and long down it, falling this
 * fast (sky heights a second), leaning with the wind; as light, this share of the storm's over the streaks.
 */
const STREAK = 220, STREAK_LONG = 3.5, STREAK_FALL = 1.6, STREAK_LEAN = 0.3, STREAK_LIGHT = 0.4;
/**
 * Lightning: one stroke in each BOLT seconds, at a moment within it; its flickers (seconds from the stroke, and each
 * one's strength); how far round it the cloud is lit, metres; how bright, as a multiple of the storm's light, and
 * how high in the storm it is, metres. A stroke is DISTANCE (min, max) metres from the eye along the storm's edge
 * when the eye is in the calm, or about it when it is in the storm.
 */
const BOLT = 4.5, FLICKER = [[0, 0.06, 1], [0.09, 0.14, 0.35], [0.2, 0.32, 0.8]] as const, REACH = 90, FLASH = 9, HIGH = 170;
const DISTANCE = [140, 320] as const;
/** The flash's colour, against the storm's own light's (its luminance kept). */
const FLASH_TINT = [0.85, 0.85, 1.05] as const;
const LUMA = vec3(0.2126, 0.7152, 0.0722);

/** A steady pseudo-random number in [0, 1) for an integer and a stream. */
const hash = (n: number, k: number) => {
  const s = Math.sin(n * 127.1 + k * 311.7) * 43758.5453;
  return s - Math.floor(s);
};

export function createStormLook(view: View) {
  const centre = uniform(new Vector3(0, 1, 0));
  const radius = uniform(Math.PI);
  const cosine = uniform(-1), wallCosine = uniform(-1);
  const clock = uniform(0);
  const bolt = uniform(new Vector3(0, 0, 0)), flash = uniform(0), whole = uniform(1);

  /** Metres world position p lies past the cap's edge (far inside it everywhere while the cap is the whole planet). */
  const edge = (p: Vec3Node): FloatNode => acos(clamp(dot(normalize(p), centre), -1, 1)).sub(radius).mul(R).sub(whole.mul(1e4));
  /** 0…1 how deep in the storm world position p lies, past a cone `past` metres out from the cap's edge. */
  const deeper = (p: Vec3Node, past: number): FloatNode => smoothstep(past, past + SOFT, edge(p));
  const depth = (p: Vec3Node): FloatNode => deeper(p, 0);

  /**
   * The eye's ray along world direction dir, up to `metres`, through the storm past the cone `past` metres out from
   * its edge (whose cosine is `k`): how far it runs in it (weighed by depth), and a point a mean free path in from
   * where it enters (or its end, if it runs less), whose rain is what the eye sees most of.
   */
  const path = (dir: Vec3Node, metres: FloatNode, k: FloatNode, past: number): { length: FloatNode; q: Vec3Node } => {
    const o = view.position, d = dir;
    const a = dot(o, centre), b = dot(d, centre), oo = dot(o, o), od = dot(o, d), k2 = k.mul(k);
    // the storm's shell: where the ray is below TOP, and in front of what the pixel shows
    const h = od.mul(od).sub(oo.sub((R + TOP) * (R + TOP)));
    const half = sqrt(max(h, 0));
    const lo = max(od.negate().sub(half), 0);
    const hi = select(h.lessThan(0), lo, max(min(od.negate().add(half), metres), lo));
    // (a + tb)² = cos²·|o + td|²: the cone and its mirror, which the midpoints' depths tell apart
    const A = b.mul(b).sub(k2), B = a.mul(b).sub(k2.mul(od)).mul(2), C = a.mul(a).sub(k2.mul(oo));
    const disc = B.mul(B).sub(A.mul(C).mul(4));
    const A2 = select(abs(A).lessThan(1e-7), float(1e-7), A).mul(2), root = sqrt(max(disc, 0));
    const r1 = B.negate().sub(root).div(A2), r2 = B.negate().add(root).div(A2);
    const t1 = select(disc.lessThan(0), hi, clamp(min(r1, r2), lo, hi));
    const t2 = select(disc.lessThan(0), hi, clamp(max(r1, r2), lo, hi));
    const at = (t: FloatNode): Vec3Node => o.add(d.mul(t));
    const w0 = deeper(at(lo.add(t1).mul(0.5)), past), w1 = deeper(at(t1.add(t2).mul(0.5)), past), w2 = deeper(at(t2.add(hi).mul(0.5)), past);
    const length = t1.sub(lo).mul(w0).add(t2.sub(t1).mul(w1)).add(hi.sub(t2).mul(w2));
    const enter = select(w0.greaterThan(0), lo, select(w1.greaterThan(0), t1, t2));
    return { length, q: at(min(enter.add(WALL * 0.5), hi)) };
  };
  /** The ray's optical depth through the storm (before its curtains thin it), and where the eye sees most of it. */
  const through = (dir: Vec3Node, metres: FloatNode): { tau: FloatNode; q: Vec3Node } => {
    const all = path(dir, metres, cosine, 0), deep = path(dir, metres, wallCosine, WALL);
    const wall = max(all.length.sub(deep.length), 0);
    return { tau: wall.mul(SIGMA_WALL).add(deep.length.mul(SIGMA)), q: all.q };
  };

  /** The storm's light at altitude: dark at its foot, where the rain falls out of it, paler up in the cloud. */
  const shade = (light: Vec3Node, altitude: FloatNode): Vec3Node => light.mul(mix(FOOT, CROWN, smoothstep(0, TOP, altitude)));
  /** The lightning's light at q: the storm's light, whitened, by the flash and how near the stroke q is. */
  const lightning = (light: Vec3Node, q: Vec3Node): Vec3Node => {
    const near = exp(length(q.sub(bolt)).div(-REACH));
    return vec3(dot(light, LUMA)).mul(vec3(...FLASH_TINT)).mul(flash.mul(near).mul(FLASH));
  };

  /** Colour c seen m metres along world direction dir from the eye, through the storm lit by `light`. */
  const veil = (c: Vec3Node, dir: Vec3Node, metres: FloatNode, light: Vec3Node): Vec3Node =>
    Fn(() => {
      const { tau, q } = through(dir, metres);
      const up = normalize(q), altitude = dot(q, up).sub(R);
      // Below the cloud's base, curtains of rain: streaks up and down, leaning with the wind, falling, a finer set
      // in the coarser. Above it, the cloud's billows, which fray its top.
      const across = up.mul(R / ACROSS).add(vec3(altitude.mul(LEAN / ACROSS), 0, 0));
      const streak = (k: number): FloatNode => mx_noise_float(across.mul(k).add(vec3(0, altitude.add(clock.mul(FALL)).div(ALONG), k * 7)));
      const shafts = smoothstep(0.2, 0.8, streak(1).mul(0.7).add(streak(3).mul(0.3)).mul(0.5).add(0.5));
      const billow = mx_noise_float(up.mul(R / BILLOW).add(vec3(clock.mul(0.02), altitude.div(BILLOW), 0)));
      const cloud = smoothstep(BASE * 0.7, BASE * 1.3, altitude.add(billow.mul(BASE * 0.3)));
      const rain = mix(shafts, billow.mul(0.5).add(0.5), cloud);
      // the cloud is thick throughout, the rain under it thinned between its shafts
      const thick = mix(float(1).sub(rain.mul(CURTAIN)), float(1.3), cloud);
      // its top a crown of billows, a finer set fraying the coarser's edges
      const fine = mx_noise_float(up.mul((R / BILLOW) * 3.3).add(vec3(0, altitude.div(BILLOW * 0.5), clock.mul(0.03))));
      const top = float(1).sub(smoothstep(TOP * FADE, TOP * 0.9, altitude.add(billow.mul(TOP * 0.22)).add(fine.mul(TOP * 0.07))));
      const T = exp(tau.mul(thick).mul(top).negate());
      // a shaft of heavy rain is darker than the thin air between; the cloud's billows lit on their tops; the
      // lightning lights the cloud round it from within
      const glow = shade(light, altitude).mul(mix(SHAFT, GAP, rain)).add(lightning(light, q));
      const seen = c.mul(T).add(glow.mul(float(1).sub(T)));
      // from inside, the rain driving past the eye: streaks fixed to the sky's directions, falling
      const d = view.toSky(dir);
      const fall = mx_noise_float(vec3(d.x.mul(STREAK), d.y.add(d.x.mul(STREAK_LEAN)).mul(STREAK_LONG).add(clock.mul(STREAK_FALL)), d.z.mul(STREAK)));
      const streaks = smoothstep(0.45, 0.8, fall).mul(depth(view.position)).mul(STREAK_LIGHT);
      return seen.add(light.add(lightning(light, view.position)).mul(streaks));
    })();

  /** The same, with no curtains and to the top of the storm: what a mirror (the sea) shows of it, cheaply. */
  const dim = (c: Vec3Node, dir: Vec3Node, light: Vec3Node): Vec3Node =>
    Fn(() => {
      const { tau, q } = through(dir, float(1e5));
      const T = exp(tau.mul(-(1 - CURTAIN / 2)));
      return c.mul(T).add(shade(light, dot(q, normalize(q)).sub(R)).add(lightning(light, q)).mul(float(1).sub(T)));
    })();

  /**
   * Colour c seen m metres along world direction dir from an eye high over the storm (the full map's, from space):
   * its cloud's top, billowed and lit unevenly, over everything under it; no curtains, which only show from beside.
   */
  const deck = (c: Vec3Node, dir: Vec3Node, metres: FloatNode, light: Vec3Node): Vec3Node =>
    Fn(() => {
      const { tau, q } = through(dir, metres);
      const up = normalize(q), altitude = dot(q, up).sub(R);
      const billow = mx_noise_float(up.mul(R / BILLOW).add(vec3(clock.mul(0.02), 0, 0))).mul(0.6)
        .add(mx_noise_float(up.mul((R / BILLOW) * 3.1).add(vec3(0, clock.mul(0.05), 7))).mul(0.4));
      const T = exp(tau.mul(-(1 - CURTAIN / 2)));
      return c.mul(T).add(shade(light, altitude).mul(billow.mul(0.45).add(1)).add(lightning(light, q)).mul(float(1).sub(T)));
    })();

  /** Where this moment's stroke stands, and how bright its flicker is now (0 between strokes). */
  const strike = (cap: Cap, seconds: number, eye: Vec3) => {
    const n = Math.floor(seconds / BOLT), since = seconds - (n + hash(n, 0) * 0.8) * BOLT;
    const lit = FLICKER.find(([from, to]) => since >= from && since < to);
    flash.value = !whole.value && lit ? lit[2] : 0;
    if (!flash.value) return;
    // the stroke a way off along the edge from the eye (in the calm), or about the eye (in the storm)
    const u = normalizeV(eye), c = cap.centre, out = normalizeV(add(u, c, -dotV(u, c))), side = cross(c, out);
    const turn = (hash(n, 1) - 0.5) * 2, far = DISTANCE[0] + hash(n, 2) * (DISTANCE[1] - DISTANCE[0]);
    const inside = (Math.acos(Math.min(1, Math.max(-1, dotV(u, c)))) - cap.radius) * R > SOFT;
    // in the storm: `far` off the eye, any way round; in the calm: in the wall, `far` along it either way from the eye
    const a = cap.radius + WALL / R, round = inside ? turn * Math.PI : (turn * far) / (R * Math.max(Math.sin(a), 0.05));
    const way = add(scale(out, Math.cos(round)), side, Math.sin(round));
    const at = inside ? normalizeV(add(u, way, far / R)) : normalizeV(add(scale(c, Math.cos(a)), way, Math.sin(a)));
    if (Number.isFinite(lengthV(at))) bolt.value.set(...scale(at, R + HIGH));
    else flash.value = 0;
  };

  return {
    depth,
    edge,
    veil,
    dim,
    deck,
    /** The storm now (sim/storm.ts); seconds: the world's clock (Environment.clock), which its rain, billows and
     *  lightning run on; eye: where the eye is (world, m). */
    update(cap: Cap, seconds: number, eye: Vec3) {
      centre.value.set(...cap.centre);
      radius.value = cap.radius;
      whole.value = cap.radius < Math.PI - 0.01 ? 0 : 1;
      cosine.value = Math.cos(cap.radius);
      wallCosine.value = Math.cos(Math.min(Math.PI, cap.radius + WALL / R));
      clock.value = seconds;
      strike(cap, seconds, eye);
    },
  };
}
