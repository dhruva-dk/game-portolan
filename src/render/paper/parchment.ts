// The parchment the chart is drawn on, rendered on the GPU once at load: a tile of paper whose fibres are a height field
// (nodes.ts), lit from the top left through the normals they make, over the pulp's cloudy formation, the laid and chain
// lines of the mould and a few freckles of foxing. The tile's canvas and its height field go to the chart's drawing kit
// (src/chart/paper.ts), which paints with them.
import {
  DataUtils, HalfFloatType, LinearFilter, NoBlending, NodeMaterial, QuadMesh, RenderTarget, RepeatWrapping, UnsignedByteType, WebGPURenderer,
} from 'three/webgpu';
import {
  abs, clamp, dot, float, floor, fract, length, max, mix, mod, normalize, sin, smoothstep, sRGBTransferOETF, texture, uv, vec2, vec3, vec4,
} from 'three/tsl';
import { fibres, hash, wrapFbm, wrapNoise, type F, type FibreLayer, type V2, type V3 } from './nodes.ts';

/** The sheet's tile, in pixels (shown at half that in CSS pixels, so sharp on a doubled screen). */
export const TILE = 512;

/** Paper's colour (linear). */
const PAPER = vec3(0.8, 0.68, 0.46);

const COARSE: FibreLayer = { cells: 9, per: 2, length: [0.6, 0.98], width: [0.012, 0.03], salt: 3 };
const FINE: FibreLayer = { cells: 30, per: 2, length: [0.45, 0.95], width: [0.025, 0.06], salt: 11 };

export interface Sheets {
  /** The paper tile, for painting on. */
  tile: HTMLCanvasElement;
}

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

  /** The paper's tile, made once. */
  sheets(): Promise<Sheets> {
    return (this.#sheets ??= this.#make());
  }

  async #make(): Promise<Sheets> {
    // the height field first: the sheet's shading and the chart read it
    this.#draw(this.#heightMaterial(), this.height);
    return { tile: canvasOf(await this.#bake(this.#paperMaterial(), TILE, TILE), TILE, TILE) };
  }

  /**
   * The sheet's height field read back: per texel of the tile (TILE², rows from the top), its height, fibre tint,
   * formation and fibre cover, four floats each. The chart's drawing kit (src/chart) soaks its ink by them, so a line
   * thins on the fibres that stand up and pools in the hollows between them, the same fibres the paper shows.
   */
  async fields(): Promise<Float32Array> {
    await this.sheets();
    const raw = (await this.renderer.readRenderTargetPixelsAsync(this.height, 0, 0, TILE, TILE)) as Uint16Array;
    const out = new Float32Array(TILE * TILE * 4);
    for (let k = 0; k < out.length; k++) out[k] = DataUtils.fromHalfFloat(raw[k]);
    return out;
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
