// The frame after the scene. It is drawn below the screen's resolution with motion vectors, and each step builds on
// the last:
// - occlusion and bounce: screen-space global illumination (visibility bitmasks, Therrien et al. 2023, after GTAO's
//   horizons) from the depth buffer, at half the scene's resolution with its noise turned each frame, darkens the
//   creases where light can't reach (under a gunwale, where a hull meets the water, between rocks) and gathers the
//   light the frame's own lit surfaces throw on each other: a sunlit sail warming the deck under it, a cliff's glow
//   on the sea below, the sea's blue on a hull's side;
// - contact: screen-space shadows (Bend Studio's, marched toward the sun through the depth buffer) put the small
//   shadows the shadow maps are too coarse to hold where things touch: a gun on its deck, the rigging's lines, a
//   pebble on a beach;
// - upscaling: the occluded frame is reconstructed to the screen by temporal upscaling (jittered frames accumulated
//   with a Blackman-Harris resolve, Karis 2014), which also gathers the occlusion's noise away;
// - heat haze: the air over what burns or fires shimmers, bending what lies behind it;
// - motion blur: each pixel is smeared along its own motion as through a half-open shutter, so a ship crossing fast
//   or a shot's flight streaks;
// - focus: in the lobby and the ceremonies the frame takes a lens's depth of field;
// - light: a bloom blurs a few percent of everything (a lens's scatter, not a glow on chosen things), and the
//   brightest of it throws ghosts across the lens (after Chapman's pseudo lens flare) and lights the dust and smears
//   on it;
// - exposure and tone: the eye's adaptation exposes it, AgX and the grade map it to the screen (the colour script's
//   table for the hour and the weather, grade.ts), and a fine grain lies over it all.
import {
  RenderPipeline, Vector4, CanvasTexture, LinearFilter, SRGBColorSpace, UnsignedByteType, type DirectionalLight, type PassNode, type PerspectiveCamera,
  type Scene, type Texture, type WebGPURenderer,
} from 'three/webgpu';
import type { Node, TextureNode } from 'three/webgpu';
import {
  Fn, float, ivec2, min, mix, mrt, output, pass, screenUV, smoothstep, uniform, uniformArray, vec2, vec4, velocity, clamp, dot, vec3,
  fract, sin, cos, rtt, texture, max, length, select, screenSize, uv, distance, pow, diffuseColor,
} from 'three/tsl';
import { taau } from 'three/addons/tsl/display/TAAUNode.js';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';
import SSGINode from 'three/addons/tsl/display/SSGINode.js';
import SSSNode from 'three/addons/tsl/display/SSSNode.js';
import GTAONode from 'three/addons/tsl/display/GTAONode.js';
import { gaussianBlur } from 'three/addons/tsl/display/GaussianBlurNode.js';
import { dof } from 'three/addons/tsl/display/DepthOfFieldNode.js';
import { agx, GRADE } from './tonemap.ts';
import { graded } from './grade.ts';
import { Exposure, exposure } from './exposure.ts';
import { HAZE_MAX, hazeSpots } from './haze.ts';
import { P } from './uniforms.ts';
import { shape } from './shape.ts';
import { PARKED } from './parked.ts';

/** How much of the frame the bloom spreads, as a share of its light. */
export const BLOOM = uniform(0.05);

/** Ghosts across the lens, their spacing toward the centre, and how the lens's edge fades them. */
const GHOSTS = 5;
const SPACING = 0.22;
const EDGE = 22;
/** Exposed light beyond which a thing throws ghosts, and the most any one place throws. */
const GHOST_FROM = 20;
const GHOST_MOST = 60;

/**
 * The ghosts the lens throws of what is brightest in the frame (Chapman's pseudo lens flare, made to keep its light).
 * Each ghost is the frame turned about its centre and drawn smaller or larger toward it; the pseudo flare draws each
 * as bright as what threw it, so a ghost magnified eight times paints a lamp-lit rail across half the screen. Here a
 * ghost spreads its light over the area it is magnified to (its weight goes as the square of its scale), so a small
 * hot source still throws a bright ghost and a wide lit surface throws faint ones. The threshold is taken off the
 * light's luminance, not off each channel, so an orange lamp throws orange ghosts, not red; and the excess is eased
 * toward a ceiling, so a source a thousand times too bright throws no more than a few times too bright.
 */
function lensGhosts(bright: TextureNode): Node<'vec4'> {
  return Fn(() => {
    const t = uv().oneMinus();
    const sum = vec3(0).toVar();
    for (let i = 0; i < GHOSTS; i++) {
      const scale = 1 - SPACING * i;
      const at = t.mul(scale).add(0.5 * SPACING * i);
      const c = bright.sample(at).rgb;
      const lum = dot(c, vec3(0.2126, 0.7152, 0.0722));
      const over = max(lum.sub(GHOST_FROM), 0);
      const eased = over.div(over.div(GHOST_MOST).add(1));
      const weight = pow(float(1).sub(distance(at, vec2(0.5))), EDGE).mul(scale * scale);
      sum.addAssign(c.mul(eased.div(max(lum, 1e-4))).mul(weight));
    }
    return vec4(sum.mul(vec3(1, 0.86, 0.66)), 1);
  })() as unknown as Node<'vec4'>;
}

/** What the match lays over the whole frame, 0…1: outside the safe circle, just hurt, and low on hull. */
export const SCREEN = { storm: uniform(0), hurt: uniform(0), low: uniform(0) };

/** The lens: how deep the occlusion darkens, the shutter (a share of the frame's motion each pixel is smeared over),
 *  the lens flare's ghosts and the dust they light, the film grain, and how far heat bends the light. */
export const LENS = {
  occlusion: uniform(0.8),
  /** How much of the light gathered off the frame's lit surfaces each surface throws back, and how dark the contact
   *  shadows lie (by day: the night's moon is left to the shadow maps). */
  bounce: uniform(1),
  contact: uniform(0.6),
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

/** What the frame's surfaces throw on each other, as the upscaler composites it: the occlusion, and while they are
 *  drawn, the light gathered with the surface's own colour that takes it, the contact shadows, and the sea's mask (1
 *  off the water). */
interface Light { ao: TextureNode; gi: TextureNode | null; albedo: TextureNode | null; contact: TextureNode | null; dry: TextureNode | null }

/** The scene as the upscaler loads it, clamped as clampedLoads does, occluded and lit by what the frame's surfaces
 *  throw on each other (sampled at the texel's centre), and capped. */
function occludedLoads(node: TextureNode, l: Light): TextureNode {
  const load = node.load.bind(node) as (at: Node) => TextureNode;
  const size = (node as unknown as { size(level?: number): Node<'ivec2'> }).size(0);
  const last = size.sub(ivec2(1, 1));
  (node as unknown as { load(at: Node<'ivec2'>): Node }).load = (at) => {
    const c = load(clamp(at as unknown as Node<'vec2'>, ivec2(0, 0) as unknown as Node<'vec2'>, last as unknown as Node<'vec2'>)) as unknown as Node<'vec4'>;
    const st = vec2(at as unknown as Node<'vec2'>).add(0.5).div(vec2(size as unknown as Node<'vec2'>));
    // the contact shadows lie on what is dry: the sea's own crests would shadow its troughs in a moving speckle
    const dry = l.dry ? (l.dry.sample(st) as unknown as Node<'vec4'>).r : float(1);
    const shade = l.contact ? (l.contact.sample(st) as unknown as Node<'vec4'>).r : float(1);
    const touch = mix(float(1), shade, LENS.contact.mul(dry));
    const o = mix(float(1), (l.ao.sample(st) as unknown as Node<'vec4'>).r.mul(touch), LENS.occlusion);
    const bounce = l.gi && l.albedo
      ? (l.gi.sample(st) as unknown as Node<'vec4'>).rgb.mul((l.albedo.sample(st) as unknown as Node<'vec4'>).rgb).mul(LENS.bounce)
      : vec3(0);
    return min(vec4(c.rgb.mul(o).add(bounce), c.a), vec4(30000));
  };
  return node;
}

/** Screen-space global illumination drawn at a share of the scene pass's pixels: three's node draws at the whole
 *  drawing buffer, which at the screen's own resolution would cost many times what the rest of the frame does. */
class Bounce extends SSGINode {
  scale = 0.5;
  // (three's typings leave setSize out)
  setSize(width: number, height: number): void {
    const base = SSGINode.prototype as unknown as { setSize(this: SSGINode, w: number, h: number): void };
    base.setSize.call(this, Math.max(1, Math.round(width * this.scale)), Math.max(1, Math.round(height * this.scale)));
  }
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
  /** How deep in renders the scene was last drawn. */
  sceneDepth = 0;
  readonly exposure: Exposure;
  /** The occlusion (with the bounce while it is drawn) and the contact shadows, null while parked. */
  readonly occlusion: SSGINode | GTAONode;
  readonly contact: SSSNode | null;
  readonly #renderer: WebGPURenderer;
  readonly #camera: PerspectiveCamera;
  readonly #plain: Node;
  readonly #focused: Node | null = null;
  readonly #spots = uniformArray(Array.from({ length: HAZE_MAX }, () => new Vector4()), 'vec4');
  readonly #depths = uniformArray(Array.from({ length: HAZE_MAX }, () => new Vector4()), 'vec4');
  #focus = false;

  /** `overlay` is drawn over the finished frame at the screen's own resolution, untouched by the upscaler, the
   *  exposure and the tone curve: what is written on the screen rather than lit in the world. */
  constructor(renderer: WebGPURenderer, scene: Scene, camera: PerspectiveCamera, scale: number, overlay?: Scene, sun?: DirectionalLight) {
    this.#renderer = renderer;
    this.#camera = camera;
    const scenePass = pass(scene, camera);
    // each pixel's colour and motion; and while what reads them is drawn, `smear`: how much of its motion a pixel is
    // blurred by, 1 but where a material says otherwise (the sea), and `albedo`: the surface's own colour, which takes
    // the light bounced onto it
    const smeared = !PARKED.motionBlur || !PARKED.contact;
    scenePass.setMRT(mrt({
      output, velocity, ...(smeared ? { smear: float(1) } : {}), ...(PARKED.bounce ? {} : { albedo: diffuseColor }),
    }));
    scenePass.setResolutionScale(scale);
    if (smeared) (scenePass.getTexture('smear') as Texture).type = UnsignedByteType;
    if (!PARKED.bounce) (scenePass.getTexture('albedo') as Texture).type = UnsignedByteType;
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
    const smear = smeared ? scenePass.getTextureNode('smear') : null;
    const beauty = scenePass.getTextureNode('output');
    const depth = clampedLoads(scenePass.getTextureNode('depth'));
    const motion = clampedLoads(scenePass.getTextureNode('velocity'));

    let light: Light;
    this.contact = null;
    if (PARKED.bounce) {
      // ambient occlusion from depth alone at half the scene's resolution, its noise turned each frame for the
      // upscaler to gather; the radius about a hull's beam, so it darkens under a gunwale and where a hull meets the
      // water, not a ship a cable off a cliff
      const occlusion = new GTAONode(depth, null as unknown as Node, camera);
      occlusion.resolutionScale = scale * 0.5;
      occlusion.samples.value = 8;
      occlusion.radius.value = 2.5;
      occlusion.thickness.value = 1.2;
      occlusion.useTemporalFiltering = true;
      this.occlusion = occlusion;
      light = { ao: occlusion.getTextureNode() as unknown as TextureNode, gi: null, albedo: null, contact: null, dry: null };
    } else {
      // occlusion and bounce, from depth alone: normals rebuilt from it, so the smoke and spray drawn over a hull never
      // muddy it. Two slices of eight steps a pixel, its noise turned each frame for the upscaler to gather; the
      // radius reaches a few metres, about a hull's beam, so a sail lights the deck beneath it but a cliff doesn't
      // light a ship a cable off
      const occlusion = new Bounce(beauty, depth, null as unknown as TextureNode, camera);
      occlusion.scale = scale * 0.5;
      occlusion.sliceCount.value = 2;
      occlusion.stepCount.value = 8;
      occlusion.radius.value = 4;
      occlusion.thickness.value = 1.2;
      occlusion.expFactor.value = 1.6;
      occlusion.aoIntensity.value = 1;
      occlusion.giIntensity.value = 1;
      occlusion.useTemporalFiltering = true;
      this.occlusion = occlusion;
      // contact shadows, by day, from the sun
      let contact: TextureNode | null = null;
      if (sun && !PARKED.contact) {
        const c = new SSSNode(depth, camera, sun);
        c.resolutionScale = scale * 0.75;
        c.maxDistance.value = 0.7;
        c.thickness.value = 0.12;
        c.quality.value = 0.5;
        c.useTemporalFiltering = true;
        this.contact = c;
        contact = c.getTextureNode() as unknown as TextureNode;
      }
      light = {
        ao: occlusion.getAONode() as unknown as TextureNode, gi: occlusion.getGINode() as unknown as TextureNode,
        albedo: scenePass.getTextureNode('albedo'), contact, dry: smear,
      };
    }
    // the upscaler reads the scene through its loads: occluded and lit there, and capped, since a glint past
    // half-float's range is stored as infinity, which the upscaler's blend turns into a NaN that spreads as black
    // through its history
    const resolved = taau(occludedLoads(beauty, light), depth, motion, camera) as unknown as { getTextureNode(): TextureNode };
    const sharp = resolved.getTextureNode();

    // heat haze, then motion blur, at the screen's resolution
    const spots = this.#spots, depths = this.#depths;
    const viewZ = scenePass.getViewZNode();
    const moving = PARKED.motionBlur ? null : Fn(() => {
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
      const v = motion.sample(at).xy.mul(vec2(0.5, -0.5)).mul(LENS.shutter).mul(smear!.sample(at).r).toVar();
      const len = length(v);
      v.mulAssign(min(float(1), float(0.05).div(max(len, 1e-5))));
      const sum = vec4(0).toVar();
      const N = 8;
      for (let i = 0; i < N; i++) sum.addAssign(sharp.sample(at.add(v.mul(i / (N - 1) - 0.5))));
      return sum.div(N);
    })();
    const moved = moving ? rtt(moving) : sharp;

    const finish = (hdrIn: Node<'vec4'>): Node<'vec4'> => {
      const glow = bloom(hdrIn, 1, 0.55, 0) as unknown as Node<'vec4'> & { getTextureNode(): TextureNode };
      let hdr = hdrIn.rgb.mul(float(1).sub(BLOOM)).add(glow.rgb.mul(BLOOM)).mul(exposure);
      if (!PARKED.flare) {
        // the brightest of the scatter, exposed, throws ghosts across the lens and lights its dust
        const bright = rtt(glow.rgb.mul(exposure), null, null, { resolutionScale: 0.25 });
        const ghosts = gaussianBlur(rtt(lensGhosts(bright), null, null, { resolutionScale: 0.125 }), null, 6) as unknown as Node<'vec4'>;
        const dust = texture(lensDirt(), screenUV).rgb;
        const lit = max(glow.rgb.mul(exposure).sub(1.6), vec3(0));
        hdr = hdr.add(ghosts.rgb.mul(LENS.flare)).add(lit.mul(dust).mul(LENS.dirt));
      }
      // outside the safe circle the world drains toward a bruised violet, before the tone curve so its light holds
      const lum = dot(hdr, vec3(0.2126, 0.7152, 0.0722));
      hdr = mix(hdr, vec3(lum).mul(vec3(0.55, 0.42, 0.95)).add(hdr.mul(vec3(0.25, 0.15, 0.45))), SCREEN.storm.mul(0.75));
      let ldr = graded(agx(hdr));
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
    if (!PARKED.focus) {
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
    }
    this.pipeline = new RenderPipeline(renderer);
    this.pipeline.outputNode = this.#plain;
    this.exposure = new Exposure(scenePass.getTexture('output') as Texture);
  }

  /** Draws the scene at `scale` of the screen from the next frame, its occlusion at half that. */
  setScale(scale: number): void {
    this.scenePass.setResolutionScale(scale);
    if (this.occlusion instanceof GTAONode) this.occlusion.resolutionScale = scale * 0.5;
    else if (this.occlusion instanceof Bounce) this.occlusion.scale = scale * 0.5;
  }

  /** Takes a lens's depth of field, sharp `distance` metres off, or (null) none. */
  focus(distance: number | null): void {
    const on = distance !== null && this.#focused !== null;
    if (on) FOCUS.distance.value = distance;
    if (on === this.#focus) return;
    this.#focus = on;
    this.pipeline.outputNode = on ? this.#focused! : this.#plain;
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
    // the contact shadows fade with the sun: at night the moon's are left to the shadow maps
    if (this.contact) this.contact.shadowIntensity.value = Math.max(0, 1 - (P.night.value as number) * 1.4);
    this.pipeline.render();
    this.#renderer.compute(this.exposure.passes);
  }
}

