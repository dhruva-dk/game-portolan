// The parchment the interface is made of, rendered on the GPU once at load and handed to the page as images:
// - the sheet: a tile of paper whose fibres are a height field (nodes.ts), lit from the top left through the normals
//   they make, over the pulp's cloudy formation, the laid and chain lines of the mould and a few freckles of foxing;
// - its deckled edge, as a mask in nine slices: the sheet thinning to translucence over its last millimetre or two,
//   with fibres standing out past the edge, the way a handmade sheet's edge does;
// - a ruled ink frame in nine slices, laid with a quill: the stroke swelling and thinning with the pressure, the ink
//   wicking out along the fibres it crosses and pooling where the quill stopped, past each corner. The ink is laid
//   over the paper by Kubelka–Munk (nodes.ts), so it reads as ink soaked into paper rather than a brown line on top;
// - wax seals, a red, a gold and a black: a puddle of wax with a pooled rim and the ring of the matrix pressed into
//   it, lit with a wrapped diffuse for the light the wax lets through, a soft GGX highlight and a velvet sheen at the
//   grazing edge.
// Each is drawn to a target, read back and made an image URL; the sheet's own canvas and height field are kept for
// the chart (chart.ts paints with them).
import {
  ClampToEdgeWrapping, DataTexture, FloatType, HalfFloatType, LinearFilter, NearestFilter, NoBlending, NodeMaterial, QuadMesh, RGBAFormat,
  RenderTarget, RepeatWrapping, UnsignedByteType, Vector2, WebGPURenderer,
} from 'three/webgpu';
import {
  abs, atan, clamp, dot, exp, float, floor, fract, length, max, min, mix, mod, normalize, pow, sin, smoothstep, sqrt, sRGBTransferOETF,
  texture, uniform, uniformArray, uv, vec2, vec3, vec4,
} from 'three/tsl';
import { PIGMENT, fibres, hash, over, overlay, wrapFbm, wrapNoise, type F, type FibreLayer, type V2, type V3 } from './nodes.ts';

/** The sheet's tile, in pixels (shown at half that in CSS pixels, so sharp on a doubled screen). */
export const TILE = 512;
/** One slice of the nine-slice edges, in pixels. */
export const SLICE = 64;
const SEAL = 256;

/** Paper's colour (linear), and its mean as the ground an ink overlay is matched against. */
const PAPER = vec3(0.8, 0.68, 0.46);
const PAPER_MEAN = vec3(0.78, 0.66, 0.44);

const COARSE: FibreLayer = { cells: 9, per: 2, length: [0.6, 0.98], width: [0.012, 0.03], salt: 3 };
const FINE: FibreLayer = { cells: 30, per: 2, length: [0.45, 0.95], width: [0.025, 0.06], salt: 11 };
/** The fibres at an edge: fine ones, the size the deckle frays into. */
const FRINGE: FibreLayer = { cells: 9, per: 3, length: [0.5, 0.95], width: [0.02, 0.05], salt: 29 };

export interface Sheets {
  /** The paper tile, the deckled mask, the ruled frame (both nine-slices of SLICE), and the seals by colour. */
  paper: string;
  torn: string;
  rule: string;
  seal: { red: string; gold: string; black: string };
  /** The tile itself, for painting on. */
  tile: HTMLCanvasElement;
}

type SealKind = keyof Sheets['seal'];

/** Height of the paper here: its fibres, the pulp's formation, the mould's lines. Over a unit tile, wrapping. */
function paperHeight(p: V2): { h: F; tint: F; cover: F; cloud: F } {
  const coarse = fibres(p, COARSE), fine = fibres(p, FINE);
  const cloud = wrapFbm(p, 4, 5, 41);
  // laid lines close together one way, chain lines far apart the other
  const laid = sin(p.y.mul(Math.PI * 2 * 56)).mul(0.012);
  const chain = smoothstep(0.012, 0, abs(fract(p.x.mul(4)).sub(0.5)).sub(0.488)).mul(-0.04);
  const h = max(coarse.height.mul(0.35), fine.height.mul(0.22)).add(cloud.mul(0.3)).add(laid).add(chain);
  return { h: h as F, tint: coarse.tint.add(fine.tint.mul(0.5)) as F, cover: max(coarse.cover, fine.cover) as F, cloud };
}

/** The light the sheet is seen by: from the top left, low enough to rake the fibres. */
const LIGHT = normalize(vec3(-0.5, 0.55, 0.67));

export class Parchment {
  readonly renderer: WebGPURenderer;
  readonly #quad = new QuadMesh(new NodeMaterial());
  /** The sheet's height field (r), fibre tint (g), formation (b) and fibre cover (a), wrapping. */
  readonly height: RenderTarget;
  #sheets: Promise<Sheets> | null = null;

  private constructor(renderer: WebGPURenderer) {
    this.renderer = renderer;
    this.height = new RenderTarget(TILE, TILE, { type: HalfFloatType, depthBuffer: false });
    const t = this.height.texture;
    t.wrapS = t.wrapT = RepeatWrapping;
    t.minFilter = t.magFilter = LinearFilter;
  }

  /** On the game's renderer, or on one of its own (a page with no stage). */
  static async create(renderer?: WebGPURenderer): Promise<Parchment> {
    if (!renderer) {
      renderer = new WebGPURenderer({ antialias: false, alpha: true });
      await renderer.init();
    }
    return new Parchment(renderer);
  }

  /** Every sheet, made once. */
  sheets(): Promise<Sheets> {
    return (this.#sheets ??= this.#make());
  }

  async #make(): Promise<Sheets> {
    // the height field first: the sheet's shading and the chart read it
    this.#draw(this.#heightMaterial(), this.height);
    const [paper, torn, rule, red, gold, black] = await Promise.all([
      this.#bake(this.#paperMaterial(), TILE, TILE),
      this.#bake(this.#deckleMaterial(), SLICE * 3, SLICE * 3),
      this.#bake(this.#ruleMaterial(), SLICE * 3, SLICE * 3),
      this.#bake(this.#sealMaterial('red'), SEAL, SEAL),
      this.#bake(this.#sealMaterial('gold'), SEAL, SEAL),
      this.#bake(this.#sealMaterial('black'), SEAL, SEAL),
    ]);
    const tile = canvasOf(paper, TILE, TILE);
    return {
      paper: await urlOf(tile, 'image/jpeg'),
      torn: await urlOf(canvasOf(torn, SLICE * 3, SLICE * 3)),
      rule: await urlOf(canvasOf(rule, SLICE * 3, SLICE * 3)),
      seal: {
        red: await urlOf(canvasOf(red, SEAL, SEAL)),
        gold: await urlOf(canvasOf(gold, SEAL, SEAL)),
        black: await urlOf(canvasOf(black, SEAL, SEAL)),
      },
      tile,
    };
  }

  /** Draws a material over a whole target. */
  #draw(m: NodeMaterial, target: RenderTarget): void {
    const r = this.renderer, was = r.getRenderTarget();
    m.blending = NoBlending;
    m.depthTest = m.depthWrite = false;
    this.#quad.material = m;
    r.setRenderTarget(target);
    this.#quad.render(r);
    r.setRenderTarget(was);
  }

  /** Draws a material into a fresh target and reads it back, as 8-bit RGBA rows from the top. */
  async #bake(m: NodeMaterial, w: number, h: number): Promise<Uint8Array> {
    const rt = new RenderTarget(w, h, { type: UnsignedByteType, depthBuffer: false });
    this.#draw(m, rt);
    try {
      return (await this.renderer.readRenderTargetPixelsAsync(rt, 0, 0, w, h)) as Uint8Array;
    } finally {
      rt.dispose();
      m.dispose();
    }
  }

  // ---------------------------------------------------------------- the sheet

  #heightMaterial(): NodeMaterial {
    const m = new NodeMaterial();
    const p = paperHeight(uv() as V2);
    m.fragmentNode = vec4(p.h, p.tint, p.cloud, p.cover);
    return m;
  }

  /** The sheet's colour at `p` (a unit tile): its albedo by the fibres' tint and the formation, lit through the
   *  normals of its height field, linear. */
  sheetAt(p: V2): V3 {
    const H = this.height.texture, e = 1 / TILE;
    const at = (dx: number, dy: number) => texture(H, p.add(vec2(dx * e, dy * e))).r;
    const here = texture(H, p);
    const n = normalize(vec3(at(-1, 0).sub(at(1, 0)).mul(2.4), at(0, -1).sub(at(0, 1)).mul(2.4), 1));
    const shade = mix(float(1), dot(n, LIGHT).div(LIGHT.z), 0.5);
    const tint = here.g, cloud = here.b;
    let albedo = PAPER.mul(cloud.mul(0.09).add(1));
    // dark fibres browner, pale ones whiter
    albedo = mix(albedo, albedo.mul(vec3(0.8, 0.7, 0.55)), clamp(tint.negate(), 0, 0.45));
    albedo = mix(albedo, vec3(0.88, 0.8, 0.62), clamp(tint, 0, 0.3));
    // foxing: a few rust freckles, ragged at the edge
    const cell = floor(p.mul(5)), local = fract(p.mul(5)).sub(vec2(hash(mod(cell, 5) as V2, 71), hash(mod(cell, 5) as V2, 72)));
    const spot = hash(mod(cell, 5) as V2, 73).greaterThan(0.72).select(
      smoothstep(0.06, 0.0, length(local).add(wrapNoise(p.mul(80) as V2, 80, 74).mul(0.03))), float(0));
    albedo = mix(albedo, vec3(0.5, 0.27, 0.1), spot.mul(0.28));
    return albedo.mul(shade) as V3;
  }

  #paperMaterial(): NodeMaterial {
    const m = new NodeMaterial();
    m.fragmentNode = vec4(oetf(this.sheetAt(uv() as V2)), 1);
    return m;
  }

  // ---------------------------------------------------------------- the deckle

  #deckleMaterial(): NodeMaterial {
    const m = new NodeMaterial();
    const S = SLICE * 3, T = SLICE, px = uv().mul(S) as V2;
    // each side's edge wanders, repeating every slice so the sides tile round any panel
    const edge = (u: F, salt: number): F => wrapFbm(vec2(u.div(T), salt * 0.37) as V2, 2, 4, salt).mul(T * 0.2).add(T * 0.46) as F;
    const L = edge(px.y, 1), R = float(S).sub(edge(px.y, 2)), Tp = edge(px.x, 3), B = float(S).sub(edge(px.x, 4));
    const rad = T * 0.12;
    const dx = max(L.sub(px.x), px.x.sub(R)).add(rad), dy = max(Tp.sub(px.y), px.y.sub(B)).add(rad);
    const sd = length(max(vec2(dx, dy), 0)).add(min(max(dx, dy), 0)).sub(rad);
    // fibres as the paper frays: cells about a slice across, wrapping every slice
    const f = fibres(px.div(T) as V2, FRINGE);
    // inside, the sheet thins over its last few pixels, less where a fibre runs; outside, only fibres
    const body = smoothstep(0.75, -0.75, sd);
    const thin = mix(mix(0.5, 0.85, f.cover), float(1), smoothstep(0, 7, sd.negate()));
    const fringe = f.cover.mul(smoothstep(9, 0, sd)).mul(0.85);
    m.fragmentNode = vec4(1, 1, 1, max(body.mul(thin), fringe));
    return m;
  }

  // ---------------------------------------------------------------- the ruled frame

  #ruleMaterial(): NodeMaterial {
    const m = new NodeMaterial();
    const S = SLICE * 3, T = SLICE, px = uv().mul(S) as V2;
    const inset = T * 0.5, overshoot = 7;
    // one ruled side: a line at `at` (wandering a pixel, repeating every slice) from `from` to `to` along it
    const side = (along: F, across: F, at: number, salt: number): F => {
      const wob = wrapNoise(vec2(along.div(T).mul(3), salt) as V2, 3, salt).sub(0.5).mul(1.6);
      const from = inset - overshoot, to = S - inset + overshoot;
      const off = across.sub(float(at).add(wob));
      const beyond = max(float(from).sub(along), along.sub(to));
      const d = length(vec2(off, max(beyond, 0)));
      // the quill's pressure swells and thins the stroke; it pools a blot where it lifts, past the corner
      const press = wrapNoise(vec2(along.div(T).mul(2), salt + 5) as V2, 2, salt + 7).mul(0.6).add(0.75);
      const end = max(min(along.sub(from), float(to).sub(along)), 0);
      const pool = exp(end.mul(-0.45)).mul(1.3);
      const width = press.mul(1.05).add(pool);
      // the ink wicks along the fibres it crosses
      const f = fibres(px.div(T) as V2, FRINGE);
      const wick = f.cover.mul(smoothstep(width.add(2.6), width, d)).mul(0.45);
      const stroke = smoothstep(width.add(0.7), width.sub(0.5), d);
      return max(stroke.mul(press.mul(0.5).add(0.6).add(pool.mul(0.8))), wick) as F;
    };
    const x = max(max(side(px.y, px.x, inset, 1), side(px.y, px.x, S - inset, 2)), max(side(px.x, px.y, inset, 3), side(px.x, px.y, S - inset, 4)));
    const o = overlay(PIGMENT.ink, x.mul(1.6) as F, PAPER_MEAN);
    m.fragmentNode = vec4(oetf(o.colour), o.alpha.mul(smoothstep(0, 0.04, x)));
    return m;
  }

  // ---------------------------------------------------------------- wax seals

  #sealMaterial(kind: SealKind): NodeMaterial {
    const m = new NodeMaterial();
    const WAX: Record<SealKind, readonly [number, number, number]> = { red: [0.2, 0.012, 0.007], gold: [0.4, 0.21, 0.035], black: [0.018, 0.015, 0.016] };
    const base = vec3(...WAX[kind]);
    const salt = kind === 'red' ? 1 : kind === 'gold' ? 2 : 3;
    // the puddle's outline: a circle pushed out and in where the wax ran
    const rim = (q: V2): F => {
      const a = atan(q.y, q.x).div(Math.PI * 2).add(0.5);
      return wrapNoise(vec2(a.mul(7), salt) as V2, 7, salt + 3).mul(0.09).add(wrapNoise(vec2(a.mul(19), salt) as V2, 19, salt + 4).mul(0.035)).add(0.82) as F;
    };
    const heightAt = (q: V2): F => {
      const r = length(q), s = r.div(rim(q));
      const body = sqrt(max(float(1).sub(pow(min(s, 1), 7)), 0)).mul(0.55);
      // the matrix pressed in, the wax it pushed aside standing as a lip, and the beaded ring cut in it (raised in the wax)
      const Ri = 0.6;
      const press = smoothstep(Ri + 0.035, Ri - 0.02, r).mul(0.17);
      const lip = exp(r.sub(Ri + 0.05).div(0.045).pow(2).negate()).mul(0.07);
      const ang = atan(q.y, q.x).div(Math.PI * 2).mul(28);
      const beads = smoothstep(0.045, 0.02, length(vec2(fract(ang).sub(0.5).mul(0.112), r.sub(0.5)))).mul(0.04);
      const ring = smoothstep(0.016, 0.004, abs(r.sub(0.43))).mul(0.03);
      const grain = wrapNoise(q.add(1).mul(40) as V2, 80, salt + 9).mul(0.006);
      return body.sub(press).add(lip).add(beads).add(ring).add(grain) as F;
    };
    const q = uv().mul(2).sub(1) as V2, e = 2 / SEAL;
    const h = heightAt(q), hx = heightAt(q.add(vec2(e, 0)) as V2), hy = heightAt(q.add(vec2(0, e)) as V2);
    const n = normalize(vec3(h.sub(hx).div(e), h.sub(hy).div(e), 1).mul(vec3(0.8, 0.8, 1)));
    const V = vec3(0, 0, 1), L = LIGHT, Hh = normalize(L.add(V));
    const nl = dot(n, L), nv = max(dot(n, V), 0), nh = max(dot(n, Hh), 0);
    // wax lets light through: a wrapped diffuse, and a glow where it is thin at the rim
    const diffuse = clamp(nl.add(0.45).div(1.45), 0, 1);
    const s = length(q).div(rim(q));
    const through = base.mul(vec3(1.5, 0.75, 0.6)).mul(smoothstep(0.75, 1, s)).mul(0.35);
    // a soft highlight (GGX), and a velvet sheen at the grazing edges (Charlie-like)
    const a2 = float(0.32 * 0.32).mul(0.32 * 0.32);
    const D = a2.div(nh.mul(nh).mul(a2.sub(1)).add(1).pow(2).mul(Math.PI));
    const fres = float(0.04).add(float(0.96).mul(pow(float(1).sub(max(dot(Hh, V), 0)), 5)));
    const spec = D.mul(fres).mul(max(nl, 0)).mul(0.6);
    const sheen = pow(float(1).sub(nv), 3).mul(0.22).mul(diffuse);
    const sky = mix(vec3(0.05, 0.045, 0.04), vec3(0.3, 0.29, 0.27), n.y.mul(0.5).add(0.5)).mul(pow(float(1).sub(nv), 2).mul(0.6).add(0.05));
    const lit = base.mul(diffuse.mul(1.1).add(0.1)).add(through).add(vec3(spec)).add(base.add(0.06).mul(sheen)).add(sky.mul(0.5));
    // a gentle shoulder so the highlight rolls off rather than clipping
    const toned = lit.div(lit.mul(0.7).add(1));
    const alpha = smoothstep(1.0, 0.985, s);
    m.fragmentNode = vec4(oetf(toned as V3), alpha);
    return m;
  }

  // ---------------------------------------------------------------- the chart

  #chart: { material: NodeMaterial; mask: DataTexture; sailed: ReturnType<typeof uniformArray> } | null = null;

  /**
   * The career's chart of the world, `w` × `h` pixels (2:1): the paper, and on it the seas you've sailed in watercolour,
   * ultramarine over deep water and viridian over the shoals with their edges darkened where the wash dried, ochre and
   * sienna on the land, settling into the paper's hollows; their coasts in iron-gall ink that bleeds into the fibres;
   * the borders between seas dotted in ink; and two wind roses' rhumb lines in vermilion. The seas you haven't sailed are
   * bare paper with their borders in faint pencil. `mask` is the world sampled on an equirectangular grid: each
   * cell's region and ground height.
   */
  async chart(w: number, h: number, mask: { width: number; height: number; region: Uint8Array; ground: Float32Array }, sailed: ArrayLike<number>): Promise<Uint8Array> {
    await this.sheets();
    const c = (this.#chart ??= this.#chartMaterial(mask));
    for (let k = 0; k < 16; k++) (c.sailed.array as number[])[k] = sailed[k] ?? 0;
    const rt = new RenderTarget(w, h, { type: UnsignedByteType, depthBuffer: false });
    this.#chartPx.value.set(w, h);
    this.#draw(c.material, rt);
    try {
      return (await this.renderer.readRenderTargetPixelsAsync(rt, 0, 0, w, h)) as Uint8Array;
    } finally {
      rt.dispose();
    }
  }

  readonly #chartPx = uniform(new Vector2(1024, 512));

  #chartMaterial(mask: { width: number; height: number; region: Uint8Array; ground: Float32Array }) {
    const MW = mask.width, MH = mask.height;
    // the mask as a texture: region in r (nearest), ground in g (filtered; the coast is its zero)
    const data = new Float32Array(MW * MH * 4);
    for (let k = 0; k < MW * MH; k++) {
      data[k * 4] = mask.region[k];
      data[k * 4 + 1] = mask.ground[k];
    }
    const tex = new DataTexture(data, MW, MH, RGBAFormat, FloatType);
    tex.wrapS = RepeatWrapping;
    tex.wrapT = ClampToEdgeWrapping;
    tex.minFilter = tex.magFilter = NearestFilter;
    tex.flipY = false;
    tex.needsUpdate = true;
    const sailed = uniformArray(new Array(16).fill(0), 'float');
    const m = new NodeMaterial();
    const st = uv() as V2;
    // the grid's rows run north to south; the target's uv runs bottom to top
    const g = vec2(st.x, st.y.oneMinus()) as V2;
    const px = this.#chartPx;
    const cellPx = px.x.div(MW);
    // ground, bilinear by hand (the float texture is sampled nearest), and its gradient in cells
    const ground = (at: V2): F => {
      const c = at.mul(vec2(MW, MH)).sub(0.5), i = floor(c), f = fract(c);
      const s = (dx: number, dy: number): F => texture(tex, i.add(vec2(dx, dy)).add(0.5).div(vec2(MW, MH))).g as F;
      return mix(mix(s(0, 0), s(1, 0), f.x), mix(s(0, 1), s(1, 1), f.x), f.y) as F;
    };
    const e = vec2(0.5 / MW, 0.5 / MH);
    const gh = ground(g), gx = ground(g.add(vec2(e.x, 0)) as V2).sub(ground(g.sub(vec2(e.x, 0)) as V2)), gy = ground(g.add(vec2(0, e.y)) as V2).sub(ground(g.sub(vec2(0, e.y)) as V2));
    const slope = max(length(vec2(gx, gy)), 1e-3);
    // distance to the coast, in output pixels
    const coastPx = abs(gh).div(slope).mul(cellPx);
    // which sea: the nearest cell's region; whether it, or a neighbour, is sailed (soft, over the four nearest)
    const cellAt = (at: V2) => texture(tex, at).r;
    const known = (at: V2): F => sailed.element(cellAt(at).toInt()) as unknown as F;
    const dx = 0.5 / MW, dy = 0.5 / MH;
    const near = known(g.add(vec2(dx, dy)) as V2).add(known(g.add(vec2(-dx, dy)) as V2))
      .add(known(g.add(vec2(dx, -dy)) as V2)).add(known(g.add(vec2(-dx, -dy)) as V2)).mul(0.25);
    const r0 = cellAt(g), border = min(max(
      max(abs(cellAt(g.add(vec2(dx * 2, 0)) as V2).sub(r0)), abs(cellAt(g.sub(vec2(dx * 2, 0)) as V2).sub(r0))),
      max(abs(cellAt(g.add(vec2(0, dy * 2)) as V2).sub(r0)), abs(cellAt(g.sub(vec2(0, dy * 2)) as V2).sub(r0))),
    ), 1);
    // the paper itself, at its own scale (a tile is 512 output pixels)
    const tileUv = st.mul(px).div(TILE) as V2;
    const paperH = texture(this.height.texture, tileUv).r;
    const paper = this.sheetAt(tileUv);
    // granulation: pigment settles in the paper's hollows
    const settle = float(1).add(float(0.35).sub(paperH).mul(0.9));
    const wobble = wrapFbm(g.mul(vec2(2, 1)) as V2, 24, 3, 91).mul(0.25);
    // the washes, laid only in seas you know: water deeper blue, the shoals green; land ochre, the heights sienna
    const sea = gh.lessThan(0);
    const deep = smoothstep(-3, -45, gh);
    const edge = exp(coastPx.div(5).negate()).mul(1.1);
    const water = deep.mul(0.55).add(0.18).add(wobble).mul(settle).mul(float(1).add(edge)).mul(near);
    const shoal = float(1).sub(deep).mul(0.5).mul(settle).mul(near);
    const high = smoothstep(4, 22, gh);
    const land = float(0.35).add(wobble).mul(settle).mul(float(1).add(edge.mul(0.6))).mul(near);
    let col: V3 = paper;
    col = sea.select(over(PIGMENT.viridian, shoal, col), over(PIGMENT.ochre, land, col)) as V3;
    col = sea.select(over(PIGMENT.ultramarine, water, col), over(PIGMENT.sienna, high.mul(0.5).mul(settle).mul(near) as F, col)) as V3;
    // rhumb lines from two wind roses, in vermilion, faint
    let rhumb: F = float(0);
    for (const [cx, cy] of [[0.27, 0.62], [0.74, 0.36]] as const) {
      const v = st.mul(px).sub(vec2(cx, 1 - cy).mul(px));
      const a = atan(v.y, v.x).div(Math.PI * 2 / 16);
      const off = abs(fract(a.add(0.5)).sub(0.5)).mul(length(v)).mul(Math.PI * 2 / 16);
      rhumb = max(rhumb, smoothstep(1.1, 0.3, off)) as F;
    }
    col = over(PIGMENT.vermilion, rhumb.mul(0.12) as F, col);
    // the coast in iron-gall ink, a pixel or so wide, bleeding into the fibres; known seas only
    const fib = texture(this.height.texture, tileUv).a;
    const coast = smoothstep(1.2, 0.3, coastPx.sub(fib.mul(0.5))).mul(near);
    const stipple = smoothstep(2.4, 0.8, coastPx).mul(wrapNoise(st.mul(px).div(3) as V2, 4096, 7).greaterThan(0.6).select(float(1), float(0))).mul(near).mul(0.4);
    col = over(PIGMENT.ink, coast.mul(0.9).add(stipple).mul(settle) as F, col);
    // the borders between seas: dotted ink where known, faint pencil where not
    const dots = smoothstep(0.35, 0.15, abs(fract(st.x.add(st.y).mul(px.x).div(7)).sub(0.5)));
    const pencil = border.mul(near.greaterThan(0.01).select(dots.mul(0.6), float(0.22)));
    col = over(PIGMENT.ink, pencil as F, col);
    // the neat line round it all
    const fromEdge = min(min(st.x, st.x.oneMinus()).mul(px.x), min(st.y, st.y.oneMinus()).mul(px.y));
    col = over(PIGMENT.ink, smoothstep(3.5, 2, fromEdge).mul(1.2) as F, col);
    m.fragmentNode = vec4(oetf(col), 1);
    return { material: m, mask: tex, sailed };
  }
}

/** Linear colour into sRGB, as the 8-bit targets hold it. */
const oetf = (c: V3): V3 => sRGBTransferOETF(c) as unknown as V3;

/** RGBA rows (from the top) into a canvas. */
function canvasOf(px: Uint8Array, w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const img = new ImageData(w, h);
  img.data.set(px.subarray(0, w * h * 4));
  c.getContext('2d')!.putImageData(img, 0, 0);
  return c;
}

async function urlOf(c: HTMLCanvasElement, type = 'image/png'): Promise<string> {
  const blob = await new Promise<Blob | null>((ok) => c.toBlob(ok, type, 0.9));
  if (!blob) throw new Error('parchment: the sheet could not be encoded');
  return URL.createObjectURL(blob);
}
