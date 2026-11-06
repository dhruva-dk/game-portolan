// Small helpers over TSL that every GPU module uses.
import type { Node } from 'three/webgpu';
import { Loop } from 'three/tsl';

/**
 * A counted loop whose index has its own name in the WGSL. TSL names every loop's index `i` unless told otherwise, so
 * nested loops shadow their outer index: name each one.
 */
export function loop(name: string, count: number | Node<'int'>, body: (i: Node<'int'>) => void): void {
  const params = { start: 0, end: count, type: 'int', condition: '<', name };
  (Loop as unknown as (p: typeof params, f: (vars: Record<string, Node<'int'>>) => void) => void)(params, (vars) => body(vars[name]));
}
