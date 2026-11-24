import { frameId, hash, screenCoordinate, uint, vec4 } from 'three/tsl';
import type { FloatNode, Vec3Node, Vec4Node } from '../tsl.ts';

const noise = (k: number): FloatNode => {
  const pixel = uint(screenCoordinate.x).add(
    uint(screenCoordinate.y).mul(4099)
  );
  return hash(
    pixel.add(uint(frameId).mul(16777619)).add(uint(k * 0x3c6ef372 + 1))
  );
};

export const film = (c: Vec3Node): Vec4Node =>
  vec4(c.add(noise(0).add(noise(1)).sub(1).div(255)), 1);
