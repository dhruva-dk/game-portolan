import { landOf, planetOf, type Land } from './world/land';
import type { Planet } from './world/planet';
import type { Vec3 } from './world/sphere';
import { sunAt, sunPlaces, type SunPlaces } from './world/sun';
import { createWeather, type Weather } from './world/weather';
import { createWind, type Wind } from './world/wind';

/** The match's sky and sea, fixed for it. */
export interface Climate {
  /** Hours, 0–24: the time of day, the same everywhere (world/sun.ts). */
  timeOfDay: number;
  /** Where the match's sun is set (world/sun.ts): over every place it stands as high as the hour says. */
  sunPlaces: SunPlaces;
  /** The match's weather at a time on its clock (world/weather.ts). */
  weather: (seconds: number) => Weather;
  /**
   * The wind the sea's waves were raised by, metres per second: its mean over the match, since a sea takes hours to
   * grow (the CPU's sea, world/swell.ts, is built with it).
   */
  seaWind: number;
}

/** The world a match is set in: its planet and what its land is made of (world/land.ts: for the workers that make the
 *  planet again), the planet's prevailing wind and the climate, from one seed. Built once (main.ts) and handed to both
 *  the game and the frame. */
export interface World { seed: number; land: Land; planet: Planet; wind: Wind; climate: Climate }

/** seed: the planet's (world/planet.ts); mean, swing: the weather's (world/weather.ts); hours: the time of day. */
export function createWorld(seed: number, mean: Weather, swing: Weather, hours: number): World {
  const land = landOf(seed), planet = planetOf(seed, land);
  const sun = sunPlaces(planet.start.at, planet.heart);
  return {
    seed, land, planet, wind: createWind(seed),
    climate: { timeOfDay: hours, sunPlaces: sun, weather: createWeather(seed, mean, swing), seaWind: mean.wind },
  };
}

/** The air and the sea as the eye finds them at a moment: plain data, made fresh each frame (by the frame, from the eye
 *  it draws from) and read by every system. */
export interface Environment {
  /** Seconds on the world's clock: what the sea's waves run on (the CPU's copy of them, world/swell.ts, too). */
  clock: number;
  timeOfDay: number;
  sunPlaces: SunPlaces;
  /**
   * Unit vector toward the sun over the eye, in the planet's frame (world space: the north pole is +y;
   * world/sphere.ts). Elsewhere the sun is world/sun.ts's sunAt.
   */
  sunDirection: Vec3;
  seaWind: number;
  /** The wind's speed over the sea now, metres per second: the same everywhere. */
  windSpeed: number;
  /** Unit vector the wind blows toward at the eye, in the planet's frame (a tangent there): the prevailing wind's
   *  (world/wind.ts), which varies over the planet. */
  windDirection: Vec3;
  /** 0–1. */
  cloudCoverage: number;
  /** Aerosol in the air as a multiple of a clear day's (1). Thickens the haze and whitens the sky. */
  haze: number;
}

/** The environment at `clock` (s) seen from `eye` (world metres). */
export function environmentAt(world: World, clock: number, eye: Vec3): Environment {
  const { timeOfDay, sunPlaces, weather, seaWind } = world.climate;
  const now = weather(clock);
  return {
    clock, timeOfDay, sunPlaces, seaWind,
    sunDirection: sunAt(sunPlaces, timeOfDay, eye),
    windSpeed: now.wind,
    windDirection: world.wind(eye),
    cloudCoverage: now.cloud,
    haze: now.haze,
  };
}
