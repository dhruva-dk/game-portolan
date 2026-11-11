import { Vector3 } from 'three/webgpu';
import { fromLatLon, type Vec3 } from './world/sphere';
import type { Wind } from './world/wind';

/** The one shared world state. Systems read it every frame; only the game loop writes it. */
export interface Environment {
  /** Hours, 0–24: the time of day at longitude 0. */
  timeOfDay: number;
  /**
   * Unit vector toward the sun, in the planet's frame (world space: the north pole is +y; world/sphere.ts): one
   * direction for the whole planet, so it has a day side and a night side. Derived from timeOfDay.
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

export function createEnvironment(): Environment {
  const env: Environment = {
    timeOfDay: 15,
    sunDirection: new Vector3(),
    windSpeed: 7.6,
    windDirection: new Vector3(1, 0, 0),
    cloudCoverage: 0.5,
    haze: 1,
  };
  placeSun(env);
  return env;
}

const DECLINATION = (23.44 * Math.PI) / 180; // solstice; fixed until seasons matter

/** eye: where the eye is (world, metres); wind: the planet's prevailing wind. */
export function updateEnvironment(env: Environment, _dt: number, eye: Vec3, wind: Wind): void {
  env.windDirection.set(...wind(eye));
  placeSun(env);
}

function placeSun(env: Environment) {
  // the sun stands over the point at its declination where it is noon: at longitude 0 at 12:00, and west of it later
  const hourAngle = ((env.timeOfDay - 12) / 12) * Math.PI;
  env.sunDirection.set(...fromLatLon(DECLINATION, -hourAngle));
}
