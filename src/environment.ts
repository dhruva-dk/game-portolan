import { Vector3 } from 'three/webgpu';
import type { Vec3 } from './world/sphere';
import { sunAt, type SunPlaces } from './world/sun';
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
  /** The wind's speed over the sea, metres per second: the same everywhere. */
  windSpeed: number;
  /**
   * Unit vector the wind blows toward at the eye, in the planet's frame (a tangent there): the prevailing wind's
   * (world/wind.ts), which varies over the planet. Derived from the eye's position.
   */
  windDirection: Vector3;
  /** 0–1. */
  cloudCoverage: number;
  /** Aerosol in the air as a multiple of a clear day's (1). Thickens the haze and whitens the sky. */
  haze: number;
}

/** sunPlaces: the match's (world/sun.ts, from its planet's islands). */
export function createEnvironment(sunPlaces: SunPlaces): Environment {
  return {
    clock: 0,
    timeOfDay: 14,
    sunPlaces,
    sunDirection: new Vector3(0, 1, 0),
    windSpeed: 7.6,
    windDirection: new Vector3(1, 0, 0),
    cloudCoverage: 0.3,
    haze: 1,
  };
}

/** eye: where the eye is (world, metres); wind: the planet's prevailing wind. */
export function updateEnvironment(env: Environment, _dt: number, eye: Vec3, wind: Wind): void {
  env.windDirection.set(...wind(eye));
  env.sunDirection.set(...sunAt(env.sunPlaces, env.timeOfDay, eye));
}
