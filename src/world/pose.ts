import type { Out3, Vec3 } from './sphere.ts';
/** A ship's rigid placement in planet-centred world space. */
export interface ShipPose { position: Vec3; forward: Vec3; up: Vec3 }
/** A pose written into (the `out` of what works one out, sphere.ts). */
export interface PoseOut { position: Out3; forward: Out3; up: Out3 }

/** A pose to be written into, at the origin. */
export const poseOut = (): PoseOut => ({ position: [0, 0, 0], forward: [0, 0, 1], up: [0, 1, 0] });

/** A copy of pose p into `out`. */
export function copyPose(p: ShipPose, out: PoseOut): PoseOut {
  for (let i = 0; i < 3; i++) {
    out.position[i] = p.position[i];
    out.forward[i] = p.forward[i];
    out.up[i] = p.up[i];
  }
  return out;
}
