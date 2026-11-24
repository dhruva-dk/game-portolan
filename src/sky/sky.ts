import { Vector3 } from 'three/webgpu';
import {
  Fn,
  abs,
  cross,
  dot,
  exp,
  float,
  length,
  luminance,
  max,
  mix,
  normalWorldGeometry,
  normalize,
  pow,
  select,
  smoothstep,
  sqrt,
  uniform,
  vec3,
} from 'three/tsl';
import type { Environment } from '../environment.ts';
import type { Compute } from '../gpu.ts';
import type { Eye, StormDraw } from '../snapshot.ts';
import type { View } from '../view/view.ts';
import * as sphere from '../world/sphere.ts';
import { sunAtOrigin, sunInSky } from '../world/sun.ts';
import {
  MIE_EXTINCTION,
  MIE_SCALE_HEIGHT,
  MIE_SCATTERING,
  SEA_ALBEDO,
} from './atmosphere.ts';
import { HAZE, STORM, tint } from '../palette.ts';
import { createClouds, type CloudInputs } from './clouds.ts';
import { createReflection } from './reflection.ts';
import { createStormLook, type StormLight } from './storm.ts';
import { RAYLEIGH, VIEW_RADIUS, createTables } from './tables.ts';
import { henyeyGreenstein, type FloatNode, type Vec3Node } from '../tsl.ts';

const SUN_DISC = (1.5 * Math.PI) / 180;
const SUN_RADIANCE = 8,
  EDGE = 0.3,
  HALO = 0.04,
  WIDTH = 0.6;
const PEAK_SHARE = 0.05,
  PEAK_G = 0.95;
const STORM_SUN = 0.08,
  STORM_SKY = 0.35,
  SUN_IN = 0.6,
  AIR_IN = 0.3,
  STORM_TINT = tint(STORM.shadow, 0.45);
const STORM_SUNLIT = tint(STORM.lit, 0.85);
const HAZE_DEPTH = 0.6,
  HAZE_DISTANCE = 150,
  HAZE_SHAPE = 3.2,
  HAZE_HEIGHT = 8,
  HAZE_BAND = 0.06,
  REFERENCE_EYE = 20;
const HAZE_SPECTRUM = [0.85, 1, 1.12] as const,
  HAZE_SUN = 0.22,
  HAZE_G = 0.72;
const HAZE_ABOVE = [40, 200] as const;
export const SKY_METRES = 1e4;

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

interface SkyPasses {
  tables: readonly Compute[];
  clouds: readonly Compute[];
  reflection: readonly Compute[];
}
const NONE: readonly Compute[] = [];

export function createSky(view: View, bolt: boolean) {
  const tables = createTables();
  const { haze, skyAmbientUp, skyRadiance, sunTransmittance } = tables;
  const seaLevelExtinction = RAYLEIGH.add(haze.mul(MIE_EXTINCTION));
  const sun = uniform(new Vector3(0, 1, 0));
  const skySun = uniform(new Vector3(0, 1, 0));
  const origin = uniform(new Vector3(0, 1, 0));
  const there = uniform(new Vector3(0, 1, 0));
  const rise = uniform(1);
  const under = uniform(1);
  const clouds = createClouds(view, tables);
  const reflection = createReflection(view, skyRadiance, skySun, clouds.along);
  const storm = createStormLook(view, clouds.shape, bolt);

  const sunOver = (p: Vec3Node): Vec3Node => {
    const u = normalize(p),
      c = dot(origin, u),
      w = cross(origin, u);
    return normalize(
      there
        .mul(c)
        .add(cross(w, there))
        .add(w.mul(dot(w, there).div(max(c.add(1), 1e-6))))
    );
  };

  const sunAtSea = sunTransmittance(VIEW_RADIUS, rise);
  const sunIlluminance = (_p: Vec3Node): Vec3Node => sunAtSea;
  const sunlight = sunAtSea.mul(max(rise, 0));

  const ambient = (p: Vec3Node, n: Vec3Node): Vec3Node => {
    const up = view.up(p);
    const bounce = sunlight.add(skyAmbientUp).mul(SEA_ALBEDO);
    return mix(bounce, skyAmbientUp, dot(n, up).mul(0.5).add(0.5)).mul(
      mix(1, STORM_SKY, storm.depth(p))
    );
  };
  const stormLight: StormLight = {
    air: sunlight
      .mul(SUN_IN / (4 * Math.PI))
      .add(skyAmbientUp.mul(AIR_IN))
      .mul(vec3(...STORM_TINT)),
    sun: vec3(luminance(sunlight)).mul(vec3(...STORM_SUNLIT)),
    toward: sun,
  };

  const aerial = (
    color: Vec3Node,
    dir: Vec3Node,
    metres: FloatNode
  ): Vec3Node => {
    const T = exp(seaLevelExtinction.mul(metres).mul(-0.001));
    const d = view.toSky(dir);
    const glow = skyRadiance(normalize(vec3(d.x, max(d.y, 0), d.z)), skySun);
    return color.mul(T).add(glow.mul(float(1).sub(T)));
  };

  const hazeColor = (dir: Vec3Node): Vec3Node => {
    const d = view.toSky(dir);
    const horizon = skyRadiance(normalize(vec3(d.x, 0.02, d.z)), skySun);
    const forward = henyeyGreenstein(
      dot(normalize(vec3(d.x, max(d.y, 0), d.z)), skySun),
      HAZE_G
    );
    return horizon
      .mul(vec3(...HAZE))
      .add(sunAtSea.mul(max(rise, 0.05)).mul(forward).mul(HAZE_SUN));
  };
  const meanDensity = (a: FloatNode, b: FloatNode): FloatNode => {
    const ea = exp(max(a, 0).div(-HAZE_HEIGHT)),
      eb = exp(max(b, 0).div(-HAZE_HEIGHT));
    return select(
      abs(a.sub(b)).lessThan(0.05),
      ea,
      ea.sub(eb).mul(HAZE_HEIGHT).div(b.sub(a))
    );
  };
  const reference =
    (HAZE_HEIGHT * (1 - Math.exp(-REFERENCE_EYE / HAZE_HEIGHT))) /
    REFERENCE_EYE;
  const hazeDepth = haze.mul(HAZE_DEPTH);

  const fog = (color: Vec3Node, dir: Vec3Node, metres: FloatNode): Vec3Node => {
    const end = view.position.add(dir.mul(metres));
    const density = meanDensity(view.height, length(end).sub(sphere.R)).div(
      reference
    );
    const near = hazeDepth
      .mul(pow(metres.div(HAZE_DISTANCE), HAZE_SHAPE))
      .mul(density);
    const band = hazeDepth.mul(exp(max(view.toSky(dir).y, 0).div(-HAZE_BAND)));
    const tau = select(metres.greaterThan(SKY_METRES), band, near).mul(
      float(1).sub(smoothstep(HAZE_ABOVE[0], HAZE_ABOVE[1], view.height))
    );
    const T = exp(
      vec3(...HAZE_SPECTRUM)
        .mul(tau)
        .negate()
    );
    return color.mul(T).add(hazeColor(dir).mul(vec3(1).sub(T)));
  };

  const background = Fn(() => {
    const dir = normalize(normalWorldGeometry);
    const d = view.toSky(dir);
    const sky = skyRadiance(normalize(vec3(d.x, max(d.y, 0), d.z)), skySun);
    const c = dot(dir, sun);
    const T = sunTransmittance(VIEW_RADIUS, d.y);
    const r = sqrt(max(float(1).sub(c).mul(2), 0)).div(SUN_DISC);
    const halo = exp(max(r.sub(1), 0).div(-WIDTH)).mul(HALO);
    const disc = float(1)
      .sub(smoothstep(1 - EDGE, 1, r))
      .add(halo)
      .mul(SUN_RADIANCE);
    const peak = henyeyGreenstein(c, PEAK_G);
    const mieDepth = haze
      .mul(MIE_SCATTERING * MIE_SCALE_HEIGHT * PEAK_SHARE)
      .div(max(d.y, 0.03));
    return sky.add(T.mul(disc.add(peak.mul(mieDepth))));
  })();

  const cloudCover = (p: Vec3Node): FloatNode =>
    mix(1, clouds.shadow(p), under);
  const stormSun = (p: Vec3Node): FloatNode =>
    mix(1, STORM_SUN, storm.depth(p));
  const cloudShadow = (p: Vec3Node): FloatNode =>
    cloudCover(p).mul(stormSun(p));
  const reflect = (dir: Vec3Node, roughness: FloatNode): Vec3Node =>
    storm.dim(reflection.reflect(dir, roughness), dir, stormLight);
  const open = sunlight.div(Math.PI).add(skyAmbientUp);
  const light: Sky = {
    sun: sunOver,
    sunIlluminance,
    cloudShadow,
    cloudCover,
    stormSun,
    ambient,
    open,
    reflect,
    storm: storm.depth,
    stormEdge: storm.edge,
  };
  const cloudInputs: CloudInputs = {
    coverage: 0,
    wind: { x: 0, y: 0 },
    sunDirection: skySun.value,
  };
  const due: SkyPasses = { tables: NONE, clouds: NONE, reflection: NONE };
  const seen: sphere.Out3 = [0, 0, 0];

  return {
    background,
    clouds,
    light,
    fog,
    aerial,
    veil: (color: Vec3Node, dir: Vec3Node, metres: FloatNode): Vec3Node =>
      storm.veil(color, dir, metres, stormLight),
    deck: (color: Vec3Node, dir: Vec3Node, metres: FloatNode): Vec3Node =>
      storm.deck(color, dir, metres, stormLight),
    bake: clouds.bake,
    update(
      env: Environment,
      cap: StormDraw,
      kind: Eye['kind'],
      dt: number,
      width: number,
      height: number
    ): SkyPasses {
      storm.update(cap, env.clock, view.eye.position);
      sun.value.fromArray(env.sunDirection);
      origin.value.fromArray(env.sunPlaces.origin);
      there.value.fromArray(sunAtOrigin(env.sunPlaces, env.timeOfDay, seen));
      rise.value = sunInSky(env.timeOfDay, seen)[1];
      const s = sphere.toSky(
        view.eye.frame,
        view.eye.dip,
        env.sunDirection,
        seen
      );
      skySun.value.set(s[0], s[1], s[2]);
      due.tables = tables.update(s[1], env.haze);
      under.value = kind === 'air' ? 1 : 0;
      due.reflection = reflection.update(kind === 'space');
      if (kind === 'space') {
        due.clouds = NONE;
        return due;
      }
      const w = env.windDirection,
        { east, north } = view.eye.frame;
      cloudInputs.coverage = env.cloudCoverage;
      cloudInputs.wind.x = env.windSpeed * sphere.dot(w, east);
      cloudInputs.wind.y = -env.windSpeed * sphere.dot(w, north);
      due.clouds = clouds.update(cloudInputs, dt, width, height);
      return due;
    },
  };
}
