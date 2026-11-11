// The sky: the atmosphere's tables, the backdrop drawn from them, and the light and haze every other material reads.
//
// The air is Earth's, seen from the eye (view.toSky): its tables are worked out for an eye at the sea under a sun at
// the elevation the eye's sky shows it. Light on a surface is the sun's at that surface's own elevation (dot(up, sun)),
// so the planet has a lit side and a dark one; the sky's own glow (ambient) is the eye's.
//
// What materials use (Sky):
//   sun              unit vector toward the sun, world space
//   sunIlluminance(p) the sun's light at world position p, after the air (per unit sun at the top of the air)
//   cloudShadow(p)   the fraction of it the clouds let through to p
//   ambient(p, n)    the sky's light on a surface at p facing n, as radiance (multiply by albedo)
//   reflect(d, r)    the sky and clouds seen along world direction d off a surface of roughness r
// and the frame's post pass:
//   fog(c, dir, m)   colour c seen m metres away along world direction dir, through the air

import { Vector3, type PerspectiveCamera, type WebGPURenderer } from 'three/webgpu';
import { Fn, cos, dot, exp, float, max, mix, normalWorldGeometry, normalize, smoothstep, uniform, vec3 } from 'three/tsl';
import type { Environment } from '../environment';
import type { View } from '../view/view';
import { toSky } from '../world/sphere';
import { MIE_EXTINCTION, RAYLEIGH_SCATTERING, SUN_ANGULAR_RADIUS } from './atmosphere';
import { createClouds } from './clouds';
import { createReflection } from './reflection';
import { VIEW_RADIUS, createTables, haze, skyAmbientUp, skyRadiance, sunTransmittance } from './tables';

type N = any;

/** The sun's radiance over its disc for unit illuminance: E / (π α²). */
const SUN_RADIANCE = 1 / (Math.PI * SUN_ANGULAR_RADIUS * SUN_ANGULAR_RADIUS);
/** The sea's albedo under a diffuse sky, for light bounced up onto undersides. */
const SEA_ALBEDO = 0.06;

/** Extinction of the air at sea level, per km. */
const seaLevelExtinction: N = vec3(...RAYLEIGH_SCATTERING).add(haze.mul(MIE_EXTINCTION));

/** The light the sky gives everything else. */
export interface Sky {
  sun: N;
  sunIlluminance(p: N): N;
  cloudShadow(p: N): N;
  ambient(p: N, n: N): N;
  reflect(dir: N, roughness: N): N;
}

export function createSky(renderer: WebGPURenderer, view: View) {
  const tables = createTables(renderer);
  /** Toward the sun: in the world, and as the eye's sky shows it. */
  const sun = uniform(new Vector3(0, 1, 0));
  const skySun = uniform(new Vector3(0, 1, 0));
  const clouds = createClouds(renderer, view);
  const reflection = createReflection(renderer, view, skySun);

  const sunIlluminance = (p: N): N => sunTransmittance(VIEW_RADIUS, dot(view.up(p), sun));

  const ambient = (p: N, n: N): N => {
    const up = view.up(p);
    const bounce = sunIlluminance(p).mul(max(dot(up, sun), 0)).add(skyAmbientUp).mul(SEA_ALBEDO);
    return mix(bounce, skyAmbientUp, dot(n, up).mul(0.5).add(0.5));
  };

  const fog = (color: N, dir: N, metres: N): N => {
    const T = exp(seaLevelExtinction.mul(metres).mul(-0.001));
    // what a long path through the air along dir glows with; for things below the horizon, the horizon's glow
    const d = view.toSky(dir);
    const glow = skyRadiance(normalize(vec3(d.x, max(d.y, 0), d.z)), skySun);
    return color.mul(T).add(glow.mul(float(1).sub(T)));
  };

  const background = Fn(() => {
    const dir = normalize(normalWorldGeometry);
    const d = view.toSky(dir);
    // below the horizon there is only more sea, beyond the troughs at its edge, and glancing it mirrors the horizon
    const sky = skyRadiance(normalize(vec3(d.x, max(d.y, 0), d.z)), skySun);
    // a soft edge one pixel wide so the disc doesn't alias
    const disc = smoothstep(Math.cos(SUN_ANGULAR_RADIUS * 1.1), cos(SUN_ANGULAR_RADIUS), dot(dir, sun));
    return sky.add(sunTransmittance(VIEW_RADIUS, d.y).mul(disc.mul(SUN_RADIANCE)));
  })();

  const light: Sky = { sun, sunIlluminance, cloudShadow: clouds.shadow, ambient, reflect: reflection.reflect };

  return {
    background,
    clouds,
    light,
    fog,
    update(env: Environment, camera: PerspectiveCamera, dt: number, width: number, height: number) {
      sun.value.copy(env.sunDirection);
      const s = toSky(view.eye.frame, view.eye.dip, [env.sunDirection.x, env.sunDirection.y, env.sunDirection.z]);
      skySun.value.set(s[0], s[1], s[2]);
      tables.update(s[1], env.haze);
      // the clouds drift east over the eye, as the prevailing wind blows (world/lattice.ts), at the sea's wind speed
      clouds.update({ coverage: env.cloudCoverage, wind: { x: env.windSpeed, y: 0 }, sunDirection: skySun.value }, camera, dt, width, height);
      reflection.update();
    },
  };
}
