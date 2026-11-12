import type { Vec3 } from './sphere.ts';
/** A ship's rigid placement in planet-centred world space. */
export interface ShipPose { position: Vec3; forward: Vec3; up: Vec3 }
