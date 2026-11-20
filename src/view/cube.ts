// The planet's cube as the shaders see it: world/sphere.ts FACES (the same
// faces, the same axes, the same ties), built from that one table. Where on the
// six faces of an equi-angular cube a direction lies, for reading what has been
// baked onto them (faceUV), and the gnomonic coordinates there of it or of its
// derivatives (gnomonic: water/claims.ts).

import { abs, atan, int, select, vec2 } from 'three/tsl';
import type { Node } from 'three/webgpu';
import { FACES, type Axis } from '../world/sphere.ts';
import type { FloatNode, IntNode, Vec2Node, Vec3Node } from '../tsl.ts';

/** The face across `axis` on its side `sign`. */
const faceAcross = (axis: number, sign: number) =>
  FACES.findIndex((f) => f.across[0] === axis && f.across[1] === sign);
/** q's component along a signed axis. */
const along = (q: Vec3Node, [axis, sign]: Axis): FloatNode => {
  const c = [q.x, q.y, q.z][axis];
  return sign > 0 ? c : c.negate();
};

/**
 * The face (an int, 0…5) the direction p lies on, and over it the gnomonic
 * coordinates' numerators (top: a vec2) and denominator (bottom) of any q: of q
 * = p, its coordinates there; of p's derivatives, theirs (each linear in q, the
 * face fixed by p).
 */
export function gnomonic(p: Vec3Node) {
  const a = abs(p);
  const onX = a.x.greaterThanEqual(a.y).and(a.x.greaterThanEqual(a.z)),
    onY = a.y.greaterThanEqual(a.z);
  const positive = [p.x, p.y, p.z].map((c) => c.greaterThanEqual(0));
  /** Of each face's `of`, the one p's face has. */
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

/**
 * The face (an int, 0…5) the direction p lies on, and where on it: uv in −1…1,
 * spaced evenly in angle.
 */
export function faceUV(p: Vec3Node): { face: IntNode; uv: Vec2Node } {
  const { face, top, bottom } = gnomonic(p);
  return { face, uv: atan(top(p).div(bottom(p))).mul(4 / Math.PI) };
}
