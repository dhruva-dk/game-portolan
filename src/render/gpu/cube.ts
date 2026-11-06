// Where a direction falls on the simulation's cube sphere, as nodes: sim/sphere.ts faceUV, which the height grid, the
// territory grid and the coast's field are all laid out by. Six faces, each with equal-angle coordinates −1…1.
import type { Node } from 'three/webgpu';
import { abs, atan, int, select, vec2 } from 'three/tsl';

type V2 = Node<'vec2'>;
type V3 = Node<'vec3'>;
type I = Node<'int'>;

/** The face `up` (a unit direction from the planet's centre) lies over, and its equal-angle place on it, −1…1. */
export function cubeFace(up: V3): { face: I; eq: V2 } {
  const a = abs(up);
  const xm = a.x.greaterThanEqual(a.y).and(a.x.greaterThanEqual(a.z));
  const ym = xm.not().and(a.y.greaterThanEqual(a.z));
  const face = select(xm, select(up.x.greaterThanEqual(0), int(0), int(1)),
    select(ym, select(up.y.greaterThanEqual(0), int(2), int(3)), select(up.z.greaterThanEqual(0), int(4), int(5))));
  const major = select(xm, a.x, select(ym, a.y, a.z));
  const gu = select(xm, select(up.x.greaterThanEqual(0), up.z.negate(), up.z),
    select(ym, up.x, select(up.z.greaterThanEqual(0), up.x, up.x.negate())));
  const gv = select(xm, up.y, select(ym, select(up.y.greaterThanEqual(0), up.z.negate(), up.z), up.y));
  return { face: face as I, eq: atan(vec2(gu, gv), vec2(major, major)).mul(4 / Math.PI) as V2 };
}
