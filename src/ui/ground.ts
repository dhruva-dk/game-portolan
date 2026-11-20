// The land round her, for the minimap, from the ground's height sampled over a
// disc round her, SIDE × SIDE samples (some 3.4 m apart, a cell), as held.ts
// samples who holds the sea; painted as a chart has it (paint): its shallows an
// even pale wash on the sea, its land parchment deepening to ochre up its hills
// with a faint sepia contour every few metres, its coast inked over it as a
// line by the minimap. The land never changes, so a plate is taken afresh only
// when she has sailed MOVE metres from where the last was, and it is filled a
// band of ROWS rows a redraw behind the one shown (the whole plate at once is
// some 55 000 readings of the height, 20 ms or so); between, the plate shown is
// laid onto the disc where she now is (disc.ts laid).

import { hexToLinear, linearToSrgbRgb, type Rgb } from '../colour.ts';
import { lerp } from '../world/scalar.ts';
import { distance, type Vec3 } from '../world/sphere.ts';
import {
  outInto,
  type Lay,
  type LayOnto,
  type Mutable,
  type Spot,
} from './disc.ts';
import { LAND } from './ink.ts';

/**
 * Samples across a plate; rows of it filled a redraw; metres she sails before a
 * plate is taken afresh.
 */
const SIDE = 264,
  ROWS = 12,
  MOVE = 30;
/** Where the shallows' pale wash ends: the ground this many metres down. */
const APRON = 8;
/** Metres between the hills' contours. */
const CONTOUR = 5;

/** An ink as the image's bytes, sRGB 0…255. */
const bytes = (hex: string): Rgb => {
  const c = linearToSrgbRgb(hexToLinear(hex));
  return [c[0] * 255, c[1] * 255, c[2] * 255];
};
const PALE = bytes(LAND.apron),
  LOW = bytes(LAND.low),
  HIGH = bytes(LAND.high),
  LINE = bytes(LAND.contour);

/**
 * A plate: its canvas and pixels, its heights, and where it was taken and its
 * way right and up there.
 */
interface Plate extends Spot {
  canvas: HTMLCanvasElement;
  g: CanvasRenderingContext2D;
  image: ImageData;
  h: Float32Array;
  at: Mutable;
  right: Mutable;
  ahead: Mutable;
}

/**
 * The land's plate, `span` metres from her to its edge, from the ground's
 * height over the sea; its hilltops `top` m.
 */
export function createGround(
  height: (p: Vec3) => number,
  span: number,
  top: number
) {
  const plate = (): Plate => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = SIDE;
    const g = canvas.getContext('2d')!;
    const image = g.createImageData(SIDE, SIDE),
      h = new Float32Array(SIDE * SIDE);
    return {
      canvas,
      g,
      image,
      h,
      at: [0, 0, 1],
      right: [1, 0, 0],
      ahead: [0, 1, 0],
    };
  };
  const plates = [plate(), plate()];
  let shown: Plate | null = null,
    filling: Plate | null = null,
    row = 0;
  const q: Mutable = [0, 0, 0];

  /**
   * Rows of the plate filling, from `row` on: the height at each sample inside
   * its disc (outside, none).
   */
  function fill(p: Plate, rows: number) {
    const h = p.h,
      reach = span * span,
      end = Math.min(SIDE, row + rows);
    for (; row < end; row++) {
      const y = (1 - ((row + 0.5) / SIDE) * 2) * span;
      for (let i = 0; i < SIDE; i++) {
        const x = (((i + 0.5) / SIDE) * 2 - 1) * span,
          rr = x * x + y * y,
          k = row * SIDE + i;
        if (rr > reach) {
          h[k] = -Infinity;
          continue;
        }
        h[k] = height(outInto(q, p, x, y));
      }
    }
    if (row < SIDE) return;
    paint(h, SIDE, top, p.image.data);
    p.g.putImageData(p.image, 0, 0);
    [shown, filling] = [p, null];
  }

  return {
    /**
     * Lays the land round her onto `ctx` (the disc as `l` lays it), the next
     * plate filled on if one is due.
     */
    draw(ctx: CanvasRenderingContext2D, l: Lay, transform: LayOnto) {
      if (!filling && (!shown || distance(shown.at, l.at) > MOVE)) {
        const p = (filling = plates[0] === shown ? plates[1] : plates[0]);
        for (let m = 0; m < 3; m++) {
          p.at[m] = l.at[m];
          p.right[m] = l.right[m];
          p.ahead[m] = l.ahead[m];
        }
        row = 0;
      }
      // (the first plate whole at once: there is none to show meanwhile)
      if (filling) fill(filling, shown ? ROWS : SIDE);
      if (!shown) return;
      ctx.save();
      transform(
        shown.at,
        shown.right,
        shown.ahead,
        SIDE,
        SIDE,
        (2 * span) / SIDE
      );
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'medium';
      ctx.drawImage(shown.canvas, 0, 0);
      ctx.restore();
    },
  };
}

/**
 * The land's colours, from heights over the sea on a square grid `w` across,
 * its hilltops `top` metres high: past APRON down nothing, the shallows a pale
 * wash, the land parchment to ochre with a contour every CONTOUR.
 */
function paint(h: Float32Array, w: number, top: number, d: Uint8ClampedArray) {
  top = Math.max(top, 1);
  for (let j = 0; j < w; j++) {
    for (let i = 0; i < w; i++) {
      const k = j * w + i,
        a = k * 4,
        v = h[k];
      if (!(v > -APRON)) {
        d[a + 3] = 0;
        continue;
      }
      if (v <= 0) {
        // the shallows: an even pale wash, a touch paler by the beach
        for (let c = 0; c < 3; c++) d[a + c] = PALE[c];
        d[a + 3] = 255 * (0.72 - 0.12 * (-v / APRON));
        continue;
      }
      // a contour where a step of CONTOUR is crossed between this texel and one
      // beside it
      const band = Math.floor(v / CONTOUR);
      const crossed =
        band > 0 &&
        ((i + 1 < w && Math.floor(h[k + 1] / CONTOUR) < band) ||
          (j + 1 < w && Math.floor(h[k + w] / CONTOUR) < band) ||
          (i > 0 && Math.floor(h[k - 1] / CONTOUR) < band) ||
          (j > 0 && Math.floor(h[k - w] / CONTOUR) < band));
      const t = Math.min(1, Math.pow(v / top, 0.8));
      for (let c = 0; c < 3; c++) {
        const ground = lerp(LOW[c], HIGH[c], t);
        d[a + c] = crossed ? lerp(ground, LINE[c], 0.55) : ground;
      }
      d[a + 3] = 255;
    }
  }
}
