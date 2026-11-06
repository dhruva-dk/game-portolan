// What the app hands the planet's stage each frame: a StageView made from the match or from a fixed scene. Nothing the
// stage draws reads the simulation; everything it needs is here.
import type { V3 } from '../sim/math.ts';
import type { RegionId, WeatherKind } from '../sim/world/index.ts';
import type { CameraMode, CameraTarget } from './camera.ts';
import type { EventPhase } from './regions/eventRocks.ts';

export type { CameraMode, CameraTarget } from './camera.ts';
export type { EventPhase } from './regions/eventRocks.ts';

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
  /** How far round their rings the Ice Crown's floes have ridden, in seconds; `time` when absent. */
  floes?: number;
  /** How far the regions' events move the sea now, metres at the middle of each of the world's LIFTS; none when absent. */
  lift?: readonly number[];
  /** Where the regions' events have got to, for what they move on the stage (the Spires' fall, the Narrows' rockfall,
   *  the kelp bloom); none under way when absent. */
  events?: Partial<Record<RegionId, EventPhase>>;
  /** How hard the regions' events drive the currents: each lane's speed scale (by its index in CURRENTS) and the
   *  vortex's; the currents stay unmarked when absent. */
  currents?: { lanes: readonly number[]; vortex: number };
  /** The wind where the camera looks, a tangent in metres per second. */
  wind: V3;
  camera: CameraMode;
  target: CameraTarget;
  weather: readonly WeatherSystem[];
  /** The safe circle: its centre (a unit vector) and its radius along the surface in metres; null before it forms. */
  storm: { centre: V3; radius: number } | null;
  /** Each cell's owner and trail as ship index + 1 (the simulation's grid), with a version that changes with them. */
  territory: { owner: Uint8Array; trail: Uint8Array; version: number; me: number } | null;
  /** Screen-wide tints, 0…1: outside the safe circle, just hurt, and low on hull. */
  screen?: { storm: number; hurt: number; low: number };
  /** A lens's depth of field, sharp this many metres from the eye (the lobby and the ceremonies); none when absent. */
  focus?: number;
}
