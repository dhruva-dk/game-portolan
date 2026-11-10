// The frame after the scene. The scene is drawn at a share of the canvas (renderer.ts, resolution.ts), everything below
// the upscale at that same size; over it:
// - light: a bloom blurs a few percent of everything (a lens's scatter, not a glow on chosen things);
// - exposure and tone: the colour script's exposure for the hour and the weather, AgX and the grade map it to the
//   screen (grade.ts);
// - the match's own washes: the Storm's violet outside the safe circle, a hit's red edge, a failing hull's pulse;
// - FXAA 3.11 and a Catmull-Rom upscale to the canvas (the first Portolan's), reading the finished picture;
// - a dither finer than a step of the screen's colour, which breaks the banding in the sky's long gradients.
import { RenderPipeline, UnsignedByteType, Vector2, type PassNode, type Texture, type PerspectiveCamera, type Scene, type WebGPURenderer } from 'three/webgpu';
import type { Node } from 'three/webgpu';
import { Fn, If, abs, clamp, dot, float, floor, fract, int, max, min, mix, pass, rtt, screenUV, select, sin, smoothstep, sqrt, uniform, vec2, vec3, vec4 } from 'three/tsl';
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

/** The picture at the scene's own size. */
interface Image {
  setResolutionScale(s: number): unknown;
  renderTarget: { width: number; height: number };
}

type V2 = Node<'vec2'>;
type V3 = Node<'vec3'>;
type V4 = Node<'vec4'>;
/** How FXAA walks along an edge, in texels: finer at first, then in strides. */
const WALK = [1.5, 2, 2, 2, 2, 4, 8, 8];

/** The picture brought up to the canvas: FXAA where it finds an edge, else a Catmull-Rom upscale in five bilinear taps. */
function finish(tap: (q: V2) => V4, px: V2): V3 {
  const catmull = (uv: V2): V3 => {
    const size = vec2(1).div(px), pos = uv.mul(size).toVar(), c = floor(pos.sub(0.5)).add(0.5).toVar(), f = pos.sub(c).toVar();
    const w0 = f.mul(f.mul(f.mul(-0.5).add(1)).add(-0.5)).toVar(), w1 = f.mul(f).mul(f.mul(1.5).add(-2.5)).add(1).toVar();
    const w2 = f.mul(f.mul(f.mul(-1.5).add(2)).add(0.5)).toVar(), w3 = f.mul(f).mul(f.mul(0.5).add(-0.5)).toVar();
    const w12 = w1.add(w2).toVar();
    const t0 = c.sub(1).mul(px).toVar(), t3 = c.add(2).mul(px).toVar(), t12 = c.add(w2.div(w12)).mul(px).toVar();
    const a = w12.x.mul(w0.y), b = w0.x.mul(w12.y), m = w12.x.mul(w12.y), d = w3.x.mul(w12.y), e = w12.x.mul(w3.y);
    const sum = tap(vec2(t12.x, t0.y)).rgb.mul(a).add(tap(vec2(t0.x, t12.y)).rgb.mul(b)).add(tap(t12).rgb.mul(m))
      .add(tap(vec2(t3.x, t12.y)).rgb.mul(d)).add(tap(vec2(t12.x, t3.y)).rgb.mul(e));
    return sum.div(a.add(b).add(m).add(d).add(e)) as V3;
  };
  return Fn(() => {
    const uv = screenUV.toVar();
    const luma = (q: V2) => tap(q).a.toVar();
    const out = vec3(0).toVar();
    const x = vec2(px.x, 0).toVar(), y = vec2(0, px.y).toVar();
    const m = luma(uv), n = luma(uv.add(y)), s = luma(uv.sub(y)), e = luma(uv.add(x)), w = luma(uv.sub(x));
    const hi = max(max(max(n, s), max(e, w)), m).toVar(), lo = min(min(min(n, s), min(e, w)), m).toVar(), range = hi.sub(lo).toVar();
    If(range.lessThan(max(0.0312, hi.mul(0.125))), () => {
      out.assign(catmull(uv));
    }).Else(() => {
      const nw = luma(uv.sub(x).add(y)), ne = luma(uv.add(px)), sw = luma(uv.sub(px)), se = luma(uv.add(x).sub(y));
      let sub = clamp(abs(n.add(s).add(e).add(w).mul(2).add(nw).add(ne).add(sw).add(se).div(12).sub(m)).div(range), 0, 1).toVar();
      sub = sub.mul(sub).mul(sub.mul(-2).add(3)).toVar();
      sub = sub.mul(sub).mul(0.75).toVar();
      const horz = abs(nw.add(ne).sub(n.mul(2))).add(abs(w.add(e).sub(m.mul(2))).mul(2)).add(abs(sw.add(se).sub(s.mul(2))))
        .greaterThanEqual(abs(nw.add(sw).sub(w.mul(2))).add(abs(n.add(s).sub(m.mul(2))).mul(2)).add(abs(ne.add(se).sub(e.mul(2))))).toVar();
      const l1 = select(horz, s, w).toVar(), l2 = select(horz, n, e).toVar();
      const steep2 = abs(l2.sub(m)).greaterThanEqual(abs(l1.sub(m))).toVar();
      const grad = max(abs(l1.sub(m)), abs(l2.sub(m))).mul(0.25).toVar(), avg = select(steep2, l2, l1).add(m).mul(0.5).toVar();
      const stepLen = select(horz, px.y, px.x).mul(select(steep2, float(1), float(-1))).toVar();
      const along = select(horz, x, y).toVar(), across = select(horz, vec2(0, stepLen), vec2(stepLen, 0));
      const base = uv.add(across.mul(0.5)).toVar();
      const pn = base.sub(along).toVar(), pp = base.add(along).toVar();
      const en = luma(pn).sub(avg).toVar(), ep = luma(pp).sub(avg).toVar();
      const dn = abs(en).greaterThanEqual(grad).toVar(), dp = abs(ep).greaterThanEqual(grad).toVar();
      for (const stride of WALK) {
        If(dn.and(dp).not(), () => {
          If(dn.not(), () => {
            pn.subAssign(along.mul(stride));
            en.assign(luma(pn).sub(avg));
            dn.assign(abs(en).greaterThanEqual(grad));
          });
          If(dp.not(), () => {
            pp.addAssign(along.mul(stride));
            ep.assign(luma(pp).sub(avg));
            dp.assign(abs(ep).greaterThanEqual(grad));
          });
        });
      }
      const distN = select(horz, uv.x.sub(pn.x), uv.y.sub(pn.y)).toVar(), distP = select(horz, pp.x.sub(uv.x), pp.y.sub(uv.y)).toVar();
      const good = select(distN.lessThan(distP), en, ep).lessThan(0).xor(m.sub(avg).lessThan(0));
      const edge = select(good, float(0.5).sub(min(distN, distP).div(distN.add(distP))), float(0));
      const off = max(edge, sub).mul(stepLen).toVar();
      out.assign(tap(uv.add(select(horz, vec2(0, off), vec2(off, 0)))).rgb);
    });
    return out;
  })() as V3;
}

export class Post {
  readonly pipeline: RenderPipeline;
  readonly scenePass: PassNode;
  /** How deep in renders the scene was last drawn. */
  sceneDepth = 0;
  readonly #glow: { setResolutionScale(s: number): unknown };
  readonly #image: Image;
  readonly #texel = uniform(new Vector2(1, 1));

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
    this.#glow = glow;
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
    // finished at the scene's own size, its light in the alpha for FXAA to find edges by, and brought up to the canvas
    const image = rtt(vec4(ldr, sqrt(max(dot(ldr, LUMA), 0))));
    image.setResolutionScale(scale);
    this.#image = image as unknown as Image;
    ldr = clamp(finish((q) => image.sample(q).level(int(0)) as unknown as V4, this.#texel as unknown as V2), 0, 1) as typeof ldr;
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

  /** Draws the scene at `scale` of the canvas from now on. */
  rescale(scale: number): void {
    this.scenePass.setResolutionScale(scale);
    this.#glow.setResolutionScale(scale * 0.5);
    this.#image.setResolutionScale(scale);
  }

  /** Draws the frame. */
  render(): void {
    const { width, height } = this.#image.renderTarget;
    (this.#texel.value as Vector2).set(1 / Math.max(1, width), 1 / Math.max(1, height));
    this.pipeline.render();
  }
}
