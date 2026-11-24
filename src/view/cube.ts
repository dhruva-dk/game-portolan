import { abs, atan, int, select, vec2 } from 'three/tsl';
import type { Node } from 'three/webgpu';
import { FACES, type Axis } from '../world/sphere.ts';
import type { FloatNode, IntNode, Vec2Node, Vec3Node } from '../tsl.ts';

const faceAcross = (axis: number, sign: number) =>
  FACES.findIndex((f) => f.across[0] === axis && f.across[1] === sign);
const along = (q: Vec3Node, [axis, sign]: Axis): FloatNode => {
  const c = [q.x, q.y, q.z][axis];
  return sign > 0 ? c : c.negate();
};

export function gnomonic(p: Vec3Node) {
  const a = abs(p);
  const onX = a.x.greaterThanEqual(a.y).and(a.x.greaterThanEqual(a.z)),
    onY = a.y.greaterThanEqual(a.z);
  const positive = [p.x, p.y, p.z].map((c) => c.greaterThanEqual(0));
  const pick = <K extends 'float' | 'int' | 'vec2'>(
    of: (f: number) => Node<K>
  ): Node<K> => {
    const side = (axis: number) =>
      select(positive[axis], of(faceAcross(axis, 1)), of(faceAcross(axis, -1)));
    return select(onX, side(0), select(onY, side(1), side(2)));
  };
  return {
    face: pick((f) => int(f)),
    top: (q: Vec3Node): Vec2Node =>
      pick((f) => vec2(along(q, FACES[f].u), along(q, FACES[f].v))),
    bottom: (q: Vec3Node): FloatNode => pick((f) => along(q, FACES[f].across)),
  };
}

export function faceUV(p: Vec3Node): { face: IntNode; uv: Vec2Node } {
  const { face, top, bottom } = gnomonic(p);
  return { face, uv: atan(top(p).div(bottom(p))).mul(4 / Math.PI) };
}
