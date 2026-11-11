// The sky: the atmosphere's tables, the backdrop drawn from them, and the light and haze every other material reads.
//
// What materials use:
//   sunDirection     unit vector toward the sun
//   sunIlluminance   the sun's light at sea level, after the air (per unit sun at the top of the air)
//   cloudShadow(p)   the fraction of it the clouds let through to world position p
//   ambient(n)       the sky's light on a surface facing n, as radiance (multiply by albedo)
//   fog(c, dir, m)   colour c seen m metres away along dir, through the air
//   reflect(d, r)    the sky and clouds seen along d off a surface of roughness r

import type { PerspectiveCamera, WebGPURenderer } from 'three/webgpu';
import { Fn, cos, dot, exp, float, max, mix, normalWorldGeometry, normalize, smoothstep, uniform, vec3 } from 'three/tsl';
import type { Environment } from '../environment';
import { MIE_EXTINCTION, RAYLEIGH_SCATTERING, SUN_ANGULAR_RADIUS } from './atmosphere';
import { cloudShadow, createClouds } from './clouds';
import { createReflection } from './reflection';
import { VIEW_RADIUS, createTables, haze, skyAmbientUp, skyRadiance, sunTransmittance } from './tables';

type N = any;

/** The sun's radiance over its disc for unit illuminance: E / (π α²). */
const SUN_RADIANCE = 1 / (Math.PI * SUN_ANGULAR_RADIUS * SUN_ANGULAR_RADIUS);
/** The sea's albedo under a diffuse sky, for light bounced up onto undersides. */
const SEA_ALBEDO = 0.06;

export const sunDirection = uniform(vec3(0, 1, 0));
export const sunIlluminance: N = sunTransmittance(VIEW_RADIUS, sunDirection.y);
export { cloudShadow };

export const ambient = (n: N): N => {
  const sky = skyAmbientUp;
  const bounce = sunIlluminance.mul(max(sunDirection.y, 0)).add(sky).mul(SEA_ALBEDO);
  return mix(bounce, sky, n.y.mul(0.5).add(0.5));
};

/** Extinction of the air at sea level, per km. */
const seaLevelExtinction: N = vec3(...RAYLEIGH_SCATTERING).add(haze.mul(MIE_EXTINCTION));

export const fog = (color: N, dir: N, metres: N): N => {
  const T = exp(seaLevelExtinction.mul(metres).mul(-0.001));
  // what a long path through the air along dir glows with; for things below the horizon, the horizon's glow
  const glow = skyRadiance(normalize(vec3(dir.x, max(dir.y, 0), dir.z)), sunDirection);
  return color.mul(T).add(glow.mul(float(1).sub(T)));
};

export function createSky(renderer: WebGPURenderer) {
  const tables = createTables(renderer);
  const clouds = createClouds(renderer);
  const reflection = createReflection(renderer, sunDirection);

  const background = Fn(() => {
    const dir = normalize(normalWorldGeometry);
    const sky = skyRadiance(dir, sunDirection);
    // a soft edge one pixel wide so the disc doesn't alias
    const disc = smoothstep(Math.cos(SUN_ANGULAR_RADIUS * 1.1), cos(SUN_ANGULAR_RADIUS), dot(dir, sunDirection));
    return sky.add(sunTransmittance(VIEW_RADIUS, dir.y).mul(disc.mul(SUN_RADIANCE)));
  })();

  return {
    background,
    clouds,
    reflect: reflection.reflect,
    update(env: Environment, camera: PerspectiveCamera, dt: number, width: number, height: number) {
      sunDirection.value.copy(env.sunDirection);
      tables.update(env.sunDirection.y, env.haze);
      clouds.update({ coverage: env.cloudCoverage, wind: env.wind, sunDirection: env.sunDirection }, camera, dt, width, height);
      reflection.update();
    },
  };
}
