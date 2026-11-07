// A captain's emblem, from the cosmetics library's own charges (src/render/cosmetics/emblems.ts), so the chart shows
// exactly what flies on her sail. The kit takes a captain as the roster keeps her (src/career/captains.ts): her colour
// and her sigil, nothing more; the player's own mark comes in the same shape from her worn look. A charge it does not
// know falls back to the library's own fallback.
//
// On the chart an emblem is painted the way a colourist would: the charge washed in the captain's colour, deeper at
// its rim where the wash dried, soaked into the paper's grain, and at a size where it can carry one, a fine ink line
// round it.
import { emblemDef } from '../render/cosmetics/emblems.ts';
import { rgbOf } from './inks.ts';
import { canvas, ctx, type Paper } from './paper.ts';

/** What the kit needs of a captain: a roster record (Captain) is one as it stands. */
export interface Colours {
  /** Her one colour (hull, sail, pennant, seal). */
  colour: string;
  /** Her sigil: its id is her emblem's in the cosmetics library. */
  sigil: { id: string };
}

const masks = new Map<string, Float32Array>();

/** The charge's signed distance sampled on a px × px grid (in pixels, negative inside), rows from the top. */
export function emblemField(id: string, px: number): Float32Array {
  const key = `${id}@${px}`;
  let f = masks.get(key);
  if (!f) {
    const sdf = emblemDef(id).charge, step = 2 / px;
    f = new Float32Array(px * px);
    for (let j = 0; j < px; j++) for (let i = 0; i < px; i++) f[j * px + i] = sdf((i + 0.5) * step - 1, 1 - (j + 0.5) * step) / step;
    masks.set(key, f);
  }
  return f;
}

const sprites = new Map<string, HTMLCanvasElement>();

/**
 * The emblem as a painted sprite `size` CSS pixels square (device pixels inside), in `colour`, with an ink line at
 * sizes that can hold one. Cached.
 */
export function emblemSprite(paper: Paper, id: string, colour: string, size: number, dpr: number, line = size * dpr >= 36): HTMLCanvasElement {
  const px = Math.max(8, Math.round(size * dpr));
  const key = `${id}|${colour}|${px}|${line}`;
  let c = sprites.get(key);
  if (c) return c;
  c = canvas(px, px);
  const g = ctx(c), img = g.createImageData(px, px), d = img.data, f = emblemField(id, px);
  const [r, gr, b] = rgbOf(colour);
  // the wash dries darker at its rim; a pale colour needs the ink line more
  const lum = (0.3 * r + 0.55 * gr + 0.15 * b) / 255;
  const deep = [r * 0.62, gr * 0.6, b * 0.6];
  const ink = [38, 25, 16];
  const lineW = line ? Math.max(0.55, px / 110) : 0;
  for (let j = 0; j < px; j++) for (let i = 0; i < px; i++) {
    const k = j * px + i, dist = f[k];
    const cover = Math.min(1, Math.max(0, 0.5 - dist));
    const rim = Math.max(0, 1 - Math.abs(dist + 1.2) / 1.8) * cover;
    const z = paper.heightAt(i * 2, j * 2);
    let a = cover * (0.88 - 0.06 * z);
    let cr = r + (deep[0] - r) * rim * 0.7, cg = gr + (deep[1] - gr) * rim * 0.7, cb = b + (deep[2] - b) * rim * 0.7;
    if (lineW > 0) {
      const e = Math.min(1, Math.max(0, lineW + 0.5 - Math.abs(dist)));
      const la = e * (lum > 0.55 ? 0.9 : 0.7);
      cr += (ink[0] - cr) * la; cg += (ink[1] - cg) * la; cb += (ink[2] - cb) * la;
      a = Math.max(a, la);
    }
    d[k * 4] = cr; d[k * 4 + 1] = cg; d[k * 4 + 2] = cb; d[k * 4 + 3] = Math.round(255 * Math.min(1, a));
  }
  g.putImageData(img, 0, 0);
  sprites.set(key, c);
  return c;
}

/** Draws a captain's emblem centred at (x, y), `size` CSS pixels across. */
export function drawEmblem(g: CanvasRenderingContext2D, paper: Paper, id: string, colour: string, x: number, y: number, size: number, dpr: number, alpha = 1): void {
  if (alpha <= 0) return;
  const s = emblemSprite(paper, id, colour, size, dpr);
  const was = g.globalAlpha;
  g.globalAlpha = was * alpha;
  g.drawImage(s, x - size / 2, y - size / 2, size, size);
  g.globalAlpha = was;
}
