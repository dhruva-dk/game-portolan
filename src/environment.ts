import { Vector2, Vector3 } from 'three/webgpu';
import { fromLatLon } from './world/sphere';

/** The one shared world state. Systems read it every frame; only the game loop writes it. */
export interface Environment {
  /** Hours, 0–24: the time of day at longitude 0. */
  timeOfDay: number;
  /**
   * Unit vector toward the sun, in the planet's frame (world space: the north pole is +y; world/sphere.ts): one
   * direction for the whole planet, so it has a day side and a night side. Derived from timeOfDay.
   */
  sunDirection: Vector3;
  /** Metres per second, along the sea's chart: x along its axis (east at the island), y along its z (south). */
  wind: Vector2;
  /** 0–1. */
  cloudCoverage: number;
  /** Aerosol in the air as a multiple of a clear day's (1). Thickens the haze and whitens the sky. */
  haze: number;
}

export function createEnvironment(): Environment {
  const env: Environment = {
    timeOfDay: 15,
    sunDirection: new Vector3(),
    wind: new Vector2(7, 3),
    cloudCoverage: 0.5,
    haze: 1,
  };
  updateEnvironment(env, 0);
  return env;
}

const DECLINATION = (23.44 * Math.PI) / 180; // solstice; fixed until seasons matter

export function updateEnvironment(env: Environment, _dt: number): void {
  // the sun stands over the point at its declination where it is noon: at longitude 0 at 12:00, and west of it later
  const hourAngle = ((env.timeOfDay - 12) / 12) * Math.PI;
  env.sunDirection.set(...fromLatLon(DECLINATION, -hourAngle));
}
