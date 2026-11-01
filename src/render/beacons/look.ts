import type * as THREE from 'three';

/**
 * One region's natural beacon. build() makes a self-contained object in a local frame: metres, +Y up (the outward
 * normal of the planet), y = 0 at sea level, its front toward +Z. update() animates it; `night` runs from 0 (full
 * day, when the beacon is a subtle, natural thing) to 1 (full night, when it is the region's light).
 */
export interface BeaconLook {
  /** The beacon's evocative name. */
  name: string;
  /** One line of what it is, for the dev page and the integration step. */
  what: string;
  /** The colour of its light (sRGB hex): for a point light near it, its map marker or a far stand-in. */
  color: number;
  /** Height in metres of its brightest light above sea level: where a point light belongs. */
  lightHeight: number;
  /** Height in metres of the top of its glow: what still shows over the horizon from about 330 m. */
  height: number;
  /** Radius in metres of its footprint at the waterline: keep other things out of it. */
  radius: number;
  /** Where it stands: 'sea' rises from open water or shallows, 'shore' needs a little land or rock under it. */
  ground: 'sea' | 'shore';
  build(seed: number): THREE.Object3D;
  update(obj: THREE.Object3D, t: number, night: number): void;
}
