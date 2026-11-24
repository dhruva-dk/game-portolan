import {
  Fn,
  Loop,
  abs,
  clamp,
  cross,
  float,
  fract,
  fwidth,
  int,
  max,
  min,
  nodeObject,
  normalize,
  pow,
  saturate,
  select,
  uint,
  vec3,
  workgroupArray,
} from 'three/tsl';
import { MathNode, type Node } from 'three/webgpu';

export type FloatNode = Node<'float'>;
export type IntNode = Node<'int'>;
export type UintNode = Node<'uint'>;
export type BoolNode = Node<'bool'>;
export type Vec2Node = Node<'vec2'>;
export type Vec3Node = Node<'vec3'>;
export type Vec4Node = Node<'vec4'>;

export const toFloat = (x: FloatNode | number): FloatNode =>
  typeof x === 'number' ? float(x) : x;

const pcg3 = Fn(([c]: [Vec3Node]) => {
  const [x, y, z] = [c.x, c.y, c.z].map((k) =>
    uint(int(k)).mul(1664525).add(1013904223).toVar()
  );
  const stir = () => {
    x.addAssign(y.mul(z));
    y.addAssign(z.mul(x));
    z.addAssign(x.mul(y));
  };
  stir();
  for (const v of [x, y, z]) v.assign(v.bitXor(v.shiftRight(16)));
  stir();
  return vec3(float(x), float(y), float(z)).mul(1 / 2 ** 32);
}).setLayout({
  name: 'pcg3',
  type: 'vec3',
  inputs: [{ name: 'c', type: 'vec3' }],
});
export const hash3 = (c: Vec3Node): Vec3Node => pcg3(c);

export function tangentFrame(up: Vec3Node): { e1: Vec3Node; e2: Vec3Node } {
  const ref = select(abs(up.y).lessThan(0.9), vec3(0, 1, 0), vec3(1, 0, 0));
  const e1 = normalize(cross(ref, up));
  return { e1, e2: cross(up, e1) };
}

export const henyeyGreenstein = (c: FloatNode, g: number): FloatNode =>
  float((1 - g * g) / (4 * Math.PI)).div(
    pow(float(1 + g * g).sub(c.mul(2 * g)), 1.5)
  );

export const ramp = (
  x: FloatNode,
  a: FloatNode,
  b: FloatNode | number
): FloatNode => clamp(x.sub(a).div(max(toFloat(b).sub(a), 1e-4)), 0, 1);

export const cut = (x: FloatNode, at: FloatNode | number): FloatNode =>
  saturate(
    x
      .sub(at)
      .div(max(fwidth(x), 1e-6))
      .add(0.5)
  );

export const line = (t: FloatNode, every: number): FloatNode => {
  const f = t.mul(every),
    w = fwidth(f);
  const d = min(fract(f), float(1).sub(fract(f))).div(max(w, 1e-4));
  return float(1)
    .sub(clamp(d, 0, 1))
    .mul(clamp(float(1).sub(w.mul(2)), 0, 1));
};

export const clampInts = (value: Node, low: Node, high: Node): MathNode =>
  new MathNode(MathNode.CLAMP, value, low, high);

export function minInt(a: IntNode, b: IntNode | number): IntNode;
export function minInt(a: Node, b: Node | number): Node {
  return new MathNode(MathNode.MIN, a, nodeObject(b)).toAssignable();
}
export function maxInt(a: IntNode, b: IntNode | number): IntNode;
export function maxInt(a: Node, b: Node | number): Node {
  return new MathNode(MathNode.MAX, a, nodeObject(b)).toAssignable();
}

export function loop(
  name: string,
  count: number | IntNode,
  body: (i: IntNode) => void
) {
  const params = {
    start: 0,
    end: count,
    type: 'int' as const,
    condition: '<',
    name,
  };
  return Loop(params, (counters: Readonly<Record<string, IntNode>>) =>
    body(counters[name])
  );
}

declare module 'three/webgpu' {
  interface WorkgroupInfoNode {
    element<TNodeType>(indexNode: Node | number): Node<TNodeType>;
  }
}

export function workgroupArrayOf<TNodeType extends string>(
  type: TNodeType,
  count: number
) {
  const array = workgroupArray(type, count);
  return { element: (index: Node | number) => array.element<TNodeType>(index) };
}
