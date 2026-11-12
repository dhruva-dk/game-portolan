import { Vector3 } from 'three/webgpu';
import type { Vec3 } from './world/sphere';
import { sunAt, type SunPlaces } from './world/sun';
import type { Weather } from './world/weather';
import type { Wind } from './world/wind';

/** The one shared world state. Systems read it every frame; only the game loop writes it. */
export interface Environment {
  /** Seconds on the world's clock: what the sea's waves run on (the CPU's copy of them, water/swell.ts, too). */
  clock: number;
  /** Hours, 0–24: the time of day, the same everywhere (world/sun.ts). */
  timeOfDay: number;
  /** Where the match's sun is set (world/sun.ts): over every place it stands as high as the hour says. */
  sunPlaces: SunPlaces;
  /**
   * Unit vector toward the sun over the eye, in the planet's frame (world space: the north pole is +y;
   * world/sphere.ts). Derived from timeOfDay and the eye's position; elsewhere the sun is world/sun.ts's sunAt.
   */
  sunDirection: Vector3;
  /** The match's weather at a time on its clock (world/weather.ts). */
  weather: (seconds: number) => Weather;
  /**
   * The wind the sea's waves were raised by, metres per second: its mean over the match, since a sea takes hours to
   * grow. Fixed for the match (the CPU's sea, water/swell.ts, is built with it).
   */
  seaWind: number;
  /** The wind's speed over the sea now, metres per second: the same everywhere. Derived from the clock. */
  windSpeed: number;
  /**
   * Unit vector the wind blows toward at the eye, in the planet's frame (a tangent there): the prevailing wind's
   * (world/wind.ts), which varies over the planet. Derived from the eye's position.
   */
  windDirection: Vector3;
  /** 0–1. Derived from the clock. */
  cloudCoverage: number;
  /** Aerosol in the air as a multiple of a clear day's (1). Thickens the haze and whitens the sky. Derived from the clock. */
  haze: number;
}

/** sunPlaces: the match's (world/sun.ts, from its planet's islands); weather: its weather, about seaWind's mean wind. */
export function createEnvironment(sunPlaces: SunPlaces, weather: (seconds: number) => Weather, seaWind: number): Environment {
  const now = weather(0);
  return {
    clock: 0,
    timeOfDay: 15,
    sunPlaces,
    sunDirection: new Vector3(0, 1, 0),
    weather,
    seaWind,
    windSpeed: now.wind,
    windDirection: new Vector3(1, 0, 0),
    cloudCoverage: now.cloud,
    haze: now.haze,
  };
}

/** eye: where the eye is (world, metres); wind: the planet's prevailing wind. */
export function updateEnvironment(env: Environment, _dt: number, eye: Vec3, wind: Wind): void {
  ({ wind: env.windSpeed, cloud: env.cloudCoverage, haze: env.haze } = env.weather(env.clock));
  env.windDirection.set(...wind(eye));
  env.sunDirection.set(...sunAt(env.sunPlaces, env.timeOfDay, eye));
}
