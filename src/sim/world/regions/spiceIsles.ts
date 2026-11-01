// The Spice Isles. Rounded jungle hills rising straight out of warm emerald water, each a dome of red earth
// under canopy, with black rock points at their tips. The tallest, 88 m, holds Spice Cove in its south flank:
// a round, sheltered bay under the tallest flame trees, open to the sea by one mouth.
// Chart: x east, y north (toward the equator); the Maelstrom lies south.
import { R } from '../../sphere.ts';
import { fbm, fromEquator, hyp, needle, noise, plant, scatter, shore, smax, smin, snapWet } from '../kit.ts';
import type { RegionSpec } from '../spec.ts';

const S = 0x591c;
// Hills: x, y, radius at the shore, height.
const HILLS: number[][] = [
  [5, 35, 92, 88],
  [-160, 150, 52, 46],
  [150, 165, 46, 40],
  [-165, -105, 58, 52],
  [120, -110, 44, 38],
  [-30, -195, 42, 32],
  [-195, 30, 34, 28],
  [195, 30, 30, 24],
];
const COVE = { x: 5, y: -32, r: 33 };
const LANE = [75, -280, 60, -150, 65, -95, 140, -20, 170, 90, 205, 210, 235, 330];

function height(x: number, y: number): number {
  // Warm emerald water.
  let h = -20 + 5 * fbm(x * 0.009, y * 0.009, S, 3);
  h = smin(h, -60 + 1.3 * fromEquator(x, y, R, true), 4);
  for (let i = 0; i < HILLS.length; i++) {
    const [hx, hy, r, top] = HILLS[i];
    const rho = hyp(x - hx, y - hy);
    if (rho > r * 1.3 + 40) continue;
    let sd = rho - r * (1 + 0.12 * noise((x - hx) * 0.02, (y - hy) * 0.02, S + i));
    // Spice Cove: a round bay bitten out of the tallest hill's south flank.
    if (i === 0) sd = smax(sd, COVE.r - hyp(x - COVE.x, y - COVE.y), 6);
    // A dome: steep-sided low down, rounded on top, with a red earth beach at the foot.
    const u = Math.min(1, rho / (r * 1.1)), dome = top * (1 - u * u) * (0.75 + 0.25 * (1 - u));
    h = smax(h, shore(sd, Math.max(2, dome), 14, 2.5, 8), 3);
  }
  // Black rock points: little stacks off the shores.
  h = scatter(x, y, 44, S + 10, 0.35, h, (s) => {
    const r = 2.5 + 4 * s.a, rho = hyp(s.dx, s.dy);
    return rho > r + 9 ? -1e9 : needle(rho, r, 4 + 10 * s.b);
  }, (cx, cy) => {
    for (const [hx, hy, r] of HILLS) {
      const d = hyp(cx - hx, cy - hy) - r;
      if (d < 4 || d > 34) continue;
      return false;
    }
    return true;
  });
  return h;
}

export const spiceIsles: RegionSpec = {
  height,
  // The cove itself is sea level; the hill and flame trees standing over it are what is seen.
  landmark: { x: COVE.x, y: COVE.y, r: COVE.r, height: 96, bearing: 180 },
  beacon: { x: COVE.x, y: COVE.y + 20, height: 60 },
  loot: snapWet(height, [COVE.x, COVE.y - 6, -160, 80, 150, 100, -100, -110, 60, -150, -110, 250, 120, 240, -40, -260, 190, -40], 3),
  lanes: [
    // A warm current north from the Maelstrom's edge, through the isles and across to the Narrows.
    { name: 'the Spice current', pts: LANE, width: 22, speed: 2.8 },
  ],
  obstacles: [],
  zones: [{ kind: 'lagoon', x: COVE.x, y: COVE.y, r: COVE.r - 6 }],
  tidal: [],
  props: [
    ...plant(height, 'flameTree', [-60, -80, 70, 60], 9, S + 20, 0.7, 20, 90, 1, 18).filter((p) => hyp(p.x - COVE.x, p.y - COVE.y) < 60),
    ...plant(height, 'flameTree', [-260, -260, 260, 300], 26, S + 21, 0.5, 6, 90, 0.8, 14),
  ],
};
