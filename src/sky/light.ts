// How anything standing on the island is lit: the sky's sun (through the clouds' shadow, and the shadows of what
// stands on the island) and its ambient light; below the water, only what of them the water lets down to that depth.
// A glossy surface (a ship's oiled timber, her paint, her gilding) also reflects them toward the eye: the sun as a
// GGX highlight, the sky as its GGX-filtered reflection (sky/reflection.ts), both at the same exposure as the rest.

import { cameraPosition, dot, float, max, min, normalize, pow, reflect, saturate, vec2, vec3, vec4 } from 'three/tsl';
import type { FloatNode, Vec3Node } from '../tsl';
import type { Sky } from './sky';

/** The light under the water at a point, as a share of what is above it (water.below). */
export interface Below { sun(p: Vec3Node): Vec3Node; sky(p: Vec3Node): Vec3Node }

/** A glossy surface's light: what reaches it per unit albedo (for its diffuse part), and the radiance it reflects
 * toward the eye. */
export interface Gloss { diffuse: Vec3Node; specular: Vec3Node }

/** Light reaching a matte surface at world position p facing n, as radiance per unit albedo. */
export interface Light {
  (p: Vec3Node, n: Vec3Node): Vec3Node;
  /** The same for a surface of roughness r (perceptual, 0…1) and reflectance f0 face on (rgb: a metal's colour). */
  glossy(p: Vec3Node, n: Vec3Node, r: FloatNode, f0: Vec3Node): Gloss;
  /**
   * The rim: the sun's light caught along an outline, where the surface at p facing n turns away from the eye, the
   * more as the sun stands behind it; radiance per unit albedo. A painter's light rather than a physical one: at the
   * phone's resolution a lit edge reads where a thin dark one is lost, so the ships are cut out of the sea by it.
   */
  rim(p: Vec3Node, n: Vec3Node): Vec3Node;
}

/** The rim's strength (of the sun's light at p, as a white surface square to it would give), how fast it narrows to
 *  the outline, how much of it a surface lit from the front keeps, and its warmth. */
const RIM = 1.2, RIM_POWER = 3, FRONT = 0.3, RIM_TINT = [1.1, 0.95, 0.75] as const;

/** The smoothest a surface is taken to be for the sun: a smoother one's highlight would be smaller than the disc. */
const SMOOTHEST = 0.06;

/**
 * The environment's share of a glossy reflection, integrated over the hemisphere: Karis's fit for mobile ("Physically
 * Based Shading on Mobile", 2014), f0 scaled and biased by roughness and the angle of view.
 */
const envBRDF = (f0: Vec3Node, r: FloatNode, nv: FloatNode): Vec3Node => {
  const c0 = vec4(-1, -0.0275, -0.572, 0.022), c1 = vec4(1, 0.0425, 1.04, -0.04);
  const q = c0.mul(r).add(c1);
  const a004 = min(q.x.mul(q.x), pow(float(2), nv.mul(-9.28))).mul(q.x).add(q.y);
  const ab = vec2(-1.04, 1.04).mul(a004).add(q.zw);
  return f0.mul(ab.x).add(ab.y);
};

/** visible(p, n): 0…1, how much of the sun reaches p past what stands on the island (shadow.visible). */
export function createLighting(sky: Sky, below: Below, visible: (p: Vec3Node, n: Vec3Node) => FloatNode): Light {
  const sunAt = (p: Vec3Node, n: Vec3Node): Vec3Node => sky.sunIlluminance(p).mul(sky.cloudShadow(p)).mul(visible(p, n)).mul(below.sun(p));
  const ambient = (p: Vec3Node, n: Vec3Node): Vec3Node => sky.ambient(p, n).mul(below.sky(p));
  const light = (p: Vec3Node, n: Vec3Node): Vec3Node => sunAt(p, n).mul(saturate(n.dot(sky.sun(p)))).div(Math.PI).add(ambient(p, n));
  light.glossy = (p: Vec3Node, n: Vec3Node, r: FloatNode, f0: Vec3Node): Gloss => {
    const l = sky.sun(p).toVar();
    const sun = sunAt(p, n).toVar(), nl = saturate(n.dot(l));
    const v = normalize(cameraPosition.sub(p)), nv = max(dot(n, v), 1e-4);
    // the sun: GGX, Smith's height-correlated visibility (Hammon's fit), Schlick's Fresnel
    const rough = max(r, SMOOTHEST), a = rough.mul(rough), a2 = a.mul(a);
    const h = normalize(v.add(l)), nh = saturate(dot(n, h)), vh = saturate(dot(v, h));
    const d = nh.mul(nh).mul(a2.sub(1)).add(1);
    const D = a2.div(d.mul(d).mul(Math.PI));
    const V = float(0.5).div(nl.mul(nv).mul(2).mul(float(1).sub(a)).add(nl.add(nv).mul(a)).add(1e-5));
    const F = f0.add(vec3(1).sub(f0).mul(pow(float(1).sub(vh), 5)));
    const glint = sun.mul(F).mul(D.mul(V).mul(nl));
    // the sky, reflected
    const mirrored = sky.reflect(reflect(v.negate(), n), rough).mul(envBRDF(f0, rough, nv)).mul(below.sky(p));
    return { diffuse: sun.mul(nl).div(Math.PI).add(ambient(p, n)), specular: glint.add(mirrored) };
  };
  light.rim = (p: Vec3Node, n: Vec3Node): Vec3Node => {
    const v = normalize(cameraPosition.sub(p)), l = sky.sun(p);
    const edge = pow(float(1).sub(saturate(dot(n, v))), RIM_POWER);
    const behind = saturate(dot(v.negate(), l)).mul(1 - FRONT).add(FRONT);
    // only where the sky's sun reaches (its shadows, and none under water), and on the side of the outline toward it
    const facing = saturate(dot(n, l).mul(0.5).add(0.6));
    return sunAt(p, n).mul(edge.mul(behind).mul(facing).mul(RIM / Math.PI)).mul(vec3(...RIM_TINT));
  };
  return light;
}

/** A leaf facing n (the side toward the eye): lit on that side, and by the share `through` of what falls on the other. */
export const leafLight = (light: Light, p: Vec3Node, n: Vec3Node, through: number): Vec3Node => light(p, n).add(light(p, n.negate()).mul(through));
