// The frame after the scene. The scene is drawn at a fixed share of the canvas (renderer.ts) and brought up to it by
// a plain bilinear sample; over it:
// - light: a bloom blurs a few percent of everything (a lens's scatter, not a glow on chosen things);
// - exposure and tone: the colour script's exposure for the hour and the weather, AgX and the grade map it to the
//   screen (grade.ts);
// - the match's own washes: the Storm's violet outside the safe circle, a hit's red edge, a failing hull's pulse;
// - a dither finer than a step of the screen's colour, which breaks the banding in the sky's long gradients.
import { RenderPipeline, UnsignedByteType, type PassNode, type Texture, type PerspectiveCamera, type Scene, type WebGPURenderer } from 'three/webgpu';
import type { Node } from 'three/webgpu';
import { clamp, dot, float, fract, min, mix, pass, screenUV, sin, smoothstep, uniform, vec3, vec4 } from 'three/tsl';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';
import { agx, GRADE } from './tonemap.ts';
import { EXPOSURE, graded } from './grade.ts';
import { P } from './uniforms.ts';
import { shape } from './shape.ts';

/** How much of the frame the bloom spreads, as a share of its light. */
const BLOOM = 0.05;

/** What the match lays over the whole frame, 0…1: outside the safe circle, just hurt, and low on hull. */
export const SCREEN = { storm: uniform(0), hurt: uniform(0), low: uniform(0) };

const LUMA = vec3(0.2126, 0.7152, 0.0722);

export class Post {
  readonly pipeline: RenderPipeline;
  readonly scenePass: PassNode;
  /** How deep in renders the scene was last drawn. */
  sceneDepth = 0;

  /** The scene is drawn at `scale` of the canvas each way. `overlay` is drawn over the finished frame at the canvas's
   *  own resolution, untouched by the exposure and the tone curve: what is written on the screen rather than lit in
   *  the world. */
  constructor(renderer: WebGPURenderer, scene: Scene, camera: PerspectiveCamera, scale: number, overlay?: Scene) {
    const scenePass = pass(scene, camera);
    scenePass.setResolutionScale(scale);
    this.scenePass = scenePass;
    // for the frame log: what the scene pass draws (the shadow maps with it) is the scene's, what follows is post's
    const drawScene = scenePass.updateBefore.bind(scenePass);
    scenePass.updateBefore = (frame) => {
      shape.system('scene');
      // the stage builds the scene's materials ahead for this depth (stage.ts, SCENE_DEPTH)
      this.sceneDepth = (renderer as unknown as { _callDepth: number })._callDepth + 1;
      const r = drawScene(frame);
      shape.system('post');
      return r;
    };
    // capped: a glint past half-float's range is stored as infinity, which the bloom's blur would spread as a block
    const hdrIn = min(scenePass.getTextureNode('output'), vec4(30000));
    // the bloom at half the scene's resolution, whatever the canvas's
    const glow = bloom(hdrIn, 1, 0.55, 0);
    glow.setResolutionScale(scale * 0.5);
    let hdr = hdrIn.rgb.mul(1 - BLOOM).add((glow as unknown as Node<'vec4'>).rgb.mul(BLOOM)).mul(EXPOSURE);
    // outside the safe circle the world drains toward a bruised violet, before the tone curve so its light holds
    const lum = dot(hdr, LUMA);
    hdr = mix(hdr, vec3(lum).mul(vec3(0.55, 0.42, 0.95)).add(hdr.mul(vec3(0.25, 0.15, 0.45))), SCREEN.storm.mul(0.75));
    let ldr = graded(agx(hdr));
    // low on hull the colour drains a little
    ldr = mix(vec3(dot(ldr, LUMA)), ldr, float(1).sub(SCREEN.low.mul(0.35)));
    // the corners darken a little, as through any lens
    const d = screenUV.sub(0.5).mul(vec3(1.25, 1, 0).xy);
    ldr = ldr.mul(float(1).sub(GRADE.vignette.mul(smoothstep(0.25, 0.85, d.length()))));
    // a hit reddens the edges of the frame, and a failing hull pulses them dark
    const edge = smoothstep(0.12, 0.42, d.dot(d));
    ldr = mix(ldr, vec3(0.75, 0.05, 0.02), edge.mul(SCREEN.hurt.clamp(0, 1)).mul(0.65));
    ldr = mix(ldr, vec3(0.25, 0, 0.02), edge.mul(SCREEN.low).mul(sin(P.time.mul(5)).mul(0.15).add(0.35)));
    // the dither: a step of the screen's colour, spread as noise over the pixels and moved on each frame
    const seed = screenUV.mul(vec3(1931.7, 1279.3, 0).xy).add(fract(P.time.mul(7.13)));
    const n = fract(sin(dot(seed, vec3(12.9898, 78.233, 0).xy)).mul(43758.5453));
    ldr = clamp(ldr.add(n.sub(0.5).mul(1 / 255)), 0, 1);
    if (overlay) {
      // cleared to nothing and blended over, the overlay's colour comes premultiplied by its coverage
      const written = pass(overlay, camera);
      // (in eight bits: it is drawn after the tone curve)
      (written.getTexture('output') as Texture).type = UnsignedByteType;
      const over = written.getTextureNode('output');
      ldr = ldr.mul(float(1).sub(over.a)).add(over.rgb);
      renderer.setClearColor(0x000000, 0);
    }
    this.pipeline = new RenderPipeline(renderer);
    this.pipeline.outputNode = vec4(ldr, 1);
  }

  /** Draws the frame. */
  render(): void {
    this.pipeline.render();
  }
}
