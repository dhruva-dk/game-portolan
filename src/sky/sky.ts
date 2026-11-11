// The sky: the atmosphere's tables, and the backdrop drawn from them with the sun's disc.

import type { WebGPURenderer } from 'three/webgpu';
import { Fn, cos, dot, normalWorldGeometry, normalize, smoothstep, uniform, vec3 } from 'three/tsl';
import type { Environment } from '../environment';
import { SUN_ANGULAR_RADIUS } from './atmosphere';
import { VIEW_RADIUS, createTables, skyRadiance, sunTransmittance } from './tables';

/** The sun's radiance over its disc for unit illuminance: E / (π α²). */
const SUN_RADIANCE = 1 / (Math.PI * SUN_ANGULAR_RADIUS * SUN_ANGULAR_RADIUS);

export function createSky(renderer: WebGPURenderer) {
  const tables = createTables(renderer);
  const sunDirection = uniform(vec3(0, 1, 0));

  const background = Fn(() => {
    const dir = normalize(normalWorldGeometry);
    const sky = skyRadiance(dir, sunDirection);
    const c = dot(dir, sunDirection);
    // one pixel-ish of soft edge so the disc doesn't alias
    const disc = smoothstep(Math.cos(SUN_ANGULAR_RADIUS * 1.1), cos(SUN_ANGULAR_RADIUS), c);
    const sun = sunTransmittance(VIEW_RADIUS, dir.y).mul(disc.mul(SUN_RADIANCE));
    return sky.add(sun);
  })();

  return {
    background,
    update(env: Environment) {
      sunDirection.value.copy(env.sunDirection);
      tables.update(env.sunDirection.y);
    },
  };
}
