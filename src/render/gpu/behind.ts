// What the frame already holds, for what is drawn over it. three copies the framebuffer out once a render for every
// node a material reads it through, and each copy ends the scene's pass: on a tiled GPU (every iPad and iPhone) the
// pass that follows reloads every target the scene draws into, the depth and four colour targets at full size. So
// every read samples one of these three, and a frame copies three times however many materials read them. (The
// colour is a plain viewport texture: three's shared one keys its copy by node, so each sample of it copies again.)
//   beneath   the scene drawn before the sea: what the sea is seen through and what it mirrors. Copied as the sea is
//             drawn, the first of what draws over the scene, so the sea is never in it.
//   over      the depth with the sea in it: what clouds, the moonbow, smoke and trails fade into. Copied when the
//             first of them draws, after the sea.
import { DepthTexture, FramebufferTexture, ViewportDepthTextureNode, type Node } from 'three/webgpu';
import { screenUV, viewportDepthTexture, viewportTexture } from 'three/tsl';

type V2 = Node<'vec2'>;

const depthBeneath = viewportDepthTexture();
// unfiltered, so it is read by the texel and takes none of the sixteen samplers a stage may have, which the sea's
// shader needs every one of
const colourBeneath = viewportTexture(screenUV, null, new FramebufferTexture(1, 1));
const depthOver = new ViewportDepthTextureNode(screenUV, null, new DepthTexture());

/** The depth of the scene the sea is drawn over, at `uv` on the screen. */
export const beneathDepth = (uv: V2 = screenUV) => depthBeneath.sample(uv);
/** The colour of the scene the sea is drawn over. */
export const beneathColour = (uv: V2 = screenUV) => colourBeneath.sample(uv);
/** The depth of the scene with the sea in it. */
export const overDepth = (uv: V2 = screenUV) => depthOver.sample(uv);
