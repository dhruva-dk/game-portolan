// The sky: the atmosphere's tables, the backdrop drawn from them, and the light and haze every other material reads.
//
// The air is Earth's, seen from the eye (view.toSky): its tables are worked out for an eye at the sea under a sun at
// the elevation the eye's sky shows it. The sun is the same time of day everywhere (world/sun.ts): over every place it
// stands as high, its bearing carried from place to place, so a surface is lit by the sun over it (sun(p)), which is
// the same wherever the eye is; the sky's own glow (ambient) is the eye's.
//
// What materials use (Sky):
//   sun(p)           unit vector toward the sun over world position p, world space
//   sunIlluminance(p) the sun's light at world position p, after the air (per unit sun at the top of the air)
//   cloudShadow(p)   the fraction of it the clouds let through to p
//   ambient(p, n)    the sky's light on a surface at p facing n, as radiance (multiply by albedo)
//   reflect(d, r)    the sky and clouds seen along world direction d off a surface of roughness r
//   storm(p)         0…1, how deep in the storm (storm.ts) world position p lies; the sun and the sky's glow there are
//                    already dimmed by it
// and the frame's post pass:
//   fog(c, dir, m)   colour c seen m metres away along world direction dir, through the air
//   veil(c, dir, m)  the same through the storm's rain and cloud: last, over everything, the sky and clouds too

import { Vector3, type PerspectiveCamera } from 'three/webgpu';
import { Fn, cross, dot, exp, float, max, mix, normalWorldGeometry, normalize, pow, smoothstep, sqrt, uniform, vec3 } from 'three/tsl';
import type { Environment } from '../environment';
import type { Cap } from '../sim/storm';
import type { Compute } from '../gpu';
import type { View } from '../view/view';
import { toSky } from '../world/sphere';
import { sunAtOrigin, sunInSky } from '../world/sun';
import { MIE_EXTINCTION, MIE_SCALE_HEIGHT, MIE_SCATTERING, RAYLEIGH_SCATTERING, SEA_ALBEDO } from './atmosphere';
import { createClouds } from './clouds';
import { createReflection } from './reflection';
import { createStormLook } from './storm';
import { VIEW_RADIUS, createTables } from './tables';

type N = any;

/**
 * The sun's disc as the sky draws it, its angular radius: 3° across, where the true sun is 0.53°, a few pixels on the
 * phone and lost in its own glow. It is how the disc looks and nothing more: what lights the world is the sun's
 * illuminance (sunIlluminance), the glint off the sea is the true disc's (water/glitter.ts), and the reflected sky
 * leaves the disc out (reflection.ts).
 */
const SUN_DISC = (1.5 * Math.PI) / 180;
/**
 * The disc's radiance at its centre, per unit of the sun's light at the eye: white at the frame's exposure while the
 * sun is high, and through the long air of the evening its own reddened colour rather than a white hole. Its edge
 * softens over the outer EDGE of its radius, and a faint halo (HALO of its centre, falling off as e^(−(r − 1)/WIDTH))
 * blooms round it.
 */
const SUN_RADIANCE = 8, EDGE = 0.3, HALO = 0.04, WIDTH = 0.6;
/**
 * Aerosol's diffraction peak, which the sky-view table's broad Mie lobe (g = 0.8, Cornette-Shanks) cannot hold at its
 * resolution: a share of the Mie scattering in a Henyey-Greenstein lobe of g = 0.95, worked out per pixel. Near the
 * sun the view and the sunlight share one path, so single scattering is the sun's light at the eye times the phase
 * times the Mie scattering depth along the view. Added on top; the table keeps its own lobe. A twentieth: its core is
 * as wide as the drawn disc, and at a quarter it was a white blur that hid the disc in it.
 */
const PEAK_SHARE = 0.05, PEAK_G = 0.95;
/**
 * In the storm, the share of the sun its cloud lets through, and of the sky's glow; and the light in the storm's
 * own air: SUN_IN of the sun's light (scattered every way, over 4π) and AIR_IN of the sky's glow, tinted cold.
 */
const STORM_SUN = 0.08, STORM_SKY = 0.35, SUN_IN = 0.6, AIR_IN = 0.3, STORM_TINT = [0.85, 0.92, 1] as const;

/** The light the sky gives everything else. */
export interface Sky {
  sun(p: N): N;
  sunIlluminance(p: N): N;
  cloudShadow(p: N): N;
  ambient(p: N, n: N): N;
  reflect(dir: N, roughness: N): N;
  storm(p: N): N;
}

export function createSky(view: View) {
  const tables = createTables();
  const { haze, skyAmbientUp, skyRadiance, sunTransmittance } = tables;
  /** Extinction of the air at sea level, per km. */
  const seaLevelExtinction: N = vec3(...RAYLEIGH_SCATTERING).add(haze.mul(MIE_EXTINCTION));
  /** Toward the sun over the eye: in the world, and as the eye's sky shows it. */
  const sun = uniform(new Vector3(0, 1, 0));
  const skySun = uniform(new Vector3(0, 1, 0));
  /** The sun's field (world/sun.ts): its origin, the sun over that, and the sine of its height over every place. */
  const origin = uniform(new Vector3(0, 1, 0));
  const there = uniform(new Vector3(0, 1, 0));
  const rise = uniform(1);
  const clouds = createClouds(view, tables);
  const reflection = createReflection(view, skyRadiance, skySun, clouds.along);
  const storm = createStormLook(view);

  /** The sun over p: the sun over the origin turned with the rotation that takes the origin to p (sun.ts's carry). */
  const sunOver = (p: N): N => {
    const u: N = normalize(p), c: N = dot(origin, u), w: N = cross(origin, u);
    // Rodrigues: v·c + w × v + w (w·v)/(1 + c); at the origin's antipode (under an island) it is undefined
    return normalize(there.mul(c).add(cross(w, there)).add(w.mul(dot(w, there).div(max(c.add(1), 1e-6)))));
  };

  /** The same everywhere: the sun stands as high over every place. */
  const sunIlluminance = (_p: N): N => sunTransmittance(VIEW_RADIUS, rise);

  const ambient = (p: N, n: N): N => {
    const up = view.up(p);
    const bounce = sunIlluminance(p).mul(max(rise, 0)).add(skyAmbientUp).mul(SEA_ALBEDO);
    return mix(bounce, skyAmbientUp, dot(n, up).mul(0.5).add(0.5)).mul(mix(1, STORM_SKY, storm.depth(p)));
  };
  const stormLight: N = sunTransmittance(VIEW_RADIUS, rise).mul(max(rise, 0)).mul(SUN_IN / (4 * Math.PI)).add(skyAmbientUp.mul(AIR_IN)).mul(vec3(...STORM_TINT));

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
    const c = dot(dir, sun);
    const T = sunTransmittance(VIEW_RADIUS, d.y);
    // the disc, its soft edge and its halo; its angle off the sun's centre from 1 − cos, which keeps its precision so close
    const r = sqrt(max(float(1).sub(c).mul(2), 0)).div(SUN_DISC);
    const halo = exp(max(r.sub(1), 0).div(-WIDTH)).mul(HALO);
    const disc = float(1).sub(smoothstep(1 - EDGE, 1, r)).add(halo).mul(SUN_RADIANCE);
    const g2 = PEAK_G * PEAK_G;
    const peak = float((1 - g2) / (4 * Math.PI)).div(pow(float(1 + g2).sub(c.mul(2 * PEAK_G)), 1.5));
    const mieDepth = haze.mul(MIE_SCATTERING * MIE_SCALE_HEIGHT * PEAK_SHARE).div(max(d.y, 0.03));
    return sky.add(T.mul(disc.add(peak.mul(mieDepth))));
  })();

  const cloudShadow = (p: N): N => clouds.shadow(p).mul(mix(1, STORM_SUN, storm.depth(p)));
  // what a surface mirrors is the sky beyond the storm: seen from the eye, which is near enough the mirror
  const reflect = (dir: N, roughness: N): N => storm.dim(reflection.reflect(dir, roughness), dir, stormLight);
  const light: Sky = { sun: sunOver, sunIlluminance, cloudShadow, ambient, reflect, storm: storm.depth };

  return {
    background,
    clouds,
    light,
    fog,
    veil: (color: N, dir: N, metres: N): N => storm.veil(color, dir, metres, stormLight),
    /** The clouds' patterns' passes, to be run once before the first frame. */
    bake: clouds.bake,
    /** Readies the sky for this frame, and returns the passes due from each part of it. */
    update(env: Environment, cap: Cap, camera: PerspectiveCamera, dt: number, width: number, height: number): { tables: Compute[]; clouds: Compute[]; reflection: Compute[] } {
      storm.update(cap, env.clock);
      sun.value.copy(env.sunDirection);
      origin.value.set(...env.sunPlaces.origin);
      there.value.set(...sunAtOrigin(env.sunPlaces, env.timeOfDay));
      rise.value = sunInSky(env.timeOfDay)[1];
      const s = toSky(view.eye.frame, view.eye.dip, [env.sunDirection.x, env.sunDirection.y, env.sunDirection.z]);
      skySun.value.set(s[0], s[1], s[2]);
      const air = tables.update(s[1], env.haze);
      // the clouds drift over the eye with the prevailing wind there (Environment.windDirection), on the eye's east and south
      const w = env.windDirection, f = view.eye.frame, along = (a: readonly number[]) => env.windSpeed * (w.x * a[0] + w.y * a[1] + w.z * a[2]);
      const cover = clouds.update({ coverage: env.cloudCoverage, wind: { x: along(f.east), y: -along(f.north) }, sunDirection: skySun.value }, camera, dt, width, height);
      return { tables: air, clouds: cover, reflection: reflection.update() };
    },
  };
}
