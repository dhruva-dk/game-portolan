// What the galleon's body is made of, and how it takes the light: oiled timber on the hull and spars, a deck left bare
// to weather, tarred wales, the captain's paint, gilded mouldings and black iron — each a glossy surface lit as
// everything else is (sky/light.ts), its sheen the sun's highlight and the sky's reflection in a coat of oil or
// paint (reflectance 0.04 face on, as any oil, varnish or paint), the gilding a metal. Over the timber, the spars and
// the paint lies a coat of varnish: a second, smoother sheen on the hull's own curve, above the grain's.
//
// The planking: Poly Haven's Weathered Brown Planks (Dimitrios Savva, Rico Cilliers; CC0) — its colour scaled to the
// hull's albedo, its roughness under the oil, its normal map for the grain and the seams, its occlusion in the seams.
// Each strake of planks is its own tree's timber: a little lighter or darker, redder or yellower, in lengths of a few
// metres butted end to end at a fine dark joint, staggered from strake to strake, so the texture's tile doesn't repeat
// in plain view. Wet near the waterline: darker, greener and glossier where the sea washes her.
// The deck: Poly Haven's Wooden Planks (Dario Barresi, Charlotte Baglioni; CC0), pale and dry and matte.

import {
  abs, clamp, cross, dFdx, dFdy, dot, float, floor, fract, fwidth, hash, inverseSqrt, max, min, mix, normalize, positionWorld,
  select, smoothstep, sqrt, texture, vec3,
} from 'three/tsl';
import { loadTexture } from '../textures';
import type { Light } from '../sky/light';
import { KIND } from './kit';
import type { Node } from 'three/webgpu';
import type { FloatNode, Vec2Node, Vec3Node } from '../tsl';

/** The planks' and the deck's textures' mean colours, linear (measured), and the albedos they are scaled to: oiled
 * oak, a deep saturated brown; the deck bleached by sun and salt; spars a shade lighter than the hull; timber blackened with pitch. */
const PLANK_MEAN = [0.118, 0.073, 0.042], DECK_MEAN = [0.209, 0.132, 0.083];
const HULL = [0.34, 0.15, 0.05], DECK = [0.36, 0.28, 0.2], SPAR = [0.34, 0.18, 0.07];
const DARK = [0.045, 0.032, 0.022], IRON = [0.03, 0.03, 0.03];
/** How much further from grey oil takes the planks' colours. */
const SOAKED = 2;
/** Gold's reflectance face on (linear), dulled by the weather. */
const GOLD = [0.7, 0.45, 0.15];
/** Roughness: the oil fills the weathered grain to this share of the bare wood's; paint; pitch; the gilding; iron;
 * the bare deck. */
const OILED = 0.4, PAINT = 0.38, PITCH = 0.45, GILT = 0.3, FORGED = 0.55, BARE = 0.8;
/** The hull below and just above the waterline, wet: darker and greener, and smoother by this share. */
const WET = [0.45, 0.5, 0.42], WET_SMOOTH = 0.5;
/** The varnish's roughness, and how much of a coat each kind has: the planking and spars a full one, the paint and
 *  the pitch less; the wet wood near the waterline half again as much. */
const VARNISH = 0.16, COAT_PAINT = 0.8, COAT_PITCH = 0.5, COAT_WET = 1.5;
/** The varnish's sheen, amber: the light it gives back has passed in and out of the coat's own warm tint (so the sky
 *  in it warms rather than greys the timber). */
const AMBER = [1, 0.78, 0.5];
/** The planks' tile holds this many strakes; a plank runs this many tiles before it is butted to the next. */
const STRAKES = 13, LENGTH = 2.5;
/** How much one plank's timber differs from the next: in brightness, and between red and yellow. */
const TIMBER = 0.42, HUE = 0.16;
/** How strongly the normal map tilts the planking (on the skin, the bulwarks, the transom and the paint over them;
 * not on the wales and spars, whose round sections would take its seams for ridges). */
const RELIEF = 1;

/** Body colour (radiance) for a vertex of kind `kind` at texture coordinates uv, `height` metres over her waterline,
 * facing world normal n (unit), open to the sky by ao, in the captain's paint. */
export function createWood(light: Light) {
  const planks = loadTexture('planks.jpg', true), deck = loadTexture('deck.jpg', true);
  // (Poly Haven's packing: occlusion, roughness and metalness in r, g and b; the normal map in OpenGL's convention)
  const arm = loadTexture('planks-arm.jpg', false), bumps = loadTexture('planks-normal.jpg', false);

  return (kind: FloatNode, uv: Vec2Node, height: FloatNode, n0: Vec3Node, ao: FloatNode, paint: Vec3Node): Vec3Node => {
    const p = positionWorld;
    const is = (k: number) => abs(kind.sub(k)).lessThan(0.5);
    const pick = <T>(i: number, a: Node<T>, b: Node<T>) => select(kind.lessThan(i + 0.5), a, b);
    const tex = texture(planks, uv).rgb, packed = texture(arm, uv), dk = texture(deck, uv).rgb;
    const tone = tex.div(vec3(...PLANK_MEAN));
    const grey = dot(tone, vec3(0.3, 0.59, 0.11));
    // oil soaks the weathered grey out of the grain: its colours further from grey
    const soaked = mix(vec3(grey), tone, SOAKED).max(0);

    // one plank's timber, and the joint where it is butted to the next
    const strake = floor(uv.y.mul(STRAKES).add(0.5));
    const run = uv.x.div(LENGTH).add(hash(strake.add(512)));
    const plank = hash(strake.add(512).mul(97).add(floor(run).add(64)));
    const warmth = hash(plank.mul(7919).add(17)).sub(0.5);
    const timber = vec3(1).add(plank.sub(0.5).mul(TIMBER)).mul(vec3(warmth.mul(HUE).add(1), 1, warmth.mul(-HUE).add(1)));
    const f = fract(run), w = fwidth(run);
    const joint = float(1).sub(clamp(min(f, float(1).sub(f)).div(max(w, 1e-5)), 0, 1).oneMinus().mul(0.5)
      .mul(clamp(float(1).sub(w.mul(40)), 0, 1)));
    const timbered = soaked.mul(timber).mul(joint);

    // the normal map through a tangent frame from the screen's derivatives (Schüler, "Normal Mapping Without
    // Precomputed Tangents", 2013), on the planked kinds only
    const planked = kind.lessThan(KIND.paint + 0.5);
    const bump = texture(bumps, uv).xy.mul(2).sub(1).mul(select(planked, float(RELIEF), float(0)));
    const dp1 = dFdx(p), dp2 = dFdy(p), duv1 = dFdx(uv), duv2 = dFdy(uv);
    const t1 = cross(dp2, n0), t2 = cross(n0, dp1);
    const T = t1.mul(duv1.x).add(t2.mul(duv2.x)), B = t1.mul(duv1.y).add(t2.mul(duv2.y));
    const scale = inverseSqrt(max(max(dot(T, T), dot(B, B)), 1e-20));
    const n = normalize(n0.add(T.mul(scale.mul(bump.x))).add(B.mul(scale.mul(bump.y)))).toVar();

    // what each kind is: its albedo, roughness and reflectance face on
    const wet = smoothstep(0.6, -0.2, height);
    const oiled = packed.g.mul(OILED);
    let albedo = pick(KIND.planks, timbered.mul(vec3(...HULL)),
      pick(KIND.paint, paint.mul(grey).mul(joint),
        pick(KIND.dark, tone.mul(vec3(...DARK)),
          pick(KIND.deck, dk.div(vec3(...DECK_MEAN)).mul(vec3(...DECK)),
            pick(KIND.spar, soaked.mul(vec3(...SPAR)),
              pick(KIND.gilt, vec3(0), vec3(...IRON)))))));
    albedo = albedo.mul(mix(vec3(1), vec3(...WET), wet));
    let rough = pick(KIND.planks, oiled, pick(KIND.paint, float(PAINT), pick(KIND.dark, float(PITCH),
      pick(KIND.deck, float(BARE), pick(KIND.spar, oiled, pick(KIND.gilt, float(GILT), float(FORGED)))))));
    rough = rough.mul(mix(float(1), float(WET_SMOOTH), wet));
    const f0 = select(is(KIND.gilt), vec3(...GOLD).mul(grey.mul(0.4).add(0.6)), vec3(0.04));
    // the highlight widened by how much the normal turns across the pixel, so a fine bump doesn't sparkle
    // (Kaplanyan, Hill, Patney and Lefohn, "Filtering Distributions of Normals for Shading Antialiasing", 2016)
    const dn1 = dFdx(n), dn2 = dFdy(n);
    const spread = min(dot(dn1, dn1).add(dot(dn2, dn2)).mul(0.5), 0.18);
    rough = sqrt(sqrt(rough.mul(rough).mul(rough.mul(rough)).add(spread)));

    // the seams' occlusion in the planking's texture, on the planked kinds only
    const seams = select(planked, packed.r, float(1));
    const shade = ao.mul(seams);
    const lit = light.glossy(p, n, rough, f0);
    // the varnish over the timber and the paint: a smooth coat on the hull's own curve, not the grain's, so the sun
    // and the sky lie on it as long clean streaks; wetter, and so glossier, where the sea washes her
    const coat = pick(KIND.planks, float(1), pick(KIND.paint, float(COAT_PAINT), pick(KIND.dark, float(COAT_PITCH),
      pick(KIND.deck, float(0), pick(KIND.spar, float(1), float(0)))))).mul(mix(float(1), float(COAT_WET), wet));
    const varnish = light.glossy(p, n0, mix(float(VARNISH), float(VARNISH * WET_SMOOTH), wet), vec3(0.04)).specular;
    // the rim lights the outline whatever the wood: on the dark planking as on the paint
    return albedo.mul(lit.diffuse).mul(float(1).sub(coat.mul(0.04))).add(lit.specular).add(varnish.mul(coat).mul(vec3(...AMBER)))
      .add(light.rim(p, n0).mul(albedo.add(0.12))).mul(shade);
  };
}
