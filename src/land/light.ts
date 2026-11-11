// How anything standing on the island is lit: the sky's sun (through the clouds' shadow) and its ambient light;
// below the water, only what of them the water lets down to that depth (water.below).

import { saturate } from 'three/tsl';
import { ambient, cloudShadow, sunDirection, sunIlluminance } from '../sky/sky';

type N = any;

/** The light under the water at a point, as a share of what is above it. */
export interface Below { sun(p: N): N; sky(p: N): N }

/** Light reaching a matte surface at p facing n, as radiance per unit albedo. */
export const light = (p: N, n: N, below: Below): N => {
  const sun = sunIlluminance.mul(cloudShadow(p)).mul(below.sun(p));
  return sun.mul(saturate(n.dot(sunDirection))).div(Math.PI).add(ambient(n).mul(below.sky(p)));
};
