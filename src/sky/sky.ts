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
//   cloudShadow(p)   the fraction of it the clouds let through to p: the fair-weather clouds' share (cloudCover)
//                    times the storm's (stormSun)
//   ambient(p, n)    the sky's light on a surface at p facing n, as radiance (multiply by albedo)
//   open             what the sun and the sky give a white surface facing up in the open, out of every shadow and of
//                    the storm, as radiance: the same everywhere, by the hour. The frame's exposure is set by it
//   reflect(d, r)    the sky and clouds seen along world direction d off a surface of roughness r
//   storm(p)         0…1, how deep in the storm (storm.ts) world position p lies; the sun and the sky's glow there are
//                    already dimmed by it
//   stormEdge(p)     metres world position p lies past the storm's edge (negative in its calm)
// and the frame's post pass:
//   fog(c, dir, m)   colour c seen m metres away along world direction dir, through the haze (the sky: m past SKY_METRES)
//   aerial(c, dir, m) the same through Earth's air at the eye's scale, for the view from space
//   veil(c, dir, m)  the same through the storm's rain and cloud: last, over everything, the sky and clouds too
//   deck(c, dir, m)  the storm seen from high over it instead (the full map's view from space): its cloud's top

import { Vector3 } from 'three/webgpu';
import {
  Fn, abs, cross, dot, exp, float, length, luminance, max, mix, normalWorldGeometry, normalize, pow, select, smoothstep, sqrt,
  uniform, vec3,
} from 'three/tsl';
import type { Environment } from '../environment';
import type { Cap } from '../sim/storm';
import type { Compute } from '../gpu';
import type { Eye } from '../snapshot';
import type { View } from '../view/view';
import * as sphere from '../world/sphere';
import { sunAtOrigin, sunInSky } from '../world/sun';
import { MIE_EXTINCTION, MIE_SCALE_HEIGHT, MIE_SCATTERING, SEA_ALBEDO } from './atmosphere';
import { HAZE, STORM, tint } from '../palette';
import { createClouds, type CloudInputs } from './clouds';
import { createReflection } from './reflection';
import { createStormLook, type StormLight } from './storm';
import { RAYLEIGH, VIEW_RADIUS, createTables } from './tables';
import { henyeyGreenstein, type FloatNode, type Vec3Node } from '../tsl';

/**
 * The sun's disc as the sky draws it, its angular radius: 3° across, where the true sun is 0.53°, a few pixels on the
 * phone and lost in its own glow. It is how the disc looks and nothing more: what lights the world is the sun's
 * illuminance (sunIlluminance), the sea draws its own glints (water/optics.ts), and the reflected sky leaves the disc
 * out (reflection.ts).
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
 * own air: SUN_IN of the sun's light (scattered every way, over 4π) and AIR_IN of the sky's glow, tinted the storm's
 * shadow violet (palette.ts).
 */
const STORM_SUN = 0.08, STORM_SKY = 0.35, SUN_IN = 0.6, AIR_IN = 0.3, STORM_TINT = tint(STORM.shadow, 0.45);
/** The sun on the storm's cloud: its luminance, in the storm's lit violet, so the crown is lit whatever the hour,
 *  never red. */
const STORM_SUNLIT = tint(STORM.lit, 0.85);
/**
 * The haze, drawn to the planet's scale rather than Earth's: on a sea whose horizon is 150 m off, Earth's air would
 * leave it as clear as a room, so the far field is swallowed by a haze of its own. Its optical depth is HAZE_DEPTH a
 * unit of the air's aerosol (Environment.haze: about 1.3 on a mean day) at HAZE_DISTANCE metres along the sea from the
 * chase camera's height, growing as the distance to the power HAZE_SHAPE, so the near water stays clear and the far
 * dissolves; it lies in a layer HAZE_HEIGHT metres deep, so a ship's canvas stands out of it over her hull, and the
 * sky gets it as a band HAZE_BAND (the sine of its height) deep along the horizon. Red goes through a little further
 * than blue (HAZE_SPECTRUM). Its glow is the horizon's (tinted the palette's HAZE) and the sun's light scattered forward
 * (HAZE_SUN of it, Henyey-Greenstein HAZE_G). An eye higher than HAZE_ABOVE (from, to) metres leaves it below:
 * gone by the height the arrival's eye comes down into the air from space (play/arrival.ts ARRIVAL.air), so the
 * hand-over from the space eye's air to this haze shows no step.
 */
const HAZE_DEPTH = 0.6, HAZE_DISTANCE = 150, HAZE_SHAPE = 3.2, HAZE_HEIGHT = 8, HAZE_BAND = 0.06, REFERENCE_EYE = 20;
const HAZE_SPECTRUM = [0.85, 1, 1.12] as const, HAZE_SUN = 0.22, HAZE_G = 0.72;
const HAZE_ABOVE = [40, 200] as const;
/** Past this many metres a ray has met nothing: the frame hands the sky's pixels this far or further. */
export const SKY_METRES = 1e4;

/** The light the sky gives everything else. */
export interface Sky {
  sun(p: Vec3Node): Vec3Node;
  sunIlluminance(p: Vec3Node): Vec3Node;
  cloudShadow(p: Vec3Node): FloatNode;
  cloudCover(p: Vec3Node): FloatNode;
  stormSun(p: Vec3Node): FloatNode;
  ambient(p: Vec3Node, n: Vec3Node): Vec3Node;
  open: Vec3Node;
  reflect(dir: Vec3Node, roughness: FloatNode): Vec3Node;
  storm(p: Vec3Node): FloatNode;
  stormEdge(p: Vec3Node): FloatNode;
}

/** The sky's passes due in a frame, each part's in order. */
export interface SkyPasses { tables: readonly Compute[]; clouds: readonly Compute[]; reflection: readonly Compute[] }
const NONE: readonly Compute[] = [];

/** bolt: the storm's lightning held lit (debug.ts ?bolt). */
export function createSky(view: View, bolt: boolean) {
  const tables = createTables();
  const { haze, skyAmbientUp, skyRadiance, sunTransmittance } = tables;
  /** Extinction of the air at sea level, per km. */
  const seaLevelExtinction = RAYLEIGH.add(haze.mul(MIE_EXTINCTION));
  /** Toward the sun over the eye: in the world, and as the eye's sky shows it. */
  const sun = uniform(new Vector3(0, 1, 0));
  const skySun = uniform(new Vector3(0, 1, 0));
  /** The sun's field (world/sun.ts): its origin, the sun over that, and the sine of its height over every place. */
  const origin = uniform(new Vector3(0, 1, 0));
  const there = uniform(new Vector3(0, 1, 0));
  const rise = uniform(1);
  /** 1 while the eye is in the air, under the clouds; 0 from space, where they are not drawn and cast no shadow. */
  const under = uniform(1);
  const clouds = createClouds(view, tables);
  const reflection = createReflection(view, skyRadiance, skySun, clouds.along);
  const storm = createStormLook(view, clouds.shape, bolt);

  /** The sun over p: the sun over the origin turned with the rotation that takes the origin to p (sun.ts's carry). */
  const sunOver = (p: Vec3Node): Vec3Node => {
    const u = normalize(p), c = dot(origin, u), w = cross(origin, u);
    // Rodrigues: v·c + w × v + w (w·v)/(1 + c); at the origin's antipode (the land's heart: world/sun.ts) it is undefined
    return normalize(there.mul(c).add(cross(w, there)).add(w.mul(dot(w, there).div(max(c.add(1), 1e-6)))));
  };

  /** The sun's light through the air at the sea, per unit sun: the same everywhere, as the sun stands as high over
   *  every place. */
  const sunAtSea = sunTransmittance(VIEW_RADIUS, rise);
  const sunIlluminance = (_p: Vec3Node): Vec3Node => sunAtSea;
  /** And on a level surface. */
  const sunlight = sunAtSea.mul(max(rise, 0));

  const ambient = (p: Vec3Node, n: Vec3Node): Vec3Node => {
    const up = view.up(p);
    const bounce = sunlight.add(skyAmbientUp).mul(SEA_ALBEDO);
    return mix(bounce, skyAmbientUp, dot(n, up).mul(0.5).add(0.5)).mul(mix(1, STORM_SKY, storm.depth(p)));
  };
  const stormLight: StormLight = {
    air: sunlight.mul(SUN_IN / (4 * Math.PI)).add(skyAmbientUp.mul(AIR_IN)).mul(vec3(...STORM_TINT)),
    sun: vec3(luminance(sunlight)).mul(vec3(...STORM_SUNLIT)),
    toward: sun,
  };

  /** The air as Earth's is at the eye's scale, for the view from space: its extinction over the metres, toward the
   *  glow a long path through it has along dir (for things below the horizon, the horizon's). */
  const aerial = (color: Vec3Node, dir: Vec3Node, metres: FloatNode): Vec3Node => {
    const T = exp(seaLevelExtinction.mul(metres).mul(-0.001));
    const d = view.toSky(dir);
    const glow = skyRadiance(normalize(vec3(d.x, max(d.y, 0), d.z)), skySun);
    return color.mul(T).add(glow.mul(float(1).sub(T)));
  };

  /** What the haze glows with along world direction dir: the sky's glow at the horizon under it, and the sun's light
   *  scattered forward by the droplets, warm round the sun and cool away from it. */
  const hazeColor = (dir: Vec3Node): Vec3Node => {
    const d = view.toSky(dir);
    const horizon = skyRadiance(normalize(vec3(d.x, 0.02, d.z)), skySun);
    const forward = henyeyGreenstein(dot(normalize(vec3(d.x, max(d.y, 0), d.z)), skySun), HAZE_G);
    return horizon.mul(vec3(...HAZE)).add(sunAtSea.mul(max(rise, 0.05)).mul(forward).mul(HAZE_SUN));
  };
  /** The low air's mean density between two heights over the sea (metres), as a share of the sea's. */
  const meanDensity = (a: FloatNode, b: FloatNode): FloatNode => {
    const ea = exp(max(a, 0).div(-HAZE_HEIGHT)), eb = exp(max(b, 0).div(-HAZE_HEIGHT));
    return select(abs(a.sub(b)).lessThan(0.05), ea, ea.sub(eb).mul(HAZE_HEIGHT).div(b.sub(a)));
  };
  const reference = (HAZE_HEIGHT * (1 - Math.exp(-REFERENCE_EYE / HAZE_HEIGHT))) / REFERENCE_EYE;
  /** The haze's optical depth at HAZE_DISTANCE along the sea, for the air's aerosol now. */
  const hazeDepth = haze.mul(HAZE_DEPTH);

  /**
   * Colour c seen m metres away along world direction dir from the eye, through the haze; a ray that meets nothing
   * (m past SKY_METRES: the sky and the clouds) through the band of it along the horizon.
   */
  const fog = (color: Vec3Node, dir: Vec3Node, metres: FloatNode): Vec3Node => {
    const end = view.position.add(dir.mul(metres));
    const density = meanDensity(view.height, length(end).sub(sphere.R)).div(reference);
    const near = hazeDepth.mul(pow(metres.div(HAZE_DISTANCE), HAZE_SHAPE)).mul(density);
    const band = hazeDepth.mul(exp(max(view.toSky(dir).y, 0).div(-HAZE_BAND)));
    const tau = select(metres.greaterThan(SKY_METRES), band, near).mul(float(1).sub(smoothstep(HAZE_ABOVE[0], HAZE_ABOVE[1], view.height)));
    const T = exp(vec3(...HAZE_SPECTRUM).mul(tau).negate());
    return color.mul(T).add(hazeColor(dir).mul(vec3(1).sub(T)));
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
    const peak = henyeyGreenstein(c, PEAK_G);
    const mieDepth = haze.mul(MIE_SCATTERING * MIE_SCALE_HEIGHT * PEAK_SHARE).div(max(d.y, 0.03));
    return sky.add(T.mul(disc.add(peak.mul(mieDepth))));
  })();

  const cloudCover = (p: Vec3Node): FloatNode => mix(1, clouds.shadow(p), under);
  const stormSun = (p: Vec3Node): FloatNode => mix(1, STORM_SUN, storm.depth(p));
  const cloudShadow = (p: Vec3Node): FloatNode => cloudCover(p).mul(stormSun(p));
  // what a surface mirrors is the sky beyond the storm: seen from the eye, which is near enough the mirror
  const reflect = (dir: Vec3Node, roughness: FloatNode): Vec3Node => storm.dim(reflection.reflect(dir, roughness), dir, stormLight);
  const open = sunlight.div(Math.PI).add(skyAmbientUp);
  const light: Sky = {
    sun: sunOver, sunIlluminance, cloudShadow, cloudCover, stormSun, ambient, open, reflect, storm: storm.depth, stormEdge: storm.edge,
  };
  /** What update hands the clouds, and the passes it returns, laid afresh each frame. */
  const cloudInputs: CloudInputs = { coverage: 0, wind: { x: 0, y: 0 }, sunDirection: skySun.value };
  const due: SkyPasses = { tables: NONE, clouds: NONE, reflection: NONE };
  /** The sun as update works it out, written over each frame. */
  const seen: sphere.Out3 = [0, 0, 0];

  return {
    background,
    clouds,
    light,
    fog,
    aerial,
    veil: (color: Vec3Node, dir: Vec3Node, metres: FloatNode): Vec3Node => storm.veil(color, dir, metres, stormLight),
    deck: (color: Vec3Node, dir: Vec3Node, metres: FloatNode): Vec3Node => storm.deck(color, dir, metres, stormLight),
    /** The clouds' patterns' passes, to be run once before the first frame. */
    bake: clouds.bake,
    /**
     * Readies the sky for this frame, seen from the eye (view.ts, already moved), and returns the passes due from each
     * part of it. An eye in space sees the clouds from outside: they are neither marched nor moved on (their history
     * stays the air's), they cast no shadow, and the sea mirrors the sky alone. The screen is width × height CSS pixels.
     */
    update(env: Environment, cap: Cap, kind: Eye['kind'], dt: number, width: number, height: number): SkyPasses {
      storm.update(cap, env.clock, view.eye.position);
      sun.value.fromArray(env.sunDirection);
      origin.value.fromArray(env.sunPlaces.origin);
      there.value.fromArray(sunAtOrigin(env.sunPlaces, env.timeOfDay, seen));
      rise.value = sunInSky(env.timeOfDay, seen)[1];
      const s = sphere.toSky(view.eye.frame, view.eye.dip, env.sunDirection, seen);
      skySun.value.set(s[0], s[1], s[2]);
      due.tables = tables.update(s[1], env.haze);
      under.value = kind === 'air' ? 1 : 0;
      due.reflection = reflection.update(kind === 'space');
      if (kind === 'space') {
        due.clouds = NONE;
        return due;
      }
      // the clouds drift over the eye with the prevailing wind there (Environment.windDirection), on the eye's east
      // and south
      const w = env.windDirection, { east, north } = view.eye.frame;
      cloudInputs.coverage = env.cloudCoverage;
      cloudInputs.wind.x = env.windSpeed * sphere.dot(w, east);
      cloudInputs.wind.y = -env.windSpeed * sphere.dot(w, north);
      due.clouds = clouds.update(cloudInputs, dt, width, height);
      return due;
    },
  };
}
