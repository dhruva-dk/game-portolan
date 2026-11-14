// How light leaves the sea toward the eye, given the surface's normal there. Units are the sky's: radiance per unit
// sun illuminance at the top of the air. The sea is painted, as the land is (sky/light.ts): its colours are the
// palette's (palette.ts), under the brightness of the place and the hour.
//
//   body       the water's own tone: turquoise where it is shallow over the floor, through a middle blue to
//              ultramarine where it is deep, so the turquoise hugs the shores; a deeper tone of the same in
//              the troughs between the waves, its edge crisp
//   below      what lies under shallow water (the sea floor, already lit by what light reaches it: sunBelow, skyBelow),
//              coloured along the eye's path through the water and veiled by the water's own tone as the path grows
//   reflected  the sky and clouds (sky.reflect) in a few broad shapes, by a share of Fresnel for water (F0 = 0.02)
//   glints     flat shapes of light where the surface mirrors the sun to the eye
//   foam       over all of it: flat white (foam.ts)
//
// "Up" and the sun's elevation are those at the point itself (view.up), so the sea is lit as the planet turns under the
// sun; depths are heights below the sea's level there (view.altitude).

import { dot, exp, float, fwidth, length, max, min, mix, normalize, pow, saturate, smoothstep, sqrt, vec3 } from 'three/tsl';
import { FOAM, SEA_DEEP, SEA_MIDDLE, SEA_SHALLOW } from '../palette';
import type { Sky } from '../sky/sky';
import type { View } from '../view/view';
import { cut, type FloatNode, type Vec3Node, type Vec4Node } from '../tsl';

/** Absorption per metre, red/green/blue (680, 550, 440 nm): pure water's (Pope & Fry 1997). It colours the light that
 *  reaches the floor and what the eye sees of the floor through the water. */
const ABSORPTION = [0.45, 0.068, 0.025];
/** Refractive index of sea water. */
export const N_WATER = 1.34;
/** Reflectance at normal incidence, ((n − 1)/(n + 1))². */
const F0 = 0.02;
/** How much of what Fresnel gives the sea's mirror keeps: the sea stays its own colour out to the horizon. */
const MIRROR = 0.2;
/** The water's depth over the floor, metres, at which its tone is the middle one, and the deep one. */
/** Water turquoise to SHALLOW_TO metres deep, the middle blue by MIDDLE_AT, the deep by DEEP_AT: so the shallow ring
 *  hugs the shore, and open-sea banks a few metres further down are blue, not turquoise blotches (art/target/idea.png). */
const SHALLOW_TO = 2.5, MIDDLE_AT = 6, DEEP_AT = 11;
/** The deep water seen from overhead: LOOK_DOWN of the way to the middle tone, from where the eye's ray stands
 *  LOOK_FROM (cosine) off the level to straight down. */
const LOOK_DOWN = 0.25, LOOK_FROM = 0.3;
/** How fast the water's own tone veils what lies under it, per metre of the eye's path through it. */
const CLOUDY = 0.2;
/** How far a wake's air at its thickest takes the water toward the shallows' tone; and how much it veils what lies
 *  under it, as an optical depth. */
const AIRED = 0.6, AIR_VEIL = 2;
/** The troughs' tone, of the water's, and where between trough and crest (0…1) its edge lies. */
const TROUGH = 0.8, TROUGH_AT = 0.4;
/** What sets a point in the troughs' tone: the swell's crest (0…1), by this much of its range about its middle. The
 *  short waves' facets are left out of it: their marks fell in grain along the tone's edge, where art/target/idea.png
 *  draws its water's shapes with clean edges. */
const SWELL = 0.45;
/** The sun's glints: the cosine between the surface's normal and the half vector past which it mirrors the sun to the
 *  eye, the width of that edge, and the glint's light of what a white surface gets from the sun square on. */
const GLINT = 0.9998, GLINT_EDGE = 0.0001, GLINT_LIGHT = 0.4;
/** How much of the fair-weather clouds' shadow falls on the sea: some, so their shade passes over it without leaving
 *  dark blotches on the deep blue (art/target/idea.png's sea is one blue under the scattered clouds). */
const CLOUD_SHADE = 0.4;

const absorption = vec3(...ABSORPTION);

/** Schlick's Fresnel for water. */
export const fresnel = (cos: FloatNode): FloatNode => float(F0).add(pow(float(1).sub(saturate(cos)), 5).mul(1 - F0));

export function createOptics(sky: Sky, view: View) {
  /** 1 below the sea's mean level, 0 above, over a few centimetres. */
  const wet = (p: Vec3Node): FloatNode => smoothstep(0.03, -0.03, view.altitude(p));

  /**
   * The share of the sun's light (as it is above the water) that reaches world position p below the surface: through
   * the surface (Fresnel), then down the refracted ray to p's depth, absorbed on the way. 1 above the water.
   */
  const sunBelow = (p: Vec3Node): Vec3Node => {
    const depth = max(view.altitude(p).negate(), 0);
    const ly = dot(view.up(p), sky.sun(p));
    const cos = sqrt(float(1).sub(float(1).sub(ly.mul(ly)).div(N_WATER * N_WATER)));
    const through = exp(absorption.mul(depth.div(cos)).negate()).mul(float(1).sub(fresnel(max(ly, 0))));
    return mix(vec3(1), through, wet(p));
  };

  /** The same for the sky's light, which comes down from every direction: on average a path about 1.2 times the depth. */
  const skyBelow = (p: Vec3Node): Vec3Node => {
    const through = exp(absorption.mul(max(view.altitude(p).negate(), 0).mul(1.2)).negate()).mul(1 - 0.066);
    return mix(vec3(1), through, wet(p));
  };

  return {
    sunBelow,
    skyBelow,
    /** The light leaving the sea toward the eye (seaRadiance, below). */
    seaRadiance: (
      p: Vec3Node, n: Vec3Node, g: Vec3Node, v: Vec3Node, crest: FloatNode, foam: FloatNode, behind: Vec3Node, path: FloatNode,
      depth: FloatNode, ships: Ships, held?: Held,
    ): Vec3Node =>
      seaRadiance(sky, view, p, n, g, v, crest, foam, behind, path, depth, ships, held),
  };
}

/**
 * What the ships do to the light here (water/wake.ts, water/hulls.ts), each 0…1: the share of the sun their shadows
 * leave, the share of the water's glow a hull beside it leaves, and the air a wake has worked into it.
 */
export interface Ships { lit: FloatNode; glow: FloatNode; air: FloatNode }

/**
 * Who holds the water here (water/claims.ts): its tint (rgb the holder's colour, a how far the water gives up its own
 * colour for it, its brightness kept) and the line drawn over it (rgb its light per unit of what a white surface gets,
 * premultiplied; a its cover); and how far off it is seen (0 near, 1 a cell under a pixel or two: the full map's).
 */
export interface Held { dye: Vec4Node; ink: Vec4Node; far: FloatNode }

/** How much colour a tint gives the water: at most TINT_CHROMA of the water's own chroma (Oklab), for a holder's colour
 *  whose chroma is TINT_RICH of its lightness or more; seen from afar, as rich as her colour is (FAR_RICH of it). */
const TINT_CHROMA = 1.5, TINT_RICH = 0.3, FAR_RICH = 0.9;
/** How far a full tint scales the water's lightness by the holder's own against a middling colour's (Oklab, MIDDLE). */
const TINT_LIGHT = 0.6, MIDDLE = 0.55;
/** Oklab (Ottosson 2020) of linear light c, and back: lightness, then the two opponent axes. */
const oklab = (c: Vec3Node): Vec3Node => {
  const l = pow(max(dot(c, vec3(0.4122214708, 0.5363325363, 0.0514459929)), 0), 1 / 3);
  const m = pow(max(dot(c, vec3(0.2119034982, 0.6806995451, 0.1073969566)), 0), 1 / 3);
  const s = pow(max(dot(c, vec3(0.0883024619, 0.2817188376, 0.6299787005)), 0), 1 / 3);
  const lms = vec3(l, m, s);
  return vec3(dot(lms, vec3(0.2104542553, 0.793617785, -0.0040720468)), dot(lms, vec3(1.9779984951, -2.428592205, 0.4505937099)),
    dot(lms, vec3(0.0259040371, 0.7827717662, -0.808675766)));
};
const linear = (lab: Vec3Node): Vec3Node => {
  const l = pow(dot(lab, vec3(1, 0.3963377774, 0.2158037573)), 3);
  const m = pow(dot(lab, vec3(1, -0.1055613458, -0.0638541728)), 3);
  const s = pow(dot(lab, vec3(1, -0.0894841775, -1.291485548)), 3);
  const lms = vec3(l, m, s);
  return max(vec3(dot(lms, vec3(4.0767416621, -3.3077115913, 0.2309699292)), dot(lms, vec3(-1.2684380046, 2.6097574011, -0.3413193965)),
    dot(lms, vec3(-0.0041960863, -0.7034186147, 1.707614701))), 0);
};
/**
 * Light c tinted a share a toward colour's hue (Oklab), its chroma as strong as the water's own (so the sea's play of
 * colour, rich in its body and pale where it mirrors a cloud, still shows, turned to her hue), less for a paler colour;
 * from afar (`far`, 0…1) as rich as hers. Its lightness is scaled a little by hers against a middling colour's (a saffron
 * over deep water would otherwise be olive), scaled and not moved, so the waves keep their play. The water's own hue is
 * let go faster than hers comes in ((1 − a)² of it kept against a of hers; (1 − a)³ from afar), not mixed half and
 * half: blue water and scarlet so mixed would be magenta, and this way scarlet holds its hue over turquoise and deep
 * blue alike where the tint is strong (along a border, and from afar), while a light wash leaves the sea its own.
 */
function tinted(c: Vec3Node, colour: Vec3Node, a: FloatNode, far: FloatNode): Vec3Node {
  const lab = oklab(c), hers = oklab(colour), chroma = length(hers.yz), ratio = chroma.div(max(hers.x, 1e-3));
  const light = lab.x.mul(mix(float(1), hers.x.div(MIDDLE), a.mul(TINT_LIGHT)));
  const strength = mix(length(lab.yz).mul(min(ratio.div(TINT_RICH), 1).mul(TINT_CHROMA)), light.mul(ratio).mul(FAR_RICH), far);
  const keep = float(1).sub(a);
  return linear(vec3(light, lab.yz.mul(keep.mul(keep).mul(mix(float(1), keep, far))).add(hers.yz.div(max(chroma, 1e-4)).mul(strength.mul(a)))));
}

/**
 * The light leaving the sea at world position p toward the eye.
 *   n      the surface's normal          v      unit vector from p to the eye
 *   g      its normal over the long waves alone, which the sun's glints are mirrored off
 *   crest  0 in the troughs … 1 at the tops of the waves
 *   foam   the share of the pixel covered in foam
 *   behind the radiance of whatever lies behind the surface (the sea floor; the sky's if nothing)
 *   path   metres from the surface to it through the water (Infinity for open sea)
 *   depth  metres of water over the floor here
 *   ships  what the ships do to the light here
 *   held   who holds the water here: the water tinted her colour, and her border's line drawn over it
 */
function seaRadiance(
  sky: Sky, view: View, p: Vec3Node, n: Vec3Node, g: Vec3Node, v: Vec3Node, crest: FloatNode, foam: FloatNode, behind: Vec3Node,
  path: FloatNode, depth: FloatNode, ships: Ships, held?: Held,
): Vec3Node {
  const l = sky.sun(p), up = view.up(p);
  const nv = max(n.dot(v), 1e-4);
  const F = fresnel(nv).mul(MIRROR);
  const clouded = mix(float(1), sky.cloudCover(p), CLOUD_SHADE).mul(sky.stormSun(p));
  const sun = sky.sunIlluminance(p).mul(clouded).mul(ships.lit);

  // what a white surface lying on the sea would give back (ambient() is the sky's radiance, so its E/π is itself):
  // the water's colours are tones under it, as a solid's are under its level (sky/light.ts)
  const irradiance = sun.mul(max(dot(l, up), 0)).div(Math.PI).add(sky.ambient(p));
  // the water's own tone by how much of it the eye looks through, paler where a wake has worked air into it, and a
  // second, deeper tone in the troughs between the waves, its edge crisp
  // looked down into, the deep water is LOOK_DOWN of the way to the middle tone, deepening to its own toward the
  // horizon, so the open sea runs from teal at the eye's feet to royal blue far off
  const down = smoothstep(LOOK_FROM, 1, dot(v, up)).mul(LOOK_DOWN);
  const deep = mix(vec3(...SEA_DEEP), vec3(...SEA_MIDDLE), down);
  const own = mix(mix(vec3(...SEA_SHALLOW), vec3(...SEA_MIDDLE), smoothstep(SHALLOW_TO, MIDDLE_AT, depth)), deep, smoothstep(MIDDLE_AT, DEEP_AT, depth));
  const lifted = mix(float(0.5), crest, SWELL);
  const tone = mix(own, vec3(...SEA_SHALLOW), ships.air.mul(AIRED)).mul(mix(float(TROUGH), float(1), cut(lifted, TROUGH_AT)));
  const body = tone.mul(irradiance).mul(ships.glow);

  // The sky, along the reflected ray, blurred to broad shapes. A ray reflected down (below the horizon here, by the up
  // here) from a facet turned away from the eye meets the next wave instead, at about the angle it points down:
  // glancing, that wave mirrors the sky at its horizon; steeper, the light comes through it, the sea's own colour.
  const r = v.negate().reflect(n);
  const below = dot(r, up);
  const above = sky.reflect(normalize(r.sub(up.mul(min(below, 0)))));
  const seen = mix(body, above, fresnel(below.negate()));
  // the sun's glints: flat shapes of light where the surface mirrors it to the eye
  const nh = g.dot(normalize(l.add(v)));
  const edge = max(fwidth(nh), GLINT_EDGE);
  const glint = vec3(...FOAM).mul(sun).mul(smoothstep(float(GLINT).sub(edge), float(GLINT).add(edge), nh).mul(GLINT_LIGHT));

  // what lies behind, seen through `path` metres of water: dimmed and coloured by it, and veiled by the water's own
  // tone as the path grows (and by a wake's bubbles, as so much more water would)
  const veil = float(1).sub(exp(path.mul(-CLOUDY).sub(ships.air.mul(AIR_VEIL))));
  const through = behind.mul(exp(absorption.mul(path).negate())).div(N_WATER * N_WATER);
  const under = mix(through, body, veil);
  let water = seen.mul(F).add(under.mul(float(1).sub(F)));
  if (held) water = tinted(water, held.dye.xyz, held.dye.w, held.far).mul(float(1).sub(held.ink.w)).add(held.ink.xyz.mul(irradiance));
  // foam: its flat white, as bright as the place
  return mix(water.add(glint), vec3(...FOAM).mul(irradiance), foam);
}
