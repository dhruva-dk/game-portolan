import { coastLines } from './coastline.ts';
import { landOf, planetOf, type Land } from './land.ts';
import { duneHeight } from './planet-terrain.ts';
import type { Planet } from './planet.ts';
import type { Out3, Vec3 } from './sphere.ts';
import { sunAt, sunPlaces, type SunPlaces } from './sun.ts';
import { createWeather, type Weather } from './weather.ts';
import { createWind, type Wind } from './wind.ts';

interface Climate {
  timeOfDay: number;
  sunPlaces: SunPlaces;
  weather: (seconds: number, out?: Weather) => Weather;
  seaWind: number;
}

export const SEED = 3;

export interface World {
  seed: number;
  land: Land;
  planet: Planet;
  coasts: Vec3[][];
  dunes: number;
  wind: Wind;
  climate: Climate;
}

export function createWorld(
  seed: number,
  mean: Weather,
  swing: Weather,
  hours: number
): World {
  const land = landOf(seed),
    planet = planetOf(seed, land);
  const sun = sunPlaces(planet.start.at, planet.heart);
  return {
    seed,
    land,
    planet,
    coasts: coastLines(land.shore),
    dunes: duneHeight(land.stats.summit),
    wind: createWind(seed),
    climate: {
      timeOfDay: hours,
      sunPlaces: sun,
      weather: createWeather(seed, mean, swing),
      seaWind: mean.wind,
    },
  };
}

export interface Environment {
  clock: number;
  timeOfDay: number;
  sunPlaces: SunPlaces;
  sunDirection: Out3;
  seaWind: number;
  windSpeed: number;
  windDirection: Out3;
  cloudCoverage: number;
  haze: number;
}

const now: Weather = { wind: 0, cloud: 0, haze: 0 };

export function environmentAt(
  world: World,
  clock: number,
  eye: Vec3,
  into?: Environment
): Environment {
  const { timeOfDay, sunPlaces, weather, seaWind } = world.climate;
  weather(clock, now);
  if (!into) {
    const sunDirection: Out3 = [0, 0, 0],
      windDirection: Out3 = [0, 0, 0];
    sunAt(sunPlaces, timeOfDay, eye, sunDirection);
    world.wind(eye, windDirection);
    const { wind: windSpeed, cloud: cloudCoverage, haze } = now;
    return {
      clock,
      timeOfDay,
      sunPlaces,
      seaWind,
      sunDirection,
      windSpeed,
      windDirection,
      cloudCoverage,
      haze,
    };
  }
  into.clock = clock;
  sunAt(sunPlaces, timeOfDay, eye, into.sunDirection);
  into.windSpeed = now.wind;
  world.wind(eye, into.windDirection);
  into.cloudCoverage = now.cloud;
  into.haze = now.haze;
  return into;
}
