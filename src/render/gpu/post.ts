// The frame after the scene: drawn below the screen's resolution with motion vectors, reconstructed to it by temporal
// upscaling (jittered frames accumulated with a Blackman-Harris resolve, Karis 2014), lit at its brightest by a bloom
// that blurs a few percent of everything (a lens's scatter, not a glow on chosen things), exposed by the eye's
// adaptation, and mapped to the screen through AgX and the grade.
import { RenderPipeline, type PassNode, type PerspectiveCamera, type Scene, type Texture, type WebGPURenderer } from 'three/webgpu';
import type { Node, TextureNode } from 'three/webgpu';
import { float, ivec2, min, mix, mrt, output, pass, screenUV, smoothstep, uniform, vec4, velocity, clamp, dot, vec3, fract, sin } from 'three/tsl';
import { taau } from 'three/addons/tsl/display/TAAUNode.js';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';
import { agx, GRADE } from './tonemap.ts';
import { Exposure, exposure } from './exposure.ts';
import { P } from './uniforms.ts';

/** How much of the frame the bloom spreads, as a share of its light. */
export const BLOOM = uniform(0.05);

/** What the match lays over the whole frame, 0…1: outside the safe circle, just hurt, and low on hull. */
export const SCREEN = { storm: uniform(0), hurt: uniform(0), low: uniform(0) };

/** The temporal upscaler reads each output pixel's 3×3 neighbourhood with textureLoad and no clamp; out of range,
 *  Metal hands back the texel from the opposite edge, which lit the top row with the sea. Its loads are clamped here.
 *  With `cap`, what is loaded is capped too: a glint past half-float's range is stored as infinity, which the
 *  upscaler's blend turns into a NaN that spreads as black through its history. */
function clampedLoads(node: TextureNode, cap?: number): TextureNode {
  const load = node.load.bind(node) as (at: Node) => TextureNode;
  const size = (node as unknown as { size(level?: number): Node<'ivec2'> }).size(0);
  const last = size.sub(ivec2(1, 1));
  (node as unknown as { load(at: Node<'ivec2'>): Node }).load = (at) => {
    const v = load(clamp(at as unknown as Node<'vec2'>, ivec2(0, 0) as unknown as Node<'vec2'>, last as unknown as Node<'vec2'>));
    return cap === undefined ? v : min(v as unknown as Node<'vec4'>, vec4(cap));
  };
  return node;
}

export class Post {
  readonly pipeline: RenderPipeline;
  readonly scenePass: PassNode;
  readonly exposure: Exposure;
  readonly #renderer: WebGPURenderer;

  /** `overlay` is drawn over the finished frame at the screen's own resolution, untouched by the upscaler, the
   *  exposure and the tone curve: what is written on the screen rather than lit in the world. */
  constructor(renderer: WebGPURenderer, scene: Scene, camera: PerspectiveCamera, scale: number, overlay?: Scene) {
    this.#renderer = renderer;
    const scenePass = pass(scene, camera);
    scenePass.setMRT(mrt({ output, velocity }));
    scenePass.setResolutionScale(scale);
    this.scenePass = scenePass;
    const beauty = clampedLoads(scenePass.getTextureNode('output'), 30000);
    const depth = clampedLoads(scenePass.getTextureNode('depth'));
    const motion = clampedLoads(scenePass.getTextureNode('velocity'));
    const resolved = taau(beauty, depth, motion, camera) as unknown as Node<'vec4'>;
    const glow = bloom(resolved, 1, 0.55, 0) as unknown as Node<'vec4'>;
    let hdr = resolved.rgb.mul(float(1).sub(BLOOM)).add(glow.rgb.mul(BLOOM)).mul(exposure);
    // outside the safe circle the world drains toward a bruised violet, before the tone curve so its light holds
    const lum = dot(hdr, vec3(0.2126, 0.7152, 0.0722));
    hdr = mix(hdr, vec3(lum).mul(vec3(0.55, 0.42, 0.95)).add(hdr.mul(vec3(0.25, 0.15, 0.45))), SCREEN.storm.mul(0.75));
    let ldr = agx(hdr);
    // low on hull the colour drains a little
    ldr = mix(vec3(dot(ldr, vec3(0.2126, 0.7152, 0.0722))), ldr, float(1).sub(SCREEN.low.mul(0.35)));
    // the corners darken a little, as through any lens
    const d = screenUV.sub(0.5).mul(vec3(1.25, 1, 0).xy);
    ldr = ldr.mul(float(1).sub(GRADE.vignette.mul(smoothstep(0.25, 0.85, d.length()))));
    // a hit reddens the edges of the frame, and a failing hull pulses them dark
    const edge = smoothstep(0.12, 0.42, d.dot(d));
    ldr = mix(ldr, vec3(0.75, 0.05, 0.02), edge.mul(SCREEN.hurt.clamp(0, 1)).mul(0.65));
    ldr = mix(ldr, vec3(0.25, 0, 0.02), edge.mul(SCREEN.low).mul(sin(P.time.mul(5)).mul(0.15).add(0.35)));
    // and a grain finer than a pixel breaks the banding in the sky's long gradients
    const n = fract(sin(dot(screenUV.mul(vec3(1931.7, 1279.3, 0).xy).add(fract(P.time.mul(7.13))), vec3(12.9898, 78.233, 0).xy)).mul(43758.5453));
    ldr = clamp(ldr.add(n.sub(0.5).mul(1 / 255)), 0, 1);
    if (overlay) {
      // cleared to nothing and blended over, the overlay's colour comes premultiplied by its coverage
      renderer.setClearColor(0x000000, 0);
      const over = pass(overlay, camera).getTextureNode('output');
      ldr = ldr.mul(float(1).sub(over.a)).add(over.rgb);
    }
    this.pipeline = new RenderPipeline(renderer);
    this.pipeline.outputNode = vec4(ldr, 1);
    this.exposure = new Exposure(scenePass.getTexture('output') as Texture);
  }

  /** Draws the frame, then meters it for the next. */
  render(): void {
    P.frame.value = (P.frame.value + 1) % 64;
    this.pipeline.render();
    this.#renderer.compute(this.exposure.passes);
  }
}
