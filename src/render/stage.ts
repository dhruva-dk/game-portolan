// What the app hands the planet's stage each frame: a StageView made from the match or from a fixed scene. Nothing the
// stage draws reads the simulation; everything it needs is here.
import type { V3 } from '../sim/math.ts';
import type { WeatherKind } from '../sim/world/index.ts';
import type { CameraMode, CameraTarget } from './camera.ts';
import type { TerritoryInput } from './ocean/territory.ts';

export type { CameraMode, CameraTarget } from './camera.ts';

/** One weather system over the planet, as the stage draws it. */
export interface WeatherSystem {
  kind: WeatherKind;
  at: V3;
  radius: number;
  strength: number;
  /** Stable while the system lasts: what keeps a system's clouds its own as it drifts. */
  id?: number;
}

/** How deep the camera is in each kind of weather, 0..1. */
export type WeatherDepth = Partial<Record<WeatherKind, number>>;

export interface StageView {
  /** Seconds on the clock every animated thing shares: the swell, ripples and beacons. Give the actors the same. */
  time: number;
  /** The planet's clock, 0…24: the sun stands over longitude −(hour − 12) × 15°. */
  hour: number;
  /** The sun's latitude, in degrees. */
  tilt: number;
  /** Sea level against the mean, in metres. */
  tide: number;
  /** How far above the water the falling tide has left the shore wet, in metres (sim/environment.ts ebbAt). */
  ebb: number;
  /** The wind where the camera looks, a tangent in metres per second. */
  wind: V3;
  camera: CameraMode;
  target: CameraTarget;
  weather: readonly WeatherSystem[];
  /** The safe circle: its centre (a unit vector) and its radius along the surface in metres; null before it forms. */
  storm: { centre: V3; radius: number } | null;
  /** Each cell's owner and trail as ship index + 1 (the simulation's grid), with a version that changes with them. */
  territory: TerritoryInput | null;
  /** The Gale blowing round the fleet while it rides; left out when nothing is. */
  gale?: { at: V3; way: V3; height: number; strength: number } | null;
  /** Screen-wide tints, 0…1: outside the safe circle, just hurt, and low on hull. */
  screen?: { storm: number; hurt: number; low: number };
}
