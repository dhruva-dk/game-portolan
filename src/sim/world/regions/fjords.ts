// The Fjords. Four granite massifs, their tops 60–100 m up, split by narrow fjords with U-shaped walls: the main
// fjord runs north from the open sea to Thunder Falls, which drops 146 m off the head wall with a sailable gap
// behind its curtain; a sound crosses east–west; two arms branch off. Skerries litter the outer water.
// Chart: x east, y north; the Ice Crown lies north, the Great Current along the south edge.
import { fbm, hyp, noise, plant, ridged, scatter, segDist, shoals, smax, smin, smoothstep, snapWet, strokeDist } from '../kit.ts';
import type { RegionSpec } from '../spec.ts';

const S = 0xf10d;

// The water network, as tapered strokes (x, y, half-width).
const MAIN = [4, -330, 26, -6, -170, 22, 6, -40, 19, -4, 60, 17, 0, 104, 14];
const SOUND = [-340, -10, 18, -200, -24, 17, -80, -12, 16, 6, -30, 17, 120, -6, 16, 220, 14, 17, 340, 30, 18];
const WEST_ARM = [-14, 30, 13, -70, 92, 12, -120, 170, 11, -150, 228, 10];
const EAST_ARM = [14, -110, 12, 90, -120, 12, 150, -170, 11];

// The head of the main fjord: the curtain falls at y = 104, off the lip of the head wall; the water runs on
// behind it to the wall's foot at y = 118, which is the gap you can hide in.
const FALLS_Y = 104;

function massif(x: number, y: number): number {
  // Signed distance to the outer coast of the granite: a rounded block that stops short of the side borders.
  const wx = x + 10 * noise(x * 0.012, y * 0.012, S), wy = y + 10 * noise(x * 0.012 + 3.1, y * 0.012, S + 1);
  const qx = Math.abs(wx) - 150, qy = Math.abs(wy - 50) - 185;
  const box = hyp(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - 30;
  return box;
}

function height(x: number, y: number): number {
  // Deep, cold water off the granite.
  let h = -34 + 6 * fbm(x * 0.01, y * 0.01, S + 2, 3);
  const outer = massif(x, y);
  if (outer < 40) {
    // Distance to open water inside the massif: the fjords and the sound.
    const wx = x + 3 * noise(x * 0.04, y * 0.04, S + 3), wy = y + 3 * noise(x * 0.04, y * 0.04 + 7, S + 4);
    let water = smin(strokeDist(wx, wy, MAIN), strokeDist(wx, wy, SOUND), 8);
    water = smin(water, strokeDist(wx, wy, WEST_ARM), 8);
    water = smin(water, strokeDist(wx, wy, EAST_ARM), 8);
    // Behind the curtain: a slot of water under the head wall.
    water = smin(water, segDist(wx, wy, -11, FALLS_Y + 2, 11, FALLS_Y + 2) - 6, 2);
    // Land is inside the massif and away from the water.
    const sd = smax(outer, -water, 6);
    // U-shaped walls: sheer for the first 20 m in from the water, then shoulders rounding over to the plateau.
    const top = 62 + 22 * fbm(x * 0.006, y * 0.006, S + 5, 3) + 12 * ridged(x * 0.012, y * 0.012, S + 6);
    // The head wall is the highest ground, so the falls drop the full 146 m.
    const head = 146 * (1 - smoothstep(30, 90, hyp(x, y - FALLS_Y - 30)));
    const plateau = Math.max(top, head);
    let g: number;
    if (sd < 0) {
      const t = -sd;
      g = plateau * (0.72 * smoothstep(0, 16, t) + 0.28 * smoothstep(10, 60, t)) + 2 * smoothstep(0, 6, t) * noise(x * 0.15, y * 0.15, S + 7);
    } else {
      // The walls carry straight on down under water: the fjords are deep.
      g = h * smoothstep(0, 10, sd);
    }
    h = g;
  }
  // Skerries: low granite humps in the outer water, and a few taller holms.
  if (outer > 6) {
    h = scatter(x, y, 46, S + 10, 0.5, h, (s) => {
      const r = 4 + 9 * s.a, d = hyp(s.dx, s.dy) - r * (1 + 0.35 * noise(s.dx * 0.2, s.dy * 0.2, S + 8));
      if (d > 16) return -1e9;
      const top = 2 + (s.b > 0.8 ? 18 : 6) * s.c;
      return d < 0 ? top * smoothstep(0, r * 0.7, -d) : -60 * smoothstep(0, 14, d);
    }, (cx, cy) => massif(cx, cy) < 40);
  }
  // Shoals across the open water, so no straight course runs empty for long.
  return shoals(x, y, h, 140, S + 40);
}

export const fjords: RegionSpec = {
  height,
  landmark: { x: 0, y: FALLS_Y, r: 22, height: 146, bearing: 180 },
  beacon: { x: 0, y: FALLS_Y + 16, height: 140 },
  loot: snapWet(height, [0, -110, -2, 40, -150, -20, 150, -8, -90, 115, 110, -150, -60, -230, 120, -235, 186, 8], 4),
  lanes: [
    // The falls' outflow, down the main fjord and out across the Great Current.
    { name: 'the Fjord race', pts: [0, 80, 4, -40, -6, -170, 4, -260, 30, -340], width: 22, speed: 3 },
  ],
  obstacles: [
    // Thunder Falls: a curtain of water across the head of the fjord, with the slot of water behind it.
    { kind: 'curtain', x: 0, y: FALLS_Y, bearing: 90, r: 4, height: 146, length: 30 },
  ],
  zones: [
    { kind: 'spray', x: 0, y: FALLS_Y - 10, r: 40 },
    { kind: 'curtain', x: 0, y: FALLS_Y + 2, r: 14 },
  ],
  tidal: [],
  // Dark pines along the shoulders of the walls, thinning onto the bare granite tops.
  props: plant(height, 'pine', [-240, -200, 240, 270], 11, S + 40, 0.55, 4, 70, 0.6, 16),
};
