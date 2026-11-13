// The islands as the minimap draws them, each baked once to a small image on its own chart the first time it comes near
// her: its apron an even pale wash on the sea, its land parchment deepening to ochre up its hills with a faint sepia
// contour every few metres, its coast inked over it as a line by the minimap.

import type { IslandSite } from '../world/planet';
import { cross } from '../world/sphere';

/** Metres a texel. */
const TEXEL = 1.5;
/** Where the apron's pale wash ends: the island's own ground this many metres down (its apron is 4–7.5 m deep). */
const APRON = 8;
/** Metres between the hills' contours. */
const CONTOUR = 5;

type Rgb = readonly [number, number, number];
const PALE: Rgb = [244, 240, 214], LAND: Rgb = [236, 220, 172], HIGH: Rgb = [176, 140, 88], LINE: Rgb = [128, 94, 62];
const mix = (a: Rgb, b: Rgb, t: number): Rgb => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

/** An island's image: its canvas, texels across and down, and metres a texel. */
export interface Isle { canvas: HTMLCanvasElement; w: number; h: number; m: number }

/** The island's image, on its chart (x along its axis, rows down along −z: disc.ts laid with e = axis, n = z). */
export function bakeIsle(site: IslandSite): Isle {
  const half = Math.ceil(site.shelf / TEXEL) + 1, w = 2 * half;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = w;
  const g = canvas.getContext('2d')!;
  const image = g.createImageData(w, w), d = image.data;
  const h = new Float32Array(w * w);
  for (let j = 0; j < w; j++) {
    for (let i = 0; i < w; i++) h[j * w + i] = site.mound((i + 0.5 - half) * TEXEL, -(j + 0.5 - half) * TEXEL);
  }
  const top = Math.max(site.summit, 1);
  for (let j = 0; j < w; j++) {
    for (let i = 0; i < w; i++) {
      const k = j * w + i, a = k * 4, v = h[k];
      if (v <= -APRON) {
        d[a + 3] = 0;
        continue;
      }
      if (v <= 0) {
        // the apron: an even pale wash, a touch paler by the beach
        [d[a], d[a + 1], d[a + 2]] = PALE;
        d[a + 3] = 255 * (0.72 - 0.12 * (-v / APRON));
        continue;
      }
      // a contour where a step of CONTOUR is crossed between this texel and the one right or below
      const band = Math.floor(v / CONTOUR);
      const crossed = band > 0 && ((i + 1 < w && Math.floor(h[k + 1] / CONTOUR) < band) || (j + 1 < w && Math.floor(h[k + w] / CONTOUR) < band)
        || (i > 0 && Math.floor(h[k - 1] / CONTOUR) < band) || (j > 0 && Math.floor(h[k - w] / CONTOUR) < band));
      const c = mix(LAND, HIGH, Math.min(1, Math.pow(v / top, 0.8)));
      [d[a], d[a + 1], d[a + 2]] = crossed ? mix(c, LINE, 0.55) : c;
      d[a + 3] = 255;
    }
  }
  g.putImageData(image, 0, 0);
  return { canvas, w, h: w, m: TEXEL };
}

/** The island's chart's second axis (its z: sphere.ts fromChart). */
export const zOf = (site: IslandSite) => cross(site.chart.axis, site.chart.at);
