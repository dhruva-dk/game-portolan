// The sheet every mark is made on, from the GPU parchment painter (src/render/paper): its paper tile and the height
// field under it. From the field come the grains every ink is laid through, so ink and paper share their fibres:
// - an ink's body is densest in the hollows between fibres and thins where a fibre stands up, as a quill's line does;
// - its wick is the ink drawn along the fibres a stroke crosses, so the line feathers at its edge;
// - a wash's granulation is pigment settled into the hollows;
// - gold and silver leaf are their own tiles: squares of leaf laid edge over edge, crinkled, burnished in streaks.
// Every grain is a repeating pattern at the paper's own scale (a tile texel is half a CSS pixel), anchored where the
// paper is, so a stroke laid over a sheet soaks into the fibres that sheet shows.
import type { Parchment } from '../render/paper/parchment.ts';
import { INKS, rgbOf, type InkName } from './inks.ts';
import { clamp, fbm2, hash, noise2, rng } from './noise.ts';

/** A canvas of a size in device pixels. */
export function canvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w));
  c.height = Math.max(1, Math.ceil(h));
  return c;
}

export const ctx = (c: HTMLCanvasElement): CanvasRenderingContext2D => c.getContext('2d')!;

/** What the parchment painter hands the kit: its paper tile and fields (height, tint, formation, cover per texel). */
export interface PaperSource {
  tile: HTMLCanvasElement;
  fields: Float32Array;
  size: number;
}

/** CSS pixels per tile texel: the tile is drawn at half its size, sharp on a doubled screen. */
export const TEXEL = 0.5;

export class Paper {
  readonly size: number;
  /** The paper itself. */
  readonly surface: CanvasPattern;
  /** Its mean colour, for anything that has to stand in for it (sRGB 0..255). */
  readonly mean: [number, number, number];
  readonly #fields: Float32Array;
  readonly #z: Float32Array;
  readonly #cover: Float32Array;
  readonly #cloud: Float32Array;
  readonly #inks = new Map<string, CanvasPattern>();
  readonly #wicks = new Map<string, CanvasPattern>();
  readonly #washes = new Map<string, CanvasPattern>();
  readonly #leaf = new Map<string, CanvasPattern>();
  readonly #scratch = canvas(1, 1).getContext('2d')!;

  constructor(src: PaperSource) {
    this.size = src.size;
    this.#fields = src.fields;
    // the painter's fibres stand out for a panel seen whole; under ink and at arm's length they are calmed a little
    const calm = canvas(src.size, src.size), cg = ctx(calm);
    cg.drawImage(src.tile, 0, 0);
    cg.fillStyle = 'rgba(240,228,204,0.48)';
    cg.fillRect(0, 0, src.size, src.size);
    this.surface = this.#scratch.createPattern(calm, 'repeat')!;
    const n = src.size * src.size;
    // the height as standard scores, so every grain reads it the same way whatever the painter's scale
    let m = 0, m2 = 0;
    for (let k = 0; k < n; k++) { const h = src.fields[k * 4]; m += h; m2 += h * h; }
    m /= n;
    const sd = Math.sqrt(Math.max(m2 / n - m * m, 1e-8));
    this.#z = new Float32Array(n);
    this.#cover = new Float32Array(n);
    this.#cloud = new Float32Array(n);
    for (let k = 0; k < n; k++) {
      this.#z[k] = (src.fields[k * 4] - m) / sd;
      this.#cloud[k] = src.fields[k * 4 + 2];
      this.#cover[k] = src.fields[k * 4 + 3];
    }
    const px = cg.getImageData(0, 0, src.size, src.size).data;
    const mean: [number, number, number] = [0, 0, 0];
    for (let k = 0; k < n; k++) for (let c = 0; c < 3; c++) mean[c] += px[k * 4 + c] / n;
    this.mean = mean;
  }

  /** From the parchment painter, once its sheets are made. */
  static async from(p: Parchment): Promise<Paper> {
    const sheets = await p.sheets();
    const fields = await p.fields();
    return new Paper({ tile: sheets.tile, fields, size: sheets.tile.width });
  }

  /** Fields of the tile for a pattern: rgb everywhere, alpha from `alpha(k)` per texel. */
  #tile(rgb: readonly number[], alpha: (k: number) => number): CanvasPattern {
    const S = this.size, c = canvas(S, S), g = ctx(c), img = g.createImageData(S, S), d = img.data;
    for (let k = 0; k < S * S; k++) {
      d[k * 4] = rgb[0];
      d[k * 4 + 1] = rgb[1];
      d[k * 4 + 2] = rgb[2];
      d[k * 4 + 3] = Math.round(255 * clamp(alpha(k)));
    }
    g.putImageData(img, 0, 0);
    return this.#scratch.createPattern(c, 'repeat')!;
  }

  /** An ink's body: dense in the hollows, thin on the fibres that stand up, skipping on the highest. */
  ink(name: InkName | string): CanvasPattern {
    let p = this.#inks.get(name);
    if (!p) {
      const ink = INKS[name as InkName];
      const rgb = ink ? ink.rgb : rgbOf(name);
      // bodied pigments sit on the fibres more evenly than a stain soaks into them
      const k = ink && ink.blend === 'source-over' ? 0.45 : 1;
      const z = this.#z;
      p = this.#tile(rgb, (i) => 0.94 - 0.09 * k * z[i] - 0.3 * k * Math.max(0, z[i] - 1.35));
      this.#inks.set(name, p);
    }
    return p;
  }

  /** An ink wicked along the fibres: only where a fibre lies, strongest where it lies low. */
  wick(name: InkName | string): CanvasPattern {
    let p = this.#wicks.get(name);
    if (!p) {
      const ink = INKS[name as InkName];
      const rgb = ink ? ink.rgb : rgbOf(name);
      const cov = this.#cover, z = this.#z;
      p = this.#tile(rgb, (i) => Math.pow(cov[i], 1.6) * (0.75 - 0.2 * z[i]));
      this.#wicks.set(name, p);
    }
    return p;
  }

  /** A wash's granulation: its pigment settled into the hollows and the pulp's cloudier patches. */
  wash(hex: string): CanvasPattern {
    let p = this.#washes.get(hex);
    if (!p) {
      const z = this.#z, cl = this.#cloud;
      p = this.#tile(rgbOf(hex), (i) => 0.42 - 0.26 * z[i] + 0.5 * cl[i]);
      this.#washes.set(hex, p);
    }
    return p;
  }

  /** Gold or silver leaf: squares laid edge over edge, crinkled where they were pressed down, burnished in streaks. */
  leaf(metal: 'gold' | 'silver'): CanvasPattern {
    let p = this.#leaf.get(metal);
    if (!p) {
      const S = 256, c = canvas(S, S), g = ctx(c), img = g.createImageData(S, S), d = img.data;
      const base = metal === 'gold' ? [214, 164, 72] : [206, 208, 210];
      const deep = metal === 'gold' ? [150, 98, 30] : [120, 122, 126];
      const hi = metal === 'gold' ? [255, 232, 160] : [250, 252, 255];
      const r = rng(metal === 'gold' ? 5 : 9);
      const cell = 64, tones = Array.from({ length: 16 }, () => r() * 2 - 1);
      for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
        // which square of leaf lies on top here, and how near its edge
        const ci = Math.floor(i / cell), cj = Math.floor(j / cell), fx = (i % cell) / cell, fy = (j % cell) / cell;
        const tone = tones[(ci % 4) + 4 * (cj % 4)] * 0.08;
        const seam = Math.min(fx, fy) < 0.035 ? -0.18 : Math.min(fx, fy) < 0.06 ? 0.06 : 0;
        // crinkles: ridged noise, wrapping over the tile
        const u = (i / S) * 8, v = (j / S) * 8;
        const ridge = 1 - Math.abs(noise2(u * 2.2, v * 2.2, 3) * 0.6 + noise2(u * 5, v * 5, 4) * 0.4);
        const crinkle = (ridge - 0.6) * 0.5;
        // burnishing: long streaks along one direction
        const streak = noise2(i * 0.02, j * 0.25, 7) * 0.12;
        const tarnish = metal === 'silver' ? Math.max(0, fbm2(u * 0.5, v * 0.5, 11) - 0.15) * 0.6 : 0;
        let t = 0.5 + tone + seam + crinkle + streak - tarnish;
        t = clamp(t);
        const o = (j * S + i) * 4;
        for (let ch = 0; ch < 3; ch++) {
          const a = t < 0.5 ? deep[ch] + (base[ch] - deep[ch]) * (t / 0.5) : base[ch] + (hi[ch] - base[ch]) * ((t - 0.5) / 0.5);
          d[o + ch] = a;
        }
        d[o + 3] = 255;
      }
      g.putImageData(img, 0, 0);
      p = this.#scratch.createPattern(c, 'repeat')!;
      this.#leaf.set(metal, p);
    }
    return p;
  }

  /** A pattern anchored so its texel (0, 0) lies at device pixel (ox, oy), at the paper's scale, whatever transform
   *  the context holds when it fills. */
  anchor(g: CanvasRenderingContext2D, p: CanvasPattern, ox: number, oy: number, dpr: number): CanvasPattern {
    const m = g.getTransform().invertSelf();
    m.translateSelf(ox, oy).scaleSelf(dpr * TEXEL);
    p.setTransform(m);
    return p;
  }

  /** The height score at a texel, for anything drawn by hand per pixel (seal wax, a sheet's stains). */
  heightAt(i: number, j: number): number {
    const S = this.size;
    return this.#z[(((j % S) + S) % S) * S + (((i % S) + S) % S)];
  }

  /** Fibre cover at a texel. */
  coverAt(i: number, j: number): number {
    const S = this.size;
    return this.#fields[((((j % S) + S) % S) * S + (((i % S) + S) % S)) * 4 + 3];
  }
}

/** A hash-random point, for scattering specks by a seed. */
export const scatter = (k: number, seed: number): [number, number] => [hash(k, 1, seed), hash(k, 2, seed)];
