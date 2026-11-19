// The land as the minimap paints it (ground.ts): its shallows an even pale wash on the sea, its land parchment
// deepening to ochre up its hills with a faint sepia contour every few metres, its coast inked over it as a line by the
// minimap.

/** Where the shallows' pale wash ends: the ground this many metres down. */
const APRON = 8;
/** Metres between the hills' contours. */
const CONTOUR = 5;

type Rgb = readonly [number, number, number];
const PALE: Rgb = [244, 240, 214], LAND: Rgb = [236, 220, 172], HIGH: Rgb = [176, 140, 88], LINE: Rgb = [128, 94, 62];
const mix = (a: Rgb, b: Rgb, t: number): Rgb => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

/** Land's colours on a chart, from heights over the sea on a square grid `w` across, its hilltops `top` metres high:
 *  past APRON down nothing, the apron a pale wash, the land parchment to ochre with a contour every CONTOUR. */
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
        [d[a], d[a + 1], d[a + 2]] = PALE;
        d[a + 3] = 255 * (0.72 - 0.12 * (-v / APRON));
        continue;
      }
      // a contour where a step of CONTOUR is crossed between this texel and one beside it
      const band = Math.floor(v / CONTOUR);
      const crossed = band > 0 && ((i + 1 < w && Math.floor(h[k + 1] / CONTOUR) < band) || (j + 1 < w && Math.floor(h[k + w] / CONTOUR) < band)
        || (i > 0 && Math.floor(h[k - 1] / CONTOUR) < band) || (j > 0 && Math.floor(h[k - w] / CONTOUR) < band));
      const c = mix(LAND, HIGH, Math.min(1, Math.pow(v / top, 0.8)));
      [d[a], d[a + 1], d[a + 2]] = crossed ? mix(c, LINE, 0.55) : c;
      d[a + 3] = 255;
    }
  }
}
