// How light leaves the sea toward the eye, given the surface's normal and roughness there. Units are the sky's:
// radiance per unit sun illuminance at the top of the air.
//
//   reflected  the sky and clouds (sky.reflect, prefiltered to the surface's roughness) and the sun (Beckmann
//              facets), weighted by Fresnel for water (F0 = 0.02)
//   body       light scattered back up out of deep water: the irradiance from the sun and sky, times the water's
//              reflectance R(u), u = b_b/(a + b_b) (Gordon et al. 1975's cubic, which the linear 0.33u falls short of
//              once backscatter rivals absorption, as it does in the blue here), through the surface twice and spread
//              by n² on the way out
//   below      what lies under shallow water (the sea floor, already lit by what light reaches it: sunBelow, skyBelow),
//              dimmed along the eye's path through the water and spread by n² on the way out, with the water's own
//              glow in front of it growing toward the deep water's over the path
//   crests     sunlight passing through the thin water at the top of a wave toward an eye looking into the sun: the
//              same water's colour after a couple of metres (exp(−a·d)), the turquoise in the faces of the waves
//   foam       over all of it where the waves break: white and rough, lit by the sun and the sky like any matte surface
//
// "Up" and the sun's elevation are those at the point itself (view.up), so the sea is lit as the planet turns under the
// sun; depths are heights below the sea's level there (view.altitude).
//
// The water is the clear water over the tropics' carbonate banks (Jerlov's oceanic IB): absorption mostly pure
// water's (Pope & Fry 1997), and backscatter pure water's plus the fine carbonate silt the waves keep stirred up,
// b_bp ≈ 0.03 m⁻¹ at 550 nm, rising toward the blue as λ⁻¹: the upper end of what was measured over the Bahamas Banks
// (0.003–0.04, Dierssen et al. 2009), where the trade wind keeps the ooid silt in suspension. It is what turns their
// deep water a bright, saturated blue and their shallows turquoise, where the open ocean's clearest water is navy.

import { dot, exp, float, max, min, mix, normalize, pow, saturate, smoothstep, sqrt, vec3 } from 'three/tsl';
import type { Sky } from '../sky/sky';
import type { View } from '../view/view';
import type { FloatNode, Vec3Node, Vec4Node } from '../tsl';

/** Absorption per metre, red/green/blue (680, 550, 440 nm). */
const ABSORPTION = [0.45, 0.068, 0.025];
/** Backscatter per metre: pure sea water's, and the silt's (0.03 at 550 nm, as 550/λ). */
const BACKSCATTER = [0.0012 + 0.0243, 0.0018 + 0.03, 0.0032 + 0.0375];
/** Refractive index of sea water. */
export const N_WATER = 1.34;
/** Reflectance at normal incidence, ((n − 1)/(n + 1))². */
const F0 = 0.02;
/** How far the sun's light runs through a crest before it leaves toward the eye, metres. */
const CREST_PATH = 2;
/** The share of that light scattered out toward the eye. */
const CREST_SCATTER = 0.06;

/** Foam's albedo: bubbles scatter almost everything back (whitecaps reflect ~50–60%; fresh foam more). */
const FOAM_ALBEDO = 0.8;
/**
 * Backscatter per metre of the air a ship's wake works into the water, at its thickest, all colours alike (bubbles
 * are far larger than the light's wavelength): with it the deep blue goes a pale turquoise.
 */
const AIR_BACKSCATTER = 0.2;
/** How much a wake at its thickest veils what lies under it: as an optical depth. */
const AIR_VEIL = 2;

/**
 * What comes back out of deep water per unit irradiance on it, with `air` (0…1) worked into it by a wake: R·(1 − F)²/n²
 * (F ≈ F0 for light near normal), R the irradiance reflectance just below the surface for u = b_b/(a + b_b) (Gordon
 * et al. 1975's cubic, sun-lit).
 */
const deep = (air: FloatNode): Vec3Node => {
  const bb = vec3(...BACKSCATTER).add(air.mul(AIR_BACKSCATTER));
  const u = bb.div(vec3(...ABSORPTION).add(bb));
  return u.mul(u.mul(u.mul(0.1308).add(0.1425)).add(0.3244)).add(0.0001).mul((1 - F0) ** 2 / (N_WATER * N_WATER));
};
/** The water's colour after the light's path through a crest. */
const CREST = vec3(...ABSORPTION.map((a) => Math.exp(-a * CREST_PATH) * CREST_SCATTER));

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
      p: Vec3Node, n: Vec3Node, v: Vec3Node, alpha: FloatNode, crest: FloatNode, foam: FloatNode, behind: Vec3Node, path: FloatNode,
      sparkle: Sparkle, ships: Ships, held?: Held,
    ): Vec3Node =>
      seaRadiance(sky, view, p, n, v, alpha, crest, foam, behind, path, sparkle, ships, held),
  };
}

/** How the glint off the unresolved ripples gathers into flashes (glitter.ts), given D, n·h and h·l: its multiplier. */
export type Sparkle = (D: FloatNode, nh: FloatNode, hl: FloatNode) => FloatNode;

/**
 * What the ships do to the light here (water/wake.ts, water/hulls.ts), each 0…1: the share of the sun their shadows
 * leave, the share of the water's glow a hull beside it leaves, and the air a wake has worked into it.
 */
export interface Ships { lit: FloatNode; glow: FloatNode; air: FloatNode }

/**
 * Who holds the water here (water/claims.ts): its dye (rgb the holder's colour, a how far the water's body is turned
 * toward it, its brightness kept) and the light its border's line gives off, per unit of what a white surface gets.
 */
export interface Held { dye: Vec4Node; shine: Vec3Node }

/**
 * The sea's facets' distribution D and visibility V, for roughness α, the root of the mean square slope over both
 * axes. The slopes are Gaussian (Cox & Munk 1954), so D is Beckmann's; V is the height-correlated Smith term in
 * GGX's closed form, which differs from Beckmann's by little at these slopes. (GGX's long tails would spread the
 * sun's glint far off its path.)
 */
function facets(nh: FloatNode, nl: FloatNode, nv: FloatNode, alpha: FloatNode): { D: FloatNode; V: FloatNode } {
  const a2 = alpha.mul(alpha), c2 = max(nh.mul(nh), 1e-4);
  const D = exp(float(1).sub(c2).div(c2.mul(a2)).negate()).div(a2.mul(c2.mul(c2)).mul(Math.PI));
  const vl = nv.mul(sqrt(nl.mul(nl).mul(float(1).sub(a2)).add(a2)));
  const vv = nl.mul(sqrt(nv.mul(nv).mul(float(1).sub(a2)).add(a2)));
  return { D, V: float(0.5).div(max(vl.add(vv), 1e-5)) };
}

/**
 * The light leaving the sea at world position p toward the eye.
 *   n      the surface's normal          v      unit vector from p to the eye
 *   alpha  roughness, √(mean square slope) (the slopes the pixel can't resolve, plus the ripples no cascade holds)
 *   crest  0 in the troughs … 1 at the tops of the waves, where the water is thinnest
 *   foam   the share of the pixel covered in foam
 *   behind the radiance of whatever lies behind the surface (the sea floor; the sky's if nothing)
 *   path   metres from the surface to it through the water (Infinity for open sea)
 *   sparkle how the sun's glint gathers into flashes
 *   ships  what the ships do to the light here
 *   held   who holds the water here: what comes up out of it is dyed her colour, and her border glows
 */
function seaRadiance(
  sky: Sky, view: View, p: Vec3Node, n: Vec3Node, v: Vec3Node, alpha: FloatNode, crest: FloatNode, foam: FloatNode, behind: Vec3Node,
  path: FloatNode, sparkle: Sparkle, ships: Ships, held?: Held,
): Vec3Node {
  const l = sky.sun(p), up = view.up(p);
  const nv = max(n.dot(v), 1e-4), nl = saturate(n.dot(l));
  const F = fresnel(nv);
  const sun = sky.sunIlluminance(p).mul(sky.cloudShadow(p)).mul(ships.lit);

  // radiance off a reflectance R under irradiance E is R·E/π; ambient() is the sky's radiance, so its E/π is itself
  const irradiance = sun.mul(max(dot(l, up), 0)).div(Math.PI).add(sky.ambient(p, up));
  const body = deep(ships.air).mul(irradiance).mul(ships.glow);

  // The sky, along the reflected ray, blurred to the roughness (sky/reflection.ts takes √α, as three's PMREM did). A
  // ray reflected down (below the horizon here, by the up here) from a facet turned away from the eye meets the next
  // wave instead, at about the angle it points down: glancing, that wave mirrors the sky at its horizon; steeper, the
  // light comes through it, the sea's own colour. Fresnel weighs the two.
  const r = v.negate().reflect(n);
  const below = dot(r, up);
  const above = sky.reflect(normalize(r.sub(up.mul(min(below, 0)))), sqrt(alpha));
  const seen = mix(body, above, fresnel(below.negate()));
  const h = normalize(l.add(v));
  const nh = saturate(n.dot(h)), { D, V } = facets(nh, nl, nv, alpha);
  const glint = sun.mul(D.mul(V).mul(nl)).mul(sparkle(D, nh, saturate(h.dot(l))));
  const reflected = seen.add(glint).mul(F);

  // toward the sun the crests glow; side-on a little, from the light scattered out sideways
  const into = saturate(v.negate().dot(normalize(l.sub(up.mul(dot(l, up))))));
  const crests = CREST.mul(sun).mul(mix(float(0.3), float(1), crest)).mul(mix(float(0.15), float(1), pow(into, 4)));
  // what lies behind, seen through `path` metres of water: dimmed by it, while the water's own glow (and the
  // crests') builds toward the deep's — over the path there and back, so twice the absorption. A wake's bubbles
  // veil it further, as so much more water would.
  const dim = exp(absorption.mul(path).add(ships.air.mul(AIR_VEIL)).negate());
  const through = behind.mul(dim).div(N_WATER * N_WATER);
  const glow = body.add(crests).mul(float(1).sub(dim.mul(dim)));
  // the light up out of the water turned toward the holder's colour, as bright as it was (the first game's)
  let under = through.add(glow);
  if (held) {
    const luminance = (c: Vec3Node) => dot(c, vec3(0.2126, 0.7152, 0.0722));
    under = mix(under, held.dye.xyz.div(max(luminance(held.dye.xyz), 1e-3)).mul(luminance(under)), held.dye.w);
  }
  let water = reflected.add(under.mul(float(1).sub(F)));
  if (held) water = water.add(held.shine.mul(irradiance));
  const froth = sun.mul(nl).div(Math.PI).add(sky.ambient(p, n)).mul(FOAM_ALBEDO);
  return mix(water, froth, foam);
}
