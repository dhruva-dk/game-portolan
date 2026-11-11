import { Vector2, Vector3 } from 'three/webgpu';

/** The one shared world state. Systems read it every frame; only the game loop writes it. */
export interface Environment {
  /** Hours, 0–24. */
  timeOfDay: number;
  /** Degrees north. The archipelago sits in the tropics. */
  latitude: number;
  /** Unit vector toward the sun, world space (y up, -z north). Derived from timeOfDay and latitude. */
  sunDirection: Vector3;
  /** Metres per second, on the xz plane. */
  wind: Vector2;
  /** 0–1. */
  cloudCoverage: number;
  /** Aerosol in the air as a multiple of a clear day's (1). Thickens the haze and whitens the sky. */
  haze: number;
}

export function createEnvironment(): Environment {
  const env: Environment = {
    timeOfDay: 15,
    latitude: 12,
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
  const hourAngle = ((env.timeOfDay - 12) / 12) * Math.PI;
  const lat = (env.latitude * Math.PI) / 180;
  // Equatorial → horizon coordinates: x east, y up, z south.
  const east = -Math.cos(DECLINATION) * Math.sin(hourAngle);
  const up = Math.sin(lat) * Math.sin(DECLINATION) + Math.cos(lat) * Math.cos(DECLINATION) * Math.cos(hourAngle);
  const south = Math.sin(lat) * Math.cos(DECLINATION) * Math.cos(hourAngle) - Math.cos(lat) * Math.sin(DECLINATION);
  env.sunDirection.set(east, up, south).normalize();
}
