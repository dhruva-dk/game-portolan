// The land as the minimap paints it (ground.ts): its shallows an even pale wash on the sea, its land parchment
// deepening to ochre up its hills with a faint sepia contour every few metres, its coast inked over it as a line by the
// minimap.

import { hexToLinear, linearToSrgbRgb, type Rgb } from '../colour';
import { lerp } from '../world/scalar';
import { LAND } from './ink';

/** Where the shallows' pale wash ends: the ground this many metres down. */
const APRON = 8;
/** Metres between the hills' contours. */
const CONTOUR = 5;

/** An ink as the image's bytes, sRGB 0…255. */
const bytes = (hex: string): Rgb => {
  const c = linearToSrgbRgb(hexToLinear(hex));
  return [c[0] * 255, c[1] * 255, c[2] * 255];
};
const PALE = bytes(LAND.apron), LOW = bytes(LAND.low), HIGH = bytes(LAND.high), LINE = bytes(LAND.contour);

/** Land's colours on a chart, from heights over the sea on a square grid `w` across, its hilltops `top` metres high:
 *  past APRON down nothing, the shallows a pale wash, the land parchment to ochre with a contour every CONTOUR. */
export function paint(h: Float32Array, w: number, top: number, d: Uint8ClampedArray) {
  top = Math.max(top, 1);
  for (let j = 0; j < w; j++) {
    for (let i = 0; i < w; i++) {
      const k = j * w + i, a = k * 4, v = h[k];
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
      // a contour where a step of CONTOUR is crossed between this texel and one beside it
      const band = Math.floor(v / CONTOUR);
      const crossed = band > 0 && ((i + 1 < w && Math.floor(h[k + 1] / CONTOUR) < band) || (j + 1 < w && Math.floor(h[k + w] / CONTOUR) < band)
        || (i > 0 && Math.floor(h[k - 1] / CONTOUR) < band) || (j > 0 && Math.floor(h[k - w] / CONTOUR) < band));
      const t = Math.min(1, Math.pow(v / top, 0.8));
      for (let c = 0; c < 3; c++) {
        const ground = lerp(LOW[c], HIGH[c], t);
        d[a + c] = crossed ? lerp(ground, LINE[c], 0.55) : ground;
      }
      d[a + 3] = 255;
    }
  }
}
