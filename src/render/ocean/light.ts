// The sea's light: three's physical model, with the sun's light on the water darkened by the shadow the sea reads for
// itself (surface.ts), once, only where a shadow on it can show, rather than by three's own reading of the cascades
// at every fragment of the sea. The sea mirrors the sky's probe and nothing else: the ships and the land in it would
// need the frame marched for every fragment of water, which the frame on the iPad has no room for.
import { PhysicalLightingModel, type NodeBuilder, type Node } from 'three/webgpu';

export class SeaLight extends PhysicalLightingModel {
  readonly #shade: () => Node<'float'>;

  /** `shade` is the sun's shadow on the water. */
  constructor(shade: () => Node<'float'>, flags: boolean[]) {
    super(...(flags as [boolean, boolean, boolean, boolean, boolean, boolean]));
    this.#shade = shade;
  }

  direct(input: Parameters<PhysicalLightingModel['direct']>[0], builder: NodeBuilder): void {
    const light = (input as { lightNode?: { light?: { name: string } } }).lightNode?.light;
    const lit = light?.name === 'sun' ? { ...input, lightColor: (input.lightColor as Node<'vec3'>).mul(this.#shade()) } : input;
    super.direct(lit, builder);
  }
}
