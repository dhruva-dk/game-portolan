// The frame after the scene. It is drawn below the screen's resolution with motion vectors, and each step builds on
// the last:
// - occlusion: ground-truth ambient occlusion (GTAO, Jimenez et al. 2016) from the depth buffer, at half the scene's
//   resolution with its noise turned each frame, darkens the creases where light can't reach: under a gunwale, where
//   a hull meets the water, between rocks;
// - upscaling: the occluded frame is reconstructed to the screen by temporal upscaling (jittered frames accumulated
//   with a Blackman-Harris resolve, Karis 2014), which also gathers the occlusion's noise away;
// - heat haze: the air over what burns or fires shimmers, bending what lies behind it;
// - motion blur: each pixel is smeared along its own motion as through a half-open shutter, so a ship crossing fast
//   or a shot's flight streaks;
// - focus: in the lobby and the ceremonies the frame takes a lens's depth of field;
// - light: a bloom blurs a few percent of everything (a lens's scatter, not a glow on chosen things), and the
//   brightest of it throws ghosts across the lens (Chapman's pseudo lens flare) and lights the dust and smears on it;
// - exposure and tone: the eye's adaptation exposes it, AgX and the grade map it to the screen, and a fine grain lies
//   over it all.
import { RenderPipeline, Vector4, CanvasTexture, LinearFilter, SRGBColorSpace, UnsignedByteType, type PassNode, type PerspectiveCamera, type Scene, type Texture, type WebGPURenderer } from 'three/webgpu';
import type { Node, TextureNode } from 'three/webgpu';
import {
  Fn, float, ivec2, min, mix, mrt, output, pass, screenUV, smoothstep, uniform, uniformArray, vec2, vec4, velocity, clamp, dot, vec3,
  fract, sin, cos, rtt, texture, max, length, select, screenSize, uv,
} from 'three/tsl';
import { taau } from 'three/addons/tsl/display/TAAUNode.js';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';
import GTAONode from 'three/addons/tsl/display/GTAONode.js';
import { lensflare } from 'three/addons/tsl/display/LensflareNode.js';
import { gaussianBlur } from 'three/addons/tsl/display/GaussianBlurNode.js';
import { dof } from 'three/addons/tsl/display/DepthOfFieldNode.js';
import { agx, GRADE } from './tonemap.ts';
import { Exposure, exposure } from './exposure.ts';
import { HAZE_MAX, hazeSpots } from './haze.ts';
import { P } from './uniforms.ts';

/** How much of the frame the bloom spreads, as a share of its light. */
export const BLOOM = uniform(0.05);

/** What the match lays over the whole frame, 0…1: outside the safe circle, just hurt, and low on hull. */
export const SCREEN = { storm: uniform(0), hurt: uniform(0), low: uniform(0) };

/** The lens: how deep the occlusion darkens, the shutter (a share of the frame's motion each pixel is smeared over),
 *  the lens flare's ghosts and the dust they light, the film grain, and how far heat bends the light. */
export const LENS = {
  occlusion: uniform(0.8),
  shutter: uniform(0.5),
  flare: uniform(0.35),
  dirt: uniform(0.1),
  grain: uniform(0.022),
  haze: uniform(0.0045),
};

/** The depth of field: where it is sharp (metres from the eye), how deep the sharp band is, and the bokeh's size. */
export const FOCUS = { distance: uniform(27), range: uniform(48), bokeh: uniform(2.2) };

/** The temporal upscaler reads each output pixel's 3×3 neighbourhood with textureLoad and no clamp; out of range,
 *  Metal hands back the texel from the opposite edge, which lit the top row with the sea. Its loads are clamped here. */
function clampedLoads(node: TextureNode): TextureNode {
  const load = node.load.bind(node) as (at: Node) => TextureNode;
  const size = (node as unknown as { size(level?: number): Node<'ivec2'> }).size(0);
  const last = size.sub(ivec2(1, 1));
  (node as unknown as { load(at: Node<'ivec2'>): Node }).load = (at) =>
    load(clamp(at as unknown as Node<'vec2'>, ivec2(0, 0) as unknown as Node<'vec2'>, last as unknown as Node<'vec2'>));
  return node;
}

/** The scene as the upscaler loads it, clamped as clampedLoads does, occluded by `ao` (sampled at the texel's centre)
 *  and capped. */
function occludedLoads(node: TextureNode, ao: TextureNode): TextureNode {
  const load = node.load.bind(node) as (at: Node) => TextureNode;
  const size = (node as unknown as { size(level?: number): Node<'ivec2'> }).size(0);
  const last = size.sub(ivec2(1, 1));
  (node as unknown as { load(at: Node<'ivec2'>): Node }).load = (at) => {
    const c = load(clamp(at as unknown as Node<'vec2'>, ivec2(0, 0) as unknown as Node<'vec2'>, last as unknown as Node<'vec2'>)) as unknown as Node<'vec4'>;
    const st = vec2(at as unknown as Node<'vec2'>).add(0.5).div(vec2(size as unknown as Node<'vec2'>));
    const o = mix(float(1), (ao.sample(st) as unknown as Node<'vec4'>).r, LENS.occlusion);
    return min(vec4(c.rgb.mul(o), c.a), vec4(30000));
  };
  return node;
}

/** The dust and smears on the front of the lens, drawn once: soft specks, a few out-of-focus rings, and wipes. */
function lensDirt(): Texture {
  const size = 512, c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  g.fillStyle = '#000';
  g.fillRect(0, 0, size, size);
  let seed = 0x5eed;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 0x100000000);
  g.globalCompositeOperation = 'lighter';
  // wipes: long faint smears where a cloth went over it
  for (let k = 0; k < 7; k++) {
    g.save();
    g.translate(rnd() * size, rnd() * size);
    g.rotate(rnd() * Math.PI);
    g.scale(1, 0.12 + rnd() * 0.1);
    const r = 60 + rnd() * 140, grad = g.createRadialGradient(0, 0, 0, 0, 0, r);
    grad.addColorStop(0, `rgba(255,248,235,${0.05 + rnd() * 0.05})`);
    grad.addColorStop(1, 'rgba(255,248,235,0)');
    g.fillStyle = grad;
    g.beginPath();
    g.arc(0, 0, r, 0, Math.PI * 2);
    g.fill();
    g.restore();
  }
  // specks of dust and dried spray
  for (let k = 0; k < 160; k++) {
    const x = rnd() * size, y = rnd() * size, r = 1.5 + rnd() * rnd() * 14;
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    const a = 0.08 + rnd() * 0.25;
    grad.addColorStop(0, `rgba(255,250,240,${a})`);
    grad.addColorStop(1, 'rgba(255,250,240,0)');
    g.fillStyle = grad;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  }
  // bigger drops out of focus: discs with a brighter rim
  for (let k = 0; k < 22; k++) {
    const x = rnd() * size, y = rnd() * size, r = 10 + rnd() * 26;
    const grad = g.createRadialGradient(x, y, r * 0.6, x, y, r);
    grad.addColorStop(0, 'rgba(255,245,230,0.05)');
    grad.addColorStop(0.85, `rgba(255,245,230,${0.1 + rnd() * 0.1})`);
    grad.addColorStop(1, 'rgba(255,245,230,0)');
    g.fillStyle = grad;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  }
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.minFilter = t.magFilter = LinearFilter;
  return t;
}

export class Post {
  readonly pipeline: RenderPipeline;
  readonly scenePass: PassNode;
  readonly exposure: Exposure;
  readonly occlusion: GTAONode;
  readonly #renderer: WebGPURenderer;
  readonly #camera: PerspectiveCamera;
  readonly #plain: Node;
  readonly #focused: Node;
  readonly #spots = uniformArray(Array.from({ length: HAZE_MAX }, () => new Vector4()), 'vec4');
  readonly #depths = uniformArray(Array.from({ length: HAZE_MAX }, () => new Vector4()), 'vec4');
  #focus = false;

  /** `overlay` is drawn over the finished frame at the screen's own resolution, untouched by the upscaler, the
   *  exposure and the tone curve: what is written on the screen rather than lit in the world. */
  constructor(renderer: WebGPURenderer, scene: Scene, camera: PerspectiveCamera, scale: number, overlay?: Scene) {
    this.#renderer = renderer;
    this.#camera = camera;
    const scenePass = pass(scene, camera);
    // `smear`: how much of its motion a pixel is blurred by, 1 but where a material says otherwise (the sea)
    scenePass.setMRT(mrt({ output, velocity, smear: float(1) }));
    scenePass.setResolutionScale(scale);
    (scenePass.getTexture('smear') as Texture).type = UnsignedByteType;
    this.scenePass = scenePass;
    const smear = scenePass.getTextureNode('smear');
    const beauty = scenePass.getTextureNode('output');
    const depth = clampedLoads(scenePass.getTextureNode('depth'));
    const motion = clampedLoads(scenePass.getTextureNode('velocity'));

    // occlusion, from depth alone: normals rebuilt from it, so the smoke and spray drawn over a hull never muddy it
    const occlusion = new GTAONode(depth, null as unknown as Node, camera);
    occlusion.resolutionScale = 0.5;
    occlusion.radius.value = 1.6;
    occlusion.thickness.value = 1.5;
    occlusion.distanceExponent.value = 1.4;
    occlusion.samples.value = 12;
    occlusion.useTemporalFiltering = true;
    this.occlusion = occlusion;
    const ao = occlusion.getTextureNode();
    // the upscaler reads the scene through its loads: occluded there, and capped, since a glint past half-float's range
    // is stored as infinity, which the upscaler's blend turns into a NaN that spreads as black through its history
    const resolved = taau(occludedLoads(beauty, ao), depth, motion, camera) as unknown as { getTextureNode(): TextureNode };
    const sharp = resolved.getTextureNode();

    // heat haze, then motion blur, at the screen's resolution
    const spots = this.#spots, depths = this.#depths;
    const viewZ = scenePass.getViewZNode();
    const moving = Fn(() => {
      const at = uv().toVar();
      const aspect = screenSize.x.div(screenSize.y);
      const far = viewZ.negate();
      const bend = vec2(0, 0).toVar();
      for (let k = 0; k < HAZE_MAX; k++) {
        const s = spots.element(k) as unknown as Node<'vec4'>, d = depths.element(k) as unknown as Node<'vec4'>;
        const q = at.sub(s.xy).mul(vec2(aspect, 1)).div(max(s.z, 1e-4)).toVar();
        // the column of hot air rises: it reaches three radii up and one down
        const rise = select(q.y.lessThan(0), q.y.div(3), q.y);
        const w = smoothstep(1, 0, length(vec2(q.x.mul(1.2), rise))).mul(s.w).mul(smoothstep(d.x.sub(2), d.x, far));
        // turbulence rising through it, finer than the source
        const t = P.time.mul(3.1);
        const n = vec2(
          sin(q.y.mul(9.3).add(t.mul(2.3)).add(sin(q.x.mul(6.1).sub(t)))),
          cos(q.x.mul(8.7).sub(t.mul(1.7)).add(sin(q.y.mul(7.3).add(t.mul(2.9))))),
        );
        bend.addAssign(n.mul(w));
      }
      at.addAssign(bend.mul(LENS.haze));
      // the pixel's own motion, in screen terms (motion vectors are in device coordinates, y up), smeared over the
      // shutter and held to a twentieth of the screen
      const v = motion.sample(at).xy.mul(vec2(0.5, -0.5)).mul(LENS.shutter).mul(smear.sample(at).r).toVar();
      const len = length(v);
      v.mulAssign(min(float(1), float(0.05).div(max(len, 1e-5))));
      const sum = vec4(0).toVar();
      const N = 8;
      for (let i = 0; i < N; i++) sum.addAssign(sharp.sample(at.add(v.mul(i / (N - 1) - 0.5))));
      return sum.div(N);
    })();
    const moved = rtt(moving);

    const finish = (hdrIn: Node<'vec4'>): Node<'vec4'> => {
      const glow = bloom(hdrIn, 1, 0.55, 0) as unknown as Node<'vec4'> & { getTextureNode(): TextureNode };
      // the brightest of the scatter, exposed, throws ghosts across the lens and lights its dust
      const bright = rtt(glow.rgb.mul(exposure), null, null, { resolutionScale: 0.25 });
      const ghosts = gaussianBlur(
        lensflare(bright, { ghostTint: vec3(1, 0.86, 0.66), threshold: float(20), ghostSamples: float(5), ghostSpacing: float(0.22), ghostAttenuationFactor: float(22), downSampleRatio: 2 }),
        null, 6,
      ) as unknown as Node<'vec4'>;
      const dust = texture(lensDirt(), screenUV).rgb;
      const lit = max(glow.rgb.mul(exposure).sub(1.6), vec3(0));
      let hdr = hdrIn.rgb.mul(float(1).sub(BLOOM)).add(glow.rgb.mul(BLOOM)).mul(exposure)
        .add(ghosts.rgb.mul(LENS.flare))
        .add(lit.mul(dust).mul(LENS.dirt));
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
      // film grain, most in the mid-tones and shadows, and under it a dither finer than a pixel that breaks the banding
      // in the sky's long gradients
      const seedUV = screenUV.mul(vec3(1931.7, 1279.3, 0).xy).add(fract(P.time.mul(7.13)));
      const n = fract(sin(dot(seedUV, vec3(12.9898, 78.233, 0).xy)).mul(43758.5453));
      const m = fract(sin(dot(seedUV.add(17.17), vec3(39.346, 11.135, 0).xy)).mul(24634.6345));
      const luma = dot(ldr, vec3(0.2126, 0.7152, 0.0722));
      ldr = ldr.add(m.sub(0.5).mul(LENS.grain).mul(float(1.15).sub(luma)));
      ldr = clamp(ldr.add(n.sub(0.5).mul(1 / 255)), 0, 1);
      if (overlay) {
        // cleared to nothing and blended over, the overlay's colour comes premultiplied by its coverage
        const over = pass(overlay, camera).getTextureNode('output');
        ldr = ldr.mul(float(1).sub(over.a)).add(over.rgb);
      }
      return vec4(ldr, 1);
    };
    if (overlay) renderer.setClearColor(0x000000, 0);
    this.#plain = finish(moved as unknown as Node<'vec4'>);
    // out of focus a lens spreads each point of light into a disc; the light is tone-weighted before it spreads
    // (Karis's 1/(1+luma)) and given back after, so a spark or a lantern behind the focus blooms into a soft glow
    // instead of a hard-edged coin brighter than everything round it
    const weighed = rtt(Fn(() => {
      const c = moved.sample(screenUV).rgb.toVar();
      return vec4(c.div(dot(c, vec3(0.2126, 0.7152, 0.0722)).mul(exposure).add(1)), 1);
    })());
    const spread = dof(weighed, viewZ, FOCUS.distance, FOCUS.range, FOCUS.bokeh) as unknown as Node<'vec4'>;
    this.#focused = finish(Fn(() => {
      const c = spread.rgb.toVar();
      return vec4(c.div(max(float(1).sub(dot(c, vec3(0.2126, 0.7152, 0.0722)).mul(exposure)), 0.02)), 1);
    })() as unknown as Node<'vec4'>);
    this.pipeline = new RenderPipeline(renderer);
    this.pipeline.outputNode = this.#plain;
    this.exposure = new Exposure(scenePass.getTexture('output') as Texture);
  }

  /** Takes a lens's depth of field, sharp `distance` metres off, or (null) none. */
  focus(distance: number | null): void {
    const on = distance !== null;
    if (on) FOCUS.distance.value = distance;
    if (on === this.#focus) return;
    this.#focus = on;
    this.pipeline.outputNode = on ? this.#focused : this.#plain;
    this.pipeline.needsUpdate = true;
  }

  /** Draws the frame, then meters it for the next. */
  render(dt = 1 / 60): void {
    P.frame.value = (P.frame.value + 1) % 64;
    const spots = hazeSpots(this.#camera, dt);
    const a = this.#spots.array as Vector4[], b = this.#depths.array as Vector4[];
    for (let k = 0; k < spots.length; k++) {
      const s = spots[k];
      a[k].set(s.x, s.y, s.r, s.strength);
      b[k].set(s.depth, 0, 0, 0);
    }
    this.pipeline.render();
    this.#renderer.compute(this.exposure.passes);
  }
}

