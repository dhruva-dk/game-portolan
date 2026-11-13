// The shaders' value types: a TSL node of each WGSL type, named once (three's Node<'vec3'> and so on), so a shader's
// inputs and outputs say what they hold. And the few places three's own types (@types/three 0.187) fall short of its
// public TSL API, each bridged once here, typed, and named with the gap it covers.

import { Loop, float, nodeObject, workgroupArray } from 'three/tsl';
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
export const toFloat = (x: FloatNode | number): FloatNode => (typeof x === 'number' ? float(x) : float(x));

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
 * type; made here with the public constructor because their types (@types/three 0.187, MathNode.d.ts MinMax, marked
 * "TODO Allow int/uint") take floats and float vectors only. The overload states what MathNode's getInputType makes
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

// three's WorkgroupInfoNode has element(index) (WorkgroupInfoNode.js: a WorkgroupInfoElementNode), which its types
// (WorkgroupInfoNode.d.ts) leave out; declared here as three defines it, its element type given by the caller.
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
