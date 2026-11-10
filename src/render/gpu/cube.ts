// Where a direction falls on the simulation's cube sphere, as nodes: sim/sphere.ts faceUV, which the height grid, the
// territory grid and the coast's field are all laid out by. Six faces, each with equal-angle coordinates −1…1.
import type { Node } from 'three/webgpu';
import { abs, atan, int, select, vec3 } from 'three/tsl';

type V2 = Node<'vec2'>;
type V3 = Node<'vec3'>;
type I = Node<'int'>;

/**
 * The face `up` (a unit direction from the planet's centre) lies over, and its equal-angle place on it, −1…1. `q` is
 * `up` in that face's frame (u axis, v axis, outward), and `project` carries any other vector into the same frame.
 */
export function cubeFace(up: V3): { face: I; eq: V2; q: V3; project: (v: V3) => V3 } {
  const a = abs(up);
  const xm = a.x.greaterThanEqual(a.y).and(a.x.greaterThanEqual(a.z));
  const ym = xm.not().and(a.y.greaterThanEqual(a.z));
  const face = select(xm, select(up.x.greaterThanEqual(0), int(0), int(1)),
    select(ym, select(up.y.greaterThanEqual(0), int(2), int(3)), select(up.z.greaterThanEqual(0), int(4), int(5))));
  const project = (v: V3): V3 => vec3(
    select(xm, select(up.x.greaterThanEqual(0), v.z.negate(), v.z), select(ym, v.x, select(up.z.greaterThanEqual(0), v.x, v.x.negate()))),
    select(xm, v.y, select(ym, select(up.y.greaterThanEqual(0), v.z.negate(), v.z), v.y)),
    select(xm, select(up.x.greaterThanEqual(0), v.x, v.x.negate()), select(ym, select(up.y.greaterThanEqual(0), v.y, v.y.negate()), select(up.z.greaterThanEqual(0), v.z, v.z.negate()))),
  ) as V3;
  const q = project(up);
  return { face: face as I, eq: atan(q.xy, q.zz).mul(4 / Math.PI) as V2, q, project };
}
