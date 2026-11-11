// The planet's cube as the shaders see it: world/sphere.ts faceUV, mirrored (the same faces, the same axes, the same
// ties). Where on the six faces of an equi-angular cube a direction lies, for reading what has been baked onto them.

import { abs, atan, int, select, vec2 } from 'three/tsl';

type N = any;

/** The face (an int, 0…5) the direction p lies on, and where on it: uv in −1…1, spaced evenly in angle. */
export function faceUV(p: N): { face: N; uv: N } {
  const a: N = abs(p);
  const onX = a.x.greaterThanEqual(a.y).and(a.x.greaterThanEqual(a.z));
  const onY = a.y.greaterThanEqual(a.z);
  const px = p.x.greaterThanEqual(0), py = p.y.greaterThanEqual(0), pz = p.z.greaterThanEqual(0);
  const face = select(onX, select(px, int(0), int(1)), select(onY, select(py, int(2), int(3)), select(pz, int(4), int(5))));
  // the gnomonic coordinates on each axis's faces; only the face's own is kept
  const gx = vec2(select(px, p.z.negate(), p.z), p.y).div(a.x);
  const gy = vec2(p.x, select(py, p.z.negate(), p.z)).div(a.y);
  const gz = vec2(select(pz, p.x, p.x.negate()), p.y).div(a.z);
  const g = select(onX, gx, select(onY, gy, gz));
  return { face, uv: atan(g).mul(4 / Math.PI) };
}
