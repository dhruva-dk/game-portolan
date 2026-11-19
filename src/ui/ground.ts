// The terrain's land round her, for the minimap: painted as the islands are (isles.ts paint) from the ground's height
// sampled over a disc round her, SIDE × SIDE samples (some 3.4 m apart, a cell), as held.ts samples who holds the sea.
// The land never changes, so a plate is taken afresh only when she has sailed MOVE metres from where the last was, and
// it is filled a band of ROWS rows a redraw behind the one shown (the whole plate at once is some 55 000 readings of
// the height, 20 ms or so); between, the plate shown is laid onto the disc where she now is (disc.ts laid).

import { R, type Vec3 } from '../world/sphere';
import type { Lay } from './disc';
import { paint } from './isles';

/** Samples across a plate; rows of it filled a redraw; metres she sails before a plate is taken afresh. */
const SIDE = 264, ROWS = 12, MOVE = 30;

interface Plate { canvas: HTMLCanvasElement; g: CanvasRenderingContext2D; image: ImageData; h: Float32Array; at: Vec3; e: Vec3; n: Vec3 }

/** The land's plate, `span` metres from her to its edge, from the ground's height over the sea; its hilltops `top` m. */
export function createGround(height: (p: Vec3) => number, span: number, top: number) {
  const plate = (): Plate => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = SIDE;
    const g = canvas.getContext('2d')!;
    return { canvas, g, image: g.createImageData(SIDE, SIDE), h: new Float32Array(SIDE * SIDE), at: [0, 0, 1], e: [1, 0, 0], n: [0, 1, 0] };
  };
  const plates = [plate(), plate()];
  let shown: Plate | null = null, filling: Plate | null = null, row = 0;

  /** Rows of the plate filling, from `row` on: the height at each sample inside its disc (outside, none). */
  function fill(p: Plate, rows: number) {
    const { at, e, n, h } = p, reach = span * span, end = Math.min(SIDE, row + rows);
    for (; row < end; row++) {
      const y = (1 - ((row + 0.5) / SIDE) * 2) * span;
      for (let i = 0; i < SIDE; i++) {
        const x = (((i + 0.5) / SIDE) * 2 - 1) * span, rr = x * x + y * y, k = row * SIDE + i;
        if (rr > reach) {
          h[k] = -Infinity;
          continue;
        }
        // x metres along e and y along n, the surface's way (disc.ts out), unrolled
        const d = Math.sqrt(rr) || 1e-9, cs = Math.cos(d / R), sn = Math.sin(d / R) / d;
        h[k] = height([at[0] * cs + (e[0] * x + n[0] * y) * sn, at[1] * cs + (e[1] * x + n[1] * y) * sn, at[2] * cs + (e[2] * x + n[2] * y) * sn]);
      }
    }
    if (row < SIDE) return;
    paint(h, SIDE, top, p.image.data);
    p.g.putImageData(p.image, 0, 0);
    [shown, filling] = [p, null];
  }

  return {
    /** Lays the land round her onto `ctx` (the disc as `l` lays it), the next plate filled on if one is due. */
    draw(ctx: CanvasRenderingContext2D, l: Lay, transform: (o: Vec3, e: Vec3, n: Vec3, w: number, h: number, m: number) => void) {
      const moved = shown ? Math.acos(Math.min(1, shown.at[0] * l.at[0] + shown.at[1] * l.at[1] + shown.at[2] * l.at[2])) * R : Infinity;
      if (!filling && moved > MOVE) {
        filling = plates[0] === shown ? plates[1] : plates[0];
        [filling.at, filling.e, filling.n, row] = [l.at, l.right, l.ahead, 0];
      }
      // (the first plate whole at once: there is none to show meanwhile)
      if (filling) fill(filling, shown ? ROWS : SIDE);
      if (!shown) return;
      ctx.save();
      transform(shown.at, shown.e, shown.n, SIDE, SIDE, (2 * span) / SIDE);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'medium';
      ctx.drawImage(shown.canvas, 0, 0);
      ctx.restore();
    },
  };
}
