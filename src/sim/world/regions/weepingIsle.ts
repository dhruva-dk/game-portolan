// The Weeping Isle. One island fills the region: a dome 150 m high and 350 m across, ringed by sheer cliffs
// 55–70 m tall, scored by the clefts its hundreds of falls run down. At the cliff feet, shelves of wet black
// rock and pools; out in the sapphire water between the cliffs and the borders, fallen rocks and stacks.
// Chart: x east, y north (toward the equator); the Maelstrom lies south.
import { dcos, dsin } from '../../math.ts';
import { R } from '../../sphere.ts';
import { fbm, fromEquator, hyp, needle, noise, polyDist, ridged, scatter, smax, smin, smoothstep, snapWet } from '../kit.ts';
import type { ObstacleSpec, RegionSpec } from '../spec.ts';

const S = 0x3ee9;
const ISLE = { x: 0, y: -15, r: 172, cliff: 62, top: 150 };
const LANE = [-215, 230, -210, 60, -200, -90, -165, -200, -120, -330];

function height(x: number, y: number): number {
  // Deep sapphire water.
  let h = -32 + 6 * fbm(x * 0.008, y * 0.008, S, 3);
  h = smin(h, -60 + 1.3 * fromEquator(x, y, R, true), 4);
  const dx = x - ISLE.x, dy = y - ISLE.y, rho = hyp(dx, dy);
  const edge = ISLE.r * (1 + 0.035 * noise(dx * 0.015, dy * 0.015, S + 1) + 0.015 * noise(dx * 0.06, dy * 0.06, S + 2));
  const sd = rho - edge;
  if (sd < 70) {
    let g: number;
    if (sd < 0) {
      // Clefts where the falls run: narrow notches in the cliff top, every few degrees round the rim.
      const cleft = rho > 1e-6 ? ridged((dx / rho) * 9, (dy / rho) * 9, S + 3) : 0;
      const cliffTop = ISLE.cliff * (1 - 0.25 * smoothstep(0.75, 1, cleft)) + 6 * noise(dx * 0.03, dy * 0.03, S + 4);
      const u = rho / edge, dome = cliffTop + (ISLE.top - ISLE.cliff) * (1 - u * u);
      g = dome * smoothstep(0, 5, -sd);
    } else {
      // A shelf of wet black rock just awash at the cliff foot, pools in it, then deep water.
      const pool = 0.6 * smoothstep(0.3, 0.7, noise(x * 0.12, y * 0.12, S + 5));
      g = -(0.4 + pool) * smoothstep(0, 2, sd) - 1.6 * smoothstep(8, 14, sd) - 58 * smoothstep(14, 40, sd);
    }
    h = sd < 0 ? g : smax(h, g, 2);
  }
  // Fallen rocks and stacks in the water ring between the cliffs and the borders.
  h = scatter(x, y, 40, S + 10, 0.55, h, (s) => {
    const r = 3 + 7 * s.a, rho2 = hyp(s.dx, s.dy);
    return rho2 > r + 10 ? -1e9 : needle(rho2, r, 2 + (s.b > 0.75 ? 20 : 7) * s.c);
  }, (cx, cy) => hyp(cx - ISLE.x, cy - ISLE.y) < ISLE.r + 30 || polyDist(cx, cy, LANE) < 26 || fromEquator(cx, cy, R, true) < 40);
  return h;
}

// The falls: curtains down the cliff all round, in the clefts.
const FALLS: ObstacleSpec[] = [];
for (let k = 0; k < 24; k++) {
  const b = (k * 15 + 7) * (3.141592653589793 / 180), r = ISLE.r + 2;
  FALLS.push({ kind: 'curtain', x: ISLE.x + r * dsin(b), y: ISLE.y + r * dcos(b), bearing: k * 15 + 97, r: 2, height: ISLE.cliff, length: 8 });
}

export const weepingIsle: RegionSpec = {
  height,
  landmark: { x: ISLE.x, y: ISLE.y, r: ISLE.r, height: ISLE.top, bearing: 0 },
  // A spring that glows in the summit's cloud forest.
  beacon: { x: ISLE.x, y: ISLE.y + 20, height: ISLE.top + 4 },
  loot: snapWet(height, [0, 185, 0, -215, 205, 0, -200, -20, 140, 140, -150, 140, 145, -165, -150, -170], 4),
  lanes: [
    // Down the western cliffs from the Basalt Stacks' water and away south into the Maelstrom.
    { name: 'the Weeping run', pts: LANE, width: 22, speed: 2.8 },
  ],
  obstacles: FALLS,
  zones: [{ kind: 'spray', x: ISLE.x, y: ISLE.y, r: ISLE.r + 30 }],
  tidal: [],
  props: [],
};
