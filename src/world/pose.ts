import type { Out3, Vec3 } from './sphere.ts';
export interface ShipPose {
  position: Vec3;
  forward: Vec3;
  up: Vec3;
}
export interface PoseOut {
  position: Out3;
  forward: Out3;
  up: Out3;
}

export const poseOut = (): PoseOut => ({
  position: [0, 0, 0],
  forward: [0, 0, 1],
  up: [0, 1, 0],
});

export function copyPose(p: ShipPose, out: PoseOut): PoseOut {
  for (let i = 0; i < 3; i++) {
    out.position[i] = p.position[i];
    out.forward[i] = p.forward[i];
    out.up[i] = p.up[i];
  }
  return out;
}
