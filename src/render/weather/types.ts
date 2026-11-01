// The plain parameters the weather runs from. The integration step adapts the simulation's state into these;
// nothing here imports the simulation.
import type * as THREE from 'three';
import type { Vec3Like, WeatherKind } from './common.ts';

export type { Vec3Like, WeatherKind };

/** One weather system drifting over the planet. */
export interface WeatherSystem {
  /** Stable from frame to frame: it seeds the formation's shape, so a system keeps its clouds as it drifts. */
  id: number;
  kind: WeatherKind;
  /** Unit vector from the planet's centre to the system's centre. */
  at: Vec3Like;
  /** Radius along the surface, in metres. */
  radius: number;
  /** 0 to 1: how built-up it is. Systems grow in and fade out through this. */
  intensity: number;
  /** Its motion over the surface in m/s (tangent). The anvil and the rain lean downwind. Defaults to east. */
  drift?: Vec3Like;
}

/** A spot where something local happens, such as the mist out of Mistwood or the spray under Moonbow Arch. */
export interface WeatherSpot {
  /** Unit vector to the spot's centre. */
  at: Vec3Like;
  /** Radius along the surface, in metres. */
  radius: number;
  /** 0 to 1. */
  amount: number;
}

/** Everything the weather needs each frame. */
export interface WeatherView {
  systems: readonly WeatherSystem[];
  /** Unit vector toward the sun, in world space. */
  sunDir: Vec3Like;
  /** Unit vector toward the moon. Defaults to a moon a little off the anti-sun. */
  moonDir?: Vec3Like;
  /** The hour, 0 to 24. Only used to place the default moon. */
  hour: number;
  /** The wind at the camera in m/s, tangent to the sphere. It carries the rain, snow, ash and fog wisps. */
  wind?: Vec3Like;
  /** Aurora strength over the north pole, 0 to 1. Defaults to 1: it shows wherever the pole is dark. */
  aurora?: number;
  /** Mist rolling out of Mistwood: amount about 0.35 normally, 1 in the fog surge. */
  mist?: WeatherSpot;
  /** The spray under Moonbow Arch, where a moonbow forms at night (and a rainbow by day). */
  moonbow?: WeatherSpot;
  /** Places where the light comes down in shafts, such as Mistwood's fog and the Fjords' valleys. */
  rays?: readonly WeatherSpot[];
}

export interface WeatherOptions {
  /** The sea's radius in metres. Defaults to 554. */
  radius?: number;
  /** 'high' for iPad, 'low' for phones and fallbacks: particle counts halve. */
  quality?: 'high' | 'low';
  /** Seeds every random choice the effects make, so captures repeat. */
  seed?: number;
  /** Adds a point light that the lightning flashes through lit materials. Defaults to true. */
  light?: boolean;
  /** Thunder systems flicker and throw bolts of their own, besides the strikes the simulation calls. Defaults to true. */
  ambientLightning?: boolean;
  /** Called the moment a bolt lands, for thunder sounds: where, how far from the camera, and whether the simulation called it. */
  onBolt?: (at: THREE.Vector3, distance: number, called: boolean) => void;
}

/** What the weather is doing where the camera is, handed back each frame for the atmosphere, the water and the sound. */
export interface WeatherLocal {
  /** 0 to 1: how deep the camera is inside each kind. */
  fog: number;
  rain: number;
  thunder: number;
  snow: number;
  ash: number;
  calm: number;
  /** Lightning flash, 0 to 1, already scaled by distance: brighten the sky and the grade with it. */
  flash: number;
  /** 0 by day, 1 at night, at the camera. */
  night: number;
  /** A suggested exponential fog density for the host's atmosphere, and its colour (linear). */
  fogDensity: number;
  fogColor: THREE.Color;
}
