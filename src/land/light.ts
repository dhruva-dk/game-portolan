// How anything standing on the island is lit: the sky's sun (through the clouds' shadow, and the shadows of what
// stands on the island) and its ambient light; below the water, only what of them the water lets down to that depth.

import { saturate } from 'three/tsl';
import { ambient, cloudShadow, sunDirection, sunIlluminance } from '../sky/sky';

type N = any;

/** The light under the water at a point, as a share of what is above it (water.below). */
export interface Below { sun(p: N): N; sky(p: N): N }

/** Light reaching a matte surface at world position p facing n, as radiance per unit albedo. */
export type Light = (p: N, n: N) => N;

/** visible(p, n): 0…1, how much of the sun reaches p past what stands on the island (shadow.visible). */
export function createLighting(below: Below, visible: (p: N, n: N) => N): Light {
  return (p, n) => {
    const sun = sunIlluminance.mul(cloudShadow(p)).mul(visible(p, n)).mul(below.sun(p));
    return sun.mul(saturate(n.dot(sunDirection))).div(Math.PI).add(ambient(n).mul(below.sky(p)));
  };
}

/** A leaf facing n (the side toward the eye): lit on that side, and by the share `through` of what falls on the other. */
export const leafLight = (light: Light, p: N, n: N, through: number): N => light(p, n).add(light(p, n.negate()).mul(through));
