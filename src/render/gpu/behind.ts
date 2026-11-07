// What the frame already holds, for what is drawn over it. three copies the framebuffer out once a render for every
// node a material reads it through, and each copy ends the scene's pass: on a tiled GPU (every iPad and iPhone) the
// pass that follows reloads every target the scene draws into. So everything that reads the frame reads one copy,
// taken as the sea is drawn, the first of what draws over the scene: the colour and the depth of the scene beneath
// it, copied together in a single break of the pass (copyTogether). The sea is never in it: what is drawn after the
// sea (clouds, smoke, trails, the moonbow) fades into the scene under the water's surface, and is cut by the sea
// itself through the depth test. (The colour is a plain viewport texture: three's shared one keys its copy by node,
// so each sample of it copies again.)
import { FramebufferTexture, type Node, type Texture, type WebGPURenderer } from 'three/webgpu';
import { screenUV, viewportDepthTexture, viewportTexture } from 'three/tsl';

type V2 = Node<'vec2'>;

const depthBeneath = viewportDepthTexture();
// unfiltered, so it is read by the texel and takes none of the sixteen samplers a stage may have, which the sea's
// shader needs every one of
const colourBeneath = viewportTexture(screenUV, null, new FramebufferTexture(1, 1));

/** The depth of the scene the sea is drawn over, at `uv` on the screen. */
export const beneathDepth = (uv: V2 = screenUV) => depthBeneath.sample(uv);
/** The colour of the scene the sea is drawn over. */
export const beneathColour = (uv: V2 = screenUV) => colourBeneath.sample(uv);
/** The depth what is drawn over the sea fades into: the same copy. */
export const overDepth = (uv: V2 = screenUV) => depthBeneath.sample(uv);

interface GpuTexture { width: number; height: number; format: string }
interface Encoder { beginRenderPass(d: unknown): unknown }
interface Context { renderTarget: unknown; depthTexture: Texture; textures: Texture[] }
interface Backend {
  get(o: object): { texture?: GpuTexture; currentPass?: unknown; encoder?: Encoder };
  copyFramebufferToTexture(texture: Texture, context: Context, rectangle: unknown): void;
  _copyFramebufferToTexture(encoder: Encoder, texture: Texture, from: GpuTexture, to: GpuTexture, rectangle: unknown, layer: number, mips: boolean): void;
}

/** Makes the copy of the colour and of the depth one break of the scene's pass, not two: whichever is asked for first
 *  copies the other in the same break, and the other's own copy is then skipped. */
export function copyTogether(renderer: WebGPURenderer): void {
  const backend = renderer.backend as unknown as Backend;
  // each node keeps a copy for each target it is drawn into
  type Copied = { getTextureForReference(target: unknown): Texture };
  const colour = colourBeneath as unknown as Copied, depth = depthBeneath as unknown as Copied;
  const partnerOf = (texture: Texture, target: unknown): Texture | undefined => {
    if (!target) return undefined;
    const c = colour.getTextureForReference(target), d = depth.getTextureForReference(target);
    return texture === c ? d : texture === d ? c : undefined;
  };
  const skip = new Set<Texture>();
  const copy = backend.copyFramebufferToTexture.bind(backend);
  backend.copyFramebufferToTexture = (texture, context, rectangle) => {
    if (skip.delete(texture)) return;
    const other = partnerOf(texture, context.renderTarget), data = backend.get(context);
    const from = other && context.renderTarget
      ? backend.get((other as { isDepthTexture?: boolean }).isDepthTexture ? context.depthTexture : context.textures[0]).texture : undefined;
    const to = other && backend.get(other).texture;
    // the first frame, before the other's texture is made to the frame's size, copies each on its own
    if (!other || !data.currentPass || !data.encoder || !from || !to || from.width !== to.width || from.height !== to.height || from.format !== to.format) {
      copy(texture, context, rectangle);
      return;
    }
    const encoder = data.encoder as Encoder & Record<string, unknown>;
    const begin = encoder.beginRenderPass;
    encoder.beginRenderPass = (d: unknown) => {
      Reflect.deleteProperty(encoder, 'beginRenderPass');
      backend._copyFramebufferToTexture(encoder, other, from, to, rectangle, 0, false);
      return begin.call(encoder, d);
    };
    copy(texture, context, rectangle);
    skip.add(other);
  };
}
