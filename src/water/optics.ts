// How light leaves the sea toward the eye, given the surface's normal and roughness there. Units are the sky's:
// radiance per unit sun illuminance at the top of the air.
//
//   reflected  the sky and clouds (sky.reflect, prefiltered to the surface's roughness) and the sun (GGX), weighted
//              by Fresnel for water (F0 = 0.02)
//   body       light scattered back up out of deep water: the irradiance from the sun and sky, times the water's
//              reflectance R ≈ 0.33·b_b/a (Morel & Prieur 1977), through the surface twice and spread by n² on the way out
//   below      what lies under shallow water (the sea floor, already lit by what light reaches it: sunBelow, skyBelow),
//              dimmed along the eye's path through the water and spread by n² on the way out, with the water's own
//              glow in front of it growing toward the deep water's over the path
//   crests     sunlight passing through the thin water at the top of a wave toward an eye looking into the sun: the
//              same water's colour after a couple of metres (exp(−a·d)), the turquoise in the faces of the waves
//   foam       over all of it where the waves break: white and rough, lit by the sun and the sky like any matte surface
//
// The water is Jerlov's oceanic type IA, the clear blue of the tropics: absorption mostly pure water (Pope & Fry
// 1997), backscatter pure water's plus a little from particles.

import { exp, float, max, mix, normalize, pow, saturate, smoothstep, sqrt, vec3 } from 'three/tsl';
import { ambient, cloudShadow, sunDirection, sunIlluminance } from '../sky/sky';

type N = any;

/** Absorption per metre, red/green/blue (680, 550, 440 nm). */
const ABSORPTION = [0.45, 0.065, 0.022];
/** Backscatter per metre. */
const BACKSCATTER = [0.0012, 0.0018, 0.0032];
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

/** What comes back out of deep water per unit irradiance on it: R·(1 − F)²/n², with F ≈ F0 for light near normal. */
const BODY = vec3(...ABSORPTION.map((a, i) => (0.33 * BACKSCATTER[i]) / a * ((1 - F0) ** 2) / (N_WATER * N_WATER)));
/** The water's colour after the light's path through a crest. */
const CREST = vec3(...ABSORPTION.map((a) => Math.exp(-a * CREST_PATH) * CREST_SCATTER));

const absorption = vec3(...ABSORPTION);

/** Schlick's Fresnel for water. */
export const fresnel = (cos: N): N => float(F0).add(pow(float(1).sub(saturate(cos)), 5).mul(1 - F0));

/** 1 below the sea's mean level, 0 above, over a few centimetres. */
const wet = (p: N): N => smoothstep(0.03, -0.03, p.y);

/**
 * The share of the sun's light (as it is above the water) that reaches world position p below the surface: through
 * the surface (Fresnel), then down the refracted ray to p's depth, absorbed on the way. 1 above the water.
 */
export const sunBelow = (p: N): N => {
  const depth = max(p.y.negate(), 0);
  const cos = sqrt(float(1).sub(float(1).sub(sunDirection.y.mul(sunDirection.y)).div(N_WATER * N_WATER)));
  const through = exp(absorption.mul(depth.div(cos)).negate()).mul(float(1).sub(fresnel(max(sunDirection.y, 0))));
  return mix(vec3(1), through, wet(p));
};

/** The same for the sky's light, which comes down from every direction: on average a path about 1.2 times the depth. */
export const skyBelow = (p: N): N => {
  const through = exp(absorption.mul(max(p.y.negate(), 0).mul(1.2)).negate()).mul(1 - 0.066);
  return mix(vec3(1), through, wet(p));
};

/** GGX's distribution and height-correlated Smith visibility, for roughness α (not squared). */
function ggx(nh: N, nl: N, nv: N, alpha: N): N {
  const a2 = alpha.mul(alpha);
  const d = nh.mul(nh).mul(a2.sub(1)).add(1);
  const D = a2.div(d.mul(d).mul(Math.PI));
  const vl = nv.mul(sqrt(nl.mul(nl).mul(float(1).sub(a2)).add(a2)));
  const vv = nl.mul(sqrt(nv.mul(nv).mul(float(1).sub(a2)).add(a2)));
  return D.mul(float(0.5).div(max(vl.add(vv), 1e-5)));
}

/**
 * The light leaving the sea at world position p toward the eye.
 *   n      the surface's normal          v      unit vector from p to the eye
 *   alpha  GGX roughness (the slopes the pixel can't resolve, plus the ripples no cascade holds)
 *   crest  0 in the troughs … 1 at the tops of the waves, where the water is thinnest
 *   foam   the share of the pixel covered in foam
 *   behind the radiance of whatever lies behind the surface (the sea floor; the sky's if nothing)
 *   path   metres from the surface to it through the water (Infinity for open sea)
 */
export function seaRadiance(
  p: N, n: N, v: N, alpha: N, crest: N, foam: N, behind: N, path: N, reflect: (dir: N, roughness: N) => N,
): N {
  const l = sunDirection;
  const nv = max(n.dot(v), 1e-4), nl = saturate(n.dot(l));
  const F = fresnel(nv);
  const sun = sunIlluminance.mul(cloudShadow(p));

  // radiance off a reflectance R under irradiance E is R·E/π; ambient() is the sky's radiance, so its E/π is itself
  const irradiance = sun.mul(max(l.y, 0)).div(Math.PI).add(ambient(vec3(0, 1, 0)));
  const body = BODY.mul(irradiance);

  // The sky, along the reflected ray, blurred to the roughness (three's PMREM takes √α). A ray reflected down
  // from a facet turned away from the eye meets the back of the next wave, not the sky: it sees the sea's own colour.
  const r = v.negate().reflect(n);
  const above = reflect(normalize(vec3(r.x, max(r.y, 0), r.z)), sqrt(alpha));
  const sky = mix(above, body, saturate(r.y.mul(-20)));
  const h = normalize(l.add(v));
  const glint = sun.mul(ggx(saturate(n.dot(h)), nl, nv, alpha)).mul(nl);
  const reflected = sky.add(glint).mul(F);

  // toward the sun the crests glow; side-on a little, from the light scattered out sideways
  const into = saturate(v.negate().dot(normalize(vec3(l.x, 0, l.z))));
  const crests = CREST.mul(sun).mul(mix(float(0.3), float(1), crest)).mul(mix(float(0.15), float(1), pow(into, 4)));
  // what lies behind, seen through `path` metres of water: dimmed by it, while the water's own glow (and the
  // crests') builds toward the deep's — over the path there and back, so twice the absorption
  const seen = behind.mul(exp(absorption.mul(path).negate())).div(N_WATER * N_WATER);
  const glow = body.add(crests).mul(float(1).sub(exp(absorption.mul(path).mul(-2))));
  const water = reflected.add(seen.add(glow).mul(float(1).sub(F)));
  const froth = sun.mul(nl).div(Math.PI).add(ambient(n)).mul(FOAM_ALBEDO);
  return mix(water, froth, foam);
}
