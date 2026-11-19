// The shaders' value types: a TSL node of each WGSL type, named once (three's Node<'vec3'> and so on), so a shader's
// inputs and outputs say what they hold. And the few places three's own types (@types/three 0.187) fall short of its
// public TSL API, each bridged once here, typed, and named with the gap it covers.

// And the two marks a flat look is drawn with, a shape's crisp edge (cut) and a thin line (line), for every material;
// and what more than one shader works out, written once: a lattice's hash (hash3), a frame on the tangent plane
// (tangentFrame) and light's phase in a medium (henyeyGreenstein).

import {
  Fn, Loop, abs, clamp, cross, float, fract, fwidth, int, max, min, nodeObject, normalize, pow, saturate, select, uint, vec3, workgroupArray,
} from 'three/tsl';
import { MathNode, type Node } from 'three/webgpu';

export type FloatNode = Node<'float'>;
export type IntNode = Node<'int'>;
export type UintNode = Node<'uint'>;
export type BoolNode = Node<'bool'>;
export type Vec2Node = Node<'vec2'>;
export type Vec3Node = Node<'vec3'>;
export type Vec4Node = Node<'vec4'>;
export type Mat3Node = Node<'mat3'>;
export type Mat4Node = Node<'mat4'>;

/** float(x) for x either a number or a float node: three's float() takes each, as separate overloads, so a value that
 * may be either has to be told apart before the call. */
export const toFloat = (x: FloatNode | number): FloatNode => (typeof x === 'number' ? float(x) : x);

/**
 * Three hashes in [0, 1) of a point of whole numbers (a lattice's cell): pcg3d (Jarzynski and Olano 2020), integer
 * arithmetic throughout, so it holds the same at any coordinate; for one number, three's `hash` (PCG). A sine hash's
 * precision runs out as its argument grows, and its noise turns to stripes (post/film.ts).
 */
const pcg3 = Fn(([c]: [Vec3Node]) => {
  // a uint each (three's types give the bit operators to scalars only); an int's bits carried over as they are
  const [x, y, z] = [c.x, c.y, c.z].map((k) => uint(int(k)).mul(1664525).add(1013904223).toVar());
  const stir = () => {
    x.addAssign(y.mul(z));
    y.addAssign(z.mul(x));
    z.addAssign(x.mul(y));
  };
  stir();
  for (const v of [x, y, z]) v.assign(v.bitXor(v.shiftRight(16)));
  stir();
  return vec3(float(x), float(y), float(z)).mul(1 / 2 ** 32);
}).setLayout({ name: 'pcg3', type: 'vec3', inputs: [{ name: 'c', type: 'vec3' }] });
export const hash3 = (c: Vec3Node): Vec3Node => pcg3(c);

/** Two unit axes square to the unit vector up and to each other (e1 × e2 = up): a frame on the plane tangent at up,
 *  turned by whichever of the world's y and x axes lies further from up. */
export function tangentFrame(up: Vec3Node): { e1: Vec3Node; e2: Vec3Node } {
  const ref = select(abs(up.y).lessThan(0.9), vec3(0, 1, 0), vec3(1, 0, 0));
  const e1 = normalize(cross(ref, up));
  return { e1, e2: cross(up, e1) };
}

/** The Henyey-Greenstein phase, per steradian, of light turned through an angle of cosine c by a lobe of asymmetry g
 *  (forward for g > 0). */
export const henyeyGreenstein = (c: FloatNode, g: number): FloatNode =>
  float((1 - g * g) / (4 * Math.PI)).div(pow(float(1 + g * g).sub(c.mul(2 * g)), 1.5));

/** Where x lies between a (0) and b (1), held to 0…1: three's remapClamp(x, a, b), but with a span under 1e-4 taken
 *  as that, so one closing to nothing never divides by it. */
export const ramp = (x: FloatNode, a: FloatNode, b: FloatNode | number): FloatNode =>
  clamp(x.sub(a).div(max(toFloat(b).sub(a), 1e-4)), 0, 1);

/** 0 where x is under `at` … 1 where it is over, the edge between them a pixel wide however far off it is seen: the
 *  edge of a flat shape. In a fragment's shader only (it reads x's change across the pixel). */
export const cut = (x: FloatNode, at: FloatNode | number): FloatNode => saturate(x.sub(at).div(max(fwidth(x), 1e-6)).add(0.5));

/** Lines `every` to a unit of t (1 on a line, 0 off it), each about a pixel wide and fading out once too fine to
 *  draw. In a fragment's shader only. */
export const line = (t: FloatNode, every: number): FloatNode => {
  const f = t.mul(every), w = fwidth(f);
  const d = min(fract(f), float(1).sub(fract(f))).div(max(w, 1e-4));
  return float(1).sub(clamp(d, 0, 1)).mul(clamp(float(1).sub(w.mul(2)), 0, 1));
};

/**
 * clamp() of integers (an ivec2, say): the node three's clamp() makes (MathNode.js: `new MathNode(MathNode.CLAMP, …)`,
 * WGSL's clamp, of any numeric type), made here with that public constructor because clamp()'s types (@types/three
 * 0.187, MathNode.d.ts Clamp) take floats and float vectors only. Typed as the constructor declares it: a node of no
 * stated type.
 */
export const clampInts = (value: Node, low: Node, high: Node): MathNode => new MathNode(MathNode.CLAMP, value, low, high);

/**
 * min() and max() of integers: the node three's min() and max() make (MathNode.js: `nodeProxyAssignable(MathNode,
 * MathNode.MIN)`, its arguments through nodeObject, the node made assignable), WGSL's min and max, of any numeric
 * type; made here with the public constructor because their types (@types/three 0.187, MathNode.d.ts MinMax, its
 * own note asking for int and uint) take floats and float vectors only. The overload states what MathNode's getInputType makes
 * of it: an int, the inputs' own type.
 */
export function minInt(a: IntNode, b: IntNode | number): IntNode;
export function minInt(a: Node, b: Node | number): Node {
  return new MathNode(MathNode.MIN, a, nodeObject(b)).toAssignable();
}
/** max() of integers: as minInt. */
export function maxInt(a: IntNode, b: IntNode | number): IntNode;
export function maxInt(a: Node, b: Node | number): Node {
  return new MathNode(MathNode.MAX, a, nodeObject(b)).toAssignable();
}

/**
 * Loop(0 … count − 1, body) with the counter under a name of its own, so nested loops never read each other's. three's
 * Loop takes the name (LoopNode: `name` in the parameters keys the counter in what the body is handed), but its types
 * (@types/three 0.187, LoopNode.d.ts) leave `name` out and hand the body the counter as `i` alone; here it is read by
 * its name.
 */
export function loop(name: string, count: number | IntNode, body: (i: IntNode) => void) {
  const params = { start: 0, end: count, type: 'int' as const, condition: '<', name };
  return Loop(params, (counters: Readonly<Record<string, IntNode>>) => body(counters[name]));
}

// A gap in @types/three 0.187: WorkgroupInfoNode.element(index), public in three (WorkgroupInfoNode.js), is undeclared.
declare module 'three/webgpu' {
  interface WorkgroupInfoNode {
    element<TNodeType>(indexNode: Node | number): Node<TNodeType>;
  }
}

/** workgroupArray(type, count) whose elements are typed as `type` (its types type the array by no element type). */
export function workgroupArrayOf<TNodeType extends string>(type: TNodeType, count: number) {
  const array = workgroupArray(type, count);
  return { element: (index: Node | number) => array.element<TNodeType>(index) };
}
